import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { todosUtilizadores, type Utilizador } from "@/lib/queries";
import { CARGOS } from "@/lib/db";
import { alternarAtivo, atualizarCargo, criarUtilizador, redefinirSenha } from "@/app/actions";
import ConfirmarBotao from "@/components/ConfirmarBotao";
import { PageHeader, Stat } from "@/components/Ui";
import Icone from "@/components/Icone";
import { agoraMs, dataHoraPt, estaOnline, haQuanto } from "@/lib/format";

const CARGO: Record<string, { nome: string; desc: string; cor: string }> = {
  admin: { nome: "Administrador", desc: "faz tudo", cor: "bg-brand-100 text-brand-700" },
  operador: { nome: "Operador", desc: "carrega e edita", cor: "bg-sky-100 text-sky-800" },
  contabilista: { nome: "Contabilista", desc: "propõe edições; o admin aceita", cor: "bg-amber-100 text-amber-800" },
};
const visto = (v: string | null, agora: number) => (v ? haQuanto(v, agora) : "Nunca entrou");
const iniciais = (nome: string) => nome.replace(/^(Sr|Sra|Dr|Dra)\.?\s+/i, "").split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();

export default async function Utilizadores({ searchParams }: { searchParams: Promise<{ ok?: string; erro?: string }> }) {
  const eu = await requireUser();
  if (eu.cargo !== "admin") redirect("/");
  const sp = await searchParams;
  const users = await todosUtilizadores();
  const agora = agoraMs();
  const ativos = users.filter((u) => u.ativo);
  const desativados = users.filter((u) => !u.ativo);
  const online = ativos.filter((u) => estaOnline(u.visto_em, agora));

  return (
    <>
      <PageHeader titulo="Utilizadores" subtitulo="Quem pode entrar na app, o que pode fazer e quando a usou.">
        <Link href="/historico?grupo=sessoes" className="btn-ghost">Entradas e saídas</Link>
      </PageHeader>
      {sp.ok && <p className="mb-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{sp.ok}</p>}
      {sp.erro && <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{sp.erro}</p>}

      <div className="mb-6 grid grid-cols-3 gap-3 md:max-w-xl">
        <Stat rotulo="Ativos" valor={String(ativos.length)} />
        <Stat rotulo="Online agora" valor={String(online.length)} />
        <Stat rotulo="Desativados" valor={String(desativados.length)} />
      </div>

      <details className="card mb-6 p-4">
        <summary className="cursor-pointer text-sm font-medium text-brand-700">+ Novo utilizador</summary>
        <form action={criarUtilizador} className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <div><label className="label">Nome</label><input name="nome" required className="field" /></div>
          <div><label className="label">Email (para entrar)</label><input name="email" type="email" required autoComplete="off" className="field" /></div>
          <div><label className="label">Cargo</label>
            <select name="cargo" defaultValue="operador" className="field">{CARGOS.map((c) => <option key={c} value={c}>{CARGO[c].nome} ({CARGO[c].desc})</option>)}</select></div>
          <div><label className="label">Palavra-passe (mín. 10)</label><input name="senha" type="password" required minLength={10} autoComplete="new-password" className="field" /></div>
          <div className="lg:col-span-4"><button className="btn-primary">Criar utilizador</button></div>
        </form>
      </details>

      <Lista titulo={`Ativos (${ativos.length})`} users={ativos} euId={eu.id} agora={agora} />
      {desativados.length > 0 && <Lista titulo={`Desativados (${desativados.length})`} users={desativados} euId={eu.id} agora={agora} />}
      <p className="mt-3 text-xs text-slate-400">Online = usou a app nos últimos 5 minutos. Horas na hora de Lisboa.</p>
    </>
  );
}

function Lista({ titulo, users, euId, agora }: { titulo: string; users: Utilizador[]; euId: number; agora: number }) {
  return (
    <section className="mb-6">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">{titulo}</h2>
      <ul className="card divide-y divide-slate-100 overflow-hidden">
        {users.map((u) => {
          const sou = u.id === euId;
          const on = u.ativo === 1 && estaOnline(u.visto_em, agora);
          const c = CARGO[u.cargo] ?? { nome: u.cargo, desc: "", cor: "bg-slate-100 text-slate-700" };
          const linha = (
            <div className="flex items-center gap-3 px-4 py-3">
              <span className="relative grid h-10 w-10 shrink-0 place-items-center rounded-full bg-slate-100 text-sm font-semibold text-slate-600">
                {iniciais(u.nome)}
                {on && <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white bg-emerald-500" title="Online" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{u.nome}{sou && <span className="ml-2 text-xs font-normal text-slate-400">(você)</span>}</p>
                <p className="truncate text-sm text-slate-500">{u.email}</p>
                <p className="truncate text-xs text-slate-500 sm:hidden">{c.nome} · {on ? "online" : visto(u.visto_em, agora)}</p>
              </div>
              <span className={`badge hidden sm:inline-flex ${c.cor}`}>{c.nome}</span>
              <span className="hidden w-32 text-right text-sm text-slate-500 md:block">{on ? <span className="text-emerald-700">Online</span> : visto(u.visto_em, agora)}</span>
              {!sou && <span className="text-sm text-slate-400"><Icone nome="seta" className="h-4 w-4 transition-transform group-open:rotate-180" /></span>}
            </div>
          );
          if (sou) return <li key={u.id}>{linha}</li>;
          return (
            <li key={u.id}>
              <details className="group">
                <summary className="cursor-pointer list-none hover:bg-slate-50 [&::-webkit-details-marker]:hidden">{linha}</summary>
                <div className="space-y-4 border-t border-slate-100 bg-slate-50/60 px-4 py-4 sm:pl-[4.25rem]">
                  <p className="text-sm text-slate-600">
                    Último login: {dataHoraPt(u.ultimo_login)} · Última utilização: {visto(u.visto_em, agora)}
                    {u.sessoes > 0 && ` · ${u.sessoes} sessão(ões) aberta(s)`} · <Link href={`/historico?u=${u.id}`} className="text-brand-600 hover:underline">ver o que fez</Link>
                  </p>
                  {u.ativo === 1 && (
                    <div className="grid gap-3 md:grid-cols-2">
                      <form action={atualizarCargo.bind(null, u.id)}>
                        <label className="label">Cargo</label>
                        <div className="flex gap-2">
                          <select name="cargo" defaultValue={u.cargo} className="field">{CARGOS.map((k) => <option key={k} value={k}>{CARGO[k].nome} ({CARGO[k].desc})</option>)}</select>
                          <button className="btn-ghost shrink-0">Guardar</button>
                        </div>
                      </form>
                      <form action={redefinirSenha.bind(null, u.id)}>
                        <label className="label">Nova palavra-passe</label>
                        <div className="flex gap-2">
                          <input name="senha" type="password" minLength={10} required autoComplete="new-password" placeholder="mín. 10 caracteres" className="field" />
                          <button className="btn-ghost shrink-0">Repor</button>
                        </div>
                      </form>
                    </div>
                  )}
                  <form action={alternarAtivo.bind(null, u.id)}>
                    {u.ativo
                      ? <ConfirmarBotao className="btn-danger px-3 py-1.5 text-xs" mensagem={`Desativar ${u.nome}? Deixa de poder entrar (pode reativar quando quiser).`}>Desativar utilizador</ConfirmarBotao>
                      : <button className="btn-ghost px-3 py-1.5 text-xs">Reativar utilizador</button>}
                  </form>
                </div>
              </details>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
