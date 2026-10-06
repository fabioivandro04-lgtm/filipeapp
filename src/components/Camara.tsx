"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import jsQR from "jsqr";
import { pareceQrFiscal } from "@/lib/qr";

type ImageCaptureLike = { takePhoto: (o?: { imageWidth?: number }) => Promise<Blob>; getPhotoCapabilities?: () => Promise<{ imageWidth?: { max?: number } }> };
type Caps = MediaTrackCapabilities & { torch?: boolean; focusMode?: string[]; zoom?: { min: number; max: number; step: number } };
type Aviso = "luz" | "foco" | "qr" | null;

const LADO_MAX = 4096; // lado maior da foto final
const LIMIAR_LUZ = 70; // luminosidade média (0-255) abaixo da qual a foto sai escura

/** Luminosidade média e nitidez (variância do Laplaciano) da zona central de uma imagem. */
function medir(img: ImageData) {
  const { data, width: w, height: h } = img;
  const g = new Float32Array(w * h);
  let soma = 0;
  for (let i = 0, p = 0; i < g.length; i++, p += 4) { g[i] = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2]; soma += g[i]; }
  const x0 = Math.floor(w * 0.2), x1 = Math.floor(w * 0.8), y0 = Math.floor(h * 0.2), y1 = Math.floor(h * 0.8);
  let n = 0, s = 0, s2 = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const i = y * w + x;
    const l = 4 * g[i] - g[i - 1] - g[i + 1] - g[i - w] - g[i + w];
    s += l; s2 += l * l; n++;
  }
  const media = s / n;
  return { luz: soma / g.length, nitidez: s2 / n - media * media };
}

/**
 * Câmara própria para fotografar faturas: resolução máxima, focagem contínua, lanterna, guia de enquadramento,
 * deteção do QR fiscal em direto e disparo automático quando está nítido. `modo="varias"` fica aberta para fotografar várias faturas seguidas.
 */
