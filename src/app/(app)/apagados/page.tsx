import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { listarApagados } from "@/lib/queries";
import { dataPt, money } from "@/lib/format";
import { alternarAtivo, restaurarEntidade, restaurarFatura } from "@/app/actions";
import { PageHeader, Vazio } from "@/components/Ui";

function Linha({ children, acao }: { children: React.ReactNode; acao: React.ReactNode }) {
  return <li className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm"><span>{children}</span>{acao}</li>;
}

function Restaurar({ action }: { action: () => Promise<void> }) {
  return <form action={action}><button className="btn-ghost px-3 py-1 text-xs">Restaurar</button></form>;
}

function Secao({ titulo, n, children }: { titulo: string; n: number; children: React.ReactNode }) {
  if (n === 0) return null;
  return (
    <section className="mb-8">
      <h2 className="mb-2 text-lg font-semibold">{titulo} ({n})</h2>
      <ul className="card divide-y divide-slate-100">{children}</ul>
    </section>
  );
}

export default async function Apagados({ searchParams }: { searchParams: Promise<{ ok?: string; erro?: string }> }) {
  const user = await requireUser();
  if (user.cargo !== "admin") redirect("/");
  const sp = await searchParams;
  const a = await listarApagados();
  const total = a.faturas.length + a.empresas.length + a.predios.length + a.maquinas.length + a.utilizadores.length;

  return (
    <>
      <Link href="/definicoes#dados" className="text-sm text-slate-500 hover:text-slate-900">← Definições</Link>
      <div className="mt-2" />
      <PageHeader titulo="Apagados" subtitulo="Nada é apagado para sempre: tudo o que apagou pode ser restaurado aqui." />
      {sp.ok && <p className="mb-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{sp.ok}</p>}
      {sp.erro && <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{sp.erro}</p>}
      {total === 0 && <Vazio texto="Não há nada apagado." />}

      <Secao titulo="Faturas" n={a.faturas.length}>
        {a.faturas.map((f) => (
          <Linha key={f.id} acao={<Restaurar action={restaurarFatura.bind(null, f.id)} />}>
            <span className="font-medium">{f.fornecedor ?? "Fatura sem nome"}</span>{" "}
            <span className="text-slate-500">{f.numero} · {dataPt(f.data)} · {money(f.total)}</span>
            <span className="ml-2 text-xs text-slate-400">apagada em {f.apagada_em.slice(0, 10)}</span>
          </Linha>
        ))}
      </Secao>
      <Secao titulo="Empresas" n={a.empresas.length}>
        {a.empresas.map((e) => (
          <Linha key={e.id} acao={<Restaurar action={restaurarEntidade.bind(null, "empresas", e.id)} />}>
            <span className="font-medium">{e.nome}</span> <span className="text-slate-500">{e.nif ? `NIF ${e.nif}` : ""}</span>
            <span className="ml-2 text-xs text-slate-400">apagada em {e.apagada_em.slice(0, 10)}</span>
          </Linha>
        ))}
      </Secao>
      <Secao titulo="Prédios" n={a.predios.length}>
        {a.predios.map((p) => (
          <Linha key={p.id} acao={<Restaurar action={restaurarEntidade.bind(null, "predios", p.id)} />}>
            <Link href={`/predios/${p.id}`} className="font-medium hover:text-brand-600">{p.nome}</Link> <span className="text-slate-500">{p.morada}</span>
            <span className="ml-2 text-xs text-slate-400">apagado em {p.apagada_em.slice(0, 10)}</span>
          </Linha>
        ))}
      </Secao>
      <Secao titulo="Máquinas" n={a.maquinas.length}>
        {a.maquinas.map((m) => (
          <Linha key={m.id} acao={<Restaurar action={restaurarEntidade.bind(null, "maquinas", m.id)} />}>
            <Link href={`/maquinas/${m.id}`} className="font-medium hover:text-brand-600">Nº {m.numero_interno}</Link> <span className="text-slate-500">{m.descricao}</span>
            <span className="ml-2 text-xs text-slate-400">apagada em {m.apagada_em.slice(0, 10)}</span>
          </Linha>
        ))}
      </Secao>
      <Secao titulo="Utilizadores desativados" n={a.utilizadores.length}>
        {a.utilizadores.map((u) => (
          <Linha key={u.id} acao={<Restaurar action={alternarAtivo.bind(null, u.id)} />}>
            <span className="font-medium">{u.nome}</span> <span className="text-slate-500">{u.email}</span>
          </Linha>
        ))}
      </Secao>
    </>
  );
}
