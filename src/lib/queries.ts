import { query, queryOne, type Categoria } from "./db";
import type { User } from "./auth";
import { CAMPOS_EDITAVEIS } from "./historico";

export type FaturaRow = {
  id: number; criado_em: string; criado_por_nome: string; fornecedor: string | null; nif_fornecedor: string | null;
  numero: string | null; data: string | null; total: number | null; iva: number | null; categoria: Categoria;
  predio_id: number | null; maquina_id: number | null; empresa_id: number | null; empresa_nome: string | null;
  predio_nome: string | null; maquina_numero: string | null; identificador: string | null; itens: string | null;
  alerta: string | null; ficheiro_id: number | null; ficheiro_mime: string | null; revisada: number;
  atcud: string | null; nif_adquirente: string | null; tipo_doc: string | null; qr_lido: number; enviada_em: string | null;
};

/** Todos os cargos vêem todas as faturas (menos as apagadas). O `u` fica para o caso de voltarmos a restringir. */
function visivel(_u: User, alias = "f") {
  return { sql: `${alias}.apagada_em IS NULL`, args: [] as string[] };
}

const SELECT = `SELECT f.*, u.nome AS criado_por_nome, p.nome AS predio_nome, m.numero_interno AS maquina_numero, e.nome AS empresa_nome,
  (SELECT mime FROM ficheiros WHERE id = f.ficheiro_id) AS ficheiro_mime
  FROM faturas f JOIN users u ON u.id = f.criado_por
  LEFT JOIN predios p ON p.id = f.predio_id LEFT JOIN maquinas m ON m.id = f.maquina_id LEFT JOIN empresas e ON e.id = f.empresa_id`;

export type Filtro = { categoria?: string; q?: string; predio_id?: number; maquina_id?: number; empresa_id?: number; mes?: string; alerta?: boolean; pendentesEnvio?: boolean; limite?: number };

export async function listarFaturas(u: User, filtro: Filtro = {}): Promise<FaturaRow[]> {
  const v = visivel(u);
  const where = [v.sql];
  const args: (string | number)[] = [...v.args];
  if (filtro.categoria) { where.push("f.categoria = ?"); args.push(filtro.categoria); }
  if (filtro.q) { where.push("(f.fornecedor ILIKE ? OR f.numero ILIKE ?)"); args.push(`%${filtro.q}%`, `%${filtro.q}%`); }
  if (filtro.predio_id) { where.push("f.predio_id = ?"); args.push(filtro.predio_id); }
  if (filtro.maquina_id) { where.push("f.maquina_id = ?"); args.push(filtro.maquina_id); }
  if (filtro.empresa_id) { where.push("f.empresa_id = ?"); args.push(filtro.empresa_id); }
  if (filtro.mes) { where.push("substr(COALESCE(f.data,f.criado_em),1,7) = ?"); args.push(filtro.mes); }
  if (filtro.pendentesEnvio) where.push("f.enviada_em IS NULL");
  if (filtro.alerta) where.push("f.alerta IS NOT NULL AND f.revisada = 0");
  return query<FaturaRow>(`${SELECT} WHERE ${where.join(" AND ")} ORDER BY COALESCE(f.data, f.criado_em) DESC, f.id DESC LIMIT ${Math.min(filtro.limite ?? 500, 5000)}`, args);
}

export async function obterFatura(u: User, id: number): Promise<FaturaRow | undefined> {
  const v = visivel(u);
  return queryOne<FaturaRow>(`${SELECT} WHERE f.id = ? AND ${v.sql}`, [id, ...v.args]);
}

export async function resumo(u: User) {
  const v = visivel(u);
  const mes = new Date().toISOString().slice(0, 7);
  const r = (await queryOne<{ n: number; total: number; mes: number; alertas: number }>(
    `SELECT COUNT(*)::int AS n, COALESCE(SUM(total),0)::float8 AS total,
       COALESCE(SUM(CASE WHEN substr(COALESCE(data,criado_em),1,7) = ? THEN total END),0)::float8 AS mes,
       COALESCE(SUM(CASE WHEN alerta IS NOT NULL AND revisada = 0 THEN 1 ELSE 0 END),0)::int AS alertas
     FROM faturas f WHERE ${v.sql}`,
    [mes, ...v.args],
  ))!;
  const porCategoria = await query<{ categoria: string; n: number; total: number }>(
    `SELECT categoria, COUNT(*)::int AS n, COALESCE(SUM(total),0)::float8 AS total FROM faturas f WHERE ${v.sql} GROUP BY categoria ORDER BY total DESC`,
    v.args,
  );
  return { ...r, porCategoria };
}

