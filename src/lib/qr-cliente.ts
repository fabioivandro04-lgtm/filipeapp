import jsQR from "jsqr";
import { pareceQrFiscal } from "./qr";

/** Devolve o texto do QR fiscal se aparecer na imagem, senão null. */
function procurar(img: ImageData): string | null {
  const r = jsQR(img.data, img.width, img.height, { inversionAttempts: "attemptBoth" });
  return r && pareceQrFiscal(r.data) ? r.data : null;
}

function desenhar(fonte: CanvasImageSource, w: number, h: number) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(fonte, 0, 0, w, h);
  return { canvas, ctx };
}

async function deImagem(file: File): Promise<string | null> {
  const bmp = await createImageBitmap(file);
  // Tenta a dois tamanhos: um QR pequeno numa foto grande lê melhor sem reduzir demasiado
  for (const max of [1600, 2800]) {
    const esc = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * esc), h = Math.round(bmp.height * esc);
    const { ctx } = desenhar(bmp, w, h);
    const t = procurar(ctx.getImageData(0, 0, w, h));
    if (t) return t;
    if (esc === 1) break;
  }
  return null;
}

async function dePdf(file: File): Promise<string | null> {
  // Versão "legacy": funciona também em browsers mais antigos (a normal exige funções muito recentes)
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).toString();
  const tarefa = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const doc = await tarefa.promise;
  try {
    for (let i = 1; i <= Math.min(doc.numPages, 3); i++) {
      const page = await doc.getPage(i);
      const vp = page.getViewport({ scale: 2.2 });
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(vp.width);
      canvas.height = Math.round(vp.height);
      const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
      await page.render({ canvas, canvasContext: ctx, viewport: vp }).promise;
      const t = procurar(ctx.getImageData(0, 0, canvas.width, canvas.height));
      if (t) return t;
    }
  } finally {
    await tarefa.destroy();
  }
  return null;
}

/** Lê o QR fiscal de uma foto ou PDF, no browser. Falhas nunca impedem o carregamento. */
export async function lerQrDoFicheiro(file: File): Promise<string | null> {
  try {
    return file.type === "application/pdf" ? await dePdf(file) : await deImagem(file);
  } catch (e) {
    console.warn("Não foi possível ler o QR do ficheiro:", e); // o carregamento continua sem QR
    return null;
  }
}
