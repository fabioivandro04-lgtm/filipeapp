import { createHash, randomBytes } from "node:crypto";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { query, queryOne, type Cargo } from "./db";
import { hashPassword, verifyPassword } from "./password";
import { registar } from "./historico";

const COOKIE = "session";
const TTL_MS = 1000 * 60 * 60 * 12;

export type User = { id: number; nome: string; email: string; cargo: Cargo };

/** Data/hora UTC no formato usado na base de dados («AAAA-MM-DD HH:MM:SS»). */
export const agoraUtc = () => new Date().toISOString().slice(0, 19).replace("T", " ");
// «Visto em» só é gravado se a última marca tiver mais de 1 minuto (menos escritas na base de dados)
const INTERVALO_VISTO_MS = 60 * 1000;

// Os tokens de sessão nunca ficam na base de dados em claro: só o hash (se a base fosse lida, as sessões não serviam a ninguém)
const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

// Limite de tentativas de login. Vive na base de dados (há vários servidores na Vercel, a memória de um não vale aos outros).
// Por email+IP: um atacante não consegue bloquear a conta de outra pessoa a partir de outro sítio; por IP: trava a adivinha em massa.
const JANELA_MS = 15 * 60 * 1000;
const MAX_POR_PAR = 5, MAX_POR_IP = 25;
const MAX_SENHA = 200; // evita pedidos gigantes (a verificação da palavra-passe é cara de propósito)

async function ipDoPedido(): Promise<string> {
  const h = await headers();
  return (h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0] ?? "desconhecido").trim().slice(0, 64);
}
const contarFalhas = async (chave: string) =>
  (await queryOne<{ n: number }>("SELECT COUNT(*)::int AS n FROM login_falhas WHERE chave = ? AND quando > ?", [chave, Date.now() - JANELA_MS]))?.n ?? 0;

// Palavra-passe de mentira: gasta o mesmo tempo quando o email não existe (senão o tempo de resposta revelava quem tem conta)
const HASH_FALSO = hashPassword("palavra-passe-que-ninguem-usa");

export async function login(email: string, password: string): Promise<boolean | "bloqueado"> {
  const chave = email.trim().toLowerCase().slice(0, 200);
  const ip = await ipDoPedido();
  const par = `p:${chave}|${ip}`, soIp = `i:${ip}`;
  if ((await contarFalhas(par)) >= MAX_POR_PAR || (await contarFalhas(soIp)) >= MAX_POR_IP) return "bloqueado";

  const row = await queryOne<User & { password_hash: string; ativo: number }>("SELECT * FROM users WHERE email = ?", [chave]);
  const certa = verifyPassword(password.slice(0, MAX_SENHA), row?.password_hash ?? HASH_FALSO);
  if (!row || !row.ativo || !certa || password.length > MAX_SENHA) {
    const agora = Date.now();
    await query("INSERT INTO login_falhas (chave, quando) VALUES (?,?), (?,?)", [par, agora, soIp, agora]);
    await query("DELETE FROM login_falhas WHERE quando < ?", [agora - JANELA_MS]);
    return false;
  }
  await query("DELETE FROM login_falhas WHERE chave = ?", [par]);
  const token = randomBytes(32).toString("hex");
  await query("DELETE FROM sessions WHERE expires_at < ?", [Date.now()]);
  await query("INSERT INTO sessions (token,user_id,expires_at) VALUES (?,?,?)", [hashToken(token), row.id, Date.now() + TTL_MS]);
  const agora = agoraUtc();
  await query("UPDATE users SET ultimo_login = ?, visto_em = ? WHERE id = ?", [agora, agora, row.id]);
  await registar(row, null, "sessao_entrou");
  // Cookie sempre «Secure» em produção (não depende de uma variável que alguém se esqueça de definir)
  (await cookies()).set(COOKIE, token, { httpOnly: true, sameSite: "lax", path: "/", maxAge: TTL_MS / 1000, secure: process.env.NODE_ENV === "production" || process.env.COOKIE_SECURE === "1" });
  return true;
}

export async function logout() {
  const jar = await cookies();
  const t = jar.get(COOKIE)?.value;
  if (t) {
    const s = await queryOne<{ user_id: number }>("DELETE FROM sessions WHERE token = ? RETURNING user_id", [hashToken(t)]);
    if (s) await registar({ id: s.user_id }, null, "sessao_saiu");
  }
  jar.delete(COOKIE);
}

/** Termina as sessões de uma pessoa (todas, ou todas menos a do cookie indicado). */
export const terminarSessoes = (userId: number, excetoToken?: string) =>
  excetoToken
    ? query("DELETE FROM sessions WHERE user_id = ? AND token <> ?", [userId, hashToken(excetoToken)])
    : query("DELETE FROM sessions WHERE user_id = ?", [userId]);

/** Utilizador da sessão. `cache` evita repetir a consulta quando o layout e a página a pedem no mesmo pedido. */
export const getUser = cache(async (): Promise<User | null> => {
  const t = (await cookies()).get(COOKIE)?.value;
  if (!t) return null;
  const u = await queryOne<User & { visto_em: string | null }>(
    `SELECT u.id,u.nome,u.email,u.cargo,u.visto_em FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token = ? AND s.expires_at > ? AND u.ativo = 1`,
    [hashToken(t), Date.now()],
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
