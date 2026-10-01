import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { listarFaturas, resumo, todasEmpresas } from "@/lib/queries";
import { CATEGORIAS } from "@/lib/db";
import { editaDireto } from "@/lib/auth";
import { criarFaturaManual } from "@/app/actions";
import { CATEGORIA_INFO, money } from "@/lib/format";
import FaturasLista from "@/components/FaturasLista";
import { PageHeader, Stat } from "@/components/Ui";
import { LembrarLista } from "@/components/Voltar";
import { Suspense } from "react";

export default async function Home({ searchParams }: { searchParams: Promise<{ categoria?: string; q?: string; alerta?: string; empresa?: string; mes?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const empresaId = Number(sp.empresa) || undefined;
  const mes = sp.mes && /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.mes) ? sp.mes : undefined;
  const [faturas, r, empresas] = await Promise.all([
    listarFaturas(user, { categoria: sp.categoria, q: sp.q, alerta: sp.alerta === "1", empresa_id: empresaId, mes }), resumo(user), todasEmpresas(),
  ]);
  const qs = new URLSearchParams(Object.entries({ categoria: sp.categoria, q: sp.q, empresa: empresaId ? String(empresaId) : undefined, mes }).filter(([, v]) => v) as [string, string][]).toString();

  return (
    <>
      <Suspense><LembrarLista /></Suspense>
      <PageHeader titulo="Faturas" subtitulo="Tudo o que foi carregado, por ordem de data.">
        <a href={`/api/export?${qs}`} className="btn-ghost">Exportar Excel</a>
        {editaDireto(user) && <form action={criarFaturaManual}><button className="btn-ghost">+ Fatura manual</button></form>}
        {editaDireto(user) && <Link href="/upload" className="btn-primary md:hidden">+ Carregar</Link>}
      </PageHeader>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat rotulo="Este mês" valor={money(r.mes)} />
        <Stat rotulo="Total geral" valor={money(r.total)} />
        <Stat rotulo="Faturas" valor={String(r.n)} />
        <Link href="/alertas"><Stat rotulo="Para rever" valor={String(r.alertas)} destaque={r.alertas > 0} /></Link>
      </div>

      {r.porCategoria.length > 1 && (
        <div className="mb-6 flex gap-2 overflow-x-auto pb-1">
          {r.porCategoria.map((c) => (
            <Link key={c.categoria} href={`/?categoria=${c.categoria}`} className="card shrink-0 px-4 py-2 text-sm hover:border-brand-500">
              <span className="text-slate-500">{CATEGORIA_INFO[c.categoria]?.nome}</span> <span className="ml-1 font-semibold">{money(c.total)}</span>
            </Link>
          ))}
        </div>
      )}

      <form className="mb-4 flex flex-col gap-2 sm:flex-row">
        <input name="q" defaultValue={sp.q ?? ""} placeholder="Procurar fornecedor ou nº…" className="field sm:max-w-xs" />
        <select name="categoria" defaultValue={sp.categoria ?? ""} className="field sm:max-w-[12rem]">
          <option value="">Todas as categorias</option>
          {CATEGORIAS.map((c) => <option key={c} value={c}>{CATEGORIA_INFO[c].nome}</option>)}
        </select>
        <select name="empresa" defaultValue={sp.empresa ?? ""} className="field sm:max-w-[12rem]">
          <option value="">Todas as empresas</option>
          {empresas.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
        </select>
        <input type="month" name="mes" defaultValue={mes ?? ""} className="field sm:max-w-[11rem]" aria-label="Mês" />
        <button className="btn-ghost">Filtrar</button>
        {(sp.q || sp.categoria || sp.alerta || sp.empresa || sp.mes) && <Link href="/" className="btn-ghost">Limpar</Link>}
      </form>

      <FaturasLista faturas={faturas} />
    </>
  );
}
