import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { listarFaturas, todasMaquinas } from "@/lib/queries";
import { dataPt, money } from "@/lib/format";
import { PageHeader, Stat, Vazio } from "@/components/Ui";
import { apagarEntidade, atualizarMaquina, restaurarEntidade } from "@/app/actions";
import ConfirmarBotao from "@/components/ConfirmarBotao";

type Item = { descricao: string; quantidade: number | null; total: number | null };

export default async function MaquinaPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; erro?: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const sp = await searchParams;
  const m = (await todasMaquinas(true)).find((x) => x.id === Number(id)); // inclui apagadas, para os links antigos continuarem a abrir
  if (!m) notFound();
  const faturas = await listarFaturas(user, { maquina_id: m.id });
  const total = faturas.reduce((s, f) => s + (f.total ?? 0), 0);
  // Histórico do que a máquina consumiu: uma linha por artigo comprado
  const consumos = faturas.flatMap((f) =>
    ((f.itens ? JSON.parse(f.itens) : []) as Item[]).map((i) => ({ ...i, data: f.data, fornecedor: f.fornecedor, fatura: f.id })));

  return (
    <>
      <Link href="/maquinas" className="text-sm text-slate-500 hover:text-slate-900">← Máquinas</Link>
      <div className="mt-2"><PageHeader titulo={`Máquina ${m.numero_interno}`} subtitulo={m.descricao ?? undefined} /></div>
      {sp.ok && <p className="mb-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{sp.ok}</p>}
      {sp.erro && <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{sp.erro}</p>}
      {m.apagada_em && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-100 p-3 text-sm text-slate-700">
          <span>Esta máquina está apagada. As faturas ligadas mantêm-se.</span>
          {user.cargo === "admin" && <form action={restaurarEntidade.bind(null, "maquinas", m.id)}><button className="btn-primary px-3 py-1.5">Restaurar</button></form>}
        </div>
      )}
      <div className="mb-6 grid grid-cols-2 gap-3 md:max-w-md">
        <Stat rotulo="Custo total" valor={money(total)} />
        <Stat rotulo="Faturas" valor={String(faturas.length)} />
      </div>

      {user.cargo === "admin" && !m.apagada_em && (
        <details className="card mb-8 p-4">
          <summary className="cursor-pointer text-sm font-medium">Editar ou apagar esta máquina</summary>
          <form action={atualizarMaquina.bind(null, m.id)} className="mt-3 grid gap-3 sm:grid-cols-[10rem_1fr]">
            <input name="numero" defaultValue={m.numero_interno} required placeholder="Nº interno" className="field" />
            <input name="descricao" defaultValue={m.descricao ?? ""} placeholder="Descrição" className="field" />
            <button className="btn-primary sm:col-span-2">Guardar alterações</button>
          </form>
          <form action={apagarEntidade.bind(null, "maquinas", m.id)} className="mt-3">
            <ConfirmarBotao className="btn-danger" mensagem={`Apagar a máquina ${m.numero_interno}? As ${faturas.length} faturas ligadas mantêm-se. Pode restaurá-la em Apagados.`}>Apagar máquina</ConfirmarBotao>
          </form>
        </details>
      )}

      <h2 className="mb-3 text-lg font-semibold">O que já consumiu</h2>
      {!consumos.length ? <Vazio texto="Sem artigos registados. Associe faturas a esta máquina para ver o histórico." /> : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr><th className="px-4 py-3 text-left">Data</th><th className="px-4 py-3 text-left">Artigo</th><th className="px-4 py-3 text-left">Fornecedor</th><th className="px-4 py-3 text-right">Qtd</th><th className="px-4 py-3 text-right">Valor</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {consumos.map((c, k) => (
                <tr key={k}>
                  <td className="whitespace-nowrap px-4 py-2">{dataPt(c.data)}</td>
                  <td className="px-4 py-2"><Link href={`/faturas/${c.fatura}`} className="hover:text-brand-600">{c.descricao}</Link></td>
                  <td className="px-4 py-2 text-slate-600">{c.fornecedor ?? "—"}</td>
                  <td className="px-4 py-2 text-right">{c.quantidade ?? "—"}</td>
                  <td className="px-4 py-2 text-right font-medium">{money(c.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
