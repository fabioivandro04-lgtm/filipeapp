import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { listarHistorico } from "@/lib/historico";
import { carregarNomes } from "@/lib/queries";
import HistoricoLista from "@/components/HistoricoLista";
import { PageHeader } from "@/components/Ui";

export default async function Historico() {
  const user = await requireUser();
  if (user.cargo !== "admin") redirect("/");
  const [registos, nomes] = await Promise.all([listarHistorico({ limite: 300 }), carregarNomes()]);
  return (
    <>
      <PageHeader titulo="Histórico" subtitulo="Quem criou, editou ou apagou faturas. Pode desfazer edições e restaurar faturas apagadas." />
      <HistoricoLista registos={registos} nomes={nomes} podeDesfazer mostrarFatura />
    </>
  );
}
