import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { listarFaturas, todosPredios, totaisPorMes } from "@/lib/queries";
import { money } from "@/lib/format";
import FaturasLista from "@/components/FaturasLista";
import { PageHeader, Stat } from "@/components/Ui";
import { apagarEntidade, atualizarPredio, restaurarEntidade } from "@/app/actions";
import ConfirmarBotao from "@/components/ConfirmarBotao";

export default async function PredioPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; erro?: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const sp = await searchParams;
  const p = (await todosPredios(true)).find((x) => x.id === Number(id)); // inclui apagados, para os links antigos continuarem a abrir
  if (!p) notFound();
  const [faturas, meses] = await Promise.all([listarFaturas(user, { predio_id: p.id }), totaisPorMes(user, p.id)]);
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
      {sp.ok && <p className="mb-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{sp.ok}</p>}
      {sp.erro && <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{sp.erro}</p>}
      {p.apagada_em && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-100 p-3 text-sm text-slate-700">
          <span>Este prédio está apagado. As faturas ligadas mantêm-se.</span>
          {user.cargo === "admin" && <form action={restaurarEntidade.bind(null, "predios", p.id)}><button className="btn-primary px-3 py-1.5">Restaurar</button></form>}
        </div>
      )}
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

      {user.cargo === "admin" && !p.apagada_em && (
        <details className="card mb-8 p-4">
          <summary className="cursor-pointer text-sm font-medium">Editar ou apagar este prédio</summary>
          <form action={atualizarPredio.bind(null, p.id)} className="mt-3 grid gap-3 sm:grid-cols-3">
            <input name="nome" defaultValue={p.nome} required placeholder="Nome" className="field" />
            <input name="morada" defaultValue={p.morada ?? ""} placeholder="Morada" className="field" />
            <input name="codigo" defaultValue={p.codigo_contador ?? ""} placeholder="Nº contador / cód. cliente" className="field" />
            <button className="btn-primary sm:col-span-3">Guardar alterações</button>
          </form>
          <form action={apagarEntidade.bind(null, "predios", p.id)} className="mt-3">
            <ConfirmarBotao className="btn-danger" mensagem={`Apagar o prédio «${p.nome}»? As ${faturas.length} faturas ligadas mantêm-se. Pode restaurá-lo em Apagados.`}>Apagar prédio</ConfirmarBotao>
          </form>
        </details>
      )}

      <h2 className="mb-3 text-lg font-semibold">Faturas</h2>
      <FaturasLista faturas={faturas} />
    </>
  );
}
