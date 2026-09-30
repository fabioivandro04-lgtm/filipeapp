"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { query, queryOne, CATEGORIAS, CARGOS } from "@/lib/db";
import { cookies } from "next/headers";
import { editaDireto, login, logout, requireUser } from "@/lib/auth";
import { hashPassword, verifyPassword } from "@/lib/password";
import { avaliar } from "@/lib/alertas";
import { lerQrFiscal } from "@/lib/qr";
import { carregarFicheiro, faturasDoPacote, lerFiltro, marcarComoEnviadas, paraQuery } from "@/lib/contabilidade";
import { emailConfigurado, enviarEmail, type Anexo } from "@/lib/email";
import { excelFaturas, nomeFicheiro } from "@/lib/excel";
import { guardarConfig } from "@/lib/config";
import { CAMPOS_EDITAVEIS, diferencas, registar, type Diferencas } from "@/lib/historico";
import { nifValido } from "@/lib/nif";
import { extrairFatura, extracaoDisponivel, type FaturaExtraida } from "@/lib/extract";

export async function entrar(_: string | null, form: FormData): Promise<string | null> {
  const ok = await login(String(form.get("email") ?? ""), String(form.get("password") ?? ""));
  if (ok === "bloqueado") return "Demasiadas tentativas. Tente novamente dentro de 15 minutos.";
  if (!ok) return "Email ou palavra-passe incorretos.";
  redirect("/");
}

export type ResultadoConta = { ok?: boolean; erro?: string };

export async function alterarSenha(_: ResultadoConta | null, form: FormData): Promise<ResultadoConta> {
  const u = await requireUser();
  const atual = String(form.get("atual") ?? "");
  const nova = String(form.get("nova") ?? "");
  if (nova.length < 10) return { erro: "A nova palavra-passe deve ter pelo menos 10 caracteres." };
  if (nova !== String(form.get("confirmar") ?? "")) return { erro: "As palavras-passe novas não coincidem." };
  const row = await queryOne<{ password_hash: string }>("SELECT password_hash FROM users WHERE id = ?", [u.id]);
  if (!row || !verifyPassword(atual, row.password_hash)) return { erro: "A palavra-passe atual está incorreta." };
  await query("UPDATE users SET password_hash = ? WHERE id = ?", [hashPassword(nova), u.id]);
  // Termina as outras sessões deste utilizador (fica só a atual)
  const token = (await cookies()).get("session")?.value ?? "";
  await query("DELETE FROM sessions WHERE user_id = ? AND token <> ?", [u.id, token]);
  return { ok: true };
}

export async function sair() {
  await logout();
  redirect("/login");
}

const MIMES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"]);
// A Vercel recusa pedidos acima de ~4,5 MB; as fotos são comprimidas no browser antes de chegarem aqui.
const MAX_BYTES = 4 * 1024 * 1024;

export type ResultadoUpload = { id?: number; erro?: string };

async function obterEmpresaId(nome: string | null): Promise<number | null> {
  if (!nome) return null;
  await query("INSERT INTO empresas (nome) VALUES (?) ON CONFLICT (nome) DO NOTHING", [nome]);
  return (await queryOne<{ id: number }>("SELECT id FROM empresas WHERE nome = ?", [nome]))!.id;
}

