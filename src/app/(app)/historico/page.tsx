import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { GRUPOS_HISTORICO, listarHistorico } from "@/lib/historico";
import { carregarNomes, todosUtilizadores } from "@/lib/queries";
import HistoricoLista from "@/components/HistoricoLista";
import { PageHeader } from "@/components/Ui";

type SP = { u?: string; grupo?: string; desde?: string; ate?: string; q?: string; p?: string };
const POR_PAGINA = 100;
const data = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined);

/** Fim do dia em Lisboa ≈ início do dia seguinte em UTC (as horas guardam-se em UTC). */
const diaSeguinte = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);

export default async function Historico({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser();
  if (user.cargo !== "admin") redirect("/");
  const sp = await searchParams;
  const userId = Number(sp.u) || undefined;
  const grupo = GRUPOS_HISTORICO[sp.grupo ?? ""] ? sp.grupo : undefined;
  const desde = data(sp.desde), ate = data(sp.ate);
  const pagina = Math.max(Number(sp.p) || 1, 1);
  const [registos, nomes, pessoas] = await Promise.all([
    listarHistorico({ userId, grupo, desde, ate: ate ? diaSeguinte(ate) : undefined, texto: sp.q?.trim() || undefined, limite: POR_PAGINA + 1, offset: (pagina - 1) * POR_PAGINA }),
    carregarNomes(), todosUtilizadores(),
  ]);
  const haMais = registos.length > POR_PAGINA;
  const filtros = { u: sp.u, grupo, desde, ate, q: sp.q };
  const link = (p: number) => `/historico?${new URLSearchParams(Object.entries({ ...filtros, p: String(p) }).filter(([, v]) => v) as [string, string][])}`;
  const filtrado = !!(userId || grupo || desde || ate || sp.q);

  return (
    <>
      <PageHeader titulo="Histórico" subtitulo="Quem fez o quê e quando: faturas, máquinas, prazos, alugueres, empresas, utilizadores e entradas na app." />
      <form className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
        <select name="u" defaultValue={sp.u ?? ""} className="field">
          <option value="">Todas as pessoas</option>{pessoas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
        </select>
        <select name="grupo" defaultValue={grupo ?? ""} className="field">
          <option value="">Todas as ações</option>{Object.entries(GRUPOS_HISTORICO).map(([k, g]) => <option key={k} value={k}>{g.nome}</option>)}
        </select>
        <input type="date" name="desde" defaultValue={desde ?? ""} className="field" aria-label="Desde" />
        <input type="date" name="ate" defaultValue={ate ?? ""} className="field" aria-label="Até" />
        <input name="q" defaultValue={sp.q ?? ""} placeholder="Procurar (máquina, fornecedor…)" className="field" />
        <div className="flex gap-2">
          <button className="btn-ghost flex-1">Filtrar</button>
          {filtrado && <Link href="/historico" className="btn-ghost">Limpar</Link>}
        </div>
      </form>
      {!grupo && <p className="mb-3 text-xs text-slate-500">As entradas e saídas da app aparecem escolhendo «Entradas e saídas».</p>}
      <HistoricoLista registos={registos.slice(0, POR_PAGINA)} nomes={nomes} podeDesfazer mostrarFatura />
      {(pagina > 1 || haMais) && (
        <div className="mt-4 flex items-center justify-between text-sm">
          {pagina > 1 ? <Link href={link(pagina - 1)} className="btn-ghost">← Mais recentes</Link> : <span />}
          <span className="text-slate-500">Página {pagina}</span>
          {haMais ? <Link href={link(pagina + 1)} className="btn-ghost">Mais antigos →</Link> : <span />}
        </div>
      )}
    </>
  );
}
