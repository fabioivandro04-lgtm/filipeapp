import { getUser } from "@/lib/auth";
import { listarFaturas } from "@/lib/queries";
import { excelFaturas } from "@/lib/excel";

export async function GET(req: Request) {
  const u = await getUser();
  if (!u) return new Response("Não autenticado", { status: 401 });
  const sp = new URL(req.url).searchParams;
  const mes = sp.get("mes") ?? "";
  const rows = await listarFaturas(u, {
    categoria: sp.get("categoria") ?? undefined, q: sp.get("q") ?? undefined,
    empresa_id: Number(sp.get("empresa")) || undefined, mes: /^\d{4}-(0[1-9]|1[0-2])$/.test(mes) ? mes : undefined, limite: 5000,
  });
  return new Response(new Uint8Array(await excelFaturas(rows)), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="faturas.xlsx"',
    },
  });
}
