import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { carregarNomes, listarPropostas, type Proposta } from "@/lib/queries";
import { CAMPOS_EDITAVEIS } from "@/lib/historico";
import { aceitarProposta, rejeitarProposta } from "@/app/actions";
import DiffLista from "@/components/Diff";
import { PageHeader, Vazio } from "@/components/Ui";

const norm = (v: unknown) => (v == null || v === "" ? "" : String(v));
/** A fatura mudou desde que a proposta foi feita? (o valor «antes» da proposta já não é o atual) */
function mudouEntretanto(p: Proposta) {
  if (!p.atual) return false;
  return Object.entries(JSON.parse(p.alteracoes) as Record<string, [unknown, unknown]>)
    .some(([campo, [antes]]) => (CAMPOS_EDITAVEIS as readonly string[]).includes(campo) && norm(p.atual![campo]) !== norm(antes));
}

const ESTADO: Record<string, { texto: string; cor: string }> = {
  pendente: { texto: "À espera", cor: "bg-amber-100 text-amber-800" },
  aceite: { texto: "Aceite", cor: "bg-emerald-100 text-emerald-800" },
  rejeitada: { texto: "Rejeitada", cor: "bg-red-100 text-red-800" },
  substituida: { texto: "Substituída", cor: "bg-slate-100 text-slate-600" },
};

export default async function Aprovacoes({ searchParams }: { searchParams: Promise<{ ok?: string; erro?: string }> }) {
  const user = await requireUser();
  if (user.cargo !== "admin" && user.cargo !== "contabilista") redirect("/");
  const admin = user.cargo === "admin";
  const sp = await searchParams;
  const meu = admin ? undefined : user.id;
  const [pendentes, decididas, nomes] = await Promise.all([
    listarPropostas({ estado: ["pendente"], userId: meu }),
    listarPropostas({ estado: ["aceite", "rejeitada"], userId: meu, limite: 30 }),
    carregarNomes(),
  ]);

  return (
    <>
      <PageHeader titulo={admin ? "Aprovações" : "As minhas propostas"}
        subtitulo={admin ? "Alterações propostas pelos contabilistas. Só entram em vigor depois de aceitar." : "As suas alterações ficam à espera de um administrador."} />
      {sp.ok && <p className="mb-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{sp.ok}</p>}
      {sp.erro && <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{sp.erro}</p>}

      <h2 className="mb-3 text-lg font-semibold">À espera ({pendentes.length})</h2>
      {!pendentes.length ? <Vazio texto={admin ? "Não há propostas por decidir." : "Não tem propostas à espera."} /> : (
        <ul className="space-y-3">
          {pendentes.map((p) => (
            <li key={p.id} className="card p-4 text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p>
                  <span className="font-medium">{p.user_nome}</span> propõe alterar{" "}
                  <Link href={`/faturas/${p.fatura_id}`} className="text-brand-600 hover:underline">{p.fatura_fornecedor ?? `fatura #${p.fatura_id}`} {p.fatura_numero}</Link>
                </p>
                <time className="text-xs text-slate-400">{p.criado_em.slice(0, 16)}</time>
              </div>
              <div className="mt-2"><DiffLista diff={JSON.parse(p.alteracoes)} nomes={nomes} /></div>
              {mudouEntretanto(p) && <p className="mt-2 rounded-lg bg-amber-50 p-2 text-amber-900">⚠ A fatura foi alterada depois desta proposta. Ao aceitar, os valores propostos substituem os atuais.</p>}
              {admin && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <form action={aceitarProposta.bind(null, p.id)}><button className="btn-primary px-3 py-1.5">Aceitar</button></form>
                  <form action={rejeitarProposta.bind(null, p.id)} className="flex gap-2">
                    <input name="motivo" placeholder="Motivo (opcional)" className="field py-1.5" />
                    <button className="btn-ghost px-3 py-1.5">Rejeitar</button>
                  </form>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <h2 className="mb-3 mt-10 text-lg font-semibold">Decididas recentemente</h2>
      {!decididas.length ? <Vazio texto="Ainda não há propostas decididas." /> : (
        <ul className="space-y-3">
          {decididas.map((p) => {
            const e = ESTADO[p.estado] ?? ESTADO.pendente;
            return (
              <li key={p.id} className="card p-4 text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p>
                    <span className={`badge mr-2 ${e.cor}`}>{e.texto}</span>
                    {admin && <span className="font-medium">{p.user_nome} · </span>}
                    <Link href={`/faturas/${p.fatura_id}`} className="text-brand-600 hover:underline">{p.fatura_fornecedor ?? `fatura #${p.fatura_id}`} {p.fatura_numero}</Link>
                  </p>
                  <time className="text-xs text-slate-400">{(p.decidido_em ?? p.criado_em).slice(0, 16)}{p.decidido_por_nome ? ` · ${p.decidido_por_nome}` : ""}</time>
                </div>
                <div className="mt-2"><DiffLista diff={JSON.parse(p.alteracoes)} nomes={nomes} /></div>
                {p.motivo && <p className="mt-2 text-slate-500">Motivo: {p.motivo}</p>}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
