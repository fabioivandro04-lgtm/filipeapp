import Link from "next/link";
import type { FaturaRow } from "@/lib/queries";
import { dataPt, money } from "@/lib/format";
import { CategoriaBadge, Vazio } from "./Ui";

export default function FaturasLista({ faturas }: { faturas: FaturaRow[] }) {
  if (!faturas.length) return <Vazio texto="Ainda não há faturas aqui." />;
  return (
    <>
      {/* Telemóvel: cartões */}
      <ul className="space-y-3 md:hidden">
        {faturas.map((f) => (
          <li key={f.id}>
            <Link href={`/faturas/${f.id}`} className="card block p-4 active:bg-slate-50">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{f.fornecedor ?? "Fatura sem nome"}</p>
                  <p className="text-xs text-slate-500">{dataPt(f.data)} · {f.numero ?? "sem nº"}</p>
                </div>
                <p className="shrink-0 font-semibold">{money(f.total)}</p>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <CategoriaBadge categoria={f.categoria} />
                {(f.predio_nome || f.maquina_numero) && <span className="text-xs text-slate-500">{f.predio_nome ?? `Máquina ${f.maquina_numero}`}</span>}
                {f.empresa_nome && <span className="text-xs text-slate-400">· {f.empresa_nome}</span>}
                {f.alerta && !f.revisada && <span className="badge bg-amber-100 text-amber-800">⚠ Rever</span>}
              </div>
            </Link>
          </li>
        ))}
      </ul>

      {/* Computador: tabela */}
      <div className="card hidden overflow-hidden md:block">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>{["Data", "Fornecedor", "Categoria", "Empresa", "Prédio / Máquina", "Total"].map((h, i) => (
              <th key={h} className={`px-4 py-3 font-medium ${i === 5 ? "text-right" : ""}`}>{h}</th>))}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {faturas.map((f) => (
              <tr key={f.id} className="hover:bg-slate-50">
                <td className="whitespace-nowrap px-4 py-3">{dataPt(f.data)}</td>
                <td className="px-4 py-3">
                  <Link href={`/faturas/${f.id}`} className="font-medium hover:text-brand-600">{f.fornecedor ?? "Fatura sem nome"}</Link>
                  <span className="ml-2 text-xs text-slate-400">{f.numero}</span>
                  {f.alerta && !f.revisada && <p className="mt-0.5 text-xs text-amber-700">⚠ {f.alerta}</p>}
                </td>
                <td className="px-4 py-3"><CategoriaBadge categoria={f.categoria} /></td>
                <td className="px-4 py-3 text-slate-600">{f.empresa_nome ?? "—"}</td>
                <td className="px-4 py-3 text-slate-600">{f.predio_nome ?? (f.maquina_numero ? `Máquina ${f.maquina_numero}` : "—")}</td>
                <td className="px-4 py-3 text-right font-medium">{money(f.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