export type Predio = { id: number; nome: string; morada: string | null; codigo_contador: string | null; apagada_em: string | null };
export type Maquina = { id: number; numero_interno: string; descricao: string | null; apagada_em: string | null };
type Totais = { n: number; total: number };

// Por defeito só os ativos (listas e escolhas); `true` inclui os apagados (para mostrar nomes em faturas e histórico antigos).
const ativo = (incluirApagados: boolean) => (incluirApagados ? "" : "WHERE apagada_em IS NULL");
export const todosPredios = (incluirApagados = false) => query<Predio>(`SELECT * FROM predios ${ativo(incluirApagados)} ORDER BY nome`);
export const todasMaquinas = (incluirApagados = false) => query<Maquina>(`SELECT * FROM maquinas ${ativo(incluirApagados)} ORDER BY numero_interno`);
export type Empresa = { id: number; nome: string; nif: string | null; morada: string | null; codigo_postal: string | null; localidade: string | null; apagada_em: string | null };
export const todasEmpresas = (incluirApagadas = false) => query<Empresa>(`SELECT * FROM empresas ${ativo(incluirApagadas)} ORDER BY nome`);

export function prediosComTotais(u: User) {
  const v = visivel(u);
  return query<Predio & Totais>(
    `SELECT p.*, COUNT(f.id)::int AS n, COALESCE(SUM(f.total),0)::float8 AS total FROM predios p
     LEFT JOIN faturas f ON f.predio_id = p.id AND ${v.sql} WHERE p.apagada_em IS NULL GROUP BY p.id ORDER BY p.nome`,
    v.args,
  );
}

export function maquinasComTotais(u: User) {
  const v = visivel(u);
  return query<Maquina & Totais>(
    `SELECT m.*, COUNT(f.id)::int AS n, COALESCE(SUM(f.total),0)::float8 AS total FROM maquinas m
     LEFT JOIN faturas f ON f.maquina_id = m.id AND ${v.sql} WHERE m.apagada_em IS NULL GROUP BY m.id ORDER BY m.numero_interno`,
    v.args,
  );
}

/** Totais por mês (e categoria) das faturas de um prédio. */
export async function totaisPorMes(u: User, predioId: number) {
  const v = visivel(u);
  return query<{ mes: string; categoria: string; total: number }>(
    `SELECT substr(COALESCE(data,criado_em),1,7) AS mes, categoria, COALESCE(SUM(total),0)::float8 AS total
     FROM faturas f WHERE predio_id = ? AND ${v.sql} GROUP BY 1, categoria ORDER BY mes DESC`,
    [predioId, ...v.args],
  );
}

// ---------- Relatórios ----------
const MES = "substr(COALESCE(f.data,f.criado_em),1,7)";

/** Total por mês dos últimos 12 meses (meses sem faturas aparecem a zero). */
export async function serieMensal(u: User, empresaId?: number) {
  const v = visivel(u);
  const rows = await query<{ mes: string; total: number; n: number }>(
    `SELECT ${MES} AS mes, COALESCE(SUM(f.total),0)::float8 AS total, COUNT(*)::int AS n FROM faturas f
     WHERE ${v.sql} ${empresaId ? "AND f.empresa_id = ?" : ""} GROUP BY 1`,
    [...v.args, ...(empresaId ? [empresaId] : [])],
  );
  const hoje = new Date();
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() - (11 - i), 1));
    const mes = d.toISOString().slice(0, 7);
    const r = rows.find((x) => x.mes === mes);
    return { mes, total: r?.total ?? 0, n: r?.n ?? 0 };
  });
}

