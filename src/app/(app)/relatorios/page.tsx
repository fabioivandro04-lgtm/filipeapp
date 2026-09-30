import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { serieMensal, todasEmpresas, totaisPorCategoria, totaisPorEmpresa } from "@/lib/queries";
import { CATEGORIA_INFO, money } from "@/lib/format";
import { BarrasHorizontais, ColunasMensais, nomeMes } from "@/components/Graficos";
import { PageHeader, Stat } from "@/components/Ui";

const MES_OK = /^\d{4}-(0[1-9]|1[0-2])$/;

export default async function Relatorios({ searchParams }: { searchParams: Promise<{ empresa?: string; mes?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const mes = sp.mes && MES_OK.test(sp.mes) ? sp.mes : undefined;
  const empresaId = Number(sp.empresa) || undefined;
  const [empresas, serie, porEmpresa, porCategoria] = await Promise.all([
    todasEmpresas(), serieMensal(user, empresaId), totaisPorEmpresa(user, mes), totaisPorCategoria(user, mes, empresaId),
  ]);

  const total = porCategoria.reduce((s, c) => s + c.total, 0);
  const n = porCategoria.reduce((s, c) => s + c.n, 0);
  const nomesCategoria = Object.fromEntries(Object.entries(CATEGORIA_INFO).map(([k, v]) => [k, v.nome]));
  const qs = new URLSearchParams(Object.entries({ mes, empresa: empresaId ? String(empresaId) : undefined }).filter(([, v]) => v) as [string, string][]).toString();

  return (
    <>
      <PageHeader titulo="Relatórios" subtitulo={mes ? `Detalhe de ${nomeMes(mes)}` : "Visão geral de todos os meses"}>
        <Link href={`/?${qs}`} className="btn-ghost">Ver as faturas</Link>
      </PageHeader>

      <form className="mb-6 flex flex-col gap-2 sm:flex-row">
        <select name="empresa" defaultValue={sp.empresa ?? ""} className="field sm:max-w-xs">
          <option value="">Todas as empresas</option>
          {empresas.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
        </select>
        <input type="month" name="mes" defaultValue={mes ?? ""} className="field sm:max-w-[12rem]" />
        <button className="btn-ghost">Aplicar</button>
        {(mes || empresaId) && <Link href="/relatorios" className="btn-ghost">Limpar</Link>}
      </form>

      <div className="mb-6 grid grid-cols-3 gap-3">
        <Stat rotulo="Total" valor={money(total)} />
        <Stat rotulo="Faturas" valor={String(n)} />
        <Stat rotulo="Média por fatura" valor={money(n ? total / n : 0)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="lg:col-span-2"><ColunasMensais dados={serie} titulo="Gasto por mês (últimos 12 meses)" /></div>
        <BarrasHorizontais dados={porEmpresa} titulo={mes ? `Por empresa · ${nomeMes(mes)}` : "Por empresa"} />
        <BarrasHorizontais dados={porCategoria} nomes={nomesCategoria} titulo={mes ? `Por categoria · ${nomeMes(mes)}` : "Por categoria"} />
      </div>
    </>
  );
}
