import { getUser } from "@/lib/auth";
import { excelMaquinas } from "@/lib/excel";
import { maquinasParaExportar } from "@/lib/queries";
import { ESTADOS } from "@/lib/estados";

export async function GET(req: Request) {
  const u = await getUser();
  if (!u) return new Response("Não autenticado", { status: 401 });
  const sp = new URL(req.url).searchParams;
  const estado = sp.get("estado") ?? "";
  const rows = await maquinasParaExportar({
    empresa_id: Number(sp.get("empresa")) || undefined, estado: (ESTADOS as string[]).includes(estado) ? estado : undefined, q: sp.get("q") ?? undefined,
  });
  return new Response(new Uint8Array(await excelMaquinas(rows)), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="stock-maquinas.xlsx"',
    },
  });
}
