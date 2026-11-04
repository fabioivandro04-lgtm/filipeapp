import { requireUser } from "@/lib/auth";
import { lerConfig } from "@/lib/config";
import { lerSmtp } from "@/lib/email";
import { FREQUENCIAS, TIPOS_ALERTA, lerDefinicoesAlertas, type TipoAlerta } from "@/lib/alertas-email";
import { dataHoraPt } from "@/lib/format";
import { enviarAlertasAgora, guardarAlertasEmail, guardarEmailContabilidade, guardarModelosIa, guardarPerfil, guardarProgramasFaturacao, guardarServidorEmail, testarEmail } from "@/app/actions";
import { todasEmpresas } from "@/lib/queries";
import { lerConta, ligada, PROGRAMAS, type ContaMoloni } from "@/lib/moloni";
import FormSenha from "@/components/FormSenha";
import SeletorModelo from "@/components/SeletorModelo";
import { nomeFornecedorIa } from "@/lib/extract";
import { LISTA_TAREFAS, MODELOS_SUGERIDOS, TAREFAS_IA, modelosDaTarefa, nomeModelo, type OrigemModelo } from "@/lib/modelos-ia";
import MenuDefinicoes from "@/components/MenuDefinicoes";
import InstalarApp from "@/components/InstalarApp";
import { PageHeader } from "@/components/Ui";
import Icone from "@/components/Icone";
import Link from "next/link";

const CARGO: Record<string, string> = { admin: "Administrador (faz tudo)", operador: "Operador (carrega e edita)", contabilista: "Contabilista (propõe edições; o admin aceita)" };