/** Guarda e lê UMA fatura. O browser chama-a uma vez por ficheiro. */
export async function carregarFatura(form: FormData): Promise<ResultadoUpload> {
  const user = await requireUser();
  if (!editaDireto(user)) return { erro: "O seu cargo não permite carregar faturas." };
  const file = form.get("ficheiro");
  if (!(file instanceof File) || file.size === 0) return { erro: "Ficheiro em falta." };
  if (!MIMES.has(file.type)) return { erro: `Tipo de ficheiro não suportado: ${file.name}` };
  if (file.size > MAX_BYTES) return { erro: `${file.name} é demasiado grande (máx. 4 MB). Tente uma foto em vez de PDF.` };

  const categoriaManual = String(form.get("categoria") ?? "");
  const bytes = Buffer.from(await file.arrayBuffer());
  const qr = lerQrFiscal(String(form.get("qr") ?? "")); // QR fiscal da AT, lido no browser
  const notas: string[] = [];

  let d: FaturaExtraida | null = null;
  if (extracaoDisponivel()) {
    try { d = await extrairFatura(bytes, file.type); } catch (e) { notas.push(`Leitura automática falhou: ${(e as Error).message}`); }
  } else if (!qr) {
    notas.push("Sem leitura automática (falta ANTHROPIC_API_KEY): preencha os dados à mão.");
  }

  // Os dados do QR são exatos: têm prioridade sobre a leitura por IA
  const nif = qr?.nifEmitente ?? d?.nif_fornecedor ?? null;
  const total = qr?.total ?? d?.total ?? null;
  if (qr && d?.total != null && qr.total != null && Math.abs(d.total - qr.total) > 0.01)
    notas.push(`A leitura automática (${d.total}) difere do QR (${qr.total}); foi usado o valor do QR.`);

  // Fornecedor e categoria: o que a IA leu, senão o último fornecedor conhecido com o mesmo NIF
  let fornecedor = d?.fornecedor ?? null;
  let categoriaHist: string | null = null;
  if (nif) {
    const h = await queryOne<{ fornecedor: string | null; categoria: string }>(
      "SELECT fornecedor, categoria FROM faturas WHERE nif_fornecedor = ? AND apagada_em IS NULL ORDER BY id DESC LIMIT 1", [nif]);
    fornecedor ??= h?.fornecedor ?? null;
    categoriaHist = h?.categoria ?? null;
  }
  if (qr && !fornecedor) notas.push("Falta o nome do fornecedor.");

  // Empresa: a que escreveu; senão a que tem o NIF do cliente lido no QR
  let empresaId = await obterEmpresaId(String(form.get("empresa") ?? "").trim() || null);
  if (!empresaId && qr?.nifAdquirente) {
    empresaId = (await queryOne<{ id: number }>("SELECT id FROM empresas WHERE nif = ?", [qr.nifAdquirente]))?.id ?? null;
    if (!empresaId) notas.push(`O NIF do cliente ${qr.nifAdquirente} ainda não está associado a nenhuma empresa.`);
  }

  // Ligação por identificadores estáveis (nunca só pela morada: há moradas repetidas)
  let predioId: number | null = null, maquinaId: number | null = null;
  if (d?.identificador) {
    const p = await queryOne<{ id: number }>("SELECT id FROM predios WHERE codigo_contador = ?", [d.identificador]);
    predioId = p?.id ?? null;
    if (!p && (d.categoria === "energia" || d.categoria === "agua")) notas.push(`Identificador ${d.identificador} não corresponde a nenhum prédio.`);
  }
  if (d?.numero_interno_maquina) {
    const m = await queryOne<{ id: number }>("SELECT id FROM maquinas WHERE numero_interno = ?", [d.numero_interno_maquina]);
    maquinaId = m?.id ?? null;
    if (!m) notas.push(`Máquina ${d.numero_interno_maquina} não existe.`);
  }
  if (d?.duvidas) notas.push(d.duvidas);

  const categoria = (CATEGORIAS as readonly string[]).includes(categoriaManual) ? categoriaManual : d?.categoria ?? categoriaHist ?? "outros";
  const numero = qr?.numero ?? d?.numero ?? null;
  const data = qr?.data ?? d?.data ?? null;
  notas.push(...(await avaliar({ fornecedor, nif, numero, data, total, categoria, atcud: qr?.atcud ?? null })));

  const fich = (await queryOne<{ id: number }>("INSERT INTO ficheiros (mime,dados) VALUES (?,?) RETURNING id", [file.type, bytes]))!;
  const nova = (await queryOne<{ id: number }>(
    `INSERT INTO faturas (criado_por,ficheiro_id,fornecedor,nif_fornecedor,numero,data,total,iva,categoria,empresa_id,predio_id,maquina_id,
       identificador,itens,alerta,atcud,nif_adquirente,tipo_doc,qr_lido)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id`,
    [user.id, fich.id, fornecedor, nif, numero, data, total, qr?.totalIva ?? d?.iva ?? null, categoria, empresaId, predioId, maquinaId,
      d?.identificador ?? null, d ? JSON.stringify(d.itens) : null, notas.length ? notas.join(" ") : null,
      qr?.atcud ?? null, qr?.nifAdquirente ?? null, qr?.tipo ?? null, qr ? 1 : 0],
  ))!;
  await registar(user, nova.id, "criada", { fornecedor, numero, total, qr: !!qr });
  revalidatePath("/", "layout");
  return { id: nova.id };
}

