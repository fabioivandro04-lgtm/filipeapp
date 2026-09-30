import fs from "node:fs";
import path from "node:path";
import { getUser, categoriasVisiveis } from "@/lib/auth";
import { db, UPLOAD_DIR } from "@/lib/db";

const MIME: Record<string, string> = { ".jpg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif", ".pdf": "application/pdf" };

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await getUser();
  if (!u) return new Response("Não autenticado", { status: 401 });
  const { id } = await params;
  const f = db().prepare("SELECT ficheiro, categoria FROM faturas WHERE id = ?").get(Number(id)) as { ficheiro: string | null; categoria: string } | undefined;
  const vis = categoriasVisiveis(u);
  if (!f?.ficheiro || (vis !== "todas" && !(vis as string[]).includes(f.categoria))) return new Response("Não encontrado", { status: 404 });
  const file = path.join(UPLOAD_DIR, path.basename(f.ficheiro));
  return new Response(fs.readFileSync(file), { headers: { "Content-Type": MIME[path.extname(file)] ?? "application/octet-stream" } });
}
