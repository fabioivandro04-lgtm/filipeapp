import Link from "next/link";
import type { Registo } from "@/lib/historico";
import type { Diferencas } from "@/lib/historico";
import { money } from "@/lib/format";
import type { Nomes } from "@/lib/queries";
import DiffLista from "./Diff";
import { restaurarFatura, reverterAlteracao } from "@/app/actions";

const ACAO: Record<string, string> = {
  criada: "criou a fatura", editada: "editou", apagada: "apagou a fatura", restaurada: "restaurou a fatura",
  revertida: "desfez uma alteração", proposta: "propôs uma alteração a", proposta_aceite: "aceitou uma proposta de alteração a", proposta_rejeitada: "rejeitou uma proposta de alteração a", enviada: "enviou à contabilidade", copia: "descarregou uma cópia de segurança",
};

export default function HistoricoLista({ registos, nomes, podeDesfazer, mostrarFatura }: { registos: Registo[]; nomes: Nomes; podeDesfazer: boolean; mostrarFatura: boolean }) {
  if (!registos.length) return <div className="card p-6 text-center text-sm text-slate-500">Ainda não há registos.</div>;
  const desfeitos = new Set(registos.filter((r) => r.acao === "revertida").map((r) => (JSON.parse(r.detalhe ?? "{}") as { desfeito?: number }).desfeito));
  return (
    <ul className="card divide-y divide-slate-100">
      {registos.map((r) => {
        const det = r.detalhe ? JSON.parse(r.detalhe) : null;
        return (
          <li key={r.id} className="p-4 text-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p>
                <span className="font-medium">{r.user_nome ?? "Sistema"}</span> {ACAO[r.acao] ?? r.acao}
                {mostrarFatura && r.fatura_id && (
                  <> — {r.fatura_apagada === null
                    ? <Link href={`/faturas/${r.fatura_id}`} className="text-brand-600 hover:underline">{r.fatura_fornecedor ?? `fatura #${r.fatura_id}`} {r.fatura_numero}</Link>
                    : <span className="text-slate-500">{r.fatura_fornecedor ?? `fatura #${r.fatura_id}`} (apagada)</span>}</>
                )}
              </p>
              <time className="text-xs text-slate-400">{r.quando.replace("T", " ").slice(0, 16)}</time>
            </div>
            {(r.acao === "editada" || r.acao === "proposta") && det && <div className="mt-2"><DiffLista diff={det as Diferencas} nomes={nomes} /></div>}
            {(r.acao === "proposta_aceite" || r.acao === "proposta_rejeitada") && det && (
              <p className="mt-1 text-slate-500">Proposta de {det.autor}{det.motivo ? ` — motivo: ${det.motivo}` : ""}</p>
            )}
            {r.acao === "criada" && det && <p className="mt-1 text-slate-500">{det.fornecedor ?? "sem nome"} · {money(det.total)}{det.qr ? " · QR fiscal lido" : ""}</p>}
            {podeDesfazer && r.acao === "editada" && !desfeitos.has(r.id) && r.fatura_apagada === null && (
              <form action={reverterAlteracao.bind(null, r.id)} className="mt-2"><button className="btn-ghost px-3 py-1 text-xs">Desfazer esta alteração</button></form>
            )}
            {podeDesfazer && r.acao === "apagada" && r.fatura_apagada !== null && r.fatura_id && (
              <form action={restaurarFatura.bind(null, r.fatura_id)} className="mt-2"><button className="btn-ghost px-3 py-1 text-xs">Restaurar fatura</button></form>
            )}
          </li>
        );
      })}
    </ul>
  );
}
