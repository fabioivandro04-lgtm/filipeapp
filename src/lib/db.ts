import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { hashPassword } from "./password";

// Pasta de dados locais (só usada sem DATABASE_URL)
export const DATA_DIR = process.env.GESTAO_DATA_DIR ?? path.join(process.cwd(), "data");

// Categorias e cargos da aplicação
export const CATEGORIAS = ["energia", "agua", "contabilidade", "predio", "maquinas", "outros"] as const;
export type Categoria = (typeof CATEGORIAS)[number];
export const CARGOS = ["admin", "operador", ...CATEGORIAS] as const;
export type Cargo = (typeof CARGOS)[number];

type Driver = { query(sql: string, params: unknown[]): Promise<Record<string, unknown>[]>; exec(sql: string): Promise<void> };

/**
 * Com DATABASE_URL usa Postgres a sério (Supabase, Neon, …). Sem ela usa PGlite,
 * um Postgres embutido que guarda tudo em data/pg — não é preciso instalar nada.
 */
async function criarDriver(): Promise<Driver> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const { Pool } = await import("pg");
    const local = /localhost|127\.0\.0\.1/.test(url);
    const pool = new Pool({ connectionString: url, max: 3, ssl: local ? false : { rejectUnauthorized: false } });
    return {
      query: async (sql, params) => (await pool.query(sql, params)).rows,
      exec: async (sql) => { await pool.query(sql); },
    };
  }
  const { PGlite } = await import("@electric-sql/pglite");
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const pg = new PGlite(path.join(DATA_DIR, "pg"));
  await pg.waitReady;
  return {
    query: async (sql, params) => (await pg.query(sql, params)).rows as Record<string, unknown>[],
    exec: async (sql) => { await pg.exec(sql); },
  };
}

const TABELAS = ["users", "sessions", "empresas", "predios", "maquinas", "ficheiros", "faturas"];

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY, nome TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL, cargo TEXT NOT NULL
  );
  ALTER TABLE users ADD COLUMN IF NOT EXISTS ativo INTEGER NOT NULL DEFAULT 1;
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at BIGINT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS empresas (id SERIAL PRIMARY KEY, nome TEXT NOT NULL UNIQUE);
  CREATE TABLE IF NOT EXISTS predios (
    id SERIAL PRIMARY KEY, nome TEXT NOT NULL, morada TEXT,
    -- identificador estável (nº contador / código de cliente): a morada sozinha é ambígua
    codigo_contador TEXT
  );
  CREATE TABLE IF NOT EXISTS maquinas (
    id SERIAL PRIMARY KEY, numero_interno TEXT NOT NULL UNIQUE, descricao TEXT
  );
  CREATE TABLE IF NOT EXISTS ficheiros (
    id SERIAL PRIMARY KEY, mime TEXT NOT NULL, dados BYTEA NOT NULL
  );
  CREATE TABLE IF NOT EXISTS faturas (
    id SERIAL PRIMARY KEY,
    criado_em TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'),
    criado_por INTEGER NOT NULL REFERENCES users(id),
    ficheiro_id INTEGER REFERENCES ficheiros(id) ON DELETE SET NULL,
    fornecedor TEXT, nif_fornecedor TEXT, numero TEXT, data TEXT,
    total DOUBLE PRECISION, iva DOUBLE PRECISION,
    categoria TEXT NOT NULL DEFAULT 'outros',
    empresa_id INTEGER REFERENCES empresas(id),
    predio_id INTEGER REFERENCES predios(id),
    maquina_id INTEGER REFERENCES maquinas(id),
    identificador TEXT,      -- nº contador / código cliente lido da fatura
    itens TEXT,              -- JSON [{descricao, quantidade, preco_unitario, total}]
    alerta TEXT,             -- motivo de revisão manual
    revisada INTEGER NOT NULL DEFAULT 0
  );
  -- No Supabase, sem RLS as tabelas ficariam legíveis por qualquer pessoa via API pública.
  -- Ativar RLS sem políticas bloqueia a API; a app liga-se com o utilizador da base de dados.
  ${TABELAS.map((t) => `ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY;`).join("\n  ")}
`;

/**
 * Palavra-passe inicial de um utilizador. Usa a variável de ambiente se existir.
 * Em produção sem variável, gera uma aleatória e escreve-a UMA vez no log.
 * Só em desenvolvimento local (npm run dev) usa a palavra-passe simples de exemplo.
 */
function senhaInicial(env: string, exemplo: string, quem: string): string {
  const v = process.env[env];
  if (v) return v;
  if (process.env.NODE_ENV !== "production") return exemplo;
  const gerada = randomBytes(9).toString("base64url");
  console.log(`[GESTAO APP] Palavra-passe inicial de ${quem}: ${gerada}  (defina ${env} para escolher a sua)`);
  return gerada;
}

async function iniciar(): Promise<Driver> {
  const d = await criarDriver();
  await d.exec(SCHEMA);
  const n = Number((await d.query("SELECT COUNT(*)::int AS n FROM users", []))[0].n);
  if (n === 0) {
    const ins = "INSERT INTO users (nome,email,password_hash,cargo) VALUES ($1,$2,$3,$4) ON CONFLICT (email) DO NOTHING";
    await d.query(ins, ["Sr. Filipe", "filipe@local", hashPassword(senhaInicial("FILIPE_PASSWORD", "filipe123", "filipe@local")), "admin"]);
    await d.query(ins, ["Lisa", "lisa@local", hashPassword(senhaInicial("LISA_PASSWORD", "lisa123", "lisa@local")), "operador"]);
    await d.query(ins, ["Contabilidade", "contabilidade@local", hashPassword(senhaInicial("CONTABILIDADE_PASSWORD", "conta123", "contabilidade@local")), "contabilidade"]);
  }
  return d;
}

const g = globalThis as unknown as { __driver?: Promise<Driver> };
const driver = () => (g.__driver ??= iniciar());

/** Escreve SQL com "?" como parâmetros; é convertido para $1, $2… */
const converter = (sql: string) => { let i = 0; return sql.replace(/\?/g, () => `$${++i}`); };

export async function query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  const d = await driver();
  return (await d.query(converter(sql), params.map((p) => (p === undefined ? null : p)))) as T[];
}

export async function queryOne<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T | undefined> {
  return (await query<T>(sql, params))[0];
}
