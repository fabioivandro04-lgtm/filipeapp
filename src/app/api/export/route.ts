import ExcelJS from "exceljs";
import { getUser } from "@/lib/auth";
import { listarFaturas } from "@/lib/queries";

export async function GET(req: Request) {
  const u = await getUser();
  if (!u) return new Response("Não autenticado", { status: 401 });
  const sp = new URL(req.url).searchParams;
  const rows = await listarFaturas(u, {
    categoria: sp.get("categoria") ?? undefined, q: sp.get("q") ?? undefined,
    empresa_id: Number(sp.get("empresa")) || undefined, mes: /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.get("mes") ?? "") ? sp.get("mes")! : undefined,
  });

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Faturas");
  ws.columns = [
    { header: "Data", key: "data", width: 12 }, { header: "Fornecedor", key: "fornecedor", width: 30 },
    { header: "Nº", key: "numero", width: 16 }, { header: "Categoria", key: "categoria", width: 14 }, { header: "Empresa", key: "empresa_nome", width: 22 },
    { header: "Prédio", key: "predio_nome", width: 20 }, { header: "Máquina", key: "maquina_numero", width: 12 },
    { header: "Total", key: "total", width: 12 }, { header: "IVA", key: "iva", width: 10 },
    { header: "Carregada por", key: "criado_por_nome", width: 18 },
  ];
  ws.getRow(1).font = { bold: true };
  rows.forEach((r) => ws.addRow(r));
  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="faturas.xlsx"',
    },
  });
}
