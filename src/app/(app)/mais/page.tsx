import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/Ui";

export default async function Mais() {
  const user = await requireUser();
  const links = [
    { href: "/relatorios", nome: "Relatórios", desc: "Gastos por mês, empresa e categoria" },
    { href: "/alertas", nome: "Alertas", desc: "Duplicados, valores estranhos e meses em falta" },
    ...(user.cargo === "admin" ? [{ href: "/utilizadores", nome: "Utilizadores", desc: "Criar pessoas e definir o que veem" }] : []),
    { href: "/conta", nome: "Alterar palavra-passe", desc: "A sua conta" },
  ];
  return (
    <>
      <PageHeader titulo="Mais" />
      <ul className="space-y-3">
        {links.map((l) => (
          <li key={l.href}><Link href={l.href} className="card block p-4 hover:border-brand-500"><p className="font-medium">{l.nome}</p><p className="text-sm text-slate-500">{l.desc}</p></Link></li>
        ))}
      </ul>
    </>
  );
}
