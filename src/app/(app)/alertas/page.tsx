import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { contarPrazos, listarFaturas, mesesEmFalta } from "@/lib/queries";
import { DIAS_AVISO } from "@/lib/prazos";
import { CATEGORIA_INFO } from "@/lib/format";
import { nomeMes } from "@/components/Graficos";
import FaturasLista from "@/components/FaturasLista";
import { PageHeader, Vazio } from "@/components/Ui";

export default async function Alertas() {
  const user = await requireUser();
  const [porRever, faltas, prazos] = await Promise.all([listarFaturas(user, { alerta: true }), mesesEmFalta(user), contarPrazos(DIAS_AVISO)]);
  return (
    <>
      <PageHeader titulo="Alertas" subtitulo="O que precisa da sua atenção." />

      {prazos.caducados + prazos.urgentes > 0 && (
        <Link href="/prazos" className="card mb-8 block p-4 hover:border-brand-500">
          <p className="font-medium">Prazos: {prazos.caducados} caducado(s) e {prazos.urgentes} a caducar nos próximos {DIAS_AVISO} dias</p>
          <p className="mt-1 text-sm text-slate-500">Seguros, inspeções, IUC e certificados. Abrir Prazos e documentos.</p>
        </Link>
      )}

      <h2 className="mb-3 text-lg font-semibold">Faturas para rever ({porRever.length})</h2>
      <p className="mb-3 text-sm text-slate-500">Possíveis duplicados, valores fora do normal, dados por ler ou sem prédio. Abra a fatura, corrija e marque «revista».</p>
      {porRever.length ? <FaturasLista faturas={porRever} /> : <Vazio texto="Tudo em ordem: não há faturas para rever." />}

      <h2 className="mb-3 mt-10 text-lg font-semibold">Meses sem fatura ({faltas.length})</h2>
      <p className="mb-3 text-sm text-slate-500">Prédios com água ou energia que costumam ter fatura todos os meses e estão em falta (últimos 12 meses).</p>
      {faltas.length ? (
        <ul className="space-y-3">
          {faltas.map((f) => (
            <li key={`${f.predio}-${f.categoria}`} className="card p-4">
              <p className="font-medium">{f.predio} <span className="ml-1 text-sm font-normal text-slate-500">· {CATEGORIA_INFO[f.categoria]?.nome}</span></p>
              <p className="mt-1 text-sm text-amber-800">Em falta: {f.meses.map(nomeMes).join(", ")}</p>
            </li>
          ))}
        </ul>
      ) : <Vazio texto="Não há meses em falta." />}
      <p className="mt-6 text-sm"><Link href="/predios" className="underline">Ver prédios</Link></p>
    </>
  );
}
