export type QrFatura = {
  nifEmitente: string;
  nifAdquirente: string | null;
  tipo: string | null;
  data: string | null;
  numero: string | null;
  atcud: string | null;
  totalIva: number | null;
  total: number | null;
};

/** O QR só interessa se for o da AT: campos «A:NIF*B:NIF*…». */
export const pareceQrFiscal = (t: string) => /(^|\*)A:\d{9}\*/.test(t);

/**
 * Lê o QR code fiscal das faturas portuguesas (Portaria 195/2020):
 * A=NIF emitente, B=NIF adquirente, D=tipo, F=data (AAAAMMDD), G=nº, H=ATCUD, N=total IVA, O=total.
 */
export function lerQrFiscal(texto: string | null | undefined): QrFatura | null {
  if (!texto || !pareceQrFiscal(texto)) return null;
  const c: Record<string, string> = {};
  for (const parte of texto.trim().split("*")) {
    const i = parte.indexOf(":");
    if (i > 0) c[parte.slice(0, i)] = parte.slice(i + 1);
  }
  const num = (v?: string) => (v !== undefined && v !== "" && Number.isFinite(Number(v)) ? Number(v) : null);
  let data: string | null = null;
  if (c.F && /^\d{8}$/.test(c.F)) {
    const iso = `${c.F.slice(0, 4)}-${c.F.slice(4, 6)}-${c.F.slice(6, 8)}`;
    if (!Number.isNaN(Date.parse(iso))) data = iso;
  }
  const consumidorFinal = "999999990";
  return {
    nifEmitente: c.A,
    nifAdquirente: c.B && /^\d{9}$/.test(c.B) && c.B !== consumidorFinal ? c.B : null,
    tipo: c.D || null,
    data,
    numero: c.G || null,
    atcud: c.H && c.H !== "0" ? c.H : null,
    totalIva: num(c.N),
    total: num(c.O),
  };
}
