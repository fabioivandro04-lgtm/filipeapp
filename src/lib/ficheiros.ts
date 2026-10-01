/**
 * Tipo REAL de um ficheiro, lido do conteúdo (os primeiros bytes), não do que o browser diz.
 * Quem carrega um ficheiro pode escrever «image/png» num ficheiro que é outra coisa; só aceitamos o que realmente é PDF ou imagem.
 */
export type TipoFicheiro = "application/pdf" | "image/jpeg" | "image/png" | "image/webp" | "image/gif";

export function tipoReal(b: Uint8Array): TipoFicheiro | null {
  const t = (inicio: number, s: string) => s.split("").every((c, i) => b[inicio + i] === c.charCodeAt(0));
  if (b.length < 12) return null;
  if (t(0, "%PDF-")) return "application/pdf";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x89 && t(1, "PNG\r\n") && b[6] === 0x1a && b[7] === 0x0a) return "image/png";
  if (t(0, "RIFF") && t(8, "WEBP")) return "image/webp";
  if (t(0, "GIF87a") || t(0, "GIF89a")) return "image/gif";
  return null;
}
