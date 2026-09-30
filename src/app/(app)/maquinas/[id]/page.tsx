import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { listarFaturas, todasMaquinas } from "@/lib/queries";
import { dataPt, money } from "@/lib/format";
import { PageHeader, Stat, Vazio } from "@/components/Ui";

type Item = { descricao: string; quantidade: number | null; total: number | null };

export default async function MaquinaPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const m = (await todasMaquinas()).find((x) => x.id === Number(id));
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
      <div className="mb-6 grid grid-cols-2 gap-3 md:max-w-md">
        <Stat rotulo="Custo total" valor={money(total)} />
        <Stat rotulo="Faturas" valor={String(faturas.length)} />
      </div>

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
