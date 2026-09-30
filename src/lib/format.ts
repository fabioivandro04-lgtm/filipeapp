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
