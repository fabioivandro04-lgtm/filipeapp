const eur = new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" });
export const money = (v: number | null | undefined) => (v == null ? "—" : eur.format(v));
/** Nota de crédito (devolução ou desconto): conta a menos nas somas. */
export const eNotaCredito = (f: { tipo_doc?: string | null }) => f.tipo_doc === "NC";
/** Total com sinal: negativo nas notas de crédito. */
export const valorComSinal = (f: { total: number | null; tipo_doc?: string | null }) =>
  f.total == null ? null : eNotaCredito(f) ? -Math.abs(f.total) : f.total;
/** Soma dos totais, com as notas de crédito a descontar. */
export const somaTotais = (fs: { total: number | null; tipo_doc?: string | null }[]) => fs.reduce((s, f) => s + (valorComSinal(f) ?? 0), 0);

// Datas do dia e do mês na hora de Lisboa (o servidor está em UTC: entre a meia-noite e a 1h, no verão, ainda seria «ontem»)
const diaLisboa = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Lisbon", year: "numeric", month: "2-digit", day: "2-digit" });
/** Hoje em Lisboa, «AAAA-MM-DD». */
export const hojeLisboa = (agora = new Date()) => diaLisboa.format(agora);
/** Mês em Lisboa, «AAAA-MM»; `desvio` = meses para trás (negativo) ou para a frente. */
export function mesLisboa(desvio = 0, agora = new Date()): string {
  const [a, m] = hojeLisboa(agora).split("-").map(Number);
  return new Date(Date.UTC(a, m - 1 + desvio, 1)).toISOString().slice(0, 7);
}

export const dataPt = (d: string | null | undefined) => (d ? d.split("-").reverse().join("/") : "—");

export const CATEGORIA_INFO: Record<string, { nome: string; cor: string }> = {
  energia: { nome: "Energia", cor: "bg-amber-100 text-amber-800" },
  agua: { nome: "Água", cor: "bg-sky-100 text-sky-800" },
  contabilidade: { nome: "Contabilidade", cor: "bg-violet-100 text-violet-800" },
  predio: { nome: "Prédio", cor: "bg-emerald-100 text-emerald-800" },
  maquinas: { nome: "Máquinas e peças", cor: "bg-orange-100 text-orange-800" },
  combustivel: { nome: "Combustível", cor: "bg-rose-100 text-rose-800" },
  rendas: { nome: "Rendas", cor: "bg-teal-100 text-teal-800" },
  seguros: { nome: "Seguros", cor: "bg-indigo-100 text-indigo-800" },
  transportes: { nome: "Transportes", cor: "bg-lime-100 text-lime-800" },
  comunicacoes: { nome: "Telefone e internet", cor: "bg-cyan-100 text-cyan-800" },
  outros: { nome: "Outros", cor: "bg-slate-100 text-slate-700" },
};

const MESES_EXTENSO = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
/** "2026-06" → "junho de 2026" */
export const mesExtenso = (m: string) => `${MESES_EXTENSO[Number(m.slice(5, 7)) - 1]} de ${m.slice(0, 4)}`;

/** Cores das etiquetas do estado de uma máquina. */
export const COR_ESTADO: Record<string, string> = {
  stock: "bg-emerald-100 text-emerald-800", vendido: "bg-slate-200 text-slate-700", abatido: "bg-red-100 text-red-800", outro: "bg-amber-100 text-amber-800",
};

// Datas/horas guardadas em UTC («AAAA-MM-DD HH:MM:SS»), mostradas na hora de Lisboa
const horaLisboa = new Intl.DateTimeFormat("pt-PT", { timeZone: "Europe/Lisbon", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const utc = (s: string) => new Date(s.replace(" ", "T").replace(/Z?$/, "Z"));
export const dataHoraPt = (s: string | null | undefined) => (s ? horaLisboa.format(utc(s)).replace(",", "") : "—");

/** Há quanto tempo: «agora mesmo», «há 5 min», «há 3 h», «ontem», ou a data. */
export function haQuanto(s: string | null | undefined, agora = Date.now()): string {
  if (!s) return "nunca";
  const min = Math.floor((agora - utc(s).getTime()) / 60000);
  if (min < 2) return "agora mesmo";
  if (min < 60) return `há ${min} min`;
  if (min < 24 * 60) return `há ${Math.floor(min / 60)} h`;
  if (min < 48 * 60) return "ontem";
  return dataHoraPt(s);
}

/** Hora atual em ms (fora dos componentes, para as regras do React). */
export const agoraMs = () => Date.now();

/** Online = usou a app nos últimos 5 minutos. */
export const estaOnline = (vistoEm: string | null | undefined, agora = Date.now()) => !!vistoEm && agora - utc(vistoEm).getTime() < 5 * 60000;
