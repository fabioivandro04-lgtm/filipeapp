import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { query, queryOne, type Cargo, type Categoria } from "./db";
import { verifyPassword } from "./password";

const COOKIE = "session";
const TTL_MS = 1000 * 60 * 60 * 12;

export type User = { id: number; nome: string; email: string; cargo: Cargo };

// Limite de tentativas: 5 falhas por email em 15 minutos (em memória, por instância)
const falhas = new Map<string, { n: number; ate: number }>();
const MAX_FALHAS = 5;
const JANELA_MS = 15 * 60 * 1000;

export async function login(email: string, password: string): Promise<boolean | "bloqueado"> {
  const chave = email.trim().toLowerCase();
  const f = falhas.get(chave);
  if (f && f.ate > Date.now() && f.n >= MAX_FALHAS) return "bloqueado";
  const row = await queryOne<User & { password_hash: string }>("SELECT * FROM users WHERE email = ?", [chave]);
  if (!row || !verifyPassword(password, row.password_hash)) {
    const atual = f && f.ate > Date.now() ? f : { n: 0, ate: Date.now() + JANELA_MS };
    falhas.set(chave, { n: atual.n + 1, ate: atual.ate });
    return false;
  }
  falhas.delete(chave);
  const token = randomBytes(32).toString("hex");
  await query("DELETE FROM sessions WHERE expires_at < ?", [Date.now()]);
  await query("INSERT INTO sessions (token,user_id,expires_at) VALUES (?,?,?)", [token, row.id, Date.now() + TTL_MS]);
  (await cookies()).set(COOKIE, token, { httpOnly: true, sameSite: "lax", path: "/", maxAge: TTL_MS / 1000, secure: process.env.COOKIE_SECURE === "1" });
  return true;
}

export async function logout() {
  const jar = await cookies();
  const t = jar.get(COOKIE)?.value;
  if (t) await query("DELETE FROM sessions WHERE token = ?", [t]);
  jar.delete(COOKIE);
}

export async function getUser(): Promise<User | null> {
  const t = (await cookies()).get(COOKIE)?.value;
  if (!t) return null;
  const u = await queryOne<User>(
    `SELECT u.id,u.nome,u.email,u.cargo FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token = ? AND s.expires_at > ?`,
    [t, Date.now()],
  );
  return u ?? null;
}

export async function requireUser(): Promise<User> {
  const u = await getUser();
  if (!u) redirect("/login");
  return u;
}

/** Categorias que o utilizador pode ver: admin e operador vêem tudo; os restantes cargos só a sua categoria. */
export function categoriasVisiveis(u: User): Categoria[] | "todas" {
  if (u.cargo === "admin" || u.cargo === "operador") return "todas";
  return [u.cargo as Categoria];
}
