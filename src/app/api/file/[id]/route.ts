import { getUser, categoriasVisiveis } from "@/lib/auth";
import { queryOne } from "@/lib/db";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await getUser();
  if (!u) return new Response("Não autenticado", { status: 401 });
  const { id } = await params;
  const f = await queryOne<{ mime: string; dados: Uint8Array; categoria: string }>(
    "SELECT fi.mime, fi.dados, f.categoria FROM faturas f JOIN ficheiros fi ON fi.id = f.ficheiro_id WHERE f.id = ?", [Number(id)]);
  const vis = categoriasVisiveis(u);
  if (!f || (vis !== "todas" && !(vis as string[]).includes(f.categoria))) return new Response("Não encontrado", { status: 404 });
  return new Response(new Uint8Array(f.dados), { headers: { "Content-Type": f.mime, "Cache-Control": "private, max-age=3600" } });
}
