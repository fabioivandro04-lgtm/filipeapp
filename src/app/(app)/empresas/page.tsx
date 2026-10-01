import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { nifValido } from "@/lib/nif";
import { empresasComContagem } from "@/lib/queries";
import { apagarEntidade, guardarEmpresa } from "@/app/actions";
import ConfirmarBotao from "@/components/ConfirmarBotao";
import Icone from "@/components/Icone";
import { PageHeader, Stat } from "@/components/Ui";

type DadosEmpresa = { nome: string; nif: string | null; morada: string | null; codigo_postal: string | null; localidade: string | null };
const moradaCompleta = (e: DadosEmpresa) => [e.morada, [e.codigo_postal, e.localidade].filter(Boolean).join(" ")].filter(Boolean).join(", ");

export default async function Empresas({ searchParams }: { searchParams: Promise<{ ok?: string; erro?: string }> }) {
  const user = await requireUser();
  if (user.cargo !== "admin") redirect("/");
  const sp = await searchParams;
  const empresas = await empresasComContagem();
  const semNif = empresas.filter((e) => !e.nif).length;
  const nifInvalido = empresas.filter((e) => e.nif && !nifValido(e.nif)).length;

  return (
    <>
      <PageHeader titulo="Empresas" subtitulo="Com o NIF certo, as faturas ligam-se sozinhas à empresa: o NIF do cliente vem no QR code da fatura.">
        <Link href="/apagados" className="btn-ghost">Ver apagadas</Link>
      </PageHeader>
      {sp.ok && <p className="mb-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{sp.ok}</p>}
      {sp.erro && <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{sp.erro}</p>}

      <div className="mb-6 grid grid-cols-3 gap-3 md:max-w-xl">
        <Stat rotulo="Empresas" valor={String(empresas.length)} />
        <Stat rotulo="Sem NIF" valor={String(semNif)} destaque={semNif > 0} />
        <Stat rotulo="NIF inválido" valor={String(nifInvalido)} destaque={nifInvalido > 0} />
      </div>

      <details className="card mb-6 p-4">
        <summary className="cursor-pointer text-sm font-medium text-brand-700">+ Nova empresa</summary>
        <form action={guardarEmpresa.bind(null, null)} className="mt-4 space-y-3">
          <Campos />
          <button className="btn-primary">Adicionar empresa</button>
        </form>
      </details>

      {!empresas.length ? (
        <div className="card p-6 text-center text-sm text-slate-500">Ainda não há empresas. Aparecem quando escreve o nome ao carregar uma fatura, ou pode adicioná-las aqui.</div>
      ) : (
        <ul className="card divide-y divide-slate-100 overflow-hidden">
          {empresas.map((e) => {
            const invalido = !!e.nif && !nifValido(e.nif);
            const morada = moradaCompleta(e);
            return (
              <li key={e.id}>
                <details className="group">
                  <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-500"><Icone nome="empresas" className="h-5 w-5" /></span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{e.nome}</p>
                      <p className="truncate text-sm text-slate-500">{morada || <span className="text-slate-400">Sem morada</span>}</p>
                      <p className={`truncate text-xs sm:hidden ${!e.nif || invalido ? "text-amber-700" : "text-slate-500"}`}>{!e.nif ? "Sem NIF" : invalido ? `NIF inválido: ${e.nif}` : `NIF ${e.nif}`} · {e.faturas} fatura{e.faturas === 1 ? "" : "s"}</p>
                    </div>
                    <span className="hidden w-32 text-sm sm:block">
                      {!e.nif ? <span className="badge bg-amber-100 text-amber-800">Sem NIF</span>
                        : invalido ? <span className="badge bg-red-100 text-red-700" title="Dígito de controlo errado">NIF inválido</span>
                        : <span className="font-mono text-slate-600">{e.nif}</span>}
                    </span>
                    <span className="hidden w-24 text-right text-sm text-slate-500 md:block">{e.faturas} fatura{e.faturas === 1 ? "" : "s"}</span>
                    <Icone nome="seta" className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-open:rotate-180" />
                  </summary>
                  <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-4 sm:pl-[4.25rem]">
                    {invalido && <p className="mb-3 rounded-lg bg-red-50 p-2 text-sm text-red-700">O NIF {e.nif} não é válido (dígito de controlo). Com um NIF errado, as faturas não se ligam sozinhas a esta empresa.</p>}
                    <form action={guardarEmpresa.bind(null, e.id)} className="space-y-3">
                      <Campos e={e} />
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <button className="btn-primary">Guardar alterações</button>
                        <Link href={`/?empresa=${e.id}`} className="text-sm text-brand-600 hover:underline">Ver faturas desta empresa</Link>
                      </div>
                    </form>
                    <form action={apagarEntidade.bind(null, "empresas", e.id)} className="mt-4 border-t border-slate-200 pt-3">
                      <ConfirmarBotao className="btn-danger px-3 py-1.5 text-xs"
                        mensagem={`Apagar a empresa «${e.nome}»?${e.faturas ? ` As ${e.faturas} faturas ligadas mantêm-se.` : ""} Pode restaurá-la em Apagados.`}>
                        Apagar empresa
                      </ConfirmarBotao>
                    </form>
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

function Campos({ e }: { e?: DadosEmpresa }) {
  return (
    <div className="grid gap-3 sm:grid-cols-6">
      <div className="sm:col-span-4"><label className="label">Nome</label><input name="nome" defaultValue={e?.nome} required className="field" /></div>
      <div className="sm:col-span-2"><label className="label">NIF</label><input name="nif" defaultValue={e?.nif ?? ""} placeholder="9 números" inputMode="numeric" maxLength={9} className="field font-mono" /></div>
      <div className="sm:col-span-6"><label className="label">Morada</label><input name="morada" defaultValue={e?.morada ?? ""} className="field" /></div>
      <div className="sm:col-span-2"><label className="label">Código postal</label><input name="codigo_postal" defaultValue={e?.codigo_postal ?? ""} placeholder="0000-000" maxLength={8} className="field" /></div>
      <div className="sm:col-span-4"><label className="label">Localidade</label><input name="localidade" defaultValue={e?.localidade ?? ""} className="field" /></div>
    </div>
  );
}
