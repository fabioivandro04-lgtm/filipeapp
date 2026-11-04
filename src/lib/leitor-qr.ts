// Leitura de QR codes no browser, do mais leve para o mais pesado:
// 1) BarcodeDetector nativo (Chrome/Android: rápido e fora do ecrã);
// 2) jsQR num Web Worker (não bloqueia a câmara nem os toques);
// 3) jsQR na thread principal, carregado só quando é preciso (último recurso).

type Detetor = { detect: (fonte: ImageBitmapSource) => Promise<{ rawValue: string }[]> };
type DetetorCtor = { new (o: { formats: string[] }): Detetor; getSupportedFormats?: () => Promise<string[]> };

/** Telemóvel modesto (pouca memória ou poucos núcleos): a câmara usa menos resolução e analisa menos vezes. */
export function aparelhoFraco(): boolean {
  if (typeof navigator === "undefined") return false;
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  return (mem !== undefined && mem <= 4) || (navigator.hardwareConcurrency || 8) <= 4;
}

let detetor: Promise<Detetor | null> | null = null;
/** Detetor nativo de QR, se o browser o tiver. */
export function detetorNativo(): Promise<Detetor | null> {
  detetor ??= (async () => {
    const BD = (globalThis as unknown as { BarcodeDetector?: DetetorCtor }).BarcodeDetector;
    if (!BD) return null;
    try {
      const formatos = (await BD.getSupportedFormats?.()) ?? ["qr_code"];
      return formatos.includes("qr_code") ? new BD({ formats: ["qr_code"] }) : null;
    } catch { return null; }
  })();
  return detetor;
}

/** Todos os QR que o detetor nativo encontra na imagem (vazio se não houver detetor ou falhar). */
export async function lerNativo(fonte: ImageBitmapSource): Promise<string[]> {
  const d = await detetorNativo();
  if (!d) return [];
  try { return (await d.detect(fonte)).map((r) => r.rawValue).filter(Boolean); } catch { return []; }
}

let worker: Worker | null | undefined;
let seq = 0;
const pendentes = new Map<number, (t: string | null) => void>();

function obterWorker(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    worker = new Worker(new URL("./qr.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e: MessageEvent<{ id: number; texto: string | null }>) => {
      pendentes.get(e.data.id)?.(e.data.texto);
      pendentes.delete(e.data.id);
    };
    worker.onerror = () => { // o worker não arrancou: passa a ler na thread principal
      worker?.terminate(); worker = null;
      pendentes.forEach((r) => r(null)); pendentes.clear();
    };
  } catch { worker = null; }
  return worker;
}

/** Lê um QR de uma imagem com o jsQR, de preferência fora do ecrã. `inverter` também tenta QR claro em fundo escuro (mais lento). */
export async function lerJsQr(img: ImageData, inverter = false): Promise<string | null> {
  const w = obterWorker();
  if (w) {
    const id = ++seq;
    return new Promise((resolve) => {
      pendentes.set(id, resolve);
      // O buffer é transferido (sem cópia); quem chama não volta a usar esta ImageData
      w.postMessage({ id, data: img.data, width: img.width, height: img.height, inverter }, [img.data.buffer]);
    });
  }
  const { default: jsQR } = await import("jsqr");
  return jsQR(img.data, img.width, img.height, { inversionAttempts: inverter ? "attemptBoth" : "dontInvert" })?.data ?? null;
}

// QR já lido na câmara: evita ler outra vez a mesma foto depois de a tirar
const conhecidos = new WeakMap<File, string>();
export const memorizarQr = (f: File, texto: string) => { conhecidos.set(f, texto); };
export const qrConhecido = (f: File) => conhecidos.get(f) ?? null;