export async function totaisPorEmpresa(u: User, mes?: string) {
  const v = visivel(u);
  return query<{ rotulo: string; total: number; n: number }>(
    `SELECT COALESCE(e.nome,'Sem empresa') AS rotulo, COALESCE(SUM(f.total),0)::float8 AS total, COUNT(*)::int AS n
     FROM faturas f LEFT JOIN empresas e ON e.id = f.empresa_id
     WHERE ${v.sql} ${mes ? `AND ${MES} = ?` : ""} GROUP BY 1 ORDER BY total DESC`,
    [...v.args, ...(mes ? [mes] : [])],
  );
}

export async function totaisPorCategoria(u: User, mes?: string, empresaId?: number) {
  const v = visivel(u);
  return query<{ rotulo: string; total: number; n: number }>(
    `SELECT f.categoria AS rotulo, COALESCE(SUM(f.total),0)::float8 AS total, COUNT(*)::int AS n FROM faturas f
     WHERE ${v.sql} ${mes ? `AND ${MES} = ?` : ""} ${empresaId ? "AND f.empresa_id = ?" : ""} GROUP BY 1 ORDER BY total DESC`,
    [...v.args, ...(mes ? [mes] : []), ...(empresaId ? [empresaId] : [])],
  );
}

/**
 * Meses sem fatura de água/energia por prédio: entre a primeira fatura (máx. últimos 12 meses)
 * e o mês passado. O mês atual não conta, porque a fatura pode ainda não ter chegado.
 */
export async function mesesEmFalta(u: User) {
  const v = visivel(u);
  const rows = await query<{ predio: string; categoria: string; mes: string }>(
    `SELECT p.nome AS predio, f.categoria, ${MES} AS mes FROM faturas f JOIN predios p ON p.id = f.predio_id
     WHERE f.categoria IN ('agua','energia') AND ${v.sql} GROUP BY 1,2,3 ORDER BY 1,2,3`,
    v.args,
  );
  const hoje = new Date();
  const passado = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() - 1, 1)).toISOString().slice(0, 7);
  const limite = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() - 12, 1)).toISOString().slice(0, 7);
  const grupos = new Map<string, { predio: string; categoria: string; meses: Set<string> }>();
  for (const r of rows) {
    const k = `${r.predio}|${r.categoria}`;
    if (!grupos.has(k)) grupos.set(k, { predio: r.predio, categoria: r.categoria, meses: new Set() });
    grupos.get(k)!.meses.add(r.mes);
  }
  const falta: { predio: string; categoria: string; meses: string[] }[] = [];
  for (const g of grupos.values()) {
    if (g.meses.size < 2) continue; // sem histórico não dá para saber o ritmo
    const [primeiro] = [...g.meses].sort();
    const em: string[] = [];
    let [a, m] = (primeiro > limite ? primeiro : limite).split("-").map(Number);
    for (;;) {
      const mes = `${a}-${String(m).padStart(2, "0")}`;
      if (mes > passado) break;
      if (!g.meses.has(mes)) em.push(mes);
      if (++m > 12) { m = 1; a++; }
    }
    if (em.length) falta.push({ predio: g.predio, categoria: g.categoria, meses: em });
  }
  return falta;
}

// ---------- Utilizadores ----------
export type Utilizador = { id: number; nome: string; email: string; cargo: string; ativo: number };
export const todosUtilizadores = () =>
  query<Utilizador>("SELECT id, nome, email, cargo, ativo FROM users ORDER BY ativo DESC, nome");

// ---------- Nomes (para mostrar ids como texto) ----------
export type Nomes = { empresas: Record<number, string>; predios: Record<number, string>; maquinas: Record<number, string> };

export async function carregarNomes(): Promise<Nomes> {
  const [e, p, m] = await Promise.all([todasEmpresas(true), todosPredios(true), todasMaquinas(true)]);
  return {
    empresas: Object.fromEntries(e.map((x) => [x.id, x.nome])),
    predios: Object.fromEntries(p.map((x) => [x.id, x.nome])),
    maquinas: Object.fromEntries(m.map((x) => [x.id, x.numero_interno])),
  };
}

