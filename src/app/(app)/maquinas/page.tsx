import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { listarMaquinas, resumoMaquinas, todasEmpresas, vendidasPorComprador } from "@/lib/queries";
import { empresaDoGrupo } from "@/lib/grupo";
import { ESTADOS, ROTULO_ESTADO } from "@/lib/estados";
import { COR_ESTADO, money } from "@/lib/format";
import { criarMaquina } from "@/app/actions";
import { PageHeader, Stat, Vazio } from "@/components/Ui";
import { LembrarLista } from "@/components/Voltar";
import { Suspense } from "react";

type SP = { ok?: string; erro?: string; empresa?: string; estado?: string; q?: string; p?: string };

export default async function Maquinas({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const empresaId = Number(sp.empresa) || undefined;
  const estado = (ESTADOS as string[]).includes(sp.estado ?? "") ? sp.estado : undefined;
  const pagina = Math.max(Number(sp.p) || 1, 1);

  const [{ linhas, total, porPagina }, empresas, resumo, vendidas] = await Promise.all([
    listarMaquinas(user, { empresa_id: empresaId, estado, q: sp.q, pagina }),
    todasEmpresas(), resumoMaquinas(empresaId), vendidasPorComprador(empresaId),
  ]);
  const admin = user.cargo === "admin";

  // Empresas diferentes com o mesmo dono: vender a outra empresa do grupo é uma transferência, não uma venda a terceiros
  const nomeDe = new Map(empresas.map((e) => [e.id, e.nome]));
  const porEmpresa = new Map<string, { stock: number; valor: number; vendidas: number; transferidas: number; abatidas: number; outras: number }>();
  const linhaEmpresa = (nome: string | null) => {
    const k = nome ?? "Sem empresa";
    if (!porEmpresa.has(k)) porEmpresa.set(k, { stock: 0, valor: 0, vendidas: 0, transferidas: 0, abatidas: 0, outras: 0 });
    return porEmpresa.get(k)!;
  };
  for (const r of resumo) {
    const l = linhaEmpresa(r.empresa);
    if (r.estado === "stock") { l.stock += r.n; l.valor += r.valor; } else if (r.estado === "abatido") l.abatidas += r.n; else if (r.estado === "outro") l.outras += r.n;
  }
  for (const v of vendidas) {
    const l = linhaEmpresa(v.empresa_id ? nomeDe.get(v.empresa_id) ?? null : null);
    if (empresaDoGrupo(v.comprador, empresas)) l.transferidas += v.n; else l.vendidas += v.n;
  }
  const soma = [...porEmpresa.values()].reduce((a, l) => ({ stock: a.stock + l.stock, valor: a.valor + l.valor, vendidas: a.vendidas + l.vendidas, transferidas: a.transferidas + l.transferidas, abatidas: a.abatidas + l.abatidas }), { stock: 0, valor: 0, vendidas: 0, transferidas: 0, abatidas: 0 });

  const paginas = Math.max(Math.ceil(total / porPagina), 1);
  const qs = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams(Object.entries({ empresa: sp.empresa, estado, q: sp.q, ...extra }).filter(([, v]) => v) as [string, string][]);
    return p.toString() ? `?${p}` : "";
  };

  return (
    <>
      <Suspense><LembrarLista /></Suspense>
      <PageHeader titulo="Máquinas" subtitulo="O inventário do grupo. Cada máquina pertence a uma empresa; vendas entre empresas do grupo contam como transferências.">
        <a href={`/api/maquinas/export${qs({})}`} className="btn-ghost">Exportar Excel</a>
        {admin && <Link href="/maquinas/importar" className="btn-primary">Importar stock</Link>}
        {admin && <Link href="/apagados" className="btn-ghost">Ver apagadas</Link>}
      </PageHeader>
      {sp.ok && <p className="mb-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{sp.ok}</p>}
      {sp.erro && <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{sp.erro}</p>}

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat rotulo="Em stock" valor={String(soma.stock)} />
        <Stat rotulo="Valor de compra em stock" valor={money(soma.valor)} />
        <Stat rotulo="Vendidas a terceiros" valor={String(soma.vendidas)} />
        <Stat rotulo="Transferidas no grupo" valor={String(soma.transferidas)} />
      </div>

      {porEmpresa.size > 1 && (
        <div className="card mb-6 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr><th className="px-4 py-3 text-left">Empresa</th><th className="px-4 py-3 text-right">Em stock</th><th className="px-4 py-3 text-right">Valor em stock</th><th className="px-4 py-3 text-right">Vendidas</th><th className="px-4 py-3 text-right">Transferidas</th><th className="px-4 py-3 text-right">Abatidas</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {[...porEmpresa].map(([nome, l]) => (
                <tr key={nome}><td className="px-4 py-2 font-medium">{nome}</td><td className="px-4 py-2 text-right">{l.stock}</td><td className="px-4 py-2 text-right">{money(l.valor)}</td><td className="px-4 py-2 text-right">{l.vendidas}</td><td className="px-4 py-2 text-right">{l.transferidas}</td><td className="px-4 py-2 text-right">{l.abatidas}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <form className="mb-4 flex flex-col gap-2 md:flex-row">
        <input name="q" defaultValue={sp.q ?? ""} placeholder="Procurar nº, equipamento, série, matrícula, comprador…" className="field md:max-w-sm" />
        <select name="empresa" defaultValue={sp.empresa ?? ""} className="field md:max-w-[14rem]">
          <option value="">Todas as empresas</option>
          {empresas.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
        </select>
        <select name="estado" defaultValue={estado ?? ""} className="field md:max-w-[11rem]">
          <option value="">Todos os estados</option>
          {ESTADOS.map((e) => <option key={e} value={e}>{ROTULO_ESTADO[e]}</option>)}
        </select>
        <button className="btn-ghost">Filtrar</button>
        {(sp.q || sp.empresa || estado) && <Link href="/maquinas" className="btn-ghost">Limpar</Link>}
      </form>

      {admin && (
        <details className="card mb-6 p-4">
          <summary className="cursor-pointer text-sm font-medium">+ Adicionar uma máquina</summary>
          <form action={criarMaquina} className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <input name="numero" placeholder="Nº interno (ex.: SL 005)" required className="field" />
            <input name="designacao" placeholder="Designação (ex.: Mini-giratória)" className="field" />
            <input name="marca" placeholder="Marca" className="field" />
            <input name="modelo" placeholder="Modelo" className="field" />
            <select name="empresa" defaultValue={sp.empresa ?? ""} className="field"><option value="">Sem empresa</option>{empresas.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}</select>
            <button className="btn-primary sm:col-span-2 lg:col-span-5">Adicionar</button>
          </form>
        </details>
      )}

      {!linhas.length ? <Vazio texto={total === 0 && !sp.q && !sp.empresa && !estado ? "Ainda não há máquinas. Importe os ficheiros de stock ou adicione uma." : "Nenhuma máquina com estes filtros."} /> : (
        <div className="card overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>{["Nº", "Equipamento", "Ano", "Estado", "Empresa", "Valor compra", "Faturas"].map((h, i) => <th key={h} className={`px-4 py-3 font-medium ${i >= 5 ? "text-right" : ""}`}>{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {linhas.map((m) => {
                const destino = m.estado === "vendido" ? empresaDoGrupo(m.comprador, empresas) : null;
                return (
                  <tr key={m.id} className="hover:bg-slate-50">
                    <td className="whitespace-nowrap px-4 py-2 font-medium"><Link href={`/maquinas/${m.id}`} className="hover:text-brand-600">{m.numero_interno}{m.assinalada ? "*" : ""}</Link></td>
                    <td className="px-4 py-2">{m.descricao ?? <span className="text-slate-400">—</span>}{m.numero_serie && <span className="ml-2 text-xs text-slate-400">{m.numero_serie}</span>}</td>
                    <td className="px-4 py-2 text-slate-600">{m.ano ?? ""}</td>
                    <td className="whitespace-nowrap px-4 py-2">
                      <span className={`badge ${COR_ESTADO[m.estado] ?? COR_ESTADO.outro}`}>{ROTULO_ESTADO[m.estado as keyof typeof ROTULO_ESTADO] ?? m.estado}</span>
                      {destino && <span className="badge ml-1 bg-indigo-100 text-indigo-800" title="Vendida a outra empresa do grupo">→ {destino.nome}</span>}
                      {!destino && m.estado === "vendido" && m.comprador && <span className="ml-2 text-xs text-slate-500">{m.comprador}</span>}
                    </td>
                    <td className="px-4 py-2 text-slate-600">{m.empresa_nome ?? "—"}</td>
                    <td className="px-4 py-2 text-right">{m.valor_compra != null ? money(m.valor_compra) : ""}</td>
                    <td className="px-4 py-2 text-right">{m.n ? <span title={`${m.n} fatura(s)`}>{money(m.custo)}</span> : ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {paginas > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          {pagina > 1 ? <Link href={`/maquinas${qs({ p: String(pagina - 1) })}`} className="btn-ghost">← Anterior</Link> : <span />}
          <span className="text-slate-500">Página {pagina} de {paginas} · {total} máquinas</span>
          {pagina < paginas ? <Link href={`/maquinas${qs({ p: String(pagina + 1) })}`} className="btn-ghost">Seguinte →</Link> : <span />}
        </div>
      )}
      {paginas <= 1 && total > 0 && <p className="mt-3 text-right text-sm text-slate-500">{total} máquinas</p>}
    </>
  );
}