export default function Camara({ aberta, modo, onFoto, onFechar, onSemCamara }: {
  aberta: boolean; modo: "varias" | "uma"; onFoto: (f: File) => void; onFechar: () => void; onSemCamara: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const track = useRef<MediaStreamTrack | null>(null);
  const ocupado = useRef(false);
  const ultimoQr = useRef<string | null>(null);
  const seguidas = useRef(0);
  const semQr = useRef(0);
  const visto = useRef<{ texto: string; em: number } | null>(null);
  const semCamara = useRef(onSemCamara);
  useEffect(() => { semCamara.current = onSemCamara; });
  const melhorNitidez = useRef(0);
  const [caps, setCaps] = useState<Caps>({});
  const [lanterna, setLanterna] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [auto, setAuto] = useState(true);
  const [aviso, setAviso] = useState<Aviso>(null);
  const [qr, setQr] = useState(false);
  const [fotos, setFotos] = useState(0);
  const [flash, setFlash] = useState(false);
  const [miniatura, setMiniatura] = useState<string | null>(null);

  const parar = useCallback(() => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null; track.current = null;
  }, []);

  // Abrir e fechar a câmara
  useEffect(() => {
    if (!aberta) return;
    let cancelado = false;
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) { semCamara.current(); return; }
      let s: MediaStream | null = null;
      // Do melhor para o mais simples: 4K, depois Full HD, depois o que o aparelho der
      for (const v of [
        { facingMode: { ideal: "environment" }, width: { ideal: 3840 }, height: { ideal: 2160 } },
        { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        { facingMode: "environment" },
      ] as MediaTrackConstraints[]) {
        try { s = await navigator.mediaDevices.getUserMedia({ video: v, audio: false }); break; } catch { /* tenta a seguinte */ }
      }
      if (!s) { semCamara.current(); return; }
      if (cancelado) { s.getTracks().forEach((t) => t.stop()); return; }
      stream.current = s;
      const t = s.getVideoTracks()[0];
      track.current = t;
      const c = (t.getCapabilities?.() ?? {}) as Caps;
      setCaps(c);
      // Focagem contínua (o que evita as fotos «embaciadas» de perto)
      if (c.focusMode?.includes("continuous")) t.applyConstraints({ advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet] }).catch(() => {});
      if (video.current) { video.current.srcObject = s; video.current.play().catch(() => {}); }
    })();
    return () => { cancelado = true; parar(); };
  }, [aberta, parar]);

  const tirar = useCallback(async (): Promise<void> => {
    const v = video.current;
    if (ocupado.current || !v || !v.videoWidth) return;
    ocupado.current = true;
    try {
      let fonte: Blob | null = null;
      // Foto de resolução total do sensor (Chrome/Android); senão, um fotograma do vídeo
      const IC = (window as unknown as { ImageCapture?: new (t: MediaStreamTrack) => ImageCaptureLike }).ImageCapture;
      if (IC && track.current) {
        try {
          const ic = new IC(track.current);
          const max = (await ic.getPhotoCapabilities?.())?.imageWidth?.max;
          fonte = await ic.takePhoto(max ? { imageWidth: Math.min(max, LADO_MAX) } : undefined);
        } catch { fonte = null; }
      }
      const bmp = fonte ? await createImageBitmap(fonte) : await createImageBitmap(v);
      // Reescreve a imagem já na orientação certa, sem EXIF e com o lado maior limitado
      const esc = Math.min(1, LADO_MAX / Math.max(bmp.width, bmp.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bmp.width * esc); canvas.height = Math.round(bmp.height * esc);
      canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.92));
      if (!blob) return;
      const f = new File([blob], `fatura-${Date.now()}.jpg`, { type: "image/jpeg" });
      setFlash(true); setTimeout(() => setFlash(false), 140);
      setFotos((n) => n + 1);
      setMiniatura((antes) => { if (antes) URL.revokeObjectURL(antes); return URL.createObjectURL(blob); });
      if (navigator.vibrate) navigator.vibrate(30);
      onFoto(f);
      if (modo === "uma") onFechar();
    } finally {
      ocupado.current = false;
    }
  }, [modo, onFoto, onFechar]);

  // Análise em direto: luz, nitidez e QR fiscal
  useEffect(() => {
    if (!aberta) return;
    const cv = document.createElement("canvas"); // para medir luz e nitidez (sempre ao mesmo tamanho)
    const cq = document.createElement("canvas"); // para procurar o QR (tamanho a rodar: um QR pequeno precisa de mais resolução)
    let volta = 0;
    const t = setInterval(() => {
      const v = video.current;
      if (!v || !v.videoWidth || ocupado.current) return;
      const ctx = cv.getContext("2d", { willReadFrequently: true })!;
      const w = 640, h = Math.round((640 * v.videoHeight) / v.videoWidth);
      cv.width = w; cv.height = h;
      ctx.drawImage(v, 0, 0, w, h);
      const { luz, nitidez } = medir(ctx.getImageData(0, 0, w, h));
      melhorNitidez.current = Math.max(nitidez, melhorNitidez.current * 0.97);
      const lado = [1280, 800, 1920][volta++ % 3];
      const esc = Math.min(1, lado / Math.max(v.videoWidth, v.videoHeight));
      const qw = Math.round(v.videoWidth * esc), qh = Math.round(v.videoHeight * esc);
      cq.width = qw; cq.height = qh;
      const cqx = cq.getContext("2d", { willReadFrequently: true })!;
      cqx.drawImage(v, 0, 0, qw, qh);
      const r = jsQR(cqx.getImageData(0, 0, qw, qh).data, qw, qh, { inversionAttempts: "dontInvert" });
      // Cada tamanho vê coisas diferentes: o QR conta como visível durante 1,6 s depois de lido (evita piscar)
      if (r && pareceQrFiscal(r.data)) visto.current = { texto: r.data, em: Date.now() };
      const texto = visto.current && Date.now() - visto.current.em < 1600 ? visto.current.texto : null;
      const nitida = nitidez >= 0.55 * melhorNitidez.current;
      setQr(!!texto);
      setAviso(luz < LIMIAR_LUZ ? "luz" : !nitida ? "foco" : !texto ? "qr" : null);
      // Disparo automático: QR lido e imagem estável durante ~1 s, e ainda não fotografado
      if (auto && texto && nitida && luz >= LIMIAR_LUZ && texto !== ultimoQr.current) {
        if (++seguidas.current >= 2) { seguidas.current = 0; ultimoQr.current = texto; void tirar(); }
      } else seguidas.current = 0;
      // O QR saiu do enquadramento durante ~1,5 s: a próxima fatura pode ser fotografada
      if (texto) semQr.current = 0; else if (++semQr.current >= 3) ultimoQr.current = null;
    }, 500);
    return () => clearInterval(t);
  }, [aberta, auto, tirar]);

  // Limpa o estado quando a câmara fecha
  useEffect(() => {
    if (aberta) return;
    ultimoQr.current = null; seguidas.current = 0; melhorNitidez.current = 0; visto.current = null;
    queueMicrotask(() => { setFotos(0); setAviso(null); setQr(false); setLanterna(false); setZoom(1); setMiniatura((m) => { if (m) URL.revokeObjectURL(m); return null; }); });
  }, [aberta]);

  if (!aberta) return null;

  const alternarLanterna = () => {
    const nova = !lanterna;
    track.current?.applyConstraints({ advanced: [{ torch: nova } as MediaTrackConstraintSet] }).then(() => setLanterna(nova)).catch(() => {});
  };
  const focarAqui = () => {
    const t = track.current;
    if (!t || !caps.focusMode?.includes("single-shot")) return;
    t.applyConstraints({ advanced: [{ focusMode: "single-shot" } as MediaTrackConstraintSet] })
      .then(() => setTimeout(() => t.applyConstraints({ advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet] }).catch(() => {}), 1500)).catch(() => {});
  };
  const mudarZoom = (z: number) => { setZoom(z); track.current?.applyConstraints({ advanced: [{ zoom: z } as MediaTrackConstraintSet] }).catch(() => {}); };

  const dica = aviso === "luz" ? "Pouca luz: procure mais luz ou ligue a lanterna"
    : aviso === "foco" ? "A focar… afaste um pouco e segure firme"
    : aviso === "qr" ? "Enquadre a fatura inteira, com o QR code visível"
    : "QR fiscal detetado";
  const cor = qr && !aviso ? "#34d399" : aviso === "luz" || aviso === "foco" ? "#fbbf24" : "#ffffff";

  // Num portal: a barra de baixo tem efeitos que impediriam o ecrã inteiro
  return createPortal(
    <div className="fixed inset-0 z-[70] flex flex-col bg-black text-white" role="dialog" aria-label="Câmara">
      <video ref={video} playsInline muted autoPlay onClick={focarAqui} className="absolute inset-0 h-full w-full object-cover" />

      {/* Guia de enquadramento: a fatura inteira dentro dos cantos */}
      <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
        <g fill="none" stroke={cor} strokeWidth="0.9" strokeLinecap="round" vectorEffect="non-scaling-stroke">
          {[[8, 14, 1, 1], [92, 14, -1, 1], [8, 80, 1, -1], [92, 80, -1, -1]].map(([x, y, dx, dy], i) => (
            <path key={i} d={`M${x + dx * 9} ${y} H${x} V${y + dy * 9}`} vectorEffect="non-scaling-stroke" strokeWidth="3" />
          ))}
        </g>
      </svg>

      <div className="relative z-10 flex items-center justify-between gap-2 px-4 pt-[max(env(safe-area-inset-top),0.75rem)]">
        <button type="button" onClick={onFechar} className="rounded-full bg-black/50 px-4 py-2 text-sm font-medium">{modo === "varias" && fotos ? "Concluir" : "Fechar"}</button>
        <span className="rounded-full bg-black/50 px-3 py-1.5 text-xs">{modo === "varias" ? `${fotos} fotografada${fotos === 1 ? "" : "s"}` : "Fatura"}</span>
        <div className="flex gap-2">
          {caps.torch && <button type="button" onClick={alternarLanterna} aria-pressed={lanterna} className={`rounded-full px-3 py-2 text-xs font-medium ${lanterna ? "bg-amber-400 text-black" : "bg-black/50"}`}>Lanterna</button>}
          <button type="button" onClick={() => setAuto((a) => !a)} aria-pressed={auto} className={`rounded-full px-3 py-2 text-xs font-medium ${auto ? "bg-emerald-500 text-black" : "bg-black/50"}`}>Auto</button>
        </div>
      </div>

      <p className="relative z-10 mx-auto mt-3 max-w-[90%] rounded-full bg-black/60 px-4 py-2 text-center text-sm" style={{ color: cor }}>{dica}</p>

      <div className="flex-1" />

      <div className="relative z-10 pb-[max(env(safe-area-inset-bottom),1rem)]">
        {caps.zoom && (
          <input type="range" min={caps.zoom.min} max={Math.min(caps.zoom.max, 5)} step={caps.zoom.step || 0.1} value={zoom} onChange={(e) => mudarZoom(Number(e.target.value))}
            aria-label="Zoom" className="mx-auto mb-3 block w-2/3" />
        )}
        <div className="flex items-center justify-center gap-10 px-6">
          <span className="grid h-14 w-14 place-items-center overflow-hidden rounded-xl border border-white/30 bg-white/10">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {miniatura && <img src={miniatura} alt="Última foto" className="h-full w-full object-cover" />}
          </span>
          <button type="button" onClick={() => void tirar()} aria-label="Tirar foto" className="grid h-20 w-20 place-items-center rounded-full border-4 border-white active:scale-95">
            <span className="h-14 w-14 rounded-full bg-white" />
          </button>
          <button type="button" onClick={() => semCamara.current()} className="h-14 w-14 text-[11px] leading-tight text-white/80 underline">Câmara do telemóvel</button>
        </div>
        <p className="mt-3 text-center text-xs text-white/70">Toque no ecrã para focar. {auto ? "A foto é tirada sozinha quando o QR estiver nítido." : "Modo manual."}</p>
      </div>

      {flash && <div className="pointer-events-none absolute inset-0 z-20 bg-white/70" />}
    </div>,
    document.body,
  );
}
