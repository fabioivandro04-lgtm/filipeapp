// Lê QR codes fora do ecrã: o jsQR é pesado e, na thread principal, faz a câmara «engasgar» em telemóveis fracos.
import jsQR from "jsqr";

type Pedido = { id: number; data: Uint8ClampedArray; width: number; height: number; inverter: boolean };

self.onmessage = (e: MessageEvent<Pedido>) => {
  const { id, data, width, height, inverter } = e.data;
  let texto: string | null = null;
  try {
    texto = jsQR(data, width, height, { inversionAttempts: inverter ? "attemptBoth" : "dontInvert" })?.data ?? null;
  } catch { texto = null; }
  (self as unknown as Worker).postMessage({ id, texto });
};
