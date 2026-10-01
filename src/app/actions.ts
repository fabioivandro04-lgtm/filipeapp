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
import { emailConfigurado, enviarEmail, listaEmails, type Anexo } from "@/lib/email";
import { enviarAlertas, FREQUENCIAS, guardarDefinicoesAlertas, lerDefinicoesAlertas, TIPOS_ALERTA, type Frequencia, type TipoAlerta } from "@/lib/alertas-email";
import { excelFaturas, nomeFicheiro } from "@/lib/excel";
import { guardarConfig } from "@/lib/config";
import { CAMPOS_EDITAVEIS, diferencas, registar, type Diferencas } from "@/lib/historico";
import { nifValido } from "@/lib/nif";
import { descricaoDe, ESTADOS, lerFicheiroStock, planear, ROTULO_CAMPO, type Estado, type EstadoFolha, type Existente, type Plano } from "@/lib/stock";
import { maquinaPorNumero, maquinasExistentes } from "@/lib/queries";
import { extrairFatura, extracaoDisponivel, type FaturaExtraida } from "@/lib/extract";
import { ROTULO_DOCUMENTO, TIPOS_DOCUMENTO, type TipoDocumento } from "@/lib/prazos";
import { fotosParaPdf, imagemConvertivel } from "@/lib/pdf";

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
  await registar(u, null, "utilizador_senha_propria", { nome: u.nome });
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

/** Procura a empresa pelo nome (cria se não existir). Devolve "apagada" se existir mas estiver apagada. */
async function obterEmpresaId(nome: string | null): Promise<number | null | "apagada"> {
  if (!nome) return null;
  const e = await queryOne<{ id: number; apagada_em: string | null }>("SELECT id, apagada_em FROM empresas WHERE LOWER(nome) = LOWER(?)", [nome]);
  if (e) return e.apagada_em ? "apagada" : e.id;
  return (await queryOne<{ id: number }>("INSERT INTO empresas (nome) VALUES (?) RETURNING id", [nome]))!.id;
}
const MSG_EMPRESA_APAGADA = (n: string) => `A empresa «${n}» foi apagada. Peça a um administrador para a restaurar (Mais → Apagados).`;

export type VerificacaoQr = { duplicada?: { id: number; fornecedor: string | null; numero: string | null }; empresa?: string | null };

/** Logo depois de ler o QR no telemóvel: já existe esta fatura? E de que empresa do grupo é? (antes de enviar) */
export async function verificarQr(texto: string): Promise<VerificacaoQr> {
  const u = await requireUser();
  if (!editaDireto(u)) return {};
  const qr = lerQrFiscal(texto);
  if (!qr) return {};
  const dup = await queryOne<{ id: number; fornecedor: string | null; numero: string | null }>(
    `SELECT id, fornecedor, numero FROM faturas WHERE apagada_em IS NULL AND ((? NOT IN ('', '0') AND atcud = ?) OR (nif_fornecedor = ? AND numero = ?)) ORDER BY id LIMIT 1`,
    [qr.atcud ?? "", qr.atcud ?? "", qr.nifEmitente ?? "", qr.numero ?? ""]);
  const emp = qr.nifAdquirente ? await queryOne<{ nome: string }>("SELECT nome FROM empresas WHERE nif = ? AND apagada_em IS NULL", [qr.nifAdquirente]) : undefined;
  return { duplicada: dup, empresa: emp?.nome ?? null };
}

