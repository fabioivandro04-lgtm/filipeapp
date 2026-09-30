"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { query, queryOne, CATEGORIAS } from "@/lib/db";
import { login, logout, requireUser } from "@/lib/auth";
import { extrairFatura, extracaoDisponivel, type FaturaExtraida } from "@/lib/extract";

export async function entrar(_: string | null, form: FormData): Promise<string | null> {
  const ok = await login(String(form.get("email") ?? ""), String(form.get("password") ?? ""));
  if (ok === "bloqueado") return "Demasiadas tentativas. Tente novamente dentro de 15 minutos.";
  if (!ok) return "Email ou palavra-passe incorretos.";
  redirect("/");
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
  const file = form.get("ficheiro");
  if (!(file instanceof File) || file.size === 0) return { erro: "Ficheiro em falta." };
  if (!MIMES.has(file.type)) return { erro: `Tipo de ficheiro não suportado: ${file.name}` };
  if (file.size > MAX_BYTES) return { erro: `${file.name} é demasiado grande (máx. 4 MB). Tente uma foto em vez de PDF.` };

  const categoriaManual = String(form.get("categoria") ?? "");
  const empresaId = await obterEmpresaId(String(form.get("empresa") ?? "").trim() || null);
  const bytes = Buffer.from(await file.arrayBuffer());

  let d: FaturaExtraida | null = null;
  let alerta: string | null = null;
  if (extracaoDisponivel()) {
    try { d = await extrairFatura(bytes, file.type); } catch (e) { alerta = `Leitura automática falhou: ${(e as Error).message}`; }
  } else {
    alerta = "Sem leitura automática (falta ANTHROPIC_API_KEY): preencha os dados à mão.";
  }

  // Ligação por identificadores estáveis (nunca só pela morada: há moradas repetidas)
  let predioId: number | null = null, maquinaId: number | null = null;
  if (d?.identificador) {
    const p = await queryOne<{ id: number }>("SELECT id FROM predios WHERE codigo_contador = ?", [d.identificador]);
    predioId = p?.id ?? null;
    if (!p && (d.categoria === "energia" || d.categoria === "agua")) alerta = `Identificador ${d.identificador} não corresponde a nenhum prédio.`;
  }
  if (d?.numero_interno_maquina) {
    const m = await queryOne<{ id: number }>("SELECT id FROM maquinas WHERE numero_interno = ?", [d.numero_interno_maquina]);
    maquinaId = m?.id ?? null;
    if (!m) alerta = `Máquina ${d.numero_interno_maquina} não existe.`;
  }
  if (d?.duvidas) alerta = [alerta, d.duvidas].filter(Boolean).join(" ");

  const categoria = (CATEGORIAS as readonly string[]).includes(categoriaManual) ? categoriaManual : d?.categoria ?? "outros";
  const fich = (await queryOne<{ id: number }>("INSERT INTO ficheiros (mime,dados) VALUES (?,?) RETURNING id", [file.type, bytes]))!;
  const nova = (await queryOne<{ id: number }>(
    `INSERT INTO faturas (criado_por,ficheiro_id,fornecedor,nif_fornecedor,numero,data,total,iva,categoria,empresa_id,predio_id,maquina_id,identificador,itens,alerta)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id`,
    [user.id, fich.id, d?.fornecedor ?? null, d?.nif_fornecedor ?? null, d?.numero ?? null, d?.data ?? null, d?.total ?? null,
      d?.iva ?? null, categoria, empresaId, predioId, maquinaId, d?.identificador ?? null, d ? JSON.stringify(d.itens) : null, alerta],
  ))!;
  revalidatePath("/", "layout");
  return { id: nova.id };
}

const num = (v: FormDataEntryValue | null) => {
  const t = String(v ?? "").trim().replace(",", ".");
  return t === "" || Number.isNaN(Number(t)) ? null : Number(t);
};
const txt = (v: FormDataEntryValue | null) => String(v ?? "").trim() || null;

async function podeEditar() {
  const u = await requireUser();
  return u.cargo === "admin" || u.cargo === "operador" ? u : null;
}

export async function guardarFatura(id: number, form: FormData) {
  if (!(await podeEditar())) return;
  const empresaId = await obterEmpresaId(txt(form.get("empresa")));
  const predioId = num(form.get("predio_id"));
  const identificador = txt(form.get("identificador"));
  const revisada = form.get("revisada") ? 1 : 0;
  await query(
    `UPDATE faturas SET fornecedor=?, nif_fornecedor=?, numero=?, data=?, total=?, iva=?, categoria=?, empresa_id=?,
       predio_id=?, maquina_id=?, identificador=?, revisada=?, alerta = CASE WHEN ?::int = 1 THEN NULL ELSE alerta END WHERE id=?`,
    [txt(form.get("fornecedor")), txt(form.get("nif")), txt(form.get("numero")), txt(form.get("data")), num(form.get("total")),
      num(form.get("iva")), String(form.get("categoria")), empresaId, predioId, num(form.get("maquina_id")), identificador,
      revisada, revisada, id],
  );
  // Memoriza o identificador no prédio para ligar automaticamente as próximas faturas
  if (form.get("memorizar") && predioId && identificador) {
    await query("UPDATE predios SET codigo_contador = ? WHERE id = ? AND codigo_contador IS NULL", [identificador, predioId]);
  }
  revalidatePath("/", "layout");
  redirect("/");
}

export async function apagarFatura(id: number) {
  const u = await requireUser();
  if (u.cargo !== "admin") return;
  const f = await queryOne<{ ficheiro_id: number | null }>("SELECT ficheiro_id FROM faturas WHERE id = ?", [id]);
  await query("DELETE FROM faturas WHERE id = ?", [id]);
  if (f?.ficheiro_id) await query("DELETE FROM ficheiros WHERE id = ?", [f.ficheiro_id]);
  revalidatePath("/", "layout");
  redirect("/");
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