const num = (v: FormDataEntryValue | null) => {
  const t = String(v ?? "").trim().replace(",", ".");
  return t === "" || Number.isNaN(Number(t)) ? null : Number(t);
};
const txt = (v: FormDataEntryValue | null) => String(v ?? "").trim() || null;

/** Quem edita diretamente (admin e operador). O contabilista só propõe alterações. */
async function podeEditar() {
  const u = await requireUser();
  return editaDireto(u) ? u : null;
}

type Campos = Record<(typeof CAMPOS_EDITAVEIS)[number], unknown>;

/** Aplica os campos a uma fatura (recalcula avisos, regista no histórico). Usado na edição direta e ao aceitar uma proposta. */
async function aplicarCampos(user: { id: number }, id: number, antes: Record<string, unknown>, depois: Campos) {
  const revisada = depois.revisada ? 1 : 0;
  // Ao guardar, os avisos são recalculados (marcar como revista limpa-os)
  const avisos = revisada ? [] : await avaliar({
    fornecedor: depois.fornecedor as string | null, nif: depois.nif_fornecedor as string | null, numero: depois.numero as string | null,
    data: depois.data as string | null, total: depois.total as number | null, categoria: String(depois.categoria),
    excluirId: id, predioId: depois.predio_id as number | null, atcud: (antes.atcud as string | null) ?? null,
  });
  await query(
    `UPDATE faturas SET fornecedor=?, nif_fornecedor=?, numero=?, data=?, total=?, iva=?, categoria=?, empresa_id=?,
       predio_id=?, maquina_id=?, identificador=?, nif_adquirente=?, revisada=?, alerta=? WHERE id=?`,
    [depois.fornecedor, depois.nif_fornecedor, depois.numero, depois.data, depois.total, depois.iva, depois.categoria, depois.empresa_id,
      depois.predio_id, depois.maquina_id, depois.identificador, depois.nif_adquirente, revisada, avisos.length ? avisos.join(" ") : null, id],
  );
  const mudou = diferencas(antes, depois);
  if (Object.keys(mudou).length) await registar(user, id, "editada", mudou);
}

