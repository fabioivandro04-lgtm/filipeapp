import ExcelJS from "exceljs";
import type { FaturaRow } from "./queries";

const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "application/pdf": "pdf" };
export const extensao = (mime: string | null) => EXT[mime ?? ""] ?? "bin";

const slug = (t: string | null) =>
  (t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);

/** Nome claro para o ficheiro original: data_fornecedor_nº_#id.ext */
export function nomeFicheiro(f: Pick<FaturaRow, "id" | "data" | "fornecedor" | "numero" | "ficheiro_mime">) {
  return [f.data ?? "sem-data", slug(f.fornecedor) || "sem-fornecedor", slug(f.numero), `id${f.id}`].filter(Boolean).join("_") + "." + extensao(f.ficheiro_mime);
}

/** Folha de Excel para a contabilidade. Os totais e o IVA são números (não texto), para somar. */
export async function excelFaturas(rows: FaturaRow[], prefixoFicheiro?: string): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Faturas");
  ws.columns = [
    { header: "Data", key: "data", width: 12 }, { header: "Tipo", key: "tipo_doc", width: 7 },
    { header: "Nº documento", key: "numero", width: 18 }, { header: "ATCUD", key: "atcud", width: 20 },
    { header: "Fornecedor", key: "fornecedor", width: 30 }, { header: "NIF fornecedor", key: "nif_fornecedor", width: 14 },
    { header: "NIF cliente", key: "nif_adquirente", width: 14 }, { header: "Empresa", key: "empresa_nome", width: 22 },
    { header: "Categoria", key: "categoria", width: 14 }, { header: "Prédio", key: "predio_nome", width: 18 },
    { header: "Máquina", key: "maquina_numero", width: 10 },
    { header: "Total", key: "total", width: 12, style: { numFmt: '#,##0.00 "€"' } },
    { header: "IVA", key: "iva", width: 11, style: { numFmt: '#,##0.00 "€"' } },
    { header: "Carregada por", key: "criado_por_nome", width: 18 },
    ...(prefixoFicheiro !== undefined ? [{ header: "Ficheiro", key: "ficheiro", width: 48 }] : []),
  ];
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  for (const r of rows) ws.addRow({ ...r, ficheiro: prefixoFicheiro !== undefined && r.ficheiro_id ? prefixoFicheiro + nomeFicheiro(r) : "" });
  if (rows.length) {
    const t = ws.addRow({ fornecedor: "TOTAL", total: rows.reduce((s, r) => s + (r.total ?? 0), 0), iva: rows.reduce((s, r) => s + (r.iva ?? 0), 0) });
    t.font = { bold: true };
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}
