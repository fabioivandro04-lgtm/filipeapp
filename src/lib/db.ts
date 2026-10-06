import fs from "node:fs";
import path from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { hashPassword } from "./password";

// Pasta de dados locais (só usada sem DATABASE_URL)
export const DATA_DIR = process.env.GESTAO_DATA_DIR ?? path.join(process.cwd(), "data");

// Categorias e cargos da aplicação
export const CATEGORIAS = ["energia", "agua", "contabilidade", "predio", "maquinas", "outros"] as const;
export type Categoria = (typeof CATEGORIAS)[number];
// admin: faz tudo · operador: carrega e edita · contabilista: vê tudo e propõe edições, que um admin tem de aceitar
export const CARGOS = ["admin", "operador", "contabilista"] as const;
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

const TABELAS = ["users", "sessions", "empresas", "predios", "maquinas", "ficheiros", "faturas", "config", "historico", "propostas", "documentos", "alugueres", "login_falhas"];

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
  -- Campos vindos do QR fiscal da AT, envio à contabilidade e "apagar" recuperável
  ALTER TABLE empresas ADD COLUMN IF NOT EXISTS nif TEXT;
  -- Máquinas: inventário por empresa (importado dos ficheiros de stock)
  ALTER TABLE maquinas ADD COLUMN IF NOT EXISTS empresa_id INTEGER REFERENCES empresas(id);
  ALTER TABLE maquinas ADD COLUMN IF NOT EXISTS designacao TEXT;
  ALTER TABLE maquinas ADD COLUMN IF NOT EXISTS marca TEXT;
  ALTER TABLE maquinas ADD COLUMN IF NOT EXISTS modelo TEXT;
  ALTER TABLE maquinas ADD COLUMN IF NOT EXISTS ano INTEGER;
  ALTER TABLE maquinas ADD COLUMN IF NOT EXISTS id_fornecedor TEXT;
  ALTER TABLE maquinas ADD COLUMN IF NOT EXISTS numero_serie TEXT;
  ALTER TABLE maquinas ADD COLUMN IF NOT EXISTS peso_kg INTEGER;
  ALTER TABLE maquinas ADD COLUMN IF NOT EXISTS matricula TEXT;
  ALTER TABLE maquinas ADD COLUMN IF NOT EXISTS horas DOUBLE PRECISION;
  ALTER TABLE maquinas ADD COLUMN IF NOT EXISTS data_compra TEXT;
  ALTER TABLE maquinas ADD COLUMN IF NOT EXISTS data_chegada TEXT;
  ALTER TABLE maquinas ADD COLUMN IF NOT EXISTS fornecedor TEXT;
  ALTER TABLE maquinas ADD COLUMN IF NOT EXISTS agencia TEXT;
  ALTER TABLE maquinas ADD COLUMN IF NOT EXISTS valor_compra DOUBLE PRECISION;
  ALTER TABLE maquinas ADD COLUMN IF NOT EXISTS valor_compra_original TEXT;   -- quando o valor não era um número simples (ex.: «12812,50£»)
  ALTER TABLE maquinas ADD COLUMN IF NOT EXISTS facturada TEXT;
  ALTER TABLE maquinas ADD COLUMN IF NOT EXISTS observacoes TEXT;
  ALTER TABLE maquinas ADD COLUMN IF NOT EXISTS estado TEXT NOT NULL DEFAULT 'stock';   -- stock | vendido | abatido | outro
  ALTER TABLE maquinas ADD COLUMN IF NOT EXISTS assinalada INTEGER NOT NULL DEFAULT 0;   -- nº marcado com asterisco no ficheiro
  ALTER TABLE maquinas ADD COLUMN IF NOT EXISTS venda_fatura TEXT;
  ALTER TABLE maquinas ADD COLUMN IF NOT EXISTS comprador TEXT;
  ALTER TABLE maquinas ADD COLUMN IF NOT EXISTS data_venda TEXT;
  ALTER TABLE maquinas ADD COLUMN IF NOT EXISTS origem TEXT;
  ALTER TABLE maquinas ADD COLUMN IF NOT EXISTS atualizada_em TEXT;
  CREATE INDEX IF NOT EXISTS maquinas_empresa_idx ON maquinas(empresa_id);
  -- «SL 005» e «SL005» são o mesmo nº (as faturas escrevem-no de várias maneiras). Não falha o arranque se já houver repetidos.
  DO $$ BEGIN
    CREATE UNIQUE INDEX IF NOT EXISTS maquinas_numero_norm_uq ON maquinas ((REPLACE(UPPER(numero_interno), ' ', ''))) WHERE apagada_em IS NULL;
  EXCEPTION WHEN others THEN NULL; END $$;
  ALTER TABLE empresas ADD COLUMN IF NOT EXISTS apagada_em TEXT;
  ALTER TABLE predios ADD COLUMN IF NOT EXISTS apagada_em TEXT;
  ALTER TABLE maquinas ADD COLUMN IF NOT EXISTS apagada_em TEXT;
  ALTER TABLE empresas ADD COLUMN IF NOT EXISTS morada TEXT;
  ALTER TABLE empresas ADD COLUMN IF NOT EXISTS codigo_postal TEXT;
  ALTER TABLE empresas ADD COLUMN IF NOT EXISTS localidade TEXT;
  CREATE UNIQUE INDEX IF NOT EXISTS empresas_nif_uq ON empresas(nif) WHERE nif IS NOT NULL;
  ALTER TABLE faturas ADD COLUMN IF NOT EXISTS atcud TEXT;
  ALTER TABLE faturas ADD COLUMN IF NOT EXISTS nif_adquirente TEXT;
  ALTER TABLE faturas ADD COLUMN IF NOT EXISTS tipo_doc TEXT;
  ALTER TABLE faturas ADD COLUMN IF NOT EXISTS qr_lido INTEGER NOT NULL DEFAULT 0;
  -- Como os dados foram obtidos: qr, ia, manual; 'pendente' enquanto a IA lê em segundo plano; 'falhou' se a leitura não deu
  ALTER TABLE faturas ADD COLUMN IF NOT EXISTS leitura TEXT NOT NULL DEFAULT 'manual';
  UPDATE faturas SET leitura = 'qr' WHERE qr_lido = 1 AND leitura = 'manual';
  ALTER TABLE faturas ADD COLUMN IF NOT EXISTS apagada_em TEXT;
  ALTER TABLE faturas ADD COLUMN IF NOT EXISTS enviada_em TEXT;
  CREATE TABLE IF NOT EXISTS config (chave TEXT PRIMARY KEY, valor TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS historico (
    id SERIAL PRIMARY KEY,
    quando TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'),
    user_id INTEGER REFERENCES users(id),
    fatura_id INTEGER,
    acao TEXT NOT NULL,
    detalhe TEXT
  );
  -- Edições propostas por contabilistas: só entram em vigor quando um admin as aceita
  CREATE TABLE IF NOT EXISTS propostas (
    id SERIAL PRIMARY KEY,
    fatura_id INTEGER NOT NULL REFERENCES faturas(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id),
    criado_em TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'),
    alteracoes TEXT NOT NULL,                     -- JSON { campo: [antes, depois] }
    estado TEXT NOT NULL DEFAULT 'pendente',      -- pendente | aceite | rejeitada | substituida
    decidido_por INTEGER REFERENCES users(id),
    decidido_em TEXT,
    motivo TEXT
  );
  -- Presença: última vez que cada pessoa usou a app e último login
  ALTER TABLE users ADD COLUMN IF NOT EXISTS visto_em TEXT;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS ultimo_login TEXT;
  CREATE INDEX IF NOT EXISTS historico_user_idx ON historico(user_id);
  -- Documentos com prazo (seguro, inspeção, IUC, certificados…) de uma máquina ou empresa
  CREATE TABLE IF NOT EXISTS documentos (
    id SERIAL PRIMARY KEY,
    maquina_id INTEGER REFERENCES maquinas(id),
    empresa_id INTEGER REFERENCES empresas(id),
    tipo TEXT NOT NULL,
    descricao TEXT,
    validade TEXT NOT NULL,                        -- AAAA-MM-DD
    ficheiro_id INTEGER REFERENCES ficheiros(id) ON DELETE SET NULL,
    notas TEXT,
    criado_por INTEGER REFERENCES users(id),
    criado_em TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'),
    apagado_em TEXT
  );
  CREATE INDEX IF NOT EXISTS documentos_maquina_idx ON documentos(maquina_id);
  -- Alugueres (receitas) de cada máquina, para a rentabilidade
  CREATE TABLE IF NOT EXISTS alugueres (
    id SERIAL PRIMARY KEY,
    maquina_id INTEGER NOT NULL REFERENCES maquinas(id),
    cliente TEXT,
    inicio TEXT NOT NULL,                          -- AAAA-MM-DD
    fim TEXT,                                      -- vazio = ainda alugada
    valor DOUBLE PRECISION NOT NULL DEFAULT 0,
    fatura TEXT,
    notas TEXT,
    criado_por INTEGER REFERENCES users(id),
    criado_em TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'),
    apagado_em TEXT
  );
  CREATE INDEX IF NOT EXISTS alugueres_maquina_idx ON alugueres(maquina_id);
  CREATE INDEX IF NOT EXISTS faturas_maquina_idx ON faturas(maquina_id);
  -- Tentativas de login falhadas (limite por email+IP e por IP; na base de dados porque há vários servidores)
  CREATE TABLE IF NOT EXISTS login_falhas (id SERIAL PRIMARY KEY, chave TEXT NOT NULL, quando BIGINT NOT NULL);
  CREATE INDEX IF NOT EXISTS login_falhas_idx ON login_falhas(chave, quando);
  -- Cargos antigos (por categoria) passam ao mais restrito: o contabilista propõe e um admin aceita.
  UPDATE users SET cargo = 'contabilista' WHERE cargo NOT IN ('admin', 'operador', 'contabilista');
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

// Muda sempre que o SCHEMA muda: só então se volta a correr (evita dezenas de ALTER TABLE, e os seus bloqueios, em cada arranque)
const VERSAO_SCHEMA = createHash("sha1").update(SCHEMA).digest("hex").slice(0, 12);

async function versaoAtual(d: Driver): Promise<string | null> {
  try {
    return ((await d.query("SELECT valor FROM config WHERE chave = 'schema_versao'", []))[0]?.valor as string) ?? null;
  } catch { return null; } // ainda não há tabela config
}

async function iniciar(): Promise<Driver> {
  const d = await criarDriver();
  if ((await versaoAtual(d)) !== VERSAO_SCHEMA) {
    await d.exec(SCHEMA);
    await d.query("INSERT INTO config (chave, valor) VALUES ('schema_versao', $1) ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor", [VERSAO_SCHEMA]);
  }
  const n = Number((await d.query("SELECT COUNT(*)::int AS n FROM users", []))[0].n);
  if (n === 0) {
    const ins = "INSERT INTO users (nome,email,password_hash,cargo) VALUES ($1,$2,$3,$4) ON CONFLICT (email) DO NOTHING";
    await d.query(ins, ["Sr. Filipe", "filipe@local", hashPassword(senhaInicial("FILIPE_PASSWORD", "filipe123", "filipe@local")), "admin"]);
    await d.query(ins, ["Lisa", "lisa@local", hashPassword(senhaInicial("LISA_PASSWORD", "lisa123", "lisa@local")), "operador"]);
    await d.query(ins, ["Contabilidade", "contabilidade@local", hashPassword(senhaInicial("CONTABILIDADE_PASSWORD", "conta123", "contabilidade@local")), "contabilista"]);
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
