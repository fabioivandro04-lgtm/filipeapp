import { db, type Categoria } from "./db";
import { categoriasVisiveis, type User } from "./auth";

export type FaturaRow = {
  id: number; criado_em: string; criado_por_nome: string; fornecedor: string | null; numero: string | null;
  data: string | null; total: number | null; iva: number | null; categoria: Categoria;
  predio_nome: string | null; maquina_numero: string | null; identificador: string | null; alerta: string | null;
  ficheiro: string | null;
};

export function listarFaturas(u: User, filtro?: { categoria?: string; q?: string }): FaturaRow[] {
  const vis = categoriasVisiveis(u);
  const where: string[] = [];
  const args: (string | number)[] = [];
  if (vis !== "todas") {
    where.push(`f.categoria IN (${vis.map(() => "?").join(",")})`);
    args.push(...vis);
  }
  if (filtro?.categoria) { where.push("f.categoria = ?"); args.push(filtro.categoria); }
  if (filtro?.q) { where.push("(f.fornecedor LIKE ? OR f.numero LIKE ?)"); args.push(`%${filtro.q}%`, `%${filtro.q}%`); }
  return db().prepare(
    `SELECT f.*, u.nome AS criado_por_nome, p.nome AS predio_nome, m.numero_interno AS maquina_numero
     FROM faturas f JOIN users u ON u.id = f.criado_por
     LEFT JOIN predios p ON p.id = f.predio_id LEFT JOIN maquinas m ON m.id = f.maquina_id
     ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY f.id DESC LIMIT 500`,
  ).all(...args) as FaturaRow[];
}
