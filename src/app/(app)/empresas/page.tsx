import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { todasEmpresas } from "@/lib/queries";
import { guardarEmpresa } from "@/app/actions";
import { PageHeader } from "@/components/Ui";

export default async function Empresas({ searchParams }: { searchParams: Promise<{ ok?: string; erro?: string }> }) {
  const user = await requireUser();
  if (user.cargo !== "admin") redirect("/");
  const sp = await searchParams;
  const empresas = await todasEmpresas();
  return (
    <>
      <PageHeader titulo="Empresas" subtitulo="Com o NIF, as faturas ficam associadas à empresa certa sozinhas: o NIF do cliente vem no QR code da fatura." />
      {sp.ok && <p className="mb-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{sp.ok}</p>}
      {sp.erro && <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{sp.erro}</p>}

      <form action={guardarEmpresa.bind(null, null)} className="card mb-6 grid gap-3 p-4 sm:grid-cols-[1fr_12rem_auto]">
        <input name="nome" placeholder="Nome da empresa" required className="field" />
        <input name="nif" placeholder="NIF (9 números)" inputMode="numeric" maxLength={9} className="field" />
        <button className="btn-primary">Adicionar</button>
      </form>

      <ul className="space-y-3">
        {empresas.map((e) => (
          <li key={e.id} className="card p-4">
            <form action={guardarEmpresa.bind(null, e.id)} className="grid gap-3 sm:grid-cols-[1fr_12rem_auto]">
              <input name="nome" defaultValue={e.nome} required className="field" />
              <input name="nif" defaultValue={e.nif ?? ""} placeholder="Sem NIF" inputMode="numeric" maxLength={9} className="field" />
              <button className="btn-ghost">Guardar</button>
            </form>
          </li>
        ))}
        {!empresas.length && <li className="card p-6 text-center text-sm text-slate-500">Ainda não há empresas. Aparecem quando escreve o nome ao carregar uma fatura, ou pode adicioná-las aqui.</li>}
      </ul>
    </>
  );
}
