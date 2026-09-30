import { money } from "@/lib/format";

// Cada gráfico tem uma só série: uma só cor, sem legenda (o título diz o que é).
const COR = "#2a78d6";
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
export const nomeMes = (m: string) => `${MESES[Number(m.slice(5, 7)) - 1]} ${m.slice(2, 4)}`;

type Mes = { mes: string; total: number; n: number };

/** Colunas por mês. Passe o rato (ou toque) numa coluna para ver o valor. */
export function ColunasMensais({ dados, titulo }: { dados: Mes[]; titulo: string }) {
  const max = Math.max(...dados.map((d) => d.total), 1);
  return (
    <figure className="card p-4">
      <figcaption className="mb-4 text-sm font-medium">{titulo}</figcaption>
      <div className="flex h-44 items-end gap-1" role="img"
        aria-label={`${titulo}: ${dados.map((d) => `${nomeMes(d.mes)} ${money(d.total)}`).join(", ")}`}>
        {dados.map((d) => (
          <div key={d.mes} tabIndex={0} className="group relative flex h-full flex-1 flex-col justify-end outline-none">
            <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-lg bg-slate-900 px-2 py-1 text-xs text-white group-hover:block group-focus:block">
              {nomeMes(d.mes)}: {money(d.total)} · {d.n} fatura(s)
            </span>
            <div className="rounded-t-[4px] opacity-90 group-hover:opacity-100 group-focus:opacity-100"
              style={{ height: `${d.total > 0 ? Math.max((d.total / max) * 100, 2) : 0}%`, backgroundColor: COR }} />
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-1 text-[10px] text-slate-500">
        {dados.map((d) => <span key={d.mes} className="flex-1 truncate text-center">{MESES[Number(d.mes.slice(5, 7)) - 1]}</span>)}
      </div>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-slate-500">Ver como tabela</summary>
        <table className="mt-2 w-full">
          <tbody className="divide-y divide-slate-100">
            {dados.map((d) => <tr key={d.mes}><td className="py-1">{nomeMes(d.mes)}</td><td className="py-1 text-right text-slate-500">{d.n} fatura(s)</td><td className="py-1 text-right font-medium">{money(d.total)}</td></tr>)}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

type Linha = { rotulo: string; total: number; n: number };

/** Barras horizontais, da maior para a menor. Mostra as 7 maiores e junta o resto em «Outros». */
export function BarrasHorizontais({ dados, titulo, nomes }: { dados: Linha[]; titulo: string; nomes?: Record<string, string> }) {
  const topo = dados.slice(0, 7);
  const resto = dados.slice(7);
  const linhas = resto.length
    ? [...topo, { rotulo: "Outros", total: resto.reduce((s, r) => s + r.total, 0), n: resto.reduce((s, r) => s + r.n, 0) }]
    : topo;
  const max = Math.max(...linhas.map((l) => l.total), 1);
  return (
    <figure className="card p-4">
      <figcaption className="mb-4 text-sm font-medium">{titulo}</figcaption>
      {!linhas.length ? <p className="text-sm text-slate-500">Sem dados neste período.</p> : (
        <ul className="space-y-3">
          {linhas.map((l) => (
            <li key={l.rotulo} title={`${nomes?.[l.rotulo] ?? l.rotulo}: ${money(l.total)} · ${l.n} fatura(s)`}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="truncate text-slate-700">{nomes?.[l.rotulo] ?? l.rotulo}</span>
                <span className="shrink-0 font-medium">{money(l.total)}</span>
              </div>
              <div className="mt-1 h-2 rounded-full bg-slate-100">
                <div className="h-2 rounded-l-full rounded-r-[4px]" style={{ width: `${Math.max((l.total / max) * 100, l.total > 0 ? 1.5 : 0)}%`, backgroundColor: COR }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </figure>
  );
}
