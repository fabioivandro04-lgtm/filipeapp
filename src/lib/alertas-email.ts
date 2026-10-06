import { query, queryOne } from "./db";
import { guardarConfig, lerConfig } from "./config";
import { enviarEmail, lerSmtp, listaEmails } from "./email";
import { DIAS_AVISO, ROTULO_DOCUMENTO, textoPrazo, type TipoDocumento } from "./prazos";
import { dataPt, money } from "./format";

// Alertas por email: o que vai, para quem e com que frequência (guardado em Definições)
export const TIPOS_ALERTA = {
  prazos: "Prazos (seguros, inspeções, IUC…) caducados ou a caducar",
  faturas: "Faturas para rever (possíveis duplicados, valores fora do normal)",
  aprovacoes: "Alterações à espera de aprovação",
} as const;
export type TipoAlerta = keyof typeof TIPOS_ALERTA;
export const FREQUENCIAS = { diario: "Todos os dias (só quando há alertas)", semanal: "Uma vez por semana (segunda-feira)", desligado: "Desligado" } as const;
export type Frequencia = keyof typeof FREQUENCIAS;

export type DefinicoesAlertas = { emails: string[]; tipos: TipoAlerta[]; frequencia: Frequencia; ultimo: string | null };

export async function lerDefinicoesAlertas(): Promise<DefinicoesAlertas> {
  const [emails, tipos, freq, ultimo] = await Promise.all(["alertas_emails", "alertas_tipos", "alertas_frequencia", "alertas_ultimo"].map(lerConfig));
  const validos = (tipos ?? Object.keys(TIPOS_ALERTA).join(",")).split(",").filter((t): t is TipoAlerta => t in TIPOS_ALERTA);
  return { emails: listaEmails(emails), tipos: validos, frequencia: freq && freq in FREQUENCIAS ? (freq as Frequencia) : "diario", ultimo };
}

export async function guardarDefinicoesAlertas(d: Omit<DefinicoesAlertas, "ultimo">) {
  await guardarConfig("alertas_emails", d.emails.join(", "));
  await guardarConfig("alertas_tipos", d.tipos.join(","));
  await guardarConfig("alertas_frequencia", d.frequencia);
}

type Seccao = { titulo: string; linhas: string[] };

/** O conteúdo do email: só as secções escolhidas que têm alguma coisa. */
export async function montarAlertas(tipos: TipoAlerta[]): Promise<Seccao[]> {
  const s: Seccao[] = [];
  if (tipos.includes("prazos")) {
    const limite = new Date(Date.now() + DIAS_AVISO * 86400000).toISOString().slice(0, 10);
    const docs = await query<{ tipo: string; descricao: string | null; validade: string; numero: string | null; empresa: string | null }>(
      `SELECT d.tipo, d.descricao, d.validade, m.numero_interno AS numero, COALESCE(e.nome, em.nome) AS empresa
       FROM documentos d LEFT JOIN maquinas m ON m.id = d.maquina_id LEFT JOIN empresas e ON e.id = d.empresa_id LEFT JOIN empresas em ON em.id = m.empresa_id
       WHERE d.apagado_em IS NULL AND d.validade <= ? AND (d.maquina_id IS NULL OR (m.apagada_em IS NULL AND m.estado NOT IN ('vendido','abatido')))
       ORDER BY d.validade LIMIT 50`, [limite]);
    if (docs.length) s.push({ titulo: `Prazos (${docs.length})`, linhas: docs.map((d) =>
      `${ROTULO_DOCUMENTO[d.tipo as TipoDocumento] ?? d.tipo}${d.numero ? ` · ${d.numero}` : ""}${d.descricao ? ` · ${d.descricao}` : ""}${d.empresa ? ` (${d.empresa})` : ""}: válido até ${dataPt(d.validade)}, ${textoPrazo(d.validade)}`) });
  }
  if (tipos.includes("faturas")) {
    const f = await query<{ fornecedor: string | null; numero: string | null; total: number | null; alerta: string | null }>(
      "SELECT fornecedor, numero, total, alerta FROM faturas WHERE apagada_em IS NULL AND revisada = 0 AND (alerta IS NOT NULL OR leitura IN ('ia','falhou')) ORDER BY id DESC LIMIT 30");
    if (f.length) s.push({ titulo: `Faturas para rever (${f.length}${f.length === 30 ? "+" : ""})`, linhas: f.map((x) =>
      `${x.fornecedor ?? "Sem fornecedor"}${x.numero ? ` ${x.numero}` : ""} · ${money(x.total)}: ${x.alerta ?? "dados lidos por IA, confirmar."}`) });
  }
  if (tipos.includes("aprovacoes")) {
    const n = (await queryOne<{ n: number }>("SELECT COUNT(*)::int AS n FROM propostas WHERE estado = 'pendente'"))?.n ?? 0;
    if (n) s.push({ titulo: `Aprovações (${n})`, linhas: [`${n} alteração(ões) feitas por contabilistas à espera de um administrador.`] });
  }
  return s;
}

/** Endereço da app para pôr no email (na Vercel vem do ambiente). */
export const enderecoApp = () => process.env.APP_URL ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : null);

export type ResultadoEnvio = { enviado: boolean; motivo: string };

/**
 * Envia o email de alertas. `automatico` = chamado pela tarefa diária: respeita a frequência e não envia se não houver nada.
 * Sem `automatico` (botão «Enviar agora») envia sempre, mesmo vazio, para testar.
 */
export async function enviarAlertas({ automatico }: { automatico: boolean }): Promise<ResultadoEnvio> {
  const d = await lerDefinicoesAlertas();
  if (!d.emails.length) return { enviado: false, motivo: "Não há destinatários configurados." };
  if (!(await lerSmtp())) return { enviado: false, motivo: "O servidor de email não está configurado." };
  if (automatico) {
    if (d.frequencia === "desligado") return { enviado: false, motivo: "Alertas desligados." };
    const diaLisboa = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Lisbon", weekday: "short" }).format(new Date());
    if (d.frequencia === "semanal" && diaLisboa !== "Mon") return { enviado: false, motivo: "Envio semanal: só à segunda-feira." };
  }
  const seccoes = await montarAlertas(d.tipos);
  if (automatico && !seccoes.length) return { enviado: false, motivo: "Não há alertas." };
  const url = enderecoApp();
  const texto = [
    seccoes.length ? "Há assuntos que precisam da sua atenção na GESTAO APP:" : "Tudo em dia: não há alertas neste momento. (Email de teste.)",
    ...seccoes.map((s) => `\n${s.titulo}\n${s.linhas.map((l) => `  - ${l}`).join("\n")}`),
    url ? `\nAbrir a app: ${url}/alertas` : "",
    "\n—\nEnviado automaticamente pela GESTAO APP. Para mudar quem recebe ou o que recebe: Definições → Alertas por email.",
  ].join("\n");
  const total = seccoes.reduce((n, s) => n + s.linhas.length, 0);
  await enviarEmail({ para: d.emails, assunto: seccoes.length ? `GESTAO APP: ${total} alerta(s)` : "GESTAO APP: sem alertas (teste)", texto });
  await guardarConfig("alertas_ultimo", new Date().toISOString().slice(0, 19).replace("T", " "));
  return { enviado: true, motivo: `Enviado para ${d.emails.join(", ")}.` };
}
