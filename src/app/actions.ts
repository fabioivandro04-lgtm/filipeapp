"use server";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db, UPLOAD_DIR, CATEGORIAS } from "@/lib/db";
import { login, logout, requireUser } from "@/lib/auth";
import { extrairFatura, extracaoDisponivel, type FaturaExtraida } from "@/lib/extract";

export async function entrar(_: string | null, form: FormData): Promise<string | null> {
  const ok = await login(String(form.get("email") ?? ""), String(form.get("password") ?? ""));
  if (!ok) return "Email ou palavra-passe incorretos.";
  redirect("/");
}

export async function sair() {
  await logout();
  redirect("/login");
}

const EXT: Record<string, string> = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif", "application/pdf": ".pdf" };

export async function carregarFaturas(_: string | null, form: FormData): Promise<string | null> {
  const user = await requireUser();
  const files = form.getAll("ficheiros").filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) return "Escolha pelo menos uma foto ou PDF.";
  const categoriaManual = String(form.get("categoria") ?? "");
  const empresaNome = String(form.get("empresa") ?? "").trim();

  let empresaId: number | null = null;
  if (empresaNome) {
    db().prepare("INSERT OR IGNORE INTO empresas (nome) VALUES (?)").run(empresaNome);
    empresaId = (db().prepare("SELECT id FROM empresas WHERE nome = ?").get(empresaNome) as { id: number }).id;
  }

  for (const file of files) {
    const mime = file.type;
    if (!EXT[mime]) return `Tipo de ficheiro não suportado: ${file.name}`;
    const bytes = Buffer.from(await file.arrayBuffer());
    const nome = randomUUID() + EXT[mime];
    fs.writeFileSync(path.join(UPLOAD_DIR, nome), bytes);

    let d: FaturaExtraida | null = null;
    let alerta: string | null = null;
    if (extracaoDisponivel()) {
      try { d = await extrairFatura(bytes, mime); } catch (e) { alerta = `Leitura automática falhou: ${(e as Error).message}`; }
    } else {
      alerta = "Sem ANTHROPIC_API_KEY: preencher dados manualmente.";
    }

    // Ligação por identificadores estáveis (nunca só pela morada: há moradas repetidas)
    let predioId: number | null = null, maquinaId: number | null = null;
    if (d?.identificador) {
      const p = db().prepare("SELECT id FROM predios WHERE codigo_contador = ?").get(d.identificador) as { id: number } | undefined;
      predioId = p?.id ?? null;
      if (!p && (d.categoria === "energia" || d.categoria === "agua")) alerta = `Identificador ${d.identificador} não corresponde a nenhum prédio.`;
    }
    if (d?.numero_interno_maquina) {
      const m = db().prepare("SELECT id FROM maquinas WHERE numero_interno = ?").get(d.numero_interno_maquina) as { id: number } | undefined;
      maquinaId = m?.id ?? null;
      if (!m) alerta = `Máquina ${d.numero_interno_maquina} não existe.`;
    }
    if (d?.duvidas) alerta = [alerta, d.duvidas].filter(Boolean).join(" ");

    const categoria = categoriaManual && (CATEGORIAS as readonly string[]).includes(categoriaManual) ? categoriaManual : d?.categoria ?? "outros";
    db().prepare(
      `INSERT INTO faturas (criado_por,ficheiro,fornecedor,nif_fornecedor,numero,data,total,iva,categoria,empresa_id,predio_id,maquina_id,identificador,itens,alerta)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(user.id, nome, d?.fornecedor ?? null, d?.nif_fornecedor ?? null, d?.numero ?? null, d?.data ?? null, d?.total ?? null,
      d?.iva ?? null, categoria, empresaId, predioId, maquinaId, d?.identificador ?? null, d ? JSON.stringify(d.itens) : null, alerta);
  }
  revalidatePath("/");
  redirect("/");
}

export async function criarPredio(form: FormData) {
  const u = await requireUser();
  if (u.cargo !== "admin") return;
  db().prepare("INSERT INTO predios (nome,morada,codigo_contador) VALUES (?,?,?)").run(
    String(form.get("nome")), String(form.get("morada") ?? ""), String(form.get("codigo") ?? "") || null);
  revalidatePath("/cadastros");
}

export async function criarMaquina(form: FormData) {
  const u = await requireUser();
  if (u.cargo !== "admin") return;
  try {
    db().prepare("INSERT INTO maquinas (numero_interno,descricao) VALUES (?,?)").run(String(form.get("numero")), String(form.get("descricao") ?? ""));
  } catch { /* número interno duplicado: ignorado */ }
  revalidatePath("/cadastros");
}
