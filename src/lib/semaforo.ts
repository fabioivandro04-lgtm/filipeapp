export type CorSemaforo = "verde" | "amarelo" | "vermelho" | "cinza";

type F = { leitura: string; alerta: string | null; revisada: number; total: number | null; data: string | null; nif_fornecedor: string | null };

/** Estado de confiança de uma fatura: verde = pode seguir; amarelo = confirmar; vermelho = falhou uma validação; cinza = ainda a ler. */
export function semaforo(f: F): { cor: CorSemaforo; texto: string } {
  if (f.leitura === "pendente") return { cor: "cinza", texto: "A ler…" };
  if (f.revisada) return { cor: "verde", texto: "Revista" };
  if (f.alerta) return { cor: "vermelho", texto: "Rever" };
  if (f.leitura === "ia") return { cor: "amarelo", texto: "Lida por IA: confirmar" };
  if (f.leitura === "falhou") return { cor: "amarelo", texto: "Sem leitura: preencher" };
  if (f.leitura === "manual" && (f.total == null || !f.data || !f.nif_fornecedor)) return { cor: "amarelo", texto: "Incompleta" };
  return { cor: "verde", texto: f.leitura === "qr" ? "QR fiscal" : "Completa" };
}

export const CLASSE_SEMAFORO: Record<CorSemaforo, string> = {
  verde: "bg-emerald-100 text-emerald-800",
  amarelo: "bg-amber-100 text-amber-800",
  vermelho: "bg-red-100 text-red-800",
  cinza: "bg-slate-100 text-slate-600",
};