export async function guardarFatura(id: number, form: FormData) {
  const user = await requireUser();
  const direto = editaDireto(user);
  if (!direto && user.cargo !== "contabilista") return;
  const antes = await queryOne<Record<string, unknown>>("SELECT * FROM faturas WHERE id = ? AND apagada_em IS NULL", [id]);
  if (!antes) return;

  const volta = (tipo: "ok" | "erro", msg: string): never => redirect(`/faturas/${id}?${tipo}=${encodeURIComponent(msg)}`);
  const nomeEmpresa = txt(form.get("empresa"));
  let empresaId: number | null = null;
  if (direto) empresaId = await obterEmpresaId(nomeEmpresa);
  else if (nomeEmpresa) {
    // Uma proposta não cria empresas: só usa as que já existem
    empresaId = (await queryOne<{ id: number }>("SELECT id FROM empresas WHERE LOWER(nome) = LOWER(?)", [nomeEmpresa]))?.id ?? null;
    if (!empresaId) volta("erro", `A empresa «${nomeEmpresa}» não existe. Peça a um administrador para a criar em Empresas.`);
  }

  const predioId = num(form.get("predio_id"));
  const identificador = txt(form.get("identificador"));
  const nifAdquirente = txt(form.get("nif_adquirente"));
  const depois: Campos = {
    fornecedor: txt(form.get("fornecedor")), nif_fornecedor: txt(form.get("nif")), numero: txt(form.get("numero")), data: txt(form.get("data")),
    total: num(form.get("total")), iva: num(form.get("iva")), categoria: String(form.get("categoria")), empresa_id: empresaId,
    predio_id: predioId, maquina_id: num(form.get("maquina_id")), identificador, nif_adquirente: nifAdquirente, revisada: form.get("revisada") ? 1 : 0,
  };

  if (!direto) {
    // Contabilista: fica registada uma proposta; a fatura não muda até um admin aceitar
    const mudou = diferencas(antes, depois);
    if (!Object.keys(mudou).length) volta("ok", "Não há alterações para propor.");
    await query("UPDATE propostas SET estado = 'substituida' WHERE fatura_id = ? AND user_id = ? AND estado = 'pendente'", [id, user.id]);
    await query("INSERT INTO propostas (fatura_id, user_id, alteracoes) VALUES (?,?,?)", [id, user.id, JSON.stringify(mudou)]);
    await registar(user, id, "proposta", mudou);
    revalidatePath("/", "layout");
    volta("ok", "Proposta enviada. As alterações só entram em vigor quando um administrador as aceitar.");
  }

  await aplicarCampos(user, id, antes, depois);
  // Memoriza para ligar automaticamente as próximas faturas
  if (form.get("memorizar") && predioId && identificador)
    await query("UPDATE predios SET codigo_contador = ? WHERE id = ? AND codigo_contador IS NULL", [identificador, predioId]);
  if (form.get("memorizar_empresa") && empresaId && nifAdquirente)
    await query("UPDATE empresas SET nif = ? WHERE id = ? AND nif IS NULL AND NOT EXISTS (SELECT 1 FROM empresas e2 WHERE e2.nif = ?)", [nifAdquirente, empresaId, nifAdquirente]);
  revalidatePath("/", "layout");
  redirect("/");
}

// ---------- Aprovação das propostas (só admin) ----------
async function propostaPendente(id: number) {
  const eu = await requireUser();
  if (eu.cargo !== "admin") redirect("/");
  const p = await queryOne<{ id: number; fatura_id: number; user_id: number; alteracoes: string }>(
    "SELECT id, fatura_id, user_id, alteracoes FROM propostas WHERE id = ? AND estado = 'pendente'", [id]);
  return { eu, p };
}
const voltarAprovacoes = (tipo: "ok" | "erro", msg: string): never => redirect(`/aprovacoes?${tipo}=${encodeURIComponent(msg)}`);

export async function aceitarProposta(id: number) {
  const { eu, p } = await propostaPendente(id);
  if (!p) voltarAprovacoes("erro", "Esta proposta já foi decidida ou deixou de existir.");
  const antes = await queryOne<Record<string, unknown>>("SELECT * FROM faturas WHERE id = ? AND apagada_em IS NULL", [p!.fatura_id]);
  const autor = (await queryOne<{ nome: string }>("SELECT nome FROM users WHERE id = ?", [p!.user_id]))?.nome ?? "?";
  if (!antes) {
    await query("UPDATE propostas SET estado='rejeitada', decidido_por=?, decidido_em=to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS'), motivo='A fatura foi apagada.' WHERE id=?", [eu.id, id]);
    voltarAprovacoes("erro", "A fatura já foi apagada; a proposta foi encerrada.");
  }
  // Valores atuais + o que foi proposto (só os campos que a proposta mudou)
  const depois = Object.fromEntries(CAMPOS_EDITAVEIS.map((c) => [c, antes![c] ?? null])) as Campos;
  for (const [campo, [, novo]] of Object.entries(JSON.parse(p!.alteracoes) as Diferencas))
    if ((CAMPOS_EDITAVEIS as readonly string[]).includes(campo)) depois[campo as keyof Campos] = novo;
  await aplicarCampos(eu, p!.fatura_id, antes!, depois);
  await query("UPDATE propostas SET estado='aceite', decidido_por=?, decidido_em=to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS') WHERE id=?", [eu.id, id]);
  await registar(eu, p!.fatura_id, "proposta_aceite", { proposta: id, autor });
  revalidatePath("/", "layout");
  voltarAprovacoes("ok", `Proposta de ${autor} aceite: a fatura foi atualizada.`);
}

