import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { listarFaturas, resumo } from "@/lib/queries";
import { CATEGORIAS } from "@/lib/db";
import { CATEGORIA_INFO, money } from "@/lib/format";
import FaturasLista from "@/components/FaturasLista";
import { PageHeader, Stat } from "@/components/Ui";

export default async function Home({ searchParams }: { searchParams: Promise<{ categoria?: string; q?: string; alerta?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const faturas = listarFaturas(user, { categoria: sp.categoria, q: sp.q, alerta: sp.alerta === "1" });
  const r = resumo(user);
  const qs = new URLSearchParams(Object.entries({ categoria: sp.categoria, q: sp.q }).filter(([, v]) => v) as [string, string][]).toString();

  return (
    <>
      <PageHeader titulo="Faturas" subtitulo="Tudo o que foi carregado, por ordem de data.">
        <a href={`/api/export?${qs}`} className="btn-ghost">Exportar Excel</a>
        <Link href="/upload" className="btn-primary md:hidden">+ Carregar</Link>
      </PageHeader>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat rotulo="Este mês" valor={money(r.mes)} />
        <Stat rotulo="Total geral" valor={money(r.total)} />
        <Stat rotulo="Faturas" valor={String(r.n)} />
        <Link href="/?alerta=1"><Stat rotulo="Para rever" valor={String(r.alertas)} destaque={r.alertas > 0} /></Link>
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
        <button className="btn-ghost">Filtrar</button>
        {(sp.q || sp.categoria || sp.alerta) && <Link href="/" className="btn-ghost">Limpar</Link>}
      </form>

      <FaturasLista faturas={faturas} />
    </>
  );
}
