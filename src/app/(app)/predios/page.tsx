import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prediosComTotais } from "@/lib/queries";
import { money } from "@/lib/format";
import { criarPredio } from "@/app/actions";
import { PageHeader, Vazio } from "@/components/Ui";

export default async function Predios({ searchParams }: { searchParams: Promise<{ ok?: string; erro?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const predios = await prediosComTotais(user);
  return (
    <>
      <PageHeader titulo="Prédios" subtitulo="Água, energia e restantes despesas de cada prédio.">
        {user.cargo === "admin" && <Link href="/apagados" className="btn-ghost">Ver apagados</Link>}
      </PageHeader>
      {sp.ok && <p className="mb-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{sp.ok}</p>}
      {sp.erro && <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{sp.erro}</p>}
      {user.cargo === "admin" && (
        <form action={criarPredio} className="card mb-6 grid gap-3 p-4 lg:grid-cols-[1fr_1.4fr_1fr_auto]">
          <input name="nome" placeholder="Nome do prédio" required className="field" />
          <input name="morada" placeholder="Morada" className="field" />
          <input name="codigo" placeholder="Nº contador / cód. cliente" className="field" />
          <button className="btn-primary">Adicionar</button>
        </form>
      )}
      {!predios.length ? <Vazio texto="Ainda não há prédios registados." /> : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {predios.map((p) => (
            <Link key={p.id} href={`/predios/${p.id}`} className="card block p-4 transition hover:border-brand-500">
              <p className="font-medium">{p.nome}</p>
              <p className="text-sm text-slate-500">{p.morada || "Sem morada"}</p>
              <p className="mt-3 text-2xl font-semibold">{money(p.total)}</p>
              <p className="text-xs text-slate-500">{p.n} fatura(s) · {p.codigo_contador ? `contador ${p.codigo_contador}` : "sem nº de contador"}</p>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
