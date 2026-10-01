import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { BARRA_TELEMOVEL, seccoes } from "@/lib/menu";
import { contarPrazos, contarPropostasPendentes } from "@/lib/queries";
import { PageHeader } from "@/components/Ui";
import Icone from "@/components/Icone";

export default async function Mais() {
  const user = await requireUser();
  const [pendentes, prazos] = await Promise.all([
    user.cargo === "admin" ? contarPropostasPendentes() : Promise.resolve(0),
    contarPrazos().then((p) => p.caducados + p.urgentes),
  ]);
  // As páginas que já estão na barra de baixo não se repetem aqui
  const grupos = [
    ...seccoes(user, { pendentes, prazos }).map((s) => ({ ...s, itens: s.itens.filter((i) => !BARRA_TELEMOVEL.includes(i.href)) })),
    { titulo: "Conta", itens: [{ href: "/conta", nome: "Alterar palavra-passe", desc: "A sua conta", icon: "conta" }] },
  ].filter((s) => s.itens.length);
  return (
    <>
      <PageHeader titulo="Mais" />
      {grupos.map((s) => (
        <section key={s.titulo} className="mb-6">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">{s.titulo}</h2>
          <ul className="card divide-y divide-slate-100 overflow-hidden">
            {s.itens.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="flex items-center gap-4 px-4 py-3 hover:bg-slate-50">
                  <Icone nome={l.icon} className="h-6 w-6 shrink-0 text-slate-400" />
                  <span className="min-w-0 flex-1"><span className="block font-medium">{l.nome}</span><span className="block text-sm text-slate-500">{l.desc}</span></span>
                  {"contador" in l && !!l.contador && <span className="rounded-full bg-amber-500 px-2 text-xs font-medium text-white">{l.contador}</span>}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}
