import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { todasEmpresas } from "@/lib/queries";
import ImportarStock from "@/components/ImportarStock";
import { PageHeader } from "@/components/Ui";

export default async function Importar() {
  const user = await requireUser();
  if (user.cargo !== "admin") redirect("/maquinas");
  const empresas = await todasEmpresas();
  return (
    <>
      <Link href="/maquinas" className="text-sm text-slate-500 hover:text-slate-900">← Máquinas</Link>
      <div className="mt-2"><PageHeader titulo="Importar stock" subtitulo="Escolha o Excel de UMA empresa (folhas STOCK, VENDIDO, ABATE…). Vê primeiro o que vai acontecer e só depois importa." /></div>
      <ImportarStock empresas={empresas.map((e) => ({ id: e.id, nome: e.nome }))} />
    </>
  );
}
