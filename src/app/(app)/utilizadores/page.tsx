import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { todosUtilizadores } from "@/lib/queries";
import { CARGOS } from "@/lib/db";
import { alternarAtivo, atualizarCargo, criarUtilizador, redefinirSenha } from "@/app/actions";
import ConfirmarBotao from "@/components/ConfirmarBotao";
import { PageHeader } from "@/components/Ui";
import Link from "next/link";
import { agoraMs, dataHoraPt, estaOnline, haQuanto } from "@/lib/format";

const cargoNome = (c: string) =>
  c === "admin" ? "Administrador (faz tudo)" : c === "operador" ? "Operador (carrega e edita)" : "Contabilista (propõe edições; o admin aceita)";

export default async function Utilizadores({ searchParams }: { searchParams: Promise<{ ok?: string; erro?: string }> }) {
  const eu = await requireUser();
  if (eu.cargo !== "admin") redirect("/");
  const sp = await searchParams;
  const users = await todosUtilizadores();
  const agora = agoraMs();
  const online = users.filter((u) => u.ativo && estaOnline(u.visto_em, agora));

  return (
    <>
      <PageHeader titulo="Utilizadores" subtitulo="Quem pode entrar na app, o que pode fazer e quando a usou.">
        <Link href="/historico?grupo=sessoes" className="btn-ghost">Entradas e saídas</Link>
      </PageHeader>
      <div className="card mb-6 p-4 text-sm">
        <p className="font-medium">Online agora ({online.length})</p>
        <p className="mt-1 text-slate-600">{online.length ? online.map((u) => u.nome).join(", ") : "Ninguém está a usar a app neste momento."}</p>
        <p className="mt-1 text-xs text-slate-400">Conta como online quem usou a app nos últimos 5 minutos.</p>
      </div>
      {sp.ok && <p className="mb-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{sp.ok}</p>}
      {sp.erro && <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{sp.erro}</p>}

      <form action={criarUtilizador} className="card mb-8 grid gap-3 p-4 md:grid-cols-2 lg:grid-cols-5">
        <input name="nome" placeholder="Nome" required className="field" />
        <input name="email" placeholder="Email (para entrar)" required autoComplete="off" className="field" />
        <select name="cargo" defaultValue="operador" className="field">{CARGOS.map((c) => <option key={c} value={c}>{cargoNome(c)}</option>)}</select>
        <input name="senha" type="password" placeholder="Palavra-passe (mín. 10)" required minLength={10} autoComplete="new-password" className="field" />
        <button className="btn-primary">Criar utilizador</button>
      </form>

      <ul className="space-y-3">
        {users.map((u) => {
          const sou = u.id === eu.id;
          return (
            <li key={u.id} className={`card p-4 ${u.ativo ? "" : "opacity-60"}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium">{u.nome} {sou && <span className="badge ml-1 bg-brand-100 text-brand-700">você</span>} {!u.ativo && <span className="badge ml-1 bg-slate-200 text-slate-700">desativado</span>}</p>
                  <p className="text-sm text-slate-500">{u.email}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {estaOnline(u.visto_em, agora) ? <span className="badge mr-1 bg-emerald-100 text-emerald-800">online</span> : <>Visto pela última vez: {haQuanto(u.visto_em, agora)} · </>}
                    Último login: {dataHoraPt(u.ultimo_login)}{u.sessoes > 0 && ` · ${u.sessoes} sessão(ões) aberta(s)`} · <Link href={`/historico?u=${u.id}`} className="text-brand-600 hover:underline">ver o que fez</Link>
                  </p>
                </div>
                {!sou && (
                  <form action={alternarAtivo.bind(null, u.id)}>
                    {u.ativo
                      ? <ConfirmarBotao className="btn-danger" mensagem={`Desativar ${u.nome}? Deixa de poder entrar (pode reativar quando quiser).`}>Desativar</ConfirmarBotao>
                      : <button className="btn-ghost">Reativar</button>}
                  </form>
                )}
              </div>
              {!sou && u.ativo === 1 && (
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <form action={atualizarCargo.bind(null, u.id)} className="flex gap-2">
                    <select name="cargo" defaultValue={u.cargo} className="field">{CARGOS.map((c) => <option key={c} value={c}>{cargoNome(c)}</option>)}</select>
                    <button className="btn-ghost shrink-0">Guardar cargo</button>
                  </form>
                  <form action={redefinirSenha.bind(null, u.id)} className="flex gap-2">
                    <input name="senha" type="password" placeholder="Nova palavra-passe" minLength={10} required autoComplete="new-password" className="field" />
                    <button className="btn-ghost shrink-0">Repor</button>
                  </form>
                </div>
              )}
              {sou && <p className="mt-2 text-sm text-slate-500">Cargo: {cargoNome(u.cargo)}. Para mudar a sua palavra-passe, use o seu nome no topo.</p>}
            </li>
          );
        })}
      </ul>
    </>
  );
}
