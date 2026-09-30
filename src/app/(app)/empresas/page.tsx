import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { nifValido } from "@/lib/nif";
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

      <form action={guardarEmpresa.bind(null, null)} className="card mb-6 space-y-3 p-4">
        <p className="text-sm font-medium">Nova empresa</p>
        <Campos />
        <button className="btn-primary">Adicionar</button>
      </form>

      <ul className="space-y-3">
        {empresas.map((e) => (
          <li key={e.id} className="card p-4">
            <form action={guardarEmpresa.bind(null, e.id)} className="space-y-3">
              <Campos e={e} />
              {e.nif && !nifValido(e.nif) && <p className="text-sm text-amber-800">⚠ O NIF {e.nif} não é válido (dígito de controlo). Confirme o número: com um NIF errado, as faturas não se associam sozinhas.</p>}
              <button className="btn-ghost">Guardar</button>
            </form>
          </li>
        ))}
        {!empresas.length && <li className="card p-6 text-center text-sm text-slate-500">Ainda não há empresas. Aparecem quando escreve o nome ao carregar uma fatura, ou pode adicioná-las aqui.</li>}
      </ul>
    </>
  );
}

function Campos({ e }: { e?: { nome: string; nif: string | null; morada: string | null; codigo_postal: string | null; localidade: string | null } }) {
  return (
    <div className="grid gap-3 sm:grid-cols-6">
      <input name="nome" defaultValue={e?.nome} placeholder="Nome da empresa" required className="field sm:col-span-4" />
      <input name="nif" defaultValue={e?.nif ?? ""} placeholder="NIF (9 números)" inputMode="numeric" maxLength={9} className="field sm:col-span-2" />
      <input name="morada" defaultValue={e?.morada ?? ""} placeholder="Morada" className="field sm:col-span-6" />
      <input name="codigo_postal" defaultValue={e?.codigo_postal ?? ""} placeholder="Código postal (0000-000)" maxLength={8} className="field sm:col-span-2" />
      <input name="localidade" defaultValue={e?.localidade ?? ""} placeholder="Localidade" className="field sm:col-span-4" />
    </div>
  );
}
