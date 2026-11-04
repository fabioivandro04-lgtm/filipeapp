import { headers } from "next/headers";

/** Endereço público da app (https://…), a partir do pedido atual. APP_URL na Vercel sobrepõe-se, se existir. */
export async function enderecoApp(): Promise<string> {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (/^(localhost|127\.0\.0\.1)(:|$)/.test(host) ? "http" : "https");
  return `${proto}://${host}`;
}

/** A Redirect URI que se põe no Moloni (Configurações → Developers). */
export const redirectMoloni = async () => `${await enderecoApp()}/api/moloni/ligar`;
