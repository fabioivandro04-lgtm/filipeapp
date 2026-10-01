import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { rentabilidade, todasEmpresas, type LinhaRentabilidade } from "@/lib/queries";
import { ESTADOS, ROTULO_ESTADO } from "@/lib/estados";
import { money } from "@/lib/format";
import { PageHeader, Stat, Vazio } from "@/components/Ui";

type SP = { empresa?: string; estado?: string; ordem?: string; todas?: string };

type Sinal = { texto: string; cor: string; peso: number };
/** Leitura simples de cada máquina, com base nos últimos 12 meses (o acumulado desde a compra fica nas colunas). */
function sinal(l: LinhaRentabilidade): Sinal {
  if (!l.n_alugueres && !l.n_faturas) return { texto: "Sem dados", cor: "bg-slate-100 text-slate-600", peso: 3 };
  if (l.custos_12m > l.receitas_12m && l.custos_12m > 0) return { texto: "Custa mais do que rende", cor: "bg-red-100 text-red-800", peso: 0 };
  if (l.estado === "stock" && l.dias_alugada_12m < 90) return { texto: "Pouco alugada", cor: "bg-amber-100 text-amber-800", peso: 1 };
  return { texto: "Rentável", cor: "bg-emerald-100 text-emerald-800", peso: 2 };
}

const ORDENS: Record<string, { nome: string; fn: (a: LinhaRentabilidade, b: LinhaRentabilidade) => number }> = {
  atencao: { nome: "A precisar de atenção primeiro", fn: (a, b) => sinal(a).peso - sinal(b).peso || (a.receitas - a.custos) - (b.receitas - b.custos) },
  resultado: { nome: "Melhor resultado primeiro", fn: (a, b) => (b.receitas - b.custos) - (a.receitas - a.custos) },
  ocupacao: { nome: "Mais alugada primeiro", fn: (a, b) => b.dias_alugada_12m - a.dias_alugada_12m },
  custos: { nome: "Mais custos primeiro", fn: (a, b) => b.custos - a.custos },
};
const MAX_LINHAS = 300;

