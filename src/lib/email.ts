import nodemailer from "nodemailer";
import { lerConfig } from "./config";

/**
 * O envio por email precisa de um servidor SMTP (ex.: Gmail com palavra-passe de aplicação).
 * Vem das variáveis de ambiente (SMTP_*) ou, se não existirem, do que o administrador guardou em Definições.
 */
type Smtp = { host: string; port: number; user: string | null; pass: string | null; from: string; origem: "ambiente" | "definicoes" };

export async function lerSmtp(): Promise<Smtp | null> {
  if (process.env.SMTP_HOST && process.env.SMTP_FROM) {
    return { host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT ?? 587), user: process.env.SMTP_USER ?? null, pass: process.env.SMTP_PASS ?? null, from: process.env.SMTP_FROM, origem: "ambiente" };
  }
  const [host, port, user, pass, from] = await Promise.all(["smtp_host", "smtp_port", "smtp_user", "smtp_pass", "smtp_from"].map(lerConfig));
  if (!host || !from) return null;
  return { host, port: Number(port ?? 587), user, pass, from, origem: "definicoes" };
}

export const emailConfigurado = async () => (await lerSmtp()) !== null;

export type Anexo = { filename: string; content: Buffer };

export async function enviarEmail(o: { para: string[]; assunto: string; texto: string; anexos?: Anexo[] }) {
  const s = await lerSmtp();
  if (!s) throw new Error("O envio de email não está configurado (Definições → Servidor de email).");
  const transporte = nodemailer.createTransport({
    host: s.host, port: s.port, secure: s.port === 465,
    auth: s.user ? { user: s.user, pass: s.pass ?? "" } : undefined,
  });
  await transporte.sendMail({ from: s.from, to: o.para, subject: o.assunto, text: o.texto, attachments: o.anexos ?? [] });
}

/** Lista de emails escrita à mão («a@x.pt; b@y.pt») → só os que parecem válidos. */
export const listaEmails = (texto: string | null | undefined) =>
  [...new Set((texto ?? "").split(/[,;\s]+/).map((e) => e.trim().toLowerCase()).filter((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)))];
