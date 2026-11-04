import { pareceQrFiscal } from "./qr";
import { lerJsQr, lerNativo, qrConhecido } from "./leitor-qr";

/** Devolve o texto do QR fiscal se aparecer na imagem, senão null (o jsQR corre fora do ecrã). */
async function procurar(img: ImageData): Promise<string | null> {
  const t = await lerJsQr(img, true);
  return t && pareceQrFiscal(t) ? t : null;
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
  // Primeiro o leitor nativo do telemóvel, quando existe: é muito mais rápido do que o jsQR
  const nativo = (await lerNativo(bmp)).find(pareceQrFiscal);
  if (nativo) return nativo;
  // Do menor para o maior e pára no primeiro que resulta: reduzir a foto elimina o ruído (e é mais rápido),
  // mas um QR pequeno numa foto grande precisa de mais resolução. Nunca usa o tamanho total (lento e pior).
  for (const max of [800, 1400, 2200]) {
    const esc = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * esc), h = Math.round(bmp.height * esc);
    const { ctx } = desenhar(bmp, w, h);
    const t = await procurar(ctx.getImageData(0, 0, w, h));
    if (t) return t;
    if (esc === 1) break; // a imagem já é mais pequena do que este tamanho
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
      const t = (await lerNativo(canvas)).find(pareceQrFiscal) ?? await procurar(ctx.getImageData(0, 0, canvas.width, canvas.height));
      if (t) return t;
    }
  } finally {
    await tarefa.destroy();
  }
  return null;
}

/** Lê o QR fiscal de uma foto ou PDF, no browser. Falhas nunca impedem o carregamento. */
export async function lerQrDoFicheiro(file: File): Promise<string | null> {
  const ja = qrConhecido(file); // lido em direto na câmara: não é preciso ler outra vez
  if (ja) return ja;
  try {
    return file.type === "application/pdf" ? await dePdf(file) : await deImagem(file);
  } catch (e) {
    console.warn("Não foi possível ler o QR do ficheiro:", e); // o carregamento continua sem QR
    return null;
  }
}
