import { query, queryOne, type Categoria } from "./db";
import type { User } from "./auth";
import { CAMPOS_EDITAVEIS } from "./historico";

export type FaturaRow = {
  id: number; criado_em: string; criado_por_nome: string; fornecedor: string | null; nif_fornecedor: string | null;
  numero: string | null; data: string | null; total: number | null; iva: number | null; categoria: Categoria;
  predio_id: number | null; maquina_id: number | null; empresa_id: number | null; empresa_nome: string | null;
  predio_nome: string | null; maquina_numero: string | null; identificador: string | null; itens: string | null;
  alerta: string | null; ficheiro_id: number | null; ficheiro_mime: string | null; revisada: number;
  atcud: string | null; nif_adquirente: string | null; tipo_doc: string | null; qr_lido: number; leitura: string; enviada_em: string | null; intragrupo: boolean;
};

/** Todos os cargos vêem todas as faturas (menos as apagadas). O `u` fica para o caso de voltarmos a restringir. */
function visivel(_u: User, alias = "f") {
  return { sql: `${alias}.apagada_em IS NULL`, args: [] as string[] };
}

const SELECT = `SELECT f.*, u.nome AS criado_por_nome, p.nome AS predio_nome, m.numero_interno AS maquina_numero, e.nome AS empresa_nome,
  (SELECT mime FROM ficheiros WHERE id = f.ficheiro_id) AS ficheiro_mime,
  EXISTS (SELECT 1 FROM empresas e3 WHERE e3.nif IS NOT NULL AND e3.nif = f.nif_fornecedor AND e3.apagada_em IS NULL) AS intragrupo
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
  if (filtro.alerta) where.push(`f.revisada = 0 AND (f.alerta IS NOT NULL OR f.leitura IN ('ia','falhou'))`);
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
       COALESCE(SUM(CASE WHEN revisada = 0 AND (alerta IS NOT NULL OR leitura IN ('ia','falhou')) THEN 1 ELSE 0 END),0)::int AS alertas
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
export type Maquina = {
  id: number; numero_interno: string; descricao: string | null; apagada_em: string | null; empresa_id: number | null;
  designacao: string | null; marca: string | null; modelo: string | null; ano: number | null; id_fornecedor: string | null;
  numero_serie: string | null; peso_kg: number | null; matricula: string | null; horas: number | null;
  data_compra: string | null; data_chegada: string | null; fornecedor: string | null; agencia: string | null;
  valor_compra: number | null; valor_compra_original: string | null; facturada: string | null; observacoes: string | null;
  estado: string; assinalada: number; venda_fatura: string | null; comprador: string | null; data_venda: string | null;
  origem: string | null; atualizada_em: string | null;
};
type Totais = { n: number; total: number };

// Por defeito só os ativos (listas e escolhas); `true` inclui os apagados (para mostrar nomes em faturas e histórico antigos).
const ativo = (incluirApagados: boolean) => (incluirApagados ? "" : "WHERE apagada_em IS NULL");
export const todosPredios = (incluirApagados = false) => query<Predio>(`SELECT * FROM predios ${ativo(incluirApagados)} ORDER BY nome`);
export const todasMaquinas = (incluirApagados = false) => query<Maquina>(`SELECT * FROM maquinas ${ativo(incluirApagados)} ORDER BY numero_interno`);
/** Só o necessário para escolher uma máquina numa lista (são centenas: não vale a pena trazer a ficha toda). */
export const opcoesMaquinas = () =>
  query<{ id: number; numero_interno: string; descricao: string | null }>("SELECT id, numero_interno, descricao FROM maquinas WHERE apagada_em IS NULL ORDER BY numero_interno");
/** Uma máquina pelo id (inclui apagadas, para os links antigos continuarem a abrir). */
export const maquinaPorId = (id: number) => queryOne<Maquina>("SELECT * FROM maquinas WHERE id = ?", [id]);
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

export type FiltroMaquinas = { empresa_id?: number; estado?: string; q?: string; pagina?: number; porPagina?: number };

function condicoesMaquinas(f: FiltroMaquinas) {
  const where = ["m.apagada_em IS NULL"];
  const args: unknown[] = [];
  if (f.empresa_id) { where.push("m.empresa_id = ?"); args.push(f.empresa_id); }
  if (f.estado) { where.push("m.estado = ?"); args.push(f.estado); }
  if (f.q?.trim()) {
    const like = `%${f.q.trim()}%`;
    where.push(`(m.numero_interno ILIKE ? OR REPLACE(UPPER(m.numero_interno), ' ', '') LIKE ? OR m.descricao ILIKE ? OR m.numero_serie ILIKE ?
      OR m.matricula ILIKE ? OR m.fornecedor ILIKE ? OR m.comprador ILIKE ?)`);
    args.push(like, `%${f.q.trim().toUpperCase().replace(/[\s*]/g, "")}%`, like, like, like, like, like);
  }
  return { sql: where.join(" AND "), args };
}

/** Máquinas com o que já custaram em faturas; paginadas (há centenas). */
export async function listarMaquinas(u: User, f: FiltroMaquinas = {}) {
  const v = visivel(u);
  const c = condicoesMaquinas(f);
  const porPagina = Math.min(f.porPagina ?? 50, 200);
  const off = Math.max((f.pagina ?? 1) - 1, 0) * porPagina;
  const [linhas, total] = await Promise.all([
    query<Maquina & { empresa_nome: string | null; n: number; custo: number }>(
      `SELECT m.*, e.nome AS empresa_nome, COUNT(f.id)::int AS n, COALESCE(SUM(f.total),0)::float8 AS custo
       FROM maquinas m LEFT JOIN empresas e ON e.id = m.empresa_id LEFT JOIN faturas f ON f.maquina_id = m.id AND ${v.sql}
       WHERE ${c.sql} GROUP BY m.id, e.nome ORDER BY m.numero_interno LIMIT ${porPagina} OFFSET ${off}`,
      [...v.args, ...c.args]),
    queryOne<{ n: number }>(`SELECT COUNT(*)::int AS n FROM maquinas m WHERE ${c.sql}`, c.args),
  ]);
  return { linhas, total: total?.n ?? 0, porPagina };
}

/** Quantas máquinas e quanto valor de compra, por empresa e estado. */
export function resumoMaquinas(empresaId?: number) {
  return query<{ empresa: string | null; estado: string; n: number; valor: number }>(
    `SELECT e.nome AS empresa, m.estado, COUNT(*)::int AS n, COALESCE(SUM(m.valor_compra),0)::float8 AS valor
     FROM maquinas m LEFT JOIN empresas e ON e.id = m.empresa_id
     WHERE m.apagada_em IS NULL ${empresaId ? "AND m.empresa_id = ?" : ""} GROUP BY e.nome, m.estado ORDER BY e.nome, m.estado`,
    empresaId ? [empresaId] : []);
}

/** Vendidas, por empresa e comprador (para separar vendas a terceiros de transferências dentro do grupo). */
export const vendidasPorComprador = (empresaId?: number) =>
  query<{ empresa_id: number | null; comprador: string | null; n: number; valor: number }>(
    `SELECT empresa_id, comprador, COUNT(*)::int AS n, COALESCE(SUM(valor_compra),0)::float8 AS valor FROM maquinas
     WHERE apagada_em IS NULL AND estado = 'vendido' ${empresaId ? "AND empresa_id = ?" : ""} GROUP BY empresa_id, comprador`, empresaId ? [empresaId] : []);

/** A mesma máquina física noutra empresa (mesmo nº de série, números internos diferentes). */
export function maquinasComMesmaSerie(m: Pick<Maquina, "id" | "numero_serie">) {
  const serie = (m.numero_serie ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (serie.length < 4) return Promise.resolve([]);
  return query<{ id: number; numero_interno: string; estado: string; empresa: string | null; comprador: string | null }>(
    `SELECT m.id, m.numero_interno, m.estado, e.nome AS empresa, m.comprador FROM maquinas m LEFT JOIN empresas e ON e.id = m.empresa_id
     WHERE m.apagada_em IS NULL AND m.id <> ? AND regexp_replace(UPPER(COALESCE(m.numero_serie,'')), '[^A-Z0-9]', '', 'g') = ?`, [m.id, serie]);
}

export function maquinasParaExportar(f: FiltroMaquinas = {}) {
  const c = condicoesMaquinas(f);
  return query<Maquina & { empresa_nome: string | null }>(
    `SELECT m.*, e.nome AS empresa_nome FROM maquinas m LEFT JOIN empresas e ON e.id = m.empresa_id WHERE ${c.sql} ORDER BY m.estado, m.numero_interno`, c.args);
}

export const maquinasExistentes = () => query<Maquina>("SELECT * FROM maquinas WHERE apagada_em IS NULL");

/** Procura uma máquina pelo nº interno, tolerando «SL005», «sl 005» e «SL 005*». */
export const maquinaPorNumero = (numero: string) =>
  queryOne<{ id: number }>("SELECT id FROM maquinas WHERE apagada_em IS NULL AND REPLACE(UPPER(numero_interno), ' ', '') = ?", [numero.toUpperCase().replace(/[\s*]/g, "")]);

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
export type Utilizador = { id: number; nome: string; email: string; cargo: string; ativo: number; visto_em: string | null; ultimo_login: string | null; sessoes: number };
/** Com presença: `visto_em` = último pedido à app; `sessoes` = sessões abertas (não expiradas). */
export const todosUtilizadores = () =>
  query<Utilizador>(`SELECT u.id, u.nome, u.email, u.cargo, u.ativo, u.visto_em, u.ultimo_login,
      (SELECT COUNT(*)::int FROM sessions s WHERE s.user_id = u.id AND s.expires_at > ?) AS sessoes
    FROM users u ORDER BY u.ativo DESC, u.visto_em DESC NULLS LAST, u.nome`, [Date.now()]);

// ---------- Nomes (para mostrar ids como texto) ----------
export type Nomes = { empresas: Record<number, string>; predios: Record<number, string>; maquinas: Record<number, string> };

export async function carregarNomes(): Promise<Nomes> {
  const [e, p, m] = await Promise.all([
    query<{ id: number; nome: string }>("SELECT id, nome FROM empresas"), query<{ id: number; nome: string }>("SELECT id, nome FROM predios"),
    query<{ id: number; numero_interno: string }>("SELECT id, numero_interno FROM maquinas")]);
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

// ---------- Documentos com prazo ----------
export type Documento = {
  id: number; maquina_id: number | null; empresa_id: number | null; tipo: string; descricao: string | null; validade: string;
  ficheiro_id: number | null; notas: string | null; criado_em: string; maquina_numero: string | null; maquina_descricao: string | null;
  maquina_estado: string | null; empresa_nome: string | null;
};

export function listarDocumentos(f: { maquinaId?: number; empresaId?: number; tipo?: string; ate?: string } = {}) {
  const where = ["d.apagado_em IS NULL", "(d.maquina_id IS NULL OR m.apagada_em IS NULL)"];
  const args: unknown[] = [];
  if (f.maquinaId) { where.push("d.maquina_id = ?"); args.push(f.maquinaId); }
  if (f.empresaId) { where.push("COALESCE(d.empresa_id, m.empresa_id) = ?"); args.push(f.empresaId); }
  if (f.tipo) { where.push("d.tipo = ?"); args.push(f.tipo); }
  if (f.ate) { where.push("d.validade <= ?"); args.push(f.ate); }
  return query<Documento>(
    `SELECT d.*, m.numero_interno AS maquina_numero, m.descricao AS maquina_descricao, m.estado AS maquina_estado,
       COALESCE(e.nome, em.nome) AS empresa_nome
     FROM documentos d LEFT JOIN maquinas m ON m.id = d.maquina_id LEFT JOIN empresas e ON e.id = d.empresa_id LEFT JOIN empresas em ON em.id = m.empresa_id
     WHERE ${where.join(" AND ")} ORDER BY d.validade, d.id`, args);
}

/** Quantos documentos caducados ou a caducar nos próximos `dias` (só de máquinas que ainda não foram vendidas/abatidas). */
export async function contarPrazos(dias = 30) {
  const hoje = new Date().toISOString().slice(0, 10);
  const limite = new Date(Date.now() + dias * 86400000).toISOString().slice(0, 10);
  const r = await queryOne<{ caducados: number; urgentes: number }>(
    `SELECT COALESCE(SUM(CASE WHEN d.validade < ? THEN 1 ELSE 0 END),0)::int AS caducados,
            COALESCE(SUM(CASE WHEN d.validade >= ? AND d.validade <= ? THEN 1 ELSE 0 END),0)::int AS urgentes
     FROM documentos d LEFT JOIN maquinas m ON m.id = d.maquina_id
     WHERE d.apagado_em IS NULL AND (d.maquina_id IS NULL OR (m.apagada_em IS NULL AND m.estado NOT IN ('vendido','abatido')))`,
    [hoje, hoje, limite]);
  return r ?? { caducados: 0, urgentes: 0 };
}

// ---------- Alugueres e rentabilidade ----------
export type Aluguer = { id: number; maquina_id: number; cliente: string | null; inicio: string; fim: string | null; valor: number; fatura: string | null; notas: string | null; criado_em: string };
export const listarAlugueres = (maquinaId: number) =>
  query<Aluguer>("SELECT * FROM alugueres WHERE maquina_id = ? AND apagado_em IS NULL ORDER BY inicio DESC, id DESC", [maquinaId]);

/** Clientes já usados (para sugerir ao escrever). */
export const clientesAluguer = () =>
  query<{ cliente: string }>("SELECT DISTINCT cliente FROM alugueres WHERE cliente IS NOT NULL AND apagado_em IS NULL ORDER BY cliente LIMIT 500");

export type LinhaRentabilidade = {
  id: number; numero_interno: string; descricao: string | null; estado: string; empresa_nome: string | null; valor_compra: number | null;
  receitas: number; custos: number; n_alugueres: number; n_faturas: number; dias_alugada_12m: number; receitas_12m: number; custos_12m: number;
  ultimo_aluguer: string | null; alugada_agora: boolean;
};

/**
 * Por máquina: o que rendeu em alugueres contra o que custou em faturas (peças, reparações…).
 * Os «12 meses» servem para ver a situação atual, não só o acumulado desde a compra.
 */
export function rentabilidade(f: { empresaId?: number; estado?: string } = {}) {
  const hoje = new Date().toISOString().slice(0, 10);
  const ha12 = new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10);
  const where = ["m.apagada_em IS NULL"];
  const args: unknown[] = [ha12, hoje, ha12, ha12, hoje, hoje];
  // Parâmetros numerados à mão ($1…$6 abaixo); os filtros continuam a numeração
  if (f.empresaId) { args.push(f.empresaId); where.push(`m.empresa_id = $${args.length}`); }
  if (f.estado) { args.push(f.estado); where.push(`m.estado = $${args.length}`); }
  // Dias alugada nos últimos 12 meses: interseção de cada aluguer com a janela [há 12 meses, hoje]
  return query<LinhaRentabilidade>(
    `WITH a AS (
       SELECT maquina_id, COUNT(*)::int AS n, COALESCE(SUM(valor),0)::float8 AS receitas,
         COALESCE(SUM(GREATEST(0, (LEAST(COALESCE(fim, $2)::date, $2::date) - GREATEST(inicio::date, $1::date)) + 1)),0)::int AS dias_12m,
         COALESCE(SUM(CASE WHEN COALESCE(fim, inicio) >= $3 THEN valor ELSE 0 END),0)::float8 AS receitas_12m,
         MAX(inicio) AS ultimo
       FROM alugueres WHERE apagado_em IS NULL GROUP BY maquina_id),
     c AS (
       SELECT maquina_id, COUNT(*)::int AS n, COALESCE(SUM(total),0)::float8 AS custos,
         COALESCE(SUM(CASE WHEN COALESCE(data, substr(criado_em,1,10)) >= $4 THEN total ELSE 0 END),0)::float8 AS custos_12m
       FROM faturas WHERE apagada_em IS NULL AND maquina_id IS NOT NULL GROUP BY maquina_id),
     agora AS (SELECT DISTINCT maquina_id FROM alugueres WHERE apagado_em IS NULL AND inicio <= $5 AND (fim IS NULL OR fim >= $6))
     SELECT m.id, m.numero_interno, m.descricao, m.estado, e.nome AS empresa_nome, m.valor_compra,
       COALESCE(a.receitas,0)::float8 AS receitas, COALESCE(c.custos,0)::float8 AS custos, COALESCE(a.n,0)::int AS n_alugueres, COALESCE(c.n,0)::int AS n_faturas,
       LEAST(COALESCE(a.dias_12m,0), 365)::int AS dias_alugada_12m, COALESCE(a.receitas_12m,0)::float8 AS receitas_12m, COALESCE(c.custos_12m,0)::float8 AS custos_12m,
       a.ultimo AS ultimo_aluguer, (agora.maquina_id IS NOT NULL) AS alugada_agora
     FROM maquinas m LEFT JOIN empresas e ON e.id = m.empresa_id LEFT JOIN a ON a.maquina_id = m.id LEFT JOIN c ON c.maquina_id = m.id
       LEFT JOIN agora ON agora.maquina_id = m.id
     WHERE ${where.join(" AND ")} ORDER BY m.numero_interno`,
    args);
}
