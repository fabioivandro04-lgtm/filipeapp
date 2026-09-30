import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { extras, PRINCIPAL } from "@/lib/menu";
import { contarPropostasPendentes } from "@/lib/queries";
import { PageHeader } from "@/components/Ui";

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
            <Link href={l.href} className="card block p-4 hover:border-brand-500"><p className="font-medium">{l.icon} {l.nome}</p><p className="text-sm text-slate-500">{l.desc}</p></Link>
          </li>
        ))}
      </ul>
    </>
  );
}