/** Guarda e lê UMA fatura. O browser chama-a uma vez por ficheiro. */
export async function carregarFatura(form: FormData): Promise<ResultadoUpload> {
  const user = await requireUser();
  if (!editaDireto(user)) return { erro: "O seu cargo não permite carregar faturas." };
  // Uma fatura = um ficheiro (PDF ou foto) ou várias fotos («páginas»), que se juntam num só PDF
  const paginas = form.getAll("pagina").filter((v): v is File => v instanceof File && v.size > 0);
  const unico = form.get("ficheiro");
  const ficheiros = paginas.length ? paginas : unico instanceof File && unico.size > 0 ? [unico] : [];
  if (!ficheiros.length) return { erro: "Ficheiro em falta." };
  for (const f of ficheiros) if (!MIMES.has(f.type)) return { erro: `Tipo de ficheiro não suportado: ${f.name}` };
  if (ficheiros.reduce((s, f) => s + f.size, 0) > MAX_BYTES) return { erro: "A fatura é demasiado grande (máx. 4 MB). Tente fotos em vez de PDF, ou menos páginas." };

  const categoriaManual = String(form.get("categoria") ?? "");
  // Fotos são guardadas como PDF (com a foto intacta): é o formato que a plataforma da contabilidade lê, QR incluído
  let file: { type: string } = ficheiros[0];
  let bytes = Buffer.from(await ficheiros[0].arrayBuffer());
  let paraLer = { bytes, mime: ficheiros[0].type }; // o que a leitura automática recebe
  if (ficheiros.every((f) => imagemConvertivel(f.type))) {
    const imagens = await Promise.all(ficheiros.map(async (f) => ({ bytes: new Uint8Array(await f.arrayBuffer()), mime: f.type })));
    try {
      bytes = Buffer.from(await fotosParaPdf(imagens));
      file = { type: "application/pdf" };
      paraLer = ficheiros.length === 1 ? { bytes: Buffer.from(imagens[0].bytes), mime: imagens[0].mime } : { bytes, mime: "application/pdf" };
    } catch { /* se a conversão falhar, guarda a foto como veio */ }
  } else if (ficheiros.length > 1) return { erro: "Várias páginas só com fotos (JPEG/PNG)." };
  const nomeEmpresa = String(form.get("empresa") ?? "").trim() || null;
  let empresaId = await obterEmpresaId(nomeEmpresa);
  if (empresaId === "apagada") return { erro: MSG_EMPRESA_APAGADA(nomeEmpresa!) };
  const qr = lerQrFiscal(String(form.get("qr") ?? "")); // QR fiscal da AT, lido no browser
  const notas: string[] = [];

  let d: FaturaExtraida | null = null;
  if (extracaoDisponivel()) {
    try { d = await extrairFatura(paraLer.bytes, paraLer.mime); } catch (e) { notas.push(`Leitura automática falhou: ${(e as Error).message}`); }
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
  if (!empresaId && qr?.nifAdquirente) {
    empresaId = (await queryOne<{ id: number }>("SELECT id FROM empresas WHERE nif = ? AND apagada_em IS NULL", [qr.nifAdquirente]))?.id ?? null;
    if (!empresaId) notas.push(`O NIF do cliente ${qr.nifAdquirente} ainda não está associado a nenhuma empresa.`);
  }

  // Ligação por identificadores estáveis (nunca só pela morada: há moradas repetidas)
  let predioId: number | null = null, maquinaId: number | null = null;
  if (d?.identificador) {
    const p = await queryOne<{ id: number }>("SELECT id FROM predios WHERE codigo_contador = ? AND apagada_em IS NULL", [d.identificador]);
    predioId = p?.id ?? null;
    if (!p && (d.categoria === "energia" || d.categoria === "agua")) notas.push(`Identificador ${d.identificador} não corresponde a nenhum prédio.`);
  }
  if (d?.numero_interno_maquina) {
    const m = await maquinaPorNumero(d.numero_interno_maquina);
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
  if (direto) {
    const r = await obterEmpresaId(nomeEmpresa);
    if (r === "apagada") volta("erro", MSG_EMPRESA_APAGADA(nomeEmpresa!));
    empresaId = r as number | null;
  } else if (nomeEmpresa) {
    // Uma proposta não cria empresas: só usa as que já existem
    empresaId = (await queryOne<{ id: number }>("SELECT id FROM empresas WHERE LOWER(nome) = LOWER(?) AND apagada_em IS NULL", [nomeEmpresa]))?.id ?? null;
    if (!empresaId) volta("erro", `A empresa «${nomeEmpresa}» não existe. Peça a um administrador para a criar em Empresas.`);
  }

  const predioId = num(form.get("predio_id"));
  const identificador = txt(form.get("identificador"));
  const nifAdquirente = txt(form.get("nif_adquirente"));
  const numMaquina = txt(form.get("maquina"));
  let maquinaId: number | null = null;
  if (numMaquina) {
    const m = await maquinaPorNumero(numMaquina);
    if (!m) volta("erro", `A máquina «${numMaquina}» não existe. Escreva o nº interno (ex.: SL 005 ou IN003) ou deixe em branco.`);
    maquinaId = m!.id;
  }
  const depois: Campos = {
    fornecedor: txt(form.get("fornecedor")), nif_fornecedor: txt(form.get("nif")), numero: txt(form.get("numero")), data: txt(form.get("data")),
    total: num(form.get("total")), iva: num(form.get("iva")), categoria: String(form.get("categoria")), empresa_id: empresaId,
    predio_id: predioId, maquina_id: maquinaId, identificador, nif_adquirente: nifAdquirente, revisada: form.get("revisada") ? 1 : 0,
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

// ---------- Empresas, prédios e máquinas: criar, editar, apagar e restaurar (só admin) ----------
type Entidade = "empresas" | "predios" | "maquinas";
const ENTIDADES: Record<Entidade, { tipo: string; artigo: string; coluna: string }> = {
  empresas: { tipo: "empresa", artigo: "a empresa", coluna: "nome" },
  predios: { tipo: "predio", artigo: "o prédio", coluna: "nome" },
  maquinas: { tipo: "maquina", artigo: "a máquina", coluna: "numero_interno" },
};
const AGORA = "to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')";

async function adminOuSai() {
  const u = await requireUser();
  if (u.cargo !== "admin") redirect("/");
  return u;
}
const irPara = (pagina: string, tipo: "ok" | "erro", msg: string): never => redirect(`${pagina}?${tipo}=${encodeURIComponent(msg)}`);

export async function apagarEntidade(tabela: Entidade, id: number) {
  const u = await adminOuSai();
  const E = ENTIDADES[tabela];
  if (!E) return;
  const r = await queryOne<{ nome: string }>(`SELECT ${E.coluna} AS nome FROM ${tabela} WHERE id = ? AND apagada_em IS NULL`, [id]);
  if (!r) irPara(`/${tabela}`, "erro", "Já foi apagado ou não existe.");
  await query(`UPDATE ${tabela} SET apagada_em = ${AGORA} WHERE id = ?`, [id]);
  await registar(u, null, `${E.tipo}_apagada`, { nome: r!.nome, [`${E.tipo}_id`]: id });
  revalidatePath("/", "layout");
  irPara(`/${tabela}`, "ok", `Apagado: ${r!.nome}. Pode restaurar em Mais → Apagados.`);
}

export async function restaurarEntidade(tabela: Entidade, id: number) {
  const u = await adminOuSai();
  const E = ENTIDADES[tabela];
  if (!E) return;
  const r = await queryOne<{ nome: string }>(`SELECT ${E.coluna} AS nome FROM ${tabela} WHERE id = ? AND apagada_em IS NOT NULL`, [id]);
  if (!r) irPara("/apagados", "erro", "Não encontrado.");
  await query(`UPDATE ${tabela} SET apagada_em = NULL WHERE id = ?`, [id]);
  await registar(u, null, `${E.tipo}_restaurada`, { nome: r!.nome, [`${E.tipo}_id`]: id });
  revalidatePath("/", "layout");
  irPara("/apagados", "ok", `Restaurado: ${r!.nome}.`);
}

export async function criarPredio(form: FormData) {
  const u = await adminOuSai();
  const nome = String(form.get("nome") ?? "").trim();
  if (!nome) irPara("/predios", "erro", "Escreva o nome do prédio.");
  await query("INSERT INTO predios (nome,morada,codigo_contador) VALUES (?,?,?)", [nome, txt(form.get("morada")), txt(form.get("codigo"))]);
  await registar(u, null, "predio_criada", { nome });
  revalidatePath("/predios");
  irPara("/predios", "ok", `Prédio ${nome} criado.`);
}

export async function atualizarPredio(id: number, form: FormData) {
  const u = await adminOuSai();
  const nome = String(form.get("nome") ?? "").trim();
  if (!nome) irPara(`/predios/${id}`, "erro", "O nome não pode ficar vazio.");
  await query("UPDATE predios SET nome = ?, morada = ?, codigo_contador = ? WHERE id = ?", [nome, txt(form.get("morada")), txt(form.get("codigo")), id]);
  await registar(u, null, "predio_editada", { nome, predio_id: id });
  revalidatePath("/", "layout");
  irPara(`/predios/${id}`, "ok", "Prédio atualizado.");
}

/** Campos da ficha da máquina comparados para o histórico (o que mudou em cada edição). */
const CAMPOS_MAQUINA_EDITAVEIS = [
  "numero_interno", "empresa_id", "designacao", "marca", "modelo", "ano", "id_fornecedor", "numero_serie", "peso_kg", "matricula", "horas",
  "data_compra", "data_chegada", "fornecedor", "agencia", "valor_compra", "facturada", "observacoes", "estado", "venda_fatura", "comprador", "data_venda",
] as const;

const inteiro = (v: FormDataEntryValue | null) => { const n = num(v); return n == null ? null : Math.round(n); };
const estadoValido = (v: FormDataEntryValue | null): Estado => ((ESTADOS as string[]).includes(String(v)) ? (String(v) as Estado) : "stock");

export async function criarMaquina(form: FormData) {
  const u = await adminOuSai();
  const numero = String(form.get("numero") ?? "").trim();
  if (!numero) irPara("/maquinas", "erro", "Escreva o nº interno da máquina.");
  const d = { designacao: txt(form.get("designacao")), marca: txt(form.get("marca")), modelo: txt(form.get("modelo")) };
  let r: { id: number } | undefined;
  try {
    r = await queryOne<{ id: number }>(
      "INSERT INTO maquinas (numero_interno, descricao, empresa_id, designacao, marca, modelo, estado) VALUES (?,?,?,?,?,?, 'stock') RETURNING id",
      [numero, descricaoDe(d) || null, num(form.get("empresa")), d.designacao, d.marca, d.modelo]);
  } catch { r = undefined; }
  if (!r) irPara("/maquinas", "erro", `Já existe uma máquina com o nº ${numero} (pode estar apagada: veja Mais → Apagados).`);
  await registar(u, null, "maquina_criada", { nome: numero, maquina_id: r!.id });
  revalidatePath("/maquinas");
  irPara(`/maquinas/${r!.id}`, "ok", `Máquina ${numero} criada. Complete os dados abaixo.`);
}

/** Admin e operador editam as máquinas (o operador atualiza o stock no dia a dia). */
export async function atualizarMaquina(id: number, form: FormData) {
  const u = await podeEditar();
  if (!u) redirect("/");
  const numero = String(form.get("numero") ?? "").trim();
  if (!numero) irPara(`/maquinas/${id}`, "erro", "O nº interno não pode ficar vazio.");
  const d = { designacao: txt(form.get("designacao")), marca: txt(form.get("marca")), modelo: txt(form.get("modelo")) };
  const antes = await queryOne<Record<string, unknown>>(`SELECT ${CAMPOS_MAQUINA_EDITAVEIS.join(",")} FROM maquinas WHERE id = ?`, [id]);
  try {
    await query(
      `UPDATE maquinas SET numero_interno=?, descricao=?, empresa_id=?, designacao=?, marca=?, modelo=?, ano=?, id_fornecedor=?, numero_serie=?, peso_kg=?,
         matricula=?, horas=?, data_compra=?, data_chegada=?, fornecedor=?, agencia=?, valor_compra=?, facturada=?, observacoes=?, estado=?,
         venda_fatura=?, comprador=?, data_venda=?, atualizada_em=${AGORA} WHERE id=?`,
      [numero, descricaoDe(d) || null, num(form.get("empresa")), d.designacao, d.marca, d.modelo, inteiro(form.get("ano")), txt(form.get("id_fornecedor")),
        txt(form.get("numero_serie")), inteiro(form.get("peso_kg")), txt(form.get("matricula")), num(form.get("horas")), txt(form.get("data_compra")),
        txt(form.get("data_chegada")), txt(form.get("fornecedor")), txt(form.get("agencia")), num(form.get("valor_compra")), txt(form.get("facturada")),
        txt(form.get("observacoes")), estadoValido(form.get("estado")), txt(form.get("venda_fatura")), txt(form.get("comprador")), txt(form.get("data_venda")), id]);
  } catch {
    irPara(`/maquinas/${id}`, "erro", `Já existe outra máquina com o nº ${numero}.`);
  }
  const depois = await queryOne<Record<string, unknown>>(`SELECT ${CAMPOS_MAQUINA_EDITAVEIS.join(",")} FROM maquinas WHERE id = ?`, [id]);
  const mudou: Diferencas = {};
  for (const c of CAMPOS_MAQUINA_EDITAVEIS) {
    const a = antes?.[c] ?? null, b = depois?.[c] ?? null;
    if (String(a ?? "") !== String(b ?? "")) mudou[c] = [a, b];
  }
  if (Object.keys(mudou).length) await registar(u, null, "maquina_editada", { nome: numero, maquina_id: id, mudou });
  revalidatePath("/", "layout");
  irPara(`/maquinas/${id}`, "ok", "Máquina atualizada.");
}

// ---------- Importar stock (ficheiros Excel) ----------
export type ResultadoStock = {
  erro?: string;
  importado?: boolean;
  empresa?: string;
  folhas?: { nome: string; sugerido: EstadoFolha; estado: EstadoFolha; n: number; ignoradas: number }[];
  resumo?: { total: number; novas: number; atualizar: number; iguais: number; duplicadas: number; renumeradas: number; ignoradas: number; semValor: number; porEstado: Record<string, number> };
  renumeradas?: Plano["renumeradas"];
  duplicadas?: Plano["duplicadas"];
  ignoradas?: Plano["ignoradas"];
  atualizacoes?: { numero: string; mudancas: string[] }[];
};

const COLUNAS_MAQUINA = [
  "numero_interno", "descricao", "empresa_id", "designacao", "marca", "modelo", "ano", "id_fornecedor", "numero_serie", "peso_kg", "matricula", "horas",
  "data_compra", "data_chegada", "fornecedor", "agencia", "valor_compra", "valor_compra_original", "facturada", "observacoes", "estado", "assinalada",
  "venda_fatura", "comprador", "data_venda", "origem", "atualizada_em",
] as const;

/**
 * Analisa (modo «analisar») ou importa (modo «importar») um ficheiro de stock de UMA empresa.
 * As duas fases usam exatamente o mesmo plano, por isso o que a pré-visualização mostra é o que se importa.
 * Importar de novo o mesmo ficheiro não duplica nada: atualiza só o que mudou (ex.: uma máquina que passou a vendida).
 */
export async function processarStock(form: FormData): Promise<ResultadoStock> {
  const user = await requireUser();
  if (user.cargo !== "admin") return { erro: "Só um administrador pode importar stock." };
  const file = form.get("ficheiro");
  if (!(file instanceof File) || file.size === 0) return { erro: "Escolha um ficheiro Excel (.xlsx)." };
  if (!/\.xlsx$/i.test(file.name)) return { erro: "O ficheiro tem de ser um Excel .xlsx (não .xls nem .csv)." };
  if (file.size > MAX_BYTES) return { erro: "O ficheiro é demasiado grande (máx. 4 MB)." };
  const empresa = await queryOne<{ id: number; nome: string }>("SELECT id, nome FROM empresas WHERE id = ? AND apagada_em IS NULL", [num(form.get("empresa"))]);
  if (!empresa) return { erro: "Escolha a empresa a que o ficheiro pertence." };

  let escolhidos: Record<string, EstadoFolha> = {};
  try {
    const bruto = JSON.parse(String(form.get("estados") || "{}")) as Record<string, string>;
    for (const [folha, e] of Object.entries(bruto)) if ((ESTADOS as string[]).includes(e) || e === "ignorar") escolhidos[folha] = e as EstadoFolha;
  } catch { escolhidos = {}; }

  let folhas;
  try {
    folhas = await lerFicheiroStock(Buffer.from(await file.arrayBuffer()));
  } catch {
    return { erro: "Não consegui ler o ficheiro. Confirme que é um Excel (.xlsx) e que não tem palavra-passe." };
  }
  if (!folhas.length) return { erro: "Não encontrei nenhuma folha com as colunas «Designação do equipamento» e «Nº Interno»." };

  const existentes = (await maquinasExistentes()) as unknown as Existente[];
  const plano = planear(folhas, escolhidos, empresa.id, existentes, { limparVazios: form.get("vazios") === "limpar" });
  const porEstado: Record<string, number> = {};
  for (const it of plano.itens) porEstado[it.l.estado] = (porEstado[it.l.estado] ?? 0) + 1;
  const novas = plano.itens.filter((i) => i.acao === "nova");
  const atualizar = plano.itens.filter((i) => i.acao === "atualizar");

  const resultado: ResultadoStock = {
    empresa: empresa.nome,
    folhas: folhas.map((f) => ({ nome: f.nome, sugerido: f.sugerido, estado: escolhidos[f.nome] ?? f.sugerido, n: f.linhas.length, ignoradas: f.ignoradas.length })),
    resumo: {
      total: plano.itens.length, novas: novas.length, atualizar: atualizar.length, iguais: plano.itens.length - novas.length - atualizar.length,
      duplicadas: plano.duplicadas.length, renumeradas: plano.renumeradas.length, ignoradas: plano.ignoradas.length, semValor: plano.semValor, porEstado,
    },
    renumeradas: plano.renumeradas, duplicadas: plano.duplicadas, ignoradas: plano.ignoradas,
    atualizacoes: atualizar.slice(0, 40).map((i) => ({ numero: i.numeroFinal, mudancas: i.mudancas.map((m) => ROTULO_CAMPO[m] ?? m) })),
  };
  if (form.get("modo") !== "importar") return resultado;

  // ---- importar ----
  const agora = new Date().toISOString().slice(0, 19).replace("T", " ");
  const origem = file.name.slice(0, 120);
  const linhaBd = (i: (typeof plano.itens)[number]) => {
    const l = i.l;
    return [i.numeroFinal, descricaoDe(l) || null, empresa.id, l.designacao, l.marca, l.modelo, l.ano, l.id_fornecedor, l.numero_serie, l.peso_kg, l.matricula, l.horas,
      l.data_compra, l.data_chegada, l.fornecedor, l.agencia, l.valor_compra, l.valor_compra_original, l.facturada, l.observacoes, l.estado, l.assinalada ? 1 : 0,
      l.venda_fatura, l.comprador, l.data_venda, origem, agora];
  };
  try {
    for (let i = 0; i < novas.length; i += 40) {
      const bloco = novas.slice(i, i + 40);
      const marcas = bloco.map(() => `(${COLUNAS_MAQUINA.map(() => "?").join(",")})`).join(",");
      await query(`INSERT INTO maquinas (${COLUNAS_MAQUINA.join(",")}) VALUES ${marcas}`, bloco.flatMap(linhaBd));
    }
    for (const it of atualizar) {
      const valores = linhaBd(it);
      const dadoDe = (col: string) => valores[COLUNAS_MAQUINA.indexOf(col as (typeof COLUNAS_MAQUINA)[number])];
      // só as colunas que mudaram (+ descrição, origem e data); «empresa» = adotar uma máquina que estava sem empresa
      const cols = new Set<string>(["descricao", "origem", "atualizada_em"]);
      for (const m of it.mudancas) cols.add(m === "empresa" ? "empresa_id" : m);
      const lista = [...cols].filter((c) => (COLUNAS_MAQUINA as readonly string[]).includes(c));
      await query(`UPDATE maquinas SET ${lista.map((c) => `${c} = ?`).join(", ")} WHERE id = ?`, [...lista.map(dadoDe), it.id]);
    }
  } catch (e) {
    return { ...resultado, erro: `A importação parou a meio (${(e as Error).message}). Pode voltar a importar o mesmo ficheiro: o que já entrou não é duplicado.` };
  }
  await registar(user, null, "maquinas_importadas", { resumo: `${origem} → ${empresa.nome}: ${novas.length} novas, ${atualizar.length} atualizadas` });
  revalidatePath("/", "layout");
  return { ...resultado, importado: true };
}

/** Cria uma fatura sem ficheiro (para lançar à mão) e abre-a para preencher. */
export async function criarFaturaManual() {
  const u = await podeEditar();
  if (!u) redirect("/");
  const f = (await queryOne<{ id: number }>("INSERT INTO faturas (criado_por, categoria) VALUES (?, 'outros') RETURNING id", [u.id]))!;
  await registar(u, f.id, "criada", { manual: true });
  revalidatePath("/", "layout");
  redirect(`/faturas/${f.id}?ok=${encodeURIComponent("Fatura criada. Preencha os dados e guarde.")}`);
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
  await registar(await soAdmin(), null, "utilizador_criada", { nome });
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
  await registar(await soAdmin(), null, "utilizador_cargo", { nome: u.nome, cargo });
  revalidatePath("/utilizadores");
  voltar("ok", `Cargo de ${u.nome} atualizado.`);
}

export async function alternarAtivo(id: number) {
  const u = await alvo(id);
  const novo = u.ativo ? 0 : 1;
  await query("UPDATE users SET ativo = ? WHERE id = ?", [novo, id]);
  if (!novo) await query("DELETE FROM sessions WHERE user_id = ?", [id]);
  await registar(await soAdmin(), null, novo ? "utilizador_restaurada" : "utilizador_apagada", { nome: u.nome });
  revalidatePath("/", "layout");
  voltar("ok", `${u.nome} ${novo ? "reativado" : "desativado"}.`);
}

export async function redefinirSenha(id: number, form: FormData) {
  const u = await alvo(id);
  const senha = String(form.get("senha") ?? "");
  if (senha.length < 10) voltar("erro", "A palavra-passe deve ter pelo menos 10 caracteres.");
  await query("UPDATE users SET password_hash = ? WHERE id = ?", [hashPassword(senha), id]);
  await query("DELETE FROM sessions WHERE user_id = ?", [id]);
  await registar(await soAdmin(), null, "utilizador_senha", { nome: u.nome });
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
    voltarEmpresas("erro", "Já existe uma empresa com esse nome ou NIF (pode estar apagada: veja Mais → Apagados).");
  }
  await registar(u, null, id ? "empresa_editada" : "empresa_criada", { nome });
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

  if (!(await emailConfigurado())) voltar("erro", "O envio por email ainda não está configurado. Use «Descarregar ZIP» ou veja as instruções na página.");
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

// ---------- Documentos com prazo (seguro, inspeção, IUC…) ----------
/** Só aceita caminhos internos (evita redirecionar para outro site). */
const destino = (v: FormDataEntryValue | null, padrao: string) => { const s = String(v ?? ""); return s.startsWith("/") && !s.startsWith("//") ? s : padrao; };
const dataValida = (v: FormDataEntryValue | null) => { const s = String(v ?? "").trim(); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null; };

async function guardarAnexo(v: FormDataEntryValue | null): Promise<number | null | "erro"> {
  if (!(v instanceof File) || v.size === 0) return null;
  if (!MIMES.has(v.type) || v.size > MAX_BYTES) return "erro";
  return (await queryOne<{ id: number }>("INSERT INTO ficheiros (mime,dados) VALUES (?,?) RETURNING id", [v.type, Buffer.from(await v.arrayBuffer())]))!.id;
}

export async function guardarDocumento(id: number | null, form: FormData) {
  const u = await podeEditar();
  if (!u) redirect("/");
  const voltarA = destino(form.get("voltar"), "/prazos");
  const tipo = String(form.get("tipo") ?? "");
  const validade = dataValida(form.get("validade"));
  if (!(TIPOS_DOCUMENTO as readonly string[]).includes(tipo)) irPara(voltarA, "erro", "Escolha o tipo de documento.");
  if (!validade) irPara(voltarA, "erro", "Indique a data de validade.");
  // A máquina pode vir pelo id (ficha da máquina) ou pelo nº interno escrito (página Prazos)
  let maquinaId = num(form.get("maquina_id"));
  const numero = txt(form.get("maquina"));
  if (!maquinaId && numero) {
    const m = await maquinaPorNumero(numero);
    if (!m) irPara(voltarA, "erro", `Não encontrei a máquina ${numero}.`);
    maquinaId = m!.id;
  }
  const empresaId = num(form.get("empresa"));
  if (!maquinaId && !empresaId) irPara(voltarA, "erro", "Indique a máquina ou a empresa a que o documento pertence.");
  const anexo = await guardarAnexo(form.get("ficheiro"));
  if (anexo === "erro") irPara(voltarA, "erro", "O ficheiro tem de ser PDF ou foto, até 4 MB.");
  const dados = [maquinaId, empresaId, tipo, txt(form.get("descricao")), validade, txt(form.get("notas"))];
  let docId = id;
  if (id) {
    await query(`UPDATE documentos SET maquina_id=?, empresa_id=?, tipo=?, descricao=?, validade=?, notas=?${anexo ? ", ficheiro_id=?" : ""} WHERE id=? AND apagado_em IS NULL`,
      [...dados, ...(anexo ? [anexo] : []), id]);
  } else {
    docId = (await queryOne<{ id: number }>("INSERT INTO documentos (maquina_id, empresa_id, tipo, descricao, validade, notas, ficheiro_id, criado_por) VALUES (?,?,?,?,?,?,?,?) RETURNING id",
      [...dados, anexo, u!.id]))!.id;
  }
  const numeroMaquina = numero ?? (maquinaId ? (await queryOne<{ n: string }>("SELECT numero_interno AS n FROM maquinas WHERE id = ?", [maquinaId]))?.n : null);
  const descricao = txt(form.get("descricao"));
  const nome = `${ROTULO_DOCUMENTO[tipo as TipoDocumento]}${numeroMaquina ? ` de ${numeroMaquina}` : ""}${descricao ? ` (${descricao})` : ""}`;
  await registar(u, null, id ? "documento_editada" : "documento_criada", { nome, validade, documento_id: docId, maquina_id: maquinaId });
  revalidatePath("/", "layout");
  irPara(voltarA, "ok", id ? "Documento atualizado." : "Documento guardado.");
}

/** Renovar = nova data de validade (e, opcionalmente, o novo comprovativo). */
export async function renovarDocumento(id: number, form: FormData) {
  const u = await podeEditar();
  if (!u) redirect("/");
  const voltarA = destino(form.get("voltar"), "/prazos");
  const validade = dataValida(form.get("validade"));
  if (!validade) irPara(voltarA, "erro", "Indique a nova data de validade.");
  const anexo = await guardarAnexo(form.get("ficheiro"));
  if (anexo === "erro") irPara(voltarA, "erro", "O ficheiro tem de ser PDF ou foto, até 4 MB.");
  const d = await queryOne<{ tipo: TipoDocumento; validade: string; maquina_id: number | null; numero: string | null }>(
    "SELECT d.tipo, d.validade, d.maquina_id, m.numero_interno AS numero FROM documentos d LEFT JOIN maquinas m ON m.id = d.maquina_id WHERE d.id = ? AND d.apagado_em IS NULL", [id]);
  if (!d) irPara(voltarA, "erro", "Documento não encontrado.");
  await query(`UPDATE documentos SET validade = ?${anexo ? ", ficheiro_id = ?" : ""} WHERE id = ?`, [validade, ...(anexo ? [anexo] : []), id]);
  await registar(u, null, "documento_renovada", { nome: `${ROTULO_DOCUMENTO[d!.tipo] ?? d!.tipo}${d!.numero ? ` de ${d!.numero}` : ""}`, antes: d!.validade, validade, documento_id: id, maquina_id: d!.maquina_id });
  revalidatePath("/", "layout");
  irPara(voltarA, "ok", "Prazo renovado.");
}

export async function apagarDocumento(id: number, form: FormData) {
  const u = await adminOuSai();
  const voltarA = destino(form.get("voltar"), "/prazos");
  const d = await queryOne<{ tipo: TipoDocumento; maquina_id: number | null; numero: string | null }>(
    "SELECT d.tipo, d.maquina_id, m.numero_interno AS numero FROM documentos d LEFT JOIN maquinas m ON m.id = d.maquina_id WHERE d.id = ? AND d.apagado_em IS NULL", [id]);
  if (!d) irPara(voltarA, "erro", "Já foi apagado.");
  await query(`UPDATE documentos SET apagado_em = ${AGORA} WHERE id = ?`, [id]);
  await registar(u, null, "documento_apagada", { nome: `${ROTULO_DOCUMENTO[d!.tipo] ?? d!.tipo}${d!.numero ? ` de ${d!.numero}` : ""}`, documento_id: id, maquina_id: d!.maquina_id });
  revalidatePath("/", "layout");
  irPara(voltarA, "ok", "Documento apagado.");
}

// ---------- Alugueres (receitas por máquina) ----------
export async function guardarAluguer(maquinaId: number, id: number | null, form: FormData) {
  const u = await podeEditar();
  if (!u) redirect("/");
  const voltarA = `/maquinas/${maquinaId}`;
  const inicio = dataValida(form.get("inicio"));
  const fim = dataValida(form.get("fim"));
  const valor = num(form.get("valor"));
  if (!inicio) irPara(voltarA, "erro", "Indique a data de início do aluguer.");
  if (fim && fim < inicio!) irPara(voltarA, "erro", "A data de fim é anterior à de início.");
  if (valor == null || valor < 0) irPara(voltarA, "erro", "Indique o valor do aluguer (0 se ainda não foi faturado).");
  const m = await queryOne<{ numero_interno: string }>("SELECT numero_interno FROM maquinas WHERE id = ?", [maquinaId]);
  if (!m) irPara("/maquinas", "erro", "Máquina não encontrada.");
  const dados = [txt(form.get("cliente")), inicio, fim, valor, txt(form.get("fatura")), txt(form.get("notas"))];
  if (id) await query("UPDATE alugueres SET cliente=?, inicio=?, fim=?, valor=?, fatura=?, notas=? WHERE id=? AND maquina_id=? AND apagado_em IS NULL", [...dados, id, maquinaId]);
  else await query("INSERT INTO alugueres (maquina_id, cliente, inicio, fim, valor, fatura, notas, criado_por) VALUES (?,?,?,?,?,?,?,?)", [maquinaId, ...dados, u!.id]);
  await registar(u, null, id ? "aluguer_editada" : "aluguer_criada", { nome: `${m!.numero_interno} — ${dados[0] ?? "sem cliente"}`, valor, maquina_id: maquinaId });
  revalidatePath("/", "layout");
  irPara(voltarA, "ok", id ? "Aluguer atualizado." : "Aluguer registado.");
}

export async function apagarAluguer(maquinaId: number, id: number) {
  const u = await adminOuSai();
  const a = await queryOne<{ cliente: string | null; numero: string }>(
    "SELECT a.cliente, m.numero_interno AS numero FROM alugueres a JOIN maquinas m ON m.id = a.maquina_id WHERE a.id = ? AND a.apagado_em IS NULL", [id]);
  if (!a) irPara(`/maquinas/${maquinaId}`, "erro", "Já foi apagado.");
  await query(`UPDATE alugueres SET apagado_em = ${AGORA} WHERE id = ?`, [id]);
  await registar(u, null, "aluguer_apagada", { nome: `${a!.numero} — ${a!.cliente ?? "sem cliente"}`, maquina_id: maquinaId });
  revalidatePath("/", "layout");
  irPara(`/maquinas/${maquinaId}`, "ok", "Aluguer apagado.");
}

// ---------- Definições ----------
const voltarDefinicoes = (tipo: "ok" | "erro", msg: string, seccao = ""): never =>
  redirect(`/definicoes?${tipo}=${encodeURIComponent(msg)}${seccao ? `#${seccao}` : ""}`);

/** Cada pessoa muda o próprio nome (o email é o login e só o admin o muda, recriando o utilizador). */
export async function guardarPerfil(form: FormData) {
  const u = await requireUser();
  const nome = String(form.get("nome") ?? "").trim().slice(0, 80);
  if (!nome) voltarDefinicoes("erro", "O nome não pode ficar vazio.", "perfil");
  await query("UPDATE users SET nome = ? WHERE id = ?", [nome, u.id]);
  if (nome !== u.nome) await registar(u, null, "perfil_alterado", { nome: `${u.nome} → ${nome}` });
  revalidatePath("/", "layout");
  voltarDefinicoes("ok", "Perfil guardado.", "perfil");
}

export async function guardarAlertasEmail(form: FormData) {
  const u = await adminOuSai();
  const texto = String(form.get("emails") ?? "");
  const emails = listaEmails(texto);
  const invalidos = texto.split(/[,;\s]+/).filter((e) => e.trim() && !emails.includes(e.trim().toLowerCase()));
  if (invalidos.length) voltarDefinicoes("erro", `Email inválido: ${invalidos.join(", ")}`, "alertas");
  const tipos = form.getAll("tipos").map(String).filter((t): t is TipoAlerta => t in TIPOS_ALERTA);
  const f = String(form.get("frequencia") ?? "diario");
  const frequencia = (f in FREQUENCIAS ? f : "diario") as Frequencia;
  await guardarDefinicoesAlertas({ emails, tipos, frequencia });
  await registar(u, null, "definicoes_alertas", { resumo: `${emails.join(", ") || "ninguém"} · ${FREQUENCIAS[frequencia]}` });
  voltarDefinicoes("ok", emails.length ? "Alertas por email guardados." : "Guardado. Sem destinatários, não são enviados alertas.", "alertas");
}

export async function enviarAlertasAgora() {
  const u = await adminOuSai();
  let r: { enviado: boolean; motivo: string };
  try { r = await enviarAlertas({ automatico: false }); } catch (e) { r = { enviado: false, motivo: `Falha ao enviar: ${(e as Error).message}` }; }
  if (r.enviado) await registar(u, null, "alertas_enviados", { resumo: r.motivo });
  voltarDefinicoes(r.enviado ? "ok" : "erro", r.motivo, "alertas");
}

export async function guardarServidorEmail(form: FormData) {
  const u = await adminOuSai();
  const host = txt(form.get("host")), from = txt(form.get("from"));
  const porta = inteiro(form.get("porta")) ?? 587;
  if (!host || !from) voltarDefinicoes("erro", "Preencha o servidor e o remetente.", "email");
  if (!listaEmails(from!.replace(/.*<|>.*/g, "")).length) voltarDefinicoes("erro", "O remetente tem de ser um email (ex.: faturas@empresa.pt).", "email");
  await guardarConfig("smtp_host", host!);
  await guardarConfig("smtp_port", String(porta));
  await guardarConfig("smtp_user", txt(form.get("user")) ?? "");
  await guardarConfig("smtp_from", from!);
  // A palavra-passe só muda se escrever uma nova (o campo vem sempre vazio, por segurança)
  const pass = String(form.get("pass") ?? "");
  if (pass) await guardarConfig("smtp_pass", pass);
  await registar(u, null, "definicoes_email", { resumo: `${host}:${porta} · ${from}` });
  voltarDefinicoes("ok", "Servidor de email guardado. Use «Enviar email de teste» para confirmar.", "email");
}

export async function testarEmail() {
  const u = await adminOuSai();
  const para = u.email.includes("@") && !u.email.endsWith("@local") ? [u.email] : (await lerDefinicoesAlertas()).emails;
  if (!para.length) voltarDefinicoes("erro", "Não há para onde enviar: o seu login não é um email real e não há destinatários de alertas.", "email");
  try {
    await enviarEmail({ para, assunto: "GESTAO APP: email de teste", texto: "Se recebeu este email, o envio da GESTAO APP está a funcionar." });
  } catch (e) {
    voltarDefinicoes("erro", `O envio falhou: ${(e as Error).message}`, "email");
  }
  voltarDefinicoes("ok", `Email de teste enviado para ${para.join(", ")}.`, "email");
}

export async function guardarEmailContabilidade(form: FormData) {
  const u = await adminOuSai();
  const texto = String(form.get("emails") ?? "");
  const emails = listaEmails(texto);
  if (texto.trim() && !emails.length) voltarDefinicoes("erro", "Email da contabilidade inválido.", "contabilidade");
  await guardarConfig("email_contabilidade", emails.join(", "));
  await registar(u, null, "definicoes_contabilidade", { resumo: emails.join(", ") || "(vazio)" });
  voltarDefinicoes("ok", "Email da contabilidade guardado.", "contabilidade");
}
