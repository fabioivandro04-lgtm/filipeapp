import { query, queryOne } from "./db";

export async function lerConfig(chave: string): Promise<string | null> {
  return (await queryOne<{ valor: string }>("SELECT valor FROM config WHERE chave = ?", [chave]))?.valor ?? null;
}

export async function guardarConfig(chave: string, valor: string) {
  await query("INSERT INTO config (chave, valor) VALUES (?, ?) ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor", [chave, valor]);
}
