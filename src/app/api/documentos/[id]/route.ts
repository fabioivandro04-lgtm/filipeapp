import { getUser } from "@/lib/auth";
import { queryOne } from "@/lib/db";

/** Comprovativo de um documento com prazo (apólice, certificado de inspeção…). */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await getUser();
  if (!u) return new Response("Não autenticado", { status: 401 });
  const { id } = await params;
  const f = await queryOne<{ mime: string; dados: Uint8Array }>(
    "SELECT fi.mime, fi.dados FROM documentos d JOIN ficheiros fi ON fi.id = d.ficheiro_id WHERE d.id = ? AND d.apagado_em IS NULL", [Number(id)]);
  if (!f) return new Response("Não encontrado", { status: 404 });
  return new Response(new Uint8Array(f.dados), { headers: { "Content-Type": f.mime, "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff", "Content-Disposition": "inline" } });
}
