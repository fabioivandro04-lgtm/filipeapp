import { query } from "./db";
import type { User } from "./auth";

/** Campos de uma fatura que se podem editar (e, por isso, registar e reverter). */
export const CAMPOS_EDITAVEIS = [
  "fornecedor", "nif_fornecedor", "numero", "data", "total", "iva", "categoria",
  "empresa_id", "predio_id", "maquina_id", "identificador", "nif_adquirente", "revisada",
] as const;

export const ROTULO_CAMPO: Record<string, string> = {
  fornecedor: "Fornecedor", nif_fornecedor: "NIF do fornecedor", numero: "Nº da fatura", data: "Data", total: "Total",
  iva: "IVA", categoria: "Categoria", empresa_id: "Empresa", predio_id: "Prédio", maquina_id: "Máquina",
  identificador: "Nº contador / cliente", nif_adquirente: "NIF do cliente", revisada: "Revista",
};

export type Diferencas = Record<string, [unknown, unknown]>;

const norm = (v: unknown) => (v == null || v === "" ? "" : typeof v === "number" ? String(v) : String(v));

/** Só o que mudou: { campo: [antes, depois] }. */
export function diferencas(antes: Record<string, unknown>, depois: Record<string, unknown>): Diferencas {
  const d: Diferencas = {};
  for (const c of CAMPOS_EDITAVEIS) if (norm(antes[c]) !== norm(depois[c])) d[c] = [antes[c] ?? null, depois[c] ?? null];
  return d;
}

export async function registar(u: Pick<User, "id"> | null, faturaId: number | null, acao: string, detalhe?: unknown) {
  await query("INSERT INTO historico (user_id, fatura_id, acao, detalhe) VALUES (?,?,?,?)",
    [u?.id ?? null, faturaId, acao, detalhe === undefined ? null : JSON.stringify(detalhe)]);
}

/** Mudanças que ainda não estão em vigor (proposta) contam como diferenças, mas não podem ser desfeitas. */
export const ACOES_COM_DIFERENCAS = ["editada", "proposta"] as const;

export type Registo = {
  id: number; quando: string; user_nome: string | null; fatura_id: number | null; acao: string; detalhe: string | null;
  fatura_apagada: string | null; fatura_fornecedor: string | null; fatura_numero: string | null;
};

/** Grupos de ações para filtrar o histórico. */
export const GRUPOS_HISTORICO: Record<string, { nome: string; sql: string }> = {
  faturas: { nome: "Faturas", sql: "(h.fatura_id IS NOT NULL OR h.acao IN ('criada','editada','apagada','restaurada','revertida'))" },
  maquinas: { nome: "Máquinas, prazos e alugueres", sql: "(h.acao LIKE 'maquina%' OR h.acao LIKE 'documento%' OR h.acao LIKE 'aluguer%')" },
  entidades: { nome: "Empresas e prédios", sql: "(h.acao LIKE 'empresa%' OR h.acao LIKE 'predio%')" },
  utilizadores: { nome: "Utilizadores", sql: "h.acao LIKE 'utilizador%'" },
  sessoes: { nome: "Entradas e saídas", sql: "h.acao LIKE 'sessao%'" },
};

export type FiltroHistorico = { faturaId?: number; userId?: number; grupo?: string; desde?: string; ate?: string; texto?: string; limite?: number; offset?: number };

export function listarHistorico(opcoes: FiltroHistorico = {}) {
  const onde: string[] = []; const p: unknown[] = [];
  if (opcoes.faturaId) { onde.push("h.fatura_id = ?"); p.push(opcoes.faturaId); }
  if (opcoes.userId) { onde.push("h.user_id = ?"); p.push(opcoes.userId); }
  if (opcoes.grupo && GRUPOS_HISTORICO[opcoes.grupo]) onde.push(GRUPOS_HISTORICO[opcoes.grupo].sql);
  else if (!opcoes.faturaId) onde.push("h.acao NOT LIKE 'sessao%'"); // entradas/saídas só quando pedidas (senão enchem a lista)
  if (opcoes.desde) { onde.push("h.quando >= ?"); p.push(opcoes.desde); }
  if (opcoes.ate) { onde.push("h.quando < ?"); p.push(opcoes.ate); }
  if (opcoes.texto) { onde.push("(h.detalhe ILIKE ? OR f.fornecedor ILIKE ? OR f.numero ILIKE ?)"); const q = `%${opcoes.texto}%`; p.push(q, q, q); }
  return query<Registo>(
    `SELECT h.id, h.quando, h.fatura_id, h.acao, h.detalhe, u.nome AS user_nome,
            f.apagada_em AS fatura_apagada, f.fornecedor AS fatura_fornecedor, f.numero AS fatura_numero
     FROM historico h LEFT JOIN users u ON u.id = h.user_id LEFT JOIN faturas f ON f.id = h.fatura_id
     ${onde.length ? `WHERE ${onde.join(" AND ")}` : ""} ORDER BY h.id DESC LIMIT ? OFFSET ?`,
    [...p, opcoes.limite ?? 300, opcoes.offset ?? 0],
  );
}
