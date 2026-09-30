import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { listarHistorico } from "@/lib/historico";
import { todasEmpresas, todasMaquinas, todosPredios } from "@/lib/queries";
import HistoricoLista from "@/components/HistoricoLista";
import { PageHeader } from "@/components/Ui";

export default async function Historico() {
  const user = await requireUser();
  if (user.cargo !== "admin") redirect("/");
  const [registos, empresas, predios, maquinas] = await Promise.all([listarHistorico({ limite: 300 }), todasEmpresas(), todosPredios(), todasMaquinas()]);
  const nomes = {
    empresas: Object.fromEntries(empresas.map((e) => [e.id, e.nome])),
    predios: Object.fromEntries(predios.map((p) => [p.id, p.nome])),
    maquinas: Object.fromEntries(maquinas.map((m) => [m.id, m.numero_interno])),
  };
  return (
    <>
      <PageHeader titulo="Histórico" subtitulo="Quem criou, editou ou apagou faturas. Pode desfazer edições e restaurar faturas apagadas." />
      <HistoricoLista registos={registos} nomes={nomes} podeDesfazer mostrarFatura />
    </>
  );
}
