import { PDFDocument, PDFName, PDFRawStream } from "pdf-lib";

// A4 em pontos PDF; margem pequena para a fatura ocupar quase a página toda (o QR fica maior e mais legível)
const A4 = { w: 595.28, h: 841.89 };
const MARGEM = 18;

export type Imagem = { bytes: Uint8Array; mime: string };
export const imagemConvertivel = (mime: string) => mime === "image/jpeg" || mime === "image/png";

/**
 * Junta fotos (uma por página) num PDF A4. A foto é incorporada sem ser recomprimida,
 * por isso o QR code fiscal mantém a nitidez original e continua legível pelos programas de contabilidade.
 */
export async function fotosParaPdf(imagens: Imagem[], titulo = "Fatura"): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(titulo);
  pdf.setCreator("GESTAO APP");
  for (const img of imagens) {
    const emb = img.mime === "image/png" ? await pdf.embedPng(img.bytes) : await pdf.embedJpg(img.bytes);
    // Página ao alto ou ao baixo conforme a foto
    const deitada = emb.width > emb.height;
    const pw = deitada ? A4.h : A4.w, ph = deitada ? A4.w : A4.h;
    const esc = Math.min((pw - 2 * MARGEM) / emb.width, (ph - 2 * MARGEM) / emb.height);
    const w = emb.width * esc, h = emb.height * esc;
    pdf.addPage([pw, ph]).drawImage(emb, { x: (pw - w) / 2, y: (ph - h) / 2, width: w, height: h });
  }
  return pdf.save();
}

/** Fotos JPEG incorporadas num PDF nosso (uma por página), para voltar a ler uma fatura fotografada com IA. */
export async function jpegsDoPdf(bytes: Uint8Array, max = 3): Promise<Uint8Array[]> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const fotos: Uint8Array[] = [];
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    if (fotos.length >= max) break;
    if (obj instanceof PDFRawStream && obj.dict.get(PDFName.of("Subtype")) === PDFName.of("Image") && obj.dict.get(PDFName.of("Filter")) === PDFName.of("DCTDecode"))
      fotos.push(obj.contents);
  }
  return fotos;
}
