import { db, type Categoria } from "./db";
import { categoriasVisiveis, type User } from "./auth";

export type FaturaRow = {
  id: number; criado_em: string; criado_por_nome: string; fornecedor: string | null; nif_fornecedor: string | null;
  numero: string | null; data: string | null; total: number | null; iva: number | null; categoria: Categoria;
  predio_id: number | null; maquina_id: number | null; empresa_id: number | null; empresa_nome: string | null;
  predio_nome: string | null; maquina_numero: string | null; identificador: string | null; itens: string | null;
  alerta: string | null; ficheiro: string | null; revisada: number;
};

/** Condição SQL que limita as faturas às categorias que o cargo pode ver. */
function visivel(u: User, alias = "f") {
  const vis = categoriasVisiveis(u);
  if (vis === "todas") return { sql: "1=1", args: [] as string[] };
  return { sql: `${alias}.categoria IN (${vis.map(() => "?").join(",")})`, args: [...vis] as string[] };
}

const SELECT = `SELECT f.*, u.nome AS criado_por_nome, p.nome AS predio_nome, m.numero_interno AS maquina_numero, e.nome AS empresa_nome
  FROM faturas f JOIN users u ON u.id = f.criado_por
  LEFT JOIN predios p ON p.id = f.predio_id LEFT JOIN maquinas m ON m.id = f.maquina_id LEFT JOIN empresas e ON e.id = f.empresa_id`;

export type Filtro = { categoria?: string; q?: string; predio_id?: number; maquina_id?: number; alerta?: boolean };

export function listarFaturas(u: User, filtro: Filtro = {}): FaturaRow[] {
  const v = visivel(u);
  const where = [v.sql];
  const args: (string | number)[] = [...v.args];
  if (filtro.categoria) { where.push("f.categoria = ?"); args.push(filtro.categoria); }
  if (filtro.q) { where.push("(f.fornecedor LIKE ? OR f.numero LIKE ?)"); args.push(`%${filtro.q}%`, `%${filtro.q}%`); }
  if (filtro.predio_id) { where.push("f.predio_id = ?"); args.push(filtro.predio_id); }
  if (filtro.maquina_id) { where.push("f.maquina_id = ?"); args.push(filtro.maquina_id); }
  if (filtro.alerta) where.push("f.alerta IS NOT NULL AND f.revisada = 0");
  return db().prepare(`${SELECT} WHERE ${where.join(" AND ")} ORDER BY COALESCE(f.data, f.criado_em) DESC, f.id DESC LIMIT 500`).all(...args) as FaturaRow[];
}

export function obterFatura(u: User, id: number): FaturaRow | undefined {
  const v = visivel(u);
  return db().prepare(`${SELECT} WHERE f.id = ? AND ${v.sql}`).get(id, ...v.args) as FaturaRow | undefined;
}

export function resumo(u: User) {
  const v = visivel(u);
  const mes = new Date().toISOString().slice(0, 7);
  const r = db().prepare(
    `SELECT COUNT(*) AS n, COALESCE(SUM(total),0) AS total,
       COALESCE(SUM(CASE WHEN substr(COALESCE(data,criado_em),1,7) = ? THEN total END),0) AS mes,
       SUM(CASE WHEN alerta IS NOT NULL AND revisada = 0 THEN 1 ELSE 0 END) AS alertas
     FROM faturas f WHERE ${v.sql}`,
  ).get(mes, ...v.args) as { n: number; total: number; mes: number; alertas: number | null };
  const porCategoria = db().prepare(
    `SELECT categoria, COUNT(*) AS n, COALESCE(SUM(total),0) AS total FROM faturas f WHERE ${v.sql} GROUP BY categoria ORDER BY total DESC`,
  ).all(...v.args) as { categoria: string; n: number; total: number }[];
  return { ...r, alertas: r.alertas ?? 0, porCategoria };
}

export type Predio = { id: number; nome: string; morada: string | null; codigo_contador: string | null };
export type Maquina = { id: number; numero_interno: string; descricao: string | null };
type Totais = { n: number; total: number };

export const todosPredios = () => db().prepare("SELECT * FROM predios ORDER BY nome").all() as Predio[];
export const todasMaquinas = () => db().prepare("SELECT * FROM maquinas ORDER BY numero_interno").all() as Maquina[];
export const todasEmpresas = () => db().prepare("SELECT * FROM empresas ORDER BY nome").all() as { id: number; nome: string }[];

export function prediosComTotais(u: User) {
  const v = visivel(u);
  return db().prepare(
    `SELECT p.*, COUNT(f.id) AS n, COALESCE(SUM(f.total),0) AS total FROM predios p
     LEFT JOIN faturas f ON f.predio_id = p.id AND ${v.sql} GROUP BY p.id ORDER BY p.nome`,
  ).all(...v.args) as (Predio & Totais)[];
}

export function maquinasComTotais(u: User) {
  const v = visivel(u);
  return db().prepare(
    `SELECT m.*, COUNT(f.id) AS n, COALESCE(SUM(f.total),0) AS total FROM maquinas m
     LEFT JOIN faturas f ON f.maquina_id = m.id AND ${v.sql} GROUP BY m.id ORDER BY m.numero_interno`,
  ).all(...v.args) as (Maquina & Totais)[];
}

/** Totais por mês (e categoria) das faturas de um prédio. */
export function totaisPorMes(u: User, predioId: number) {
  const v = visivel(u);
  return db().prepare(
    `SELECT substr(COALESCE(data,criado_em),1,7) AS mes, categoria, COALESCE(SUM(total),0) AS total
     FROM faturas f WHERE predio_id = ? AND ${v.sql} GROUP BY mes, categoria ORDER BY mes DESC`,
  ).all(predioId, ...v.args) as { mes: string; categoria: string; total: number }[];
}
