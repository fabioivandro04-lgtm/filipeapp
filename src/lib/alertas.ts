import { queryOne } from "./db";

type Dados = {
  fornecedor: string | null; nif: string | null; numero: string | null; data: string | null; total: number | null;
  categoria: string; excluirId?: number;
  /** Só na edição: avisa se uma fatura de água/energia ficou sem prédio. */
  predioId?: number | null;
};

/** Avisos automáticos para uma fatura: duplicado, valor fora do normal, sem prédio. */
export async function avaliar(d: Dados): Promise<string[]> {
  const avisos: string[] = [];
  const excluir = d.excluirId ?? 0;

  // 1) Duplicado: mesmo nº + mesmo fornecedor (NIF ou nome), ou mesmo fornecedor + data + valor
  const chave = d.nif ? { sql: "nif_fornecedor = ?", v: d.nif } : d.fornecedor ? { sql: "LOWER(fornecedor) = LOWER(?)", v: d.fornecedor } : null;
  if (chave) {
    let dup: { id: number } | undefined;
    if (d.numero) dup = await queryOne<{ id: number }>(`SELECT id FROM faturas WHERE numero = ? AND ${chave.sql} AND id <> ? LIMIT 1`, [d.numero, chave.v, excluir]);
    if (!dup && d.data && d.total != null)
      dup = await queryOne<{ id: number }>(`SELECT id FROM faturas WHERE data = ? AND total = ? AND ${chave.sql} AND id <> ? LIMIT 1`, [d.data, d.total, chave.v, excluir]);
    if (dup) avisos.push(`Possível duplicado da fatura #${dup.id}.`);
  }

  // 2) Valor fora do normal: mais de 1,8× a média deste fornecedor (com pelo menos 3 faturas anteriores)
  if (d.fornecedor && d.total && d.total > 0) {
    const h = await queryOne<{ n: number; media: number }>(
      `SELECT COUNT(*)::int AS n, COALESCE(AVG(total),0)::float8 AS media FROM faturas
       WHERE LOWER(fornecedor) = LOWER(?) AND categoria = ? AND total IS NOT NULL AND id <> ?`,
      [d.fornecedor, d.categoria, excluir],
    );
    if (h && h.n >= 3 && h.media > 0 && d.total > 1.8 * h.media)
      avisos.push(`Valor ${(d.total / h.media).toFixed(1).replace(".", ",")}× acima da média deste fornecedor (${h.media.toFixed(2).replace(".", ",")} €).`);
  }

  // 3) Água/energia sem prédio associado
  if (d.predioId !== undefined && !d.predioId && (d.categoria === "agua" || d.categoria === "energia"))
    avisos.push("Fatura sem prédio associado.");

  return avisos;
}
