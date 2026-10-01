import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

// Segredos guardados na base de dados (ex.: palavra-passe do servidor de email) vão cifrados (AES-256-GCM).
// A chave vem do ambiente (APP_SECRET), nunca da base de dados: quem lesse só a base não conseguia usá-los.
const chave = () => {
  const base = process.env.APP_SECRET ?? process.env.DATABASE_URL;
  if (!base) throw new Error("Falta APP_SECRET para guardar segredos.");
  return createHash("sha256").update(`gestao-app:${base}`).digest();
};
const PREFIXO = "enc1:";

export function cifrar(texto: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", chave(), iv);
  const dados = Buffer.concat([c.update(texto, "utf8"), c.final()]);
  return PREFIXO + [iv, c.getAuthTag(), dados].map((b) => b.toString("base64")).join(".");
}

/** Devolve null se não der para decifrar (chave mudou, valor adulterado). Valores antigos sem cifra passam como estão. */
export function decifrar(valor: string | null): string | null {
  if (valor === null || !valor.startsWith(PREFIXO)) return valor;
  try {
    const [iv, tag, dados] = valor.slice(PREFIXO.length).split(".").map((p) => Buffer.from(p, "base64"));
    const d = createDecipheriv("aes-256-gcm", chave(), iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(dados), d.final()]).toString("utf8");
  } catch { return null; }
}
