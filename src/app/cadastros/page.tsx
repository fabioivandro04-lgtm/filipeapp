import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { criarMaquina, criarPredio } from "../actions";

export default async function Cadastros() {
  const u = await requireUser();
  if (u.cargo !== "admin") redirect("/");
  const predios = db().prepare("SELECT * FROM predios ORDER BY nome").all() as { id: number; nome: string; morada: string; codigo_contador: string | null }[];
  const maquinas = db().prepare("SELECT * FROM maquinas ORDER BY numero_interno").all() as { id: number; numero_interno: string; descricao: string }[];
  const inp = "rounded border p-2";
  return (
    <main className="mx-auto max-w-4xl space-y-10 p-6">
      <Link href="/" className="text-sm underline">← Voltar</Link>
      <section>
        <h2 className="mb-2 text-xl font-semibold">Prédios</h2>
        <p className="mb-3 text-sm text-gray-600">O código de contador/cliente identifica o prédio (a morada sozinha é ambígua).</p>
        <form action={criarPredio} className="mb-3 flex flex-wrap gap-2">
          <input name="nome" placeholder="Nome" required className={inp} />
          <input name="morada" placeholder="Morada" className={inp} />
          <input name="codigo" placeholder="Nº contador / cód. cliente" className={inp} />
          <button className="rounded bg-black px-3 text-white">Adicionar</button>
        </form>
        <ul className="divide-y rounded border text-sm">{predios.map((p) => <li key={p.id} className="p-2">{p.nome} — {p.morada} <span className="text-gray-500">[{p.codigo_contador ?? "sem código"}]</span></li>)}</ul>
      </section>
      <section>
        <h2 className="mb-2 text-xl font-semibold">Máquinas</h2>
        <form action={criarMaquina} className="mb-3 flex flex-wrap gap-2">
          <input name="numero" placeholder="Nº interno" required className={inp} />
          <input name="descricao" placeholder="Descrição" className={inp} />
          <button className="rounded bg-black px-3 text-white">Adicionar</button>
        </form>
        <ul className="divide-y rounded border text-sm">{maquinas.map((m) => <li key={m.id} className="p-2">{m.numero_interno} — {m.descricao}</li>)}</ul>
      </section>
    </main>
  );
}
