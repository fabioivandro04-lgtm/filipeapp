import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db, type Cargo, type Categoria } from "./db";
import { verifyPassword } from "./password";

const COOKIE = "session";
const TTL_MS = 1000 * 60 * 60 * 12;

export type User = { id: number; nome: string; email: string; cargo: Cargo };

export async function login(email: string, password: string): Promise<boolean> {
  const row = db().prepare("SELECT * FROM users WHERE email = ?").get(email.trim().toLowerCase()) as
    | (User & { password_hash: string })
    | undefined;
  if (!row || !verifyPassword(password, row.password_hash)) return false;
  const token = randomBytes(32).toString("hex");
  db().prepare("INSERT INTO sessions (token,user_id,expires_at) VALUES (?,?,?)").run(token, row.id, Date.now() + TTL_MS);
  (await cookies()).set(COOKIE, token, { httpOnly: true, sameSite: "lax", path: "/", maxAge: TTL_MS / 1000 });
  return true;
}

export async function logout() {
  const jar = await cookies();
  const t = jar.get(COOKIE)?.value;
  if (t) db().prepare("DELETE FROM sessions WHERE token = ?").run(t);
  jar.delete(COOKIE);
}

export async function getUser(): Promise<User | null> {
  const t = (await cookies()).get(COOKIE)?.value;
  if (!t) return null;
  const u = db()
    .prepare(
      `SELECT u.id,u.nome,u.email,u.cargo FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token = ? AND s.expires_at > ?`,
    )
    .get(t, Date.now()) as User | undefined;
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
