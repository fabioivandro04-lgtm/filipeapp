import Link from "next/link";
import type { Registo } from "@/lib/historico";
import { ROTULO_CAMPO, type Diferencas } from "@/lib/historico";
import { money } from "@/lib/format";
import { restaurarFatura, reverterAlteracao } from "@/app/actions";

export type Nomes = { empresas: Record<number, string>; predios: Record<number, string>; maquinas: Record<number, string> };

function valor(campo: string, v: unknown, n: Nomes): string {
  if (v == null || v === "") return "—";
  if (campo === "empresa_id") return n.empresas[Number(v)] ?? `#${v}`;
  if (campo === "predio_id") return n.predios[Number(v)] ?? `#${v}`;
  if (campo === "maquina_id") return n.maquinas[Number(v)] ?? `#${v}`;
  if (campo === "revisada") return Number(v) ? "Sim" : "Não";
  if (campo === "total" || campo === "iva") return money(Number(v));
  return String(v);
}

const ACAO: Record<string, string> = {
  criada: "criou a fatura", editada: "editou", apagada: "apagou a fatura", restaurada: "restaurou a fatura",
  revertida: "desfez uma alteração", enviada: "enviou à contabilidade", copia: "descarregou uma cópia de segurança",
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
            {r.acao === "editada" && det && (
              <ul className="mt-2 space-y-0.5 text-slate-600">
                {Object.entries(det as Diferencas).map(([campo, [a, d]]) => (
                  <li key={campo}><span className="text-slate-500">{ROTULO_CAMPO[campo] ?? campo}:</span> {valor(campo, a, nomes)} → <span className="font-medium">{valor(campo, d, nomes)}</span></li>
                ))}
              </ul>
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
