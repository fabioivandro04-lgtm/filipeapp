import { requireUser } from "@/lib/auth";
import { lerConfig } from "@/lib/config";
import { lerSmtp } from "@/lib/email";
import { FREQUENCIAS, TIPOS_ALERTA, lerDefinicoesAlertas, type TipoAlerta } from "@/lib/alertas-email";
import { dataHoraPt } from "@/lib/format";
import { enviarAlertasAgora, guardarAlertasEmail, guardarEmailContabilidade, guardarPerfil, guardarServidorEmail, testarEmail } from "@/app/actions";
import FormSenha from "@/components/FormSenha";
import { PageHeader } from "@/components/Ui";

const CARGO: Record<string, string> = { admin: "Administrador (faz tudo)", operador: "Operador (carrega e edita)", contabilista: "Contabilista (propõe edições; o admin aceita)" };

function Seccao({ id, titulo, desc, children }: { id: string; titulo: string; desc?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="card scroll-mt-20 p-5">
      <h2 className="font-semibold">{titulo}</h2>
      {desc && <p className="mt-1 text-sm text-slate-500">{desc}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export default async function Definicoes({ searchParams }: { searchParams: Promise<{ ok?: string; erro?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const admin = user.cargo === "admin";
  const [alertas, smtp, cfg] = await Promise.all([
    lerDefinicoesAlertas(), lerSmtp(),
    Promise.all(["smtp_host", "smtp_port", "smtp_user", "smtp_from", "smtp_pass", "email_contabilidade"].map(lerConfig)),
  ]);
  const [host, porta, smtpUser, from, pass, emailConta] = cfg;
  const viaAmbiente = smtp?.origem === "ambiente";
  const abas = [
    { id: "perfil", nome: "Perfil" }, { id: "seguranca", nome: "Palavra-passe" },
    ...(admin ? [{ id: "alertas", nome: "Alertas por email" }, { id: "email", nome: "Servidor de email" }, { id: "contabilidade", nome: "Contabilidade" }] : []),
  ];

  return (
    <div className="max-w-3xl">
      <PageHeader titulo="Definições" subtitulo={admin ? "O seu perfil e as definições da app." : "O seu perfil e a sua palavra-passe."} />
      {sp.ok && <p className="mb-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{sp.ok}</p>}
      {sp.erro && <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{sp.erro}</p>}

      <nav className="mb-6 flex gap-2 overflow-x-auto pb-1">
        {abas.map((a) => <a key={a.id} href={`#${a.id}`} className="shrink-0 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600 hover:border-brand-500 hover:text-brand-700">{a.nome}</a>)}
      </nav>

      <div className="space-y-6">
        <Seccao id="perfil" titulo="Perfil">
          <form action={guardarPerfil} className="grid gap-3 sm:grid-cols-2">
            <div><label className="label">Nome</label><input name="nome" defaultValue={user.nome} required maxLength={80} className="field" /></div>
            <div><label className="label">Email (para entrar)</label><input value={user.email} readOnly className="field bg-slate-50 text-slate-500" /></div>
            <div className="sm:col-span-2"><label className="label">Cargo</label><p className="text-sm">{CARGO[user.cargo] ?? user.cargo}</p></div>
            <div className="sm:col-span-2"><button className="btn-primary">Guardar perfil</button></div>
          </form>
        </Seccao>

        <Seccao id="seguranca" titulo="Palavra-passe" desc="Escolha uma palavra-passe que só você conheça. Ao mudar, as outras sessões abertas (noutros aparelhos) terminam.">
          <FormSenha />
        </Seccao>

        {admin && (
          <Seccao id="alertas" titulo="Alertas por email" desc="Quem recebe um email com o que precisa de atenção. O envio automático é feito de manhã (cerca das 8h).">
            <form action={guardarAlertasEmail} className="space-y-4">
              <div>
                <label className="label">Enviar para</label>
                <input name="emails" defaultValue={alertas.emails.join(", ")} placeholder="ex.: filipe@empresa.pt, lisa@empresa.pt" className="field" />
                <p className="mt-1 text-xs text-slate-500">Um ou mais emails, separados por vírgula.</p>
              </div>
              <fieldset>
                <legend className="label">O que enviar</legend>
                <div className="space-y-2">
                  {(Object.keys(TIPOS_ALERTA) as TipoAlerta[]).map((t) => (
                    <label key={t} className="flex items-start gap-2 text-sm">
                      <input type="checkbox" name="tipos" value={t} defaultChecked={alertas.tipos.includes(t)} className="mt-0.5 h-4 w-4" />{TIPOS_ALERTA[t]}
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="sm:max-w-sm">
                <label className="label">Frequência</label>
                <select name="frequencia" defaultValue={alertas.frequencia} className="field">
                  {Object.entries(FREQUENCIAS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button className="btn-primary">Guardar alertas</button>
                <span className="text-xs text-slate-500">Último envio: {alertas.ultimo ? dataHoraPt(alertas.ultimo) : "nunca"}</span>
              </div>
            </form>
            <form action={enviarAlertasAgora} className="mt-3 border-t border-slate-100 pt-3">
              <button disabled={!smtp || !alertas.emails.length} className="btn-ghost px-3 py-1.5 text-xs">Enviar agora (para testar)</button>
              {!smtp && <span className="ml-2 text-xs text-amber-700">Configure primeiro o servidor de email (abaixo).</span>}
            </form>
          </Seccao>
        )}

        {admin && (
          <Seccao id="email" titulo="Servidor de email" desc="Necessário para enviar alertas e o pacote da contabilidade por email. Com Gmail: servidor smtp.gmail.com, porta 465 e uma «palavra-passe de aplicação» (Conta Google → Segurança).">
            <p className={`mb-4 rounded-lg p-3 text-sm ${smtp ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}>
              {smtp ? `Configurado${viaAmbiente ? " na Vercel (variáveis SMTP_*): as alterações aqui só valem se essas variáveis forem removidas" : ""}. Envia como ${smtp.from} através de ${smtp.host}.` : "Ainda não configurado: não é possível enviar emails."}
            </p>
            <form action={guardarServidorEmail} className="grid gap-3 sm:grid-cols-6">
              <div className="sm:col-span-4"><label className="label">Servidor (SMTP)</label><input name="host" defaultValue={host ?? ""} placeholder="smtp.gmail.com" required className="field" /></div>
              <div className="sm:col-span-2"><label className="label">Porta</label><input name="porta" type="number" defaultValue={porta ?? "465"} className="field" /></div>
              <div className="sm:col-span-3"><label className="label">Utilizador</label><input name="user" defaultValue={smtpUser ?? ""} placeholder="conta@gmail.com" autoComplete="off" className="field" /></div>
              <div className="sm:col-span-3"><label className="label">Palavra-passe</label>
                <input name="pass" type="password" placeholder={pass ? "(guardada — escreva só para mudar)" : ""} autoComplete="new-password" className="field" /></div>
              <div className="sm:col-span-6"><label className="label">Remetente</label><input name="from" defaultValue={from ?? ""} placeholder="GESTAO APP <conta@gmail.com>" required className="field" /></div>
              <div className="sm:col-span-6"><button className="btn-primary">Guardar servidor</button></div>
            </form>
            <form action={testarEmail} className="mt-3 border-t border-slate-100 pt-3">
              <button disabled={!smtp} className="btn-ghost px-3 py-1.5 text-xs">Enviar email de teste</button>
            </form>
          </Seccao>
        )}

        {admin && (
          <Seccao id="contabilidade" titulo="Contabilidade" desc="Para onde vai o pacote mensal de faturas (página Envio à contabilidade).">
            <form action={guardarEmailContabilidade} className="flex flex-col gap-2 sm:flex-row">
              <input name="emails" defaultValue={emailConta ?? ""} placeholder="email da contabilista" className="field" />
              <button className="btn-primary shrink-0">Guardar</button>
            </form>
          </Seccao>
        )}
      </div>
    </div>
  );
}
