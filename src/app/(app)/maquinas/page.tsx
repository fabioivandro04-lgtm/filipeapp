import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { maquinasComTotais } from "@/lib/queries";
import { money } from "@/lib/format";
import { criarMaquina } from "@/app/actions";
import { PageHeader, Vazio } from "@/components/Ui";

export default async function Maquinas() {
  const user = await requireUser();
  const maquinas = maquinasComTotais(user);
  return (
    <>
      <PageHeader titulo="Máquinas" subtitulo="O que cada máquina já custou, com base nas faturas associadas." />
      {user.cargo === "admin" && (
        <form action={criarMaquina} className="card mb-6 grid gap-3 p-4 sm:grid-cols-[10rem_1fr_auto]">
          <input name="numero" placeholder="Nº interno" required className="field" />
          <input name="descricao" placeholder="Descrição (ex.: Retroescavadora JCB)" className="field" />
          <button className="btn-primary">Adicionar</button>
        </form>
      )}
      {!maquinas.length ? <Vazio texto="Ainda não há máquinas registadas." /> : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {maquinas.map((m) => (
            <Link key={m.id} href={`/maquinas/${m.id}`} className="card block p-4 transition hover:border-brand-500">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Nº {m.numero_interno}</p>
              <p className="mt-1 font-medium">{m.descricao || "Sem descrição"}</p>
              <p className="mt-3 text-2xl font-semibold">{money(m.total)}</p>
              <p className="text-xs text-slate-500">{m.n} fatura(s)</p>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
