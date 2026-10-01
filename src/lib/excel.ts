import ExcelJS from "exceljs";
import type { FaturaRow } from "./queries";

const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "application/pdf": "pdf" };
/** As fotos são enviadas à contabilidade convertidas em PDF (ver carregarFicheiro). */
const mimeEnviado = (m: string | null) => (m === "image/jpeg" || m === "image/png" ? "application/pdf" : m);
export const extensao = (mime: string | null) => EXT[mime ?? ""] ?? "bin";

const slug = (t: string | null) =>
  (t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);

/** Nome claro para o ficheiro original: data_fornecedor_nº_#id.ext */
export function nomeFicheiro(f: Pick<FaturaRow, "id" | "data" | "fornecedor" | "numero" | "ficheiro_mime">) {
  return [f.data ?? "sem-data", slug(f.fornecedor) || "sem-fornecedor", slug(f.numero), `id${f.id}`].filter(Boolean).join("_") + "." + extensao(mimeEnviado(f.ficheiro_mime));
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

type MaquinaExport = import("./queries").Maquina & { empresa_nome: string | null };
const TITULO_ESTADO: Record<string, string> = { stock: "STOCK", vendido: "VENDIDO", abatido: "ABATE", outro: "OUTRO" };

/** Uma folha por estado, com as colunas dos ficheiros de stock (para continuarem a poder trabalhar em Excel). */
export async function excelMaquinas(rows: MaquinaExport[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  for (const estado of ["stock", "vendido", "abatido", "outro"]) {
    const doEstado = rows.filter((r) => r.estado === estado);
    if (!doEstado.length) continue;
    const ws = wb.addWorksheet(TITULO_ESTADO[estado]);
    ws.columns = [
      { header: "Designação do equipamento", key: "designacao", width: 32 }, { header: "Marca", key: "marca", width: 16 }, { header: "Modelo", key: "modelo", width: 16 },
      { header: "Nº Interno", key: "numero", width: 11 }, { header: "Ano", key: "ano", width: 7 }, { header: "ID Fornecedor", key: "id_fornecedor", width: 14 },
      { header: "Nº Serie", key: "numero_serie", width: 24 }, { header: "PESO (kg)", key: "peso_kg", width: 10 }, { header: "MATRICULA", key: "matricula", width: 11 },
      { header: "Horas", key: "horas", width: 9 }, { header: "Data compra", key: "data_compra", width: 12 }, { header: "Data Chegada", key: "data_chegada", width: 12 },
      { header: "Fornecedor", key: "fornecedor", width: 22 }, { header: "Agência", key: "agencia", width: 16 },
      { header: "V.Compra", key: "valor_compra", width: 12, style: { numFmt: '#,##0.00 "€"' } }, { header: "Facturada", key: "facturada", width: 40 },
      { header: "Observações", key: "observacoes", width: 30 }, { header: "Empresa", key: "empresa_nome", width: 22 },
    ];
    ws.getRow(1).font = { bold: true };
    ws.views = [{ state: "frozen", ySplit: 1 }];
    for (const r of doEstado) ws.addRow({ ...r, numero: r.numero_interno + (r.assinalada ? "*" : ""), valor_compra: r.valor_compra ?? undefined });
    const soma = doEstado.reduce((s, r) => s + (r.valor_compra ?? 0), 0);
    ws.addRow({ designacao: `TOTAL (${doEstado.length})`, valor_compra: soma }).font = { bold: true };
  }
  if (!wb.worksheets.length) wb.addWorksheet("Sem máquinas");
  return Buffer.from(await wb.xlsx.writeBuffer());
}
