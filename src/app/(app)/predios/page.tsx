import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prediosComTotais } from "@/lib/queries";
import { money } from "@/lib/format";
import { criarPredio } from "@/app/actions";
import { PageHeader, Vazio } from "@/components/Ui";

export default async function Predios() {
  const user = await requireUser();
  const predios = await prediosComTotais(user);
  return (
    <>
      <PageHeader titulo="Prédios" subtitulo="Água, energia e restantes despesas de cada prédio." />
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
