import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { listarFaturas, todosPredios, totaisPorMes } from "@/lib/queries";
import { money } from "@/lib/format";
import FaturasLista from "@/components/FaturasLista";
import { PageHeader, Stat } from "@/components/Ui";

export default async function PredioPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const p = todosPredios().find((x) => x.id === Number(id));
  if (!p) notFound();
  const faturas = listarFaturas(user, { predio_id: p.id });
  const meses = totaisPorMes(user, p.id);
  const total = faturas.reduce((s, f) => s + (f.total ?? 0), 0);
  const por = (cat: string) => faturas.filter((f) => f.categoria === cat).reduce((s, f) => s + (f.total ?? 0), 0);

  // agrupa por mês: { "2026-09": { agua: x, energia: y, outros: z } }
  const tabela = new Map<string, { agua: number; energia: number; outros: number }>();
  for (const m of meses) {
    const l = tabela.get(m.mes) ?? { agua: 0, energia: 0, outros: 0 };
    if (m.categoria === "agua") l.agua += m.total; else if (m.categoria === "energia") l.energia += m.total; else l.outros += m.total;
    tabela.set(m.mes, l);
  }

  return (
    <>
      <Link href="/predios" className="text-sm text-slate-500 hover:text-slate-900">← Prédios</Link>
      <div className="mt-2"><PageHeader titulo={p.nome} subtitulo={[p.morada, p.codigo_contador && `contador ${p.codigo_contador}`].filter(Boolean).join(" · ")} /></div>
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat rotulo="Total" valor={money(total)} />
        <Stat rotulo="Água" valor={money(por("agua"))} />
        <Stat rotulo="Energia" valor={money(por("energia"))} />
        <Stat rotulo="Faturas" valor={String(faturas.length)} />
      </div>

      {tabela.size > 0 && (
        <>
          <h2 className="mb-3 text-lg font-semibold">Por mês</h2>
          <div className="card mb-8 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr><th className="px-4 py-3 text-left">Mês</th><th className="px-4 py-3 text-right">Água</th><th className="px-4 py-3 text-right">Energia</th><th className="px-4 py-3 text-right">Outros</th><th className="px-4 py-3 text-right">Total</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {[...tabela].map(([mes, l]) => (
                  <tr key={mes}>
                    <td className="px-4 py-2 font-medium">{mes}</td>
                    <td className="px-4 py-2 text-right">{money(l.agua)}</td>
                    <td className="px-4 py-2 text-right">{money(l.energia)}</td>
                    <td className="px-4 py-2 text-right">{money(l.outros)}</td>
                    <td className="px-4 py-2 text-right font-semibold">{money(l.agua + l.energia + l.outros)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <h2 className="mb-3 text-lg font-semibold">Faturas</h2>
      <FaturasLista faturas={faturas} />
    </>
  );
}
