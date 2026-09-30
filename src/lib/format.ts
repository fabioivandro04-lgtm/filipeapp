const eur = new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" });
export const money = (v: number | null | undefined) => (v == null ? "—" : eur.format(v));
export const dataPt = (d: string | null | undefined) => (d ? d.split("-").reverse().join("/") : "—");

export const CATEGORIA_INFO: Record<string, { nome: string; cor: string }> = {
  energia: { nome: "Energia", cor: "bg-amber-100 text-amber-800" },
  agua: { nome: "Água", cor: "bg-sky-100 text-sky-800" },
  contabilidade: { nome: "Contabilidade", cor: "bg-violet-100 text-violet-800" },
  predio: { nome: "Prédio", cor: "bg-emerald-100 text-emerald-800" },
  maquinas: { nome: "Máquinas", cor: "bg-orange-100 text-orange-800" },
  outros: { nome: "Outros", cor: "bg-slate-100 text-slate-700" },
};

const MESES_EXTENSO = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
/** "2026-06" → "junho de 2026" */
export const mesExtenso = (m: string) => `${MESES_EXTENSO[Number(m.slice(5, 7)) - 1]} de ${m.slice(0, 4)}`;

/** Cores das etiquetas do estado de uma máquina. */
export const COR_ESTADO: Record<string, string> = {
  stock: "bg-emerald-100 text-emerald-800", vendido: "bg-slate-200 text-slate-700", abatido: "bg-red-100 text-red-800", outro: "bg-amber-100 text-amber-800",
};