// ---------- Propostas de alteração (contabilista → admin) ----------
export type Proposta = {
  id: number; fatura_id: number; user_id: number; user_nome: string; criado_em: string; alteracoes: string; estado: string;
  decidido_por_nome: string | null; decidido_em: string | null; motivo: string | null;
  fatura_fornecedor: string | null; fatura_numero: string | null; fatura_apagada: string | null;
  /** Valores atuais da fatura, para avisar se mudou desde que a proposta foi feita. */
  atual: Record<string, unknown> | null;
};

export async function listarPropostas(o: { estado?: string[]; faturaId?: number; userId?: number; limite?: number } = {}): Promise<Proposta[]> {
  const where: string[] = [];
  const args: unknown[] = [];
  if (o.estado) { where.push(`p.estado IN (${o.estado.map(() => "?").join(",")})`); args.push(...o.estado); }
  if (o.faturaId) { where.push("p.fatura_id = ?"); args.push(o.faturaId); }
  if (o.userId) { where.push("p.user_id = ?"); args.push(o.userId); }
  const rows = await query<Omit<Proposta, "atual">>(
    `SELECT p.*, u.nome AS user_nome, d.nome AS decidido_por_nome, f.fornecedor AS fatura_fornecedor, f.numero AS fatura_numero, f.apagada_em AS fatura_apagada
     FROM propostas p JOIN users u ON u.id = p.user_id LEFT JOIN users d ON d.id = p.decidido_por JOIN faturas f ON f.id = p.fatura_id
     ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY p.id DESC LIMIT ${Math.min(o.limite ?? 100, 500)}`, args);
  const pendentes = [...new Set(rows.filter((r) => r.estado === "pendente").map((r) => r.fatura_id))];
  const atuais = pendentes.length
    ? await query<Record<string, unknown> & { id: number }>(
        `SELECT id, ${CAMPOS_EDITAVEIS.join(", ")} FROM faturas WHERE id IN (${pendentes.map(() => "?").join(",")})`, pendentes)
    : [];
  return rows.map((r) => ({ ...r, atual: atuais.find((a) => a.id === r.fatura_id) ?? null }));
}

export async function contarPropostasPendentes(): Promise<number> {
  return (await queryOne<{ n: number }>("SELECT COUNT(*)::int AS n FROM propostas WHERE estado = 'pendente'"))?.n ?? 0;
}

/** Empresas ativas com o nº de faturas de cada uma (para avisar antes de apagar). */
export const empresasComContagem = () =>
  query<Empresa & { faturas: number }>(
    `SELECT e.*, (SELECT COUNT(*)::int FROM faturas f WHERE f.empresa_id = e.id AND f.apagada_em IS NULL) AS faturas
     FROM empresas e WHERE e.apagada_em IS NULL ORDER BY e.nome`);

// ---------- Apagados (para restaurar) ----------
export async function listarApagados() {
  const [faturas, empresas, predios, maquinas, utilizadores] = await Promise.all([
    query<{ id: number; fornecedor: string | null; numero: string | null; total: number | null; data: string | null; apagada_em: string }>(
      "SELECT id, fornecedor, numero, total, data, apagada_em FROM faturas WHERE apagada_em IS NOT NULL ORDER BY apagada_em DESC LIMIT 200"),
    query<{ id: number; nome: string; nif: string | null; apagada_em: string }>("SELECT id, nome, nif, apagada_em FROM empresas WHERE apagada_em IS NOT NULL ORDER BY apagada_em DESC"),
    query<{ id: number; nome: string; morada: string | null; apagada_em: string }>("SELECT id, nome, morada, apagada_em FROM predios WHERE apagada_em IS NOT NULL ORDER BY apagada_em DESC"),
    query<{ id: number; numero_interno: string; descricao: string | null; apagada_em: string }>("SELECT id, numero_interno, descricao, apagada_em FROM maquinas WHERE apagada_em IS NOT NULL ORDER BY apagada_em DESC"),
    query<{ id: number; nome: string; email: string; cargo: string }>("SELECT id, nome, email, cargo FROM users WHERE ativo = 0 ORDER BY nome"),
  ]);
  return { faturas, empresas, predios, maquinas, utilizadores };
}
