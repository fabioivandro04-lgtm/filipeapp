import { randomBytes } from "node:crypto";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { query, queryOne, type Cargo } from "./db";
import { verifyPassword } from "./password";
import { registar } from "./historico";

const COOKIE = "session";
const TTL_MS = 1000 * 60 * 60 * 12;

export type User = { id: number; nome: string; email: string; cargo: Cargo };

/** Data/hora UTC no formato usado na base de dados («AAAA-MM-DD HH:MM:SS»). */
export const agoraUtc = () => new Date().toISOString().slice(0, 19).replace("T", " ");
// «Visto em» só é gravado se a última marca tiver mais de 1 minuto (menos escritas na base de dados)
const INTERVALO_VISTO_MS = 60 * 1000;

// Limite de tentativas: 5 falhas por email em 15 minutos (em memória, por instância)
const falhas = new Map<string, { n: number; ate: number }>();
const MAX_FALHAS = 5;
const JANELA_MS = 15 * 60 * 1000;

export async function login(email: string, password: string): Promise<boolean | "bloqueado"> {
  const chave = email.trim().toLowerCase();
  const f = falhas.get(chave);
  if (f && f.ate > Date.now() && f.n >= MAX_FALHAS) return "bloqueado";
  const row = await queryOne<User & { password_hash: string; ativo: number }>("SELECT * FROM users WHERE email = ?", [chave]);
  if (!row || !row.ativo || !verifyPassword(password, row.password_hash)) {
    const atual = f && f.ate > Date.now() ? f : { n: 0, ate: Date.now() + JANELA_MS };
    falhas.set(chave, { n: atual.n + 1, ate: atual.ate });
    return false;
  }
  falhas.delete(chave);
  const token = randomBytes(32).toString("hex");
  await query("DELETE FROM sessions WHERE expires_at < ?", [Date.now()]);
  await query("INSERT INTO sessions (token,user_id,expires_at) VALUES (?,?,?)", [token, row.id, Date.now() + TTL_MS]);
  const agora = agoraUtc();
  await query("UPDATE users SET ultimo_login = ?, visto_em = ? WHERE id = ?", [agora, agora, row.id]);
  await registar(row, null, "sessao_entrou");
  (await cookies()).set(COOKIE, token, { httpOnly: true, sameSite: "lax", path: "/", maxAge: TTL_MS / 1000, secure: process.env.COOKIE_SECURE === "1" });
  return true;
}

export async function logout() {
  const jar = await cookies();
  const t = jar.get(COOKIE)?.value;
  if (t) {
    const s = await queryOne<{ user_id: number }>("DELETE FROM sessions WHERE token = ? RETURNING user_id", [t]);
    if (s) await registar({ id: s.user_id }, null, "sessao_saiu");
  }
  jar.delete(COOKIE);
}

/** Utilizador da sessão. `cache` evita repetir a consulta quando o layout e a página a pedem no mesmo pedido. */
export const getUser = cache(async (): Promise<User | null> => {
  const t = (await cookies()).get(COOKIE)?.value;
  if (!t) return null;
  const u = await queryOne<User & { visto_em: string | null }>(
    `SELECT u.id,u.nome,u.email,u.cargo,u.visto_em FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token = ? AND s.expires_at > ? AND u.ativo = 1`,
    [t, Date.now()],
  );
  if (!u) return null;
  const visto = u.visto_em ? Date.parse(u.visto_em.replace(" ", "T") + "Z") : 0;
  // Marca a presença depois de enviar a resposta, para não atrasar a página
  if (Date.now() - visto > INTERVALO_VISTO_MS) after(() => query("UPDATE users SET visto_em = ? WHERE id = ?", [agoraUtc(), u.id]).catch(() => {}));
  return { id: u.id, nome: u.nome, email: u.email, cargo: u.cargo };
});

export async function requireUser(): Promise<User> {
  const u = await getUser();
  if (!u) redirect("/login");
  return u;
}

/** Admin e operador editam diretamente; o contabilista só propõe alterações. */
export const editaDireto = (u: Pick<User, "cargo">) => u.cargo === "admin" || u.cargo === "operador";
export const eAdmin = (u: Pick<User, "cargo">) => u.cargo === "admin";
