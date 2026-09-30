import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { hashPassword } from "./password";

export const DATA_DIR = process.env.GESTAO_DATA_DIR ?? path.join(process.cwd(), "data");
export const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Categorias e cargos da aplicação
export const CATEGORIAS = ["energia", "agua", "contabilidade", "predio", "maquinas", "outros"] as const;
export type Categoria = (typeof CATEGORIAS)[number];
export const CARGOS = ["admin", "operador", ...CATEGORIAS] as const;
export type Cargo = (typeof CARGOS)[number];

const g = globalThis as unknown as { __db?: DatabaseSync };

function open(): DatabaseSync {
  const db = new DatabaseSync(path.join(DATA_DIR, "app.db"));
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY, nome TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL, cargo TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS empresas (id INTEGER PRIMARY KEY, nome TEXT NOT NULL UNIQUE);
    CREATE TABLE IF NOT EXISTS predios (
      id INTEGER PRIMARY KEY, nome TEXT NOT NULL, morada TEXT,
      -- identificador estável (nº contador / código de cliente): a morada sozinha é ambígua
      codigo_contador TEXT
    );
    CREATE TABLE IF NOT EXISTS maquinas (
      id INTEGER PRIMARY KEY, numero_interno TEXT NOT NULL UNIQUE, descricao TEXT
    );
    CREATE TABLE IF NOT EXISTS faturas (
      id INTEGER PRIMARY KEY,
      criado_em TEXT NOT NULL DEFAULT (datetime('now')),
      criado_por INTEGER NOT NULL REFERENCES users(id),
      ficheiro TEXT,
      fornecedor TEXT, nif_fornecedor TEXT, numero TEXT, data TEXT,
      total REAL, iva REAL,
      categoria TEXT NOT NULL DEFAULT 'outros',
      empresa_id INTEGER REFERENCES empresas(id),
      predio_id INTEGER REFERENCES predios(id),
      maquina_id INTEGER REFERENCES maquinas(id),
      identificador TEXT,      -- nº contador / código cliente lido da fatura
      itens TEXT,              -- JSON [{descricao, quantidade, preco_unitario, total}]
      alerta TEXT,             -- motivo de revisão manual
      revisada INTEGER NOT NULL DEFAULT 0
    );
  `);
  seed(db);
  return db;
}

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

function seed(db: DatabaseSync) {
  const n = (db.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number }).n;
  if (n > 0) return;
  const ins = db.prepare("INSERT INTO users (nome,email,password_hash,cargo) VALUES (?,?,?,?)");
  ins.run("Sr. Filipe", "filipe@local", hashPassword(senhaInicial("FILIPE_PASSWORD", "filipe123", "filipe@local")), "admin");
  ins.run("Lisa", "lisa@local", hashPassword(senhaInicial("LISA_PASSWORD", "lisa123", "lisa@local")), "operador");
  ins.run("Contabilidade", "contabilidade@local", hashPassword(senhaInicial("CONTABILIDADE_PASSWORD", "conta123", "contabilidade@local")), "contabilidade");
}

export function db(): DatabaseSync {
  return (g.__db ??= open());
}