export async function rejeitarProposta(id: number, form: FormData) {
  const { eu, p } = await propostaPendente(id);
  if (!p) voltarAprovacoes("erro", "Esta proposta já foi decidida ou deixou de existir.");
  const motivo = txt(form.get("motivo"));
  const autor = (await queryOne<{ nome: string }>("SELECT nome FROM users WHERE id = ?", [p!.user_id]))?.nome ?? "?";
  await query("UPDATE propostas SET estado='rejeitada', decidido_por=?, decidido_em=to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS'), motivo=? WHERE id=?", [eu.id, motivo, id]);
  await registar(eu, p!.fatura_id, "proposta_rejeitada", { proposta: id, autor, motivo });
  revalidatePath("/", "layout");
  voltarAprovacoes("ok", `Proposta de ${autor} rejeitada.`);
}

/** «Apagar» é recuperável: a fatura e o ficheiro ficam guardados e o admin pode restaurar no Histórico. */
export async function apagarFatura(id: number) {
  const u = await requireUser();
  if (u.cargo !== "admin") return;
  const f = await queryOne<{ fornecedor: string | null; numero: string | null; total: number | null }>("SELECT fornecedor, numero, total FROM faturas WHERE id = ? AND apagada_em IS NULL", [id]);
  if (!f) return;
  await query("UPDATE faturas SET apagada_em = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') WHERE id = ?", [id]);
  await registar(u, id, "apagada", f);
  revalidatePath("/", "layout");
  redirect("/");
}

export async function restaurarFatura(id: number) {
  const u = await requireUser();
  if (u.cargo !== "admin") return;
  await query("UPDATE faturas SET apagada_em = NULL WHERE id = ?", [id]);
  await registar(u, id, "restaurada");
  revalidatePath("/", "layout");
  redirect(`/faturas/${id}`);
}

/** Desfaz uma edição registada no histórico (repõe os valores anteriores). */
export async function reverterAlteracao(historicoId: number) {
  const u = await podeEditar();
  if (!u) return;
  const h = await queryOne<{ id: number; fatura_id: number | null; acao: string; detalhe: string | null }>(
    "SELECT id, fatura_id, acao, detalhe FROM historico WHERE id = ?", [historicoId]);
  if (!h || h.acao !== "editada" || !h.fatura_id || !h.detalhe) return;
  const diff = JSON.parse(h.detalhe) as Diferencas;
  const sets: string[] = [];
  const args: unknown[] = [];
  for (const [campo, [antes]] of Object.entries(diff)) {
    if (!(CAMPOS_EDITAVEIS as readonly string[]).includes(campo)) continue; // só colunas conhecidas
    sets.push(`${campo}=?`);
    args.push(antes);
  }
  if (!sets.length) return;
  await query(`UPDATE faturas SET ${sets.join(", ")} WHERE id = ? AND apagada_em IS NULL`, [...args, h.fatura_id]);
  await registar(u, h.fatura_id, "revertida", { desfeito: h.id });
  revalidatePath("/", "layout");
  redirect(`/faturas/${h.fatura_id}`);
}

export async function criarPredio(form: FormData) {
  const u = await requireUser();
  if (u.cargo !== "admin") return;
  await query("INSERT INTO predios (nome,morada,codigo_contador) VALUES (?,?,?)", [String(form.get("nome")), String(form.get("morada") ?? ""), txt(form.get("codigo"))]);
  revalidatePath("/predios");
}

export async function criarMaquina(form: FormData) {
  const u = await requireUser();
  if (u.cargo !== "admin") return;
  await query("INSERT INTO maquinas (numero_interno,descricao) VALUES (?,?) ON CONFLICT (numero_interno) DO NOTHING", [String(form.get("numero")), String(form.get("descricao") ?? "")]);
  revalidatePath("/maquinas");
}

// ---------- Gestão de utilizadores (só admin) ----------
async function soAdmin() {
  const u = await requireUser();
  if (u.cargo !== "admin") redirect("/");
  return u;
}
const voltar = (tipo: "ok" | "erro", msg: string): never => redirect(`/utilizadores?${tipo}=${encodeURIComponent(msg)}`);