export default async function Rentabilidade({ searchParams }: { searchParams: Promise<SP> }) {
  await requireUser();
  const sp = await searchParams;
  const empresaId = Number(sp.empresa) || undefined;
  // Por defeito: máquinas em stock (as que ainda se podem manter ou vender)
  const estado = sp.estado === "todas" ? undefined : (ESTADOS as string[]).includes(sp.estado ?? "") ? sp.estado : "stock";
  const ordem = ORDENS[sp.ordem ?? ""] ? sp.ordem! : "atencao";
  const [linhas, empresas] = await Promise.all([rentabilidade({ empresaId, estado }), todasEmpresas()]);
  const comDados = sp.todas ? linhas : linhas.filter((l) => l.n_alugueres || l.n_faturas);
  const ordenadas = [...comDados].sort(ORDENS[ordem].fn);
  const t = linhas.reduce((a, l) => ({ r: a.r + l.receitas, c: a.c + l.custos, prejuizo: a.prejuizo + (sinal(l).peso === 0 ? 1 : 0) }), { r: 0, c: 0, prejuizo: 0 });
  const semDados = linhas.length - linhas.filter((l) => l.n_alugueres || l.n_faturas).length;
  const qsTodas = new URLSearchParams(Object.entries({ empresa: sp.empresa, estado: sp.estado, ordem: sp.ordem, todas: "1" }).filter(([, v]) => v) as [string, string][]).toString();

  return (
    <>
      <PageHeader titulo="Rentabilidade por máquina" subtitulo="O que cada máquina rendeu em alugueres contra o que custou em faturas (peças, reparações, transporte…)." />

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat rotulo="Receitas em alugueres" valor={money(t.r)} />
        <Stat rotulo="Custos em faturas" valor={money(t.c)} />
        <Stat rotulo="Resultado" valor={money(t.r - t.c)} destaque={t.r - t.c < 0} />
        <Stat rotulo="A custar mais do que rendem" valor={String(t.prejuizo)} destaque={t.prejuizo > 0} />
      </div>

      <form className="mb-4 flex flex-col gap-2 md:flex-row">
        <select name="estado" defaultValue={sp.estado ?? "stock"} className="field md:max-w-[12rem]">
          {ESTADOS.map((e) => <option key={e} value={e}>{ROTULO_ESTADO[e]}</option>)}<option value="todas">Todos os estados</option>
        </select>
        <select name="empresa" defaultValue={sp.empresa ?? ""} className="field md:max-w-[14rem]">
          <option value="">Todas as empresas</option>{empresas.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
        </select>
        <select name="ordem" defaultValue={ordem} className="field md:max-w-[16rem]">{Object.entries(ORDENS).map(([k, o]) => <option key={k} value={k}>{o.nome}</option>)}</select>
        <button className="btn-ghost">Filtrar</button>
      </form>

      {!ordenadas.length ? (
        <Vazio texto="Ainda não há alugueres nem faturas ligadas a estas máquinas. Registe os alugueres na ficha de cada máquina e ligue as faturas de peças/reparações à máquina." />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left">Máquina</th><th className="px-4 py-3 text-right">Valor compra</th><th className="px-4 py-3 text-right">Receitas</th>
                <th className="px-4 py-3 text-right">Custos</th><th className="px-4 py-3 text-right">Resultado</th><th className="px-4 py-3 text-right">Alugada (12 m)</th><th className="px-4 py-3 text-left">Leitura</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {ordenadas.slice(0, MAX_LINHAS).map((l) => {
                const s = sinal(l); const res = l.receitas - l.custos;
                return (
                  <tr key={l.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2">
                      <Link href={`/maquinas/${l.id}`} className="font-medium hover:text-brand-600">{l.numero_interno}</Link>
                      {l.alugada_agora && <span className="badge ml-2 bg-sky-100 text-sky-800">alugada agora</span>}
                      <span className="block text-xs text-slate-500">{l.descricao ?? ""}{l.empresa_nome ? ` · ${l.empresa_nome}` : ""}</span>
                    </td>
                    <td className="px-4 py-2 text-right text-slate-600">{l.valor_compra != null ? money(l.valor_compra) : ""}</td>
                    <td className="px-4 py-2 text-right">{money(l.receitas)}<span className="block text-xs text-slate-400">{l.n_alugueres} aluguer(es)</span></td>
                    <td className="px-4 py-2 text-right">{money(l.custos)}<span className="block text-xs text-slate-400">{l.n_faturas} fatura(s)</span></td>
                    <td className={`px-4 py-2 text-right font-medium ${res < 0 ? "text-red-700" : ""}`}>{money(res)}
                      {l.valor_compra ? <span className="block text-xs font-normal text-slate-400">{Math.round((res / l.valor_compra) * 100)}% da compra</span> : null}</td>
                    <td className="px-4 py-2 text-right">{l.dias_alugada_12m} dias<span className="block text-xs text-slate-400">{Math.round((l.dias_alugada_12m / 365) * 100)}% do ano</span></td>
                    <td className="px-4 py-2"><span className={`badge ${s.cor}`}>{s.texto}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-sm text-slate-500">
        {ordenadas.length > MAX_LINHAS && `A mostrar ${MAX_LINHAS} de ${ordenadas.length}. `}
        {!sp.todas && semDados > 0 && <>{semDados} máquina(s) sem alugueres nem faturas não aparecem. <Link href={`/rentabilidade?${qsTodas}`} className="text-brand-600 hover:underline">Mostrar todas</Link>. </>}
        As receitas contam os alugueres registados em cada máquina; os custos, as faturas ligadas à máquina. «Custa mais do que rende» e «Pouco alugada» (menos de 90 dias) olham só para os últimos 12 meses.
      </p>
    </>
  );
}
