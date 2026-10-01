// Documentos com prazo (seguro, inspeção, IUC…). Sem dependências de servidor: usado também no browser.

export const TIPOS_DOCUMENTO = ["seguro", "inspecao", "iuc", "certificado", "revisao", "licenca", "outro"] as const;
export type TipoDocumento = (typeof TIPOS_DOCUMENTO)[number];

export const ROTULO_DOCUMENTO: Record<TipoDocumento, string> = {
  seguro: "Seguro", inspecao: "Inspeção", iuc: "IUC", certificado: "Certificado", revisao: "Revisão / manutenção", licenca: "Licença", outro: "Outro",
};

/** Dias de antecedência com que se avisa antes de caducar. */
export const DIAS_AVISO = 30;

export type EstadoPrazo = "caducado" | "urgente" | "ok";

/** Dias até à validade (negativo = já caducou). */
export function diasAte(validade: string, hoje = new Date()): number {
  const [a, m, d] = validade.slice(0, 10).split("-").map(Number);
  const alvo = Date.UTC(a, m - 1, d);
  const h = Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  return Math.round((alvo - h) / 86400000);
}

export function estadoPrazo(validade: string, hoje = new Date()): EstadoPrazo {
  const d = diasAte(validade, hoje);
  return d < 0 ? "caducado" : d <= DIAS_AVISO ? "urgente" : "ok";
}

export function textoPrazo(validade: string, hoje = new Date()): string {
  const d = diasAte(validade, hoje);
  if (d < 0) return d === -1 ? "caducou ontem" : `caducou há ${-d} dias`;
  if (d === 0) return "caduca hoje";
  if (d === 1) return "caduca amanhã";
  return `faltam ${d} dias`;
}

export const COR_PRAZO: Record<EstadoPrazo, string> = {
  caducado: "bg-red-100 text-red-800",
  urgente: "bg-amber-100 text-amber-800",
  ok: "bg-emerald-100 text-emerald-800",
};