export async function criarUtilizador(form: FormData) {
  await soAdmin();
  const nome = String(form.get("nome") ?? "").trim();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const cargo = String(form.get("cargo") ?? "");
  const senha = String(form.get("senha") ?? "");
  if (!nome || email.length < 3 || /\s/.test(email)) voltar("erro", "Preencha o nome e um email válido (sem espaços).");
  if (!(CARGOS as readonly string[]).includes(cargo)) voltar("erro", "Cargo inválido.");
  if (senha.length < 10) voltar("erro", "A palavra-passe deve ter pelo menos 10 caracteres.");
  const r = await queryOne<{ id: number }>(
    "INSERT INTO users (nome,email,password_hash,cargo) VALUES (?,?,?,?) ON CONFLICT (email) DO NOTHING RETURNING id",
    [nome, email, hashPassword(senha), cargo]);
  if (!r) voltar("erro", "Já existe um utilizador com esse email.");
  revalidatePath("/utilizadores");
  voltar("ok", `Utilizador ${nome} criado.`);
}

/** O admin não altera a própria conta aqui: garante que há sempre pelo menos um admin ativo. */
async function alvo(id: number) {
  const eu = await soAdmin();
  if (eu.id === id) voltar("erro", "Não pode alterar a sua própria conta aqui. Use «Alterar palavra-passe» no seu perfil.");
  const u = await queryOne<{ id: number; nome: string; ativo: number }>("SELECT id, nome, ativo FROM users WHERE id = ?", [id]);
  if (!u) voltar("erro", "Utilizador não encontrado.");
  return u!;
}

export async function atualizarCargo(id: number, form: FormData) {
  const u = await alvo(id);
  const cargo = String(form.get("cargo") ?? "");
  if (!(CARGOS as readonly string[]).includes(cargo)) voltar("erro", "Cargo inválido.");
  await query("UPDATE users SET cargo = ? WHERE id = ?", [cargo, id]);
  await query("DELETE FROM sessions WHERE user_id = ?", [id]); // obriga a entrar de novo com o cargo novo
  revalidatePath("/utilizadores");
  voltar("ok", `Cargo de ${u.nome} atualizado.`);
}

export async function alternarAtivo(id: number) {
  const u = await alvo(id);
  const novo = u.ativo ? 0 : 1;
  await query("UPDATE users SET ativo = ? WHERE id = ?", [novo, id]);
  if (!novo) await query("DELETE FROM sessions WHERE user_id = ?", [id]);
  revalidatePath("/utilizadores");
  voltar("ok", `${u.nome} ${novo ? "reativado" : "desativado"}.`);
}

export async function redefinirSenha(id: number, form: FormData) {
  const u = await alvo(id);
  const senha = String(form.get("senha") ?? "");
  if (senha.length < 10) voltar("erro", "A palavra-passe deve ter pelo menos 10 caracteres.");
  await query("UPDATE users SET password_hash = ? WHERE id = ?", [hashPassword(senha), id]);
  await query("DELETE FROM sessions WHERE user_id = ?", [id]);
  voltar("ok", `Palavra-passe de ${u.nome} redefinida. Diga-lhe a nova palavra-passe.`);
}

// ---------- Empresas (só admin) ----------
const voltarEmpresas = (tipo: "ok" | "erro", msg: string): never => redirect(`/empresas?${tipo}=${encodeURIComponent(msg)}`);

export async function guardarEmpresa(id: number | null, form: FormData) {
  const u = await requireUser();
  if (u.cargo !== "admin") redirect("/");
  const nome = String(form.get("nome") ?? "").trim();
  const nif = String(form.get("nif") ?? "").replace(/\s/g, "") || null;
  const morada = txt(form.get("morada"));
  const cp = txt(form.get("codigo_postal"));
  const localidade = txt(form.get("localidade"));
  if (!nome) voltarEmpresas("erro", "Escreva o nome da empresa.");
  if (nif && !/^\d{9}$/.test(nif)) voltarEmpresas("erro", "O NIF deve ter 9 números.");
  if (nif && !nifValido(nif)) voltarEmpresas("erro", `O NIF ${nif} não é válido (o último dígito, de controlo, não bate certo). Confirme o número.`);
  if (cp && !/^\d{4}-\d{3}$/.test(cp)) voltarEmpresas("erro", "O código postal deve ter o formato 0000-000.");
  try {
    if (id) await query("UPDATE empresas SET nome = ?, nif = ?, morada = ?, codigo_postal = ?, localidade = ? WHERE id = ?", [nome, nif, morada, cp, localidade, id]);
    else await query("INSERT INTO empresas (nome, nif, morada, codigo_postal, localidade) VALUES (?, ?, ?, ?, ?)", [nome, nif, morada, cp, localidade]);
  } catch {
    voltarEmpresas("erro", "Já existe uma empresa com esse nome ou NIF.");
  }
  revalidatePath("/empresas");
  voltarEmpresas("ok", id ? "Empresa atualizada." : `Empresa ${nome} criada.`);
}

