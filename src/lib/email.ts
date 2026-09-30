import nodemailer from "nodemailer";

/** O envio por email precisa de um servidor SMTP (ex.: Gmail com palavra-passe de aplicação). */
export const emailConfigurado = () => Boolean(process.env.SMTP_HOST && process.env.SMTP_FROM);

export type Anexo = { filename: string; content: Buffer };

export async function enviarEmail(o: { para: string[]; assunto: string; texto: string; anexos: Anexo[] }) {
  const porta = Number(process.env.SMTP_PORT ?? 587);
  const transporte = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: porta,
    secure: porta === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS ?? "" } : undefined,
  });
  await transporte.sendMail({ from: process.env.SMTP_FROM, to: o.para, subject: o.assunto, text: o.texto, attachments: o.anexos });
}
