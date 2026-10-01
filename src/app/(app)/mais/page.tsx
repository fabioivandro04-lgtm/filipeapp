import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { extras, PRINCIPAL } from "@/lib/menu";
import { contarPropostasPendentes } from "@/lib/queries";
import { PageHeader } from "@/components/Ui";
import Icone from "@/components/Icone";

export default async function Mais() {
  const user = await requireUser();
  const pendentes = user.cargo === "admin" ? await contarPropostasPendentes() : 0;
  const links = [...PRINCIPAL.slice(3), ...extras(user, pendentes)]; // Relatórios, Alertas e o resto
  return (
    <>
      <PageHeader titulo="Mais" />
      <ul className="space-y-3">
        {links.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="card flex items-center gap-4 p-4 hover:border-brand-500">
              <Icone nome={l.icon} className="h-6 w-6 shrink-0 text-slate-400" />
              <span><span className="block font-medium">{l.nome}</span><span className="block text-sm text-slate-500">{l.desc}</span></span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