// ---------- Envio à contabilidade ----------
const MAX_ANEXOS = 20 * 1024 * 1024; // a maioria dos servidores de email recusa mais do que ~25 MB

export async function enviarContabilidade(form: FormData) {
  const user = await podeEditar();
  if (!user) redirect("/");
  const filtro = lerFiltro({ mes: form.get("mes"), empresa: form.get("empresa"), estado: form.get("estado") });
  const voltar = (tipo: "ok" | "erro", msg: string): never => redirect(`/contabilidade?${paraQuery(filtro)}&${tipo}=${encodeURIComponent(msg)}`);

  if (!emailConfigurado()) voltar("erro", "O envio por email ainda não está configurado. Use «Descarregar ZIP» ou veja as instruções na página.");
  const para = String(form.get("para") ?? "").split(/[,;\s]+/).filter(Boolean);
  if (!para.length || !para.every((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))) voltar("erro", "Escreva um email de destino válido.");
  const faturas = await faturasDoPacote(user, filtro);
  if (!faturas.length) voltar("erro", "Não há faturas para enviar neste período.");

  // O Excel resume; os originais vão em anexo com o QR code intacto (para o TOConline os ler)
  const anexos: Anexo[] = [{ filename: `faturas-${filtro.mes}.xlsx`, content: await excelFaturas(faturas, "") }];
  let bytes = anexos[0].content.length;
  for (const f of faturas) {
    if (!f.ficheiro_id) continue;
    const fi = await carregarFicheiro(f.ficheiro_id);
    if (!fi) continue;
    bytes += fi.dados.length;
    if (bytes > MAX_ANEXOS) voltar("erro", "Os anexos passam os 20 MB. Use «Descarregar ZIP» e envie por outro meio, ou envie por empresa.");
    anexos.push({ filename: nomeFicheiro(f), content: Buffer.from(fi.dados) });
  }

  let erro: string | null = null;
  try {
    await enviarEmail({ para, assunto: String(form.get("assunto") ?? "").trim() || `Faturas ${filtro.mes}`, texto: String(form.get("mensagem") ?? ""), anexos });
  } catch (e) {
    erro = `Falha ao enviar: ${(e as Error).message}`;
  }
  if (erro) voltar("erro", erro);

  await marcarComoEnviadas(faturas.map((f) => f.id));
  for (const f of faturas) await registar(user, f.id, "enviada", { para });
  await guardarConfig("email_contabilidade", para.join(", "));
  revalidatePath("/", "layout");
  voltar("ok", `Enviado para ${para.join(", ")}: ${faturas.length} faturas.`);
}

/** Para quem descarregou o ZIP e enviou por outro meio (WhatsApp, email próprio…). */
export async function marcarEnviadas(form: FormData) {
  const user = await podeEditar();
  if (!user) redirect("/");
  const filtro = lerFiltro({ mes: form.get("mes"), empresa: form.get("empresa"), estado: form.get("estado") });
  const faturas = await faturasDoPacote(user, filtro);
  await marcarComoEnviadas(faturas.map((f) => f.id));
  for (const f of faturas) await registar(user, f.id, "enviada", { via: "manual" });
  revalidatePath("/", "layout");
  redirect(`/contabilidade?${paraQuery(filtro)}&ok=${encodeURIComponent(`${faturas.length} faturas marcadas como enviadas.`)}`);
}