const ORIGEM: Record<OrigemModelo, string> = { definicoes: "escolhido aqui", vercel: "da Vercel", padrao: "predefinição", desligado: "desligada aqui" };

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
  const ia = admin
    ? await Promise.all(LISTA_TAREFAS.map(async (t) => ({ t, guardado: (await lerConfig(`ia_modelo_${t}`)) ?? "", ...(await modelosDaTarefa(t)) })))
    : [];
  const empresas = admin ? await todasEmpresas() : [];
  const contasMoloni = new Map<number, ContaMoloni | null>(admin ? await Promise.all(empresas.filter((e) => e.faturacao === "moloni").map(async (e) => [e.id, await lerConta(e.id)] as const)) : []);
  const fornecedorIa = nomeFornecedorIa();
  const viaAmbiente = smtp?.origem === "ambiente";
  const abas = [
    { id: "perfil", nome: "Perfil" }, { id: "seguranca", nome: "Palavra-passe" }, { id: "app", nome: "App no telemóvel", soNoBrowser: true },
    ...(admin ? [{ id: "alertas", nome: "Alertas por email" }, { id: "email", nome: "Servidor de email" }, { id: "contabilidade", nome: "Contabilidade" }, { id: "faturacao", nome: "Programas de faturação" }, { id: "modelos-ia", nome: "Modelos de IA" }, { id: "dados", nome: "Histórico, apagados e cópias" }] : []),
  ];

  return (
    <div>
      <PageHeader titulo="Definições" subtitulo={admin ? "O seu perfil e as definições da app." : "O seu perfil e a sua palavra-passe."} />
      {sp.ok && <p className="mb-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{sp.ok}</p>}
      {sp.erro && <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{sp.erro}</p>}

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_14rem] lg:gap-8">
      <MenuDefinicoes abas={abas} />
      <div className="space-y-6 lg:order-first">
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

        <InstalarApp id="app" />

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

        {admin && (
          <Seccao id="faturacao" titulo="Programas de faturação" desc="Para onde vão as compras de cada empresa. Em cada fatura aparece este destino já escolhido, e pode ser mudado só para essa fatura.">
            {empresas.length === 0 ? <p className="text-sm text-slate-500">Ainda não há empresas.</p> : (
              <form action={guardarProgramasFaturacao} className="space-y-3">
                <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200">
                  {empresas.map((e) => {
                    const conta = contasMoloni.get(e.id) ?? null;
                    return (
                      <li key={e.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
                        <span className="min-w-0 flex-1 text-sm font-medium">{e.nome}</span>
                        <select name={`faturacao_${e.id}`} defaultValue={e.faturacao ?? ""} className="field sm:w-40">
                          <option value="">Nenhum</option>
                          {Object.entries(PROGRAMAS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                        </select>
                        {e.faturacao === "moloni" && (
                          <Link href={`/definicoes/moloni/${e.id}`} className={`shrink-0 text-xs font-medium hover:underline ${ligada(conta) ? "text-emerald-700" : "text-amber-700"}`}>
                            {ligada(conta) ? "Moloni ligado · opções" : "Ligar ao Moloni"}
                          </Link>
                        )}
                        {e.faturacao === "wintouch" && <span className="shrink-0 text-xs text-slate-500">Marca-se à mão quando é lançada</span>}
                      </li>
                    );
                  })}
                </ul>
                <button className="btn-primary">Guardar programas</button>
              </form>
            )}
          </Seccao>
        )}

        {admin && (
          <Seccao id="modelos-ia" titulo="Modelos de IA" desc="Escolha que modelo faz cada tarefa. A mudança vale logo para as próximas faturas, sem mexer na Vercel. As chaves de acesso continuam guardadas só na Vercel.">
            <p className={`mb-4 rounded-lg p-3 text-sm ${fornecedorIa ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}>
              {fornecedorIa === "openrouter" && "Ligado ao OpenRouter: pode escolher modelos de várias empresas (Claude, Gemini, GPT…)."}
              {fornecedorIa === "anthropic" && "Ligado diretamente à Anthropic: só os modelos Claude funcionam; outro modelo escolhido aqui é trocado pelo Claude Opus 5.5."}
              {!fornecedorIa && "A leitura por IA não está ligada: falta a chave OPENROUTER_API_KEY (ou ANTHROPIC_API_KEY) na Vercel. Pode escolher os modelos na mesma."}
            </p>
            <form action={guardarModelosIa} className="space-y-5">
              {ia.map(({ t, guardado, modelos, origem }) => {
                const tarefa = TAREFAS_IA[t];
                const daVercel = process.env[tarefa.env];
                const padrao = daVercel ? `Predefinição da Vercel (${daVercel.split(",")[0].trim()})` : t === "leitura" ? "Predefinição (modelos gratuitos, só para testes)" : t === "leitura_forte" ? "Predefinição (sem 2.ª leitura)" : "Predefinição (nenhum)";
                return (
                  <div key={t} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:gap-4">
                    <div>
                      <p className="text-sm font-medium">
                        {tarefa.nome}
                        {!tarefa.emUso && <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-normal text-slate-600">ainda não existe na app</span>}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">{tarefa.desc}</p>
                      <p className="mt-1 text-xs text-slate-600">Agora: {modelos.length ? modelos.map(nomeModelo).join(", então ") : "nenhum"} <span className="text-slate-400">({ORIGEM[origem]})</span></p>
                    </div>
                    <SeletorModelo tarefa={t} atual={guardado} opcoes={MODELOS_SUGERIDOS} padrao={padrao} podeDesligar={t === "leitura_forte"} />
                  </div>
                );
              })}
              <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
                <button className="btn-primary">Guardar modelos</button>
                <span className="text-xs text-slate-500">Ao guardar, a app confirma no OpenRouter que o modelo existe e (para faturas) que lê imagens.</span>
              </div>
            </form>
          </Seccao>
        )}

        {admin && (
          <Seccao id="dados" titulo="Dados e registos" desc="O registo de tudo o que foi feito, o que foi apagado e a cópia de segurança dos dados.">
            <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200">
              {[
                { href: "/historico", nome: "Histórico", desc: "Quem fez o quê e quando, com opção de desfazer edições", icon: "historico" },
                { href: "/apagados", nome: "Apagados", desc: "Restaurar faturas, empresas, prédios, máquinas e utilizadores", icon: "apagados" },
                { href: "/copias", nome: "Cópia de segurança", desc: "Descarregar todos os dados e faturas", icon: "copias" },
              ].map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50">
                    <Icone nome={l.icon} className="h-5 w-5 shrink-0 text-slate-400" />
                    <span className="min-w-0 flex-1"><span className="block text-sm font-medium">{l.nome}</span><span className="block text-xs text-slate-500">{l.desc}</span></span>
                    <Icone nome="seta" className="h-4 w-4 -rotate-90 text-slate-400" />
                  </Link>
                </li>
              ))}
            </ul>
          </Seccao>
        )}
      </div>
      </div>
    </div>
  );
}
