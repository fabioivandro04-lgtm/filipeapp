import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { CATEGORIAS } from "./db";
import { idAnthropic, modelosDaTarefa } from "./modelos-ia";

/** Aceita número ou texto («1 234,56»); o resto vira null. Os modelos gratuitos nem sempre respeitam o tipo pedido. */
const numero = z.preprocess((v) => {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const n = Number(String(v).replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}, z.number().nullable());
const texto = z.preprocess((v) => (v == null || String(v).trim() === "" ? null : String(v).trim()), z.string().nullable());

const Fatura = z.object({
  fornecedor: texto,
  nif_fornecedor: texto,
  nif_cliente: texto.describe("NIF do cliente (a quem a fatura é emitida), 9 dígitos"),
  numero: texto,
  data: texto.describe("YYYY-MM-DD"),
  total: numero,
  iva: numero,
  categoria: z.enum(CATEGORIAS).catch("outros"),
  identificador: texto.describe("Nº de contador, CPE/CUI ou código de cliente/instalação, se existir"),
  morada_servico: texto,
  numero_interno_maquina: texto.describe("Nº interno de máquina escrito à mão ou impresso, se existir"),
  itens: z
    .array(z.object({ descricao: texto.transform((t) => t ?? ""), quantidade: numero, preco_unitario: numero, total: numero }))
    .catch([]),
  nota_credito: z.preprocess((v) => v === true || v === "true", z.boolean()).catch(false).describe("true se o documento for uma nota de crédito"),
  duvidas: texto.describe("O que está ilegível ou incerto"),
});
export type FaturaExtraida = z.infer<typeof Fatura>;

const PROMPT = `Lê esta fatura portuguesa e extrai os dados. Categorias: energia (eletricidade/gás), agua, combustivel (gasóleo, gasolina, AdBlue, de viaturas ou máquinas), maquinas (peças, pneus, filtros, óleos, reparações e oficina de máquinas ou viaturas), predio (obras, condomínio, manutenção de prédios), rendas (rendas e alugueres de espaços ou equipamentos), seguros (apólices e prémios de seguro), transportes (fretes, transportes, portagens, envios), comunicacoes (telefone, telemóvel, internet), contabilidade (serviços de contabilidade, impostos, taxas), outros. Não inventes valores: usa null quando não estiver legível ou visível (a foto pode estar cortada) e descreve o problema em "duvidas". A "data" é a data de EMISSÃO da fatura, nunca a data limite de pagamento, o período de consumo nem a data de hoje.`;

const FORMATO_JSON = `Responde APENAS com um objeto JSON (sem texto antes ou depois, sem markdown) com estas chaves:
{"fornecedor": string|null, "nif_fornecedor": string|null (9 dígitos, do emitente), "nif_cliente": string|null (9 dígitos, do cliente a quem a fatura é emitida), "numero": string|null (nº da fatura), "data": "YYYY-MM-DD"|null, "total": number|null (valor total com IVA, ponto decimal), "iva": number|null (valor do IVA), "categoria": "${CATEGORIAS.join('"|"')}", "identificador": string|null (nº de contador, CPE/CUI ou código de cliente), "morada_servico": string|null, "numero_interno_maquina": string|null, "itens": [{"descricao": string, "quantidade": number|null, "preco_unitario": number|null, "total": number|null}], "nota_credito": boolean (true só se o documento for uma NOTA DE CRÉDITO), "duvidas": string|null}`;

export type Pagina = { bytes: Buffer; mime: string };

type Fornecedor = "openrouter" | "anthropic" | null;
function fornecedor(): Fornecedor {
  const f = process.env.AI_PROVIDER;
  if (f === "openrouter" && process.env.OPENROUTER_API_KEY) return "openrouter";
  if (f === "anthropic" && process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.OPENROUTER_API_KEY) return "openrouter";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  return null;
}
export const extracaoDisponivel = () => fornecedor() !== null;
export const nomeFornecedorIa = () => fornecedor();


/** Primeiro objeto JSON do texto (os modelos às vezes rodeiam-no de ```json ... ``` ou cortam-no a meio). */
function jsonDoTexto(t: string): unknown {
  const limpo = t.replace(/```(?:json)?/gi, "");
  const ini = limpo.indexOf("{");
  if (ini < 0) throw new Error("A IA não devolveu dados legíveis.");
  const fim = limpo.lastIndexOf("}");
  if (fim > ini) {
    try { return JSON.parse(limpo.slice(ini, fim + 1)); } catch { /* tenta fechar abaixo */ }
  }
  return JSON.parse(fecharJson(limpo.slice(ini)));
}

/** Fecha um JSON cortado a meio (resposta truncada): corta o último valor incompleto e fecha aspas, listas e objetos. */
function fecharJson(s: string): string {
  const pilha: string[] = [];
  let emTexto = false, escape = false, ultimoSeguro = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (emTexto) {
      if (escape) escape = false;
      else if (c === "\\") escape = true;
      else if (c === '"') emTexto = false;
      continue;
    }
    if (c === '"') emTexto = true;
    else if (c === "{" || c === "[") pilha.push(c === "{" ? "}" : "]");
    else if (c === "}" || c === "]") { pilha.pop(); ultimoSeguro = i + 1; if (!pilha.length) return s.slice(0, i + 1); }
    else if (c === ",") ultimoSeguro = i;
  }
  // Volta ao último ponto seguro (fim de um valor completo) e fecha o que ficou aberto
  const base = s.slice(0, ultimoSeguro);
  const abertos: string[] = [];
  emTexto = false; escape = false;
  for (const c of base) {
    if (emTexto) { if (escape) escape = false; else if (c === "\\") escape = true; else if (c === '"') emTexto = false; continue; }
    if (c === '"') emTexto = true;
    else if (c === "{" || c === "[") abertos.push(c === "{" ? "}" : "]");
    else if (c === "}" || c === "]") abertos.pop();
  }
  return base.replace(/[,:\s]+$/, "") + abertos.reverse().join("");
}

/** Erro de uma tentativa com um modelo; `outro`: vale a pena experimentar o modelo seguinte. */
class FalhaIa extends Error {
  constructor(message: string, readonly outro = true, readonly limite = false) { super(message); }
}

type RespostaOpenRouter = {
  choices?: { finish_reason?: string | null; message?: { content?: string | null }; error?: { message?: string; code?: number | string } }[];
  error?: { message?: string; code?: number | string; metadata?: { raw?: unknown; provider_name?: string } };
};

const motivoDe = (e: { message?: string; metadata?: { raw?: unknown; provider_name?: string } } | undefined) =>
  [e?.message, e?.metadata?.provider_name, typeof e?.metadata?.raw === "string" ? e.metadata.raw : null].filter(Boolean).join(" · ").slice(0, 160);

/** Um pedido ao OpenRouter com um só modelo. */
async function pedidoOpenRouter(modelo: string, conteudo: unknown[], tempoMs: number): Promise<FaturaExtraida> {
  let res: Response, bruto: string;
  try {
    res = await fetch(`${process.env.AI_BASE_URL || "https://openrouter.ai/api/v1"}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "X-Title": "GESTAO APP",
      },
      body: JSON.stringify({
        model: modelo,
        messages: [{ role: "user", content: conteudo }],
        response_format: { type: "json_object" },
        temperature: 0,
        max_tokens: 8000,
      }),
      signal: AbortSignal.timeout(tempoMs),
    });
    // O OpenRouter responde logo 200 e vai mandando espaços enquanto o modelo pensa; o JSON (ou o erro) só chega no fim.
    // Por isso o tempo limite e as falhas do modelo podem aparecer aqui, já depois do 200.
    bruto = await res.text();
  } catch (e) {
    const nome = (e as Error).name;
    if (nome === "TimeoutError" || nome === "AbortError") throw new FalhaIa(`${modelo} demorou mais de ${Math.round(tempoMs / 1000)} s`);
    throw new FalhaIa(`${modelo}: ligação interrompida`);
  }
  let corpo: RespostaOpenRouter | null = null;
  try { corpo = JSON.parse(bruto.trim()); } catch { /* corpo inválido: tratado abaixo */ }
  const e = corpo?.error;
  if (res.status === 429 || e?.code === 429) throw new FalhaIa(`${modelo}: limite de pedidos`, true, true);
  if (res.status === 401 || res.status === 402 || res.status === 403 || e?.code === 401 || e?.code === 402)
    throw new FalhaIa(`chave do OpenRouter recusada ou sem saldo (${motivoDe(e) || res.status})`, false);
  if (!res.ok || e || !corpo?.choices?.length) throw new FalhaIa(`${modelo}: ${motivoDe(e) || bruto.trim().slice(0, 120) || "resposta vazia"}`);
  const escolha = corpo.choices[0];
  if (escolha.error) throw new FalhaIa(`${modelo}: ${escolha.error.message ?? "erro do modelo"}`);
  const t = escolha.message?.content;
  if (!t?.trim()) throw new FalhaIa(`${modelo}: resposta sem dados`);
  let json: unknown;
  try { json = jsonDoTexto(t); } catch { throw new FalhaIa(`${modelo}: resposta sem JSON válido`); }
  const r = Fatura.safeParse(json);
  if (!r.success) throw new FalhaIa(`${modelo}: dados num formato inesperado`);
  return r.data;
}

/** Tempo máximo de uma leitura (todas as tentativas), abaixo do maxDuration das páginas (300 s). */
export const TEMPO_LEITURA_MS = 240_000;

async function viaOpenRouter(paginas: Pagina[], modelos: string[], ate: number): Promise<FaturaExtraida> {
  const conteudo: unknown[] = paginas.map((p) =>
    p.mime === "application/pdf"
      ? { type: "file", file: { filename: "fatura.pdf", file_data: `data:application/pdf;base64,${p.bytes.toString("base64")}` } }
      : { type: "image_url", image_url: { url: `data:${p.mime};base64,${p.bytes.toString("base64")}` } },
  );
  conteudo.push({ type: "text", text: `${PROMPT}\n\n${FORMATO_JSON}` });
  // Um modelo de cada vez: o «models» do OpenRouter só passa ao seguinte se o erro vier antes do 200,
  // e com os gratuitos o erro costuma vir depois (dentro do corpo), o que dava «A IA não respondeu (200: …)».
  const falhas: FalhaIa[] = [];
  for (const [i, modelo] of modelos.entries()) {
    const resta = ate - Date.now();
    if (resta < 15_000) break;
    // Reparte o tempo que falta pelos modelos que faltam, mas dá pelo menos 60 s (ou o que restar) a cada um
    const tempo = Math.min(resta, Math.max(60_000, resta / (modelos.length - i)));
    try {
      return await pedidoOpenRouter(modelo, conteudo, tempo);
    } catch (e) {
      const f = e instanceof FalhaIa ? e : new FalhaIa(`${modelo}: ${(e as Error).message}`);
      falhas.push(f);
      if (!f.outro) break;
    }
  }
  if (falhas.length && falhas.every((f) => f.limite))
    throw new Error("Os modelos gratuitos da IA estão sobrecarregados (limite de pedidos). Use «Ler outra vez» daqui a pouco.");
  const detalhe = falhas.map((f) => f.message).join("; ") || "sem tempo para tentar";
  throw new Error(`A IA não conseguiu ler a fatura (${detalhe.slice(0, 300)}). Use «Ler outra vez» ou preencha à mão.`);
}

async function viaAnthropic(paginas: Pagina[], modelo: string): Promise<FaturaExtraida> {
  const client = new Anthropic();
  const fontes = paginas.map((p) => {
    const b64 = p.bytes.toString("base64");
    return p.mime === "application/pdf"
      ? ({ type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } } as const)
      : ({ type: "image", source: { type: "base64", media_type: p.mime as "image/jpeg" | "image/png" | "image/webp" | "image/gif", data: b64 } } as const);
  });
  const res = await client.messages.parse({
    model: modelo,
    max_tokens: 16000,
    output_config: { effort: "medium", format: zodOutputFormat(Fatura) },
    messages: [{ role: "user", content: [...fontes, { type: "text", text: PROMPT }] }],
  });
  if (res.stop_reason === "refusal" || !res.parsed_output) throw new Error("Não foi possível ler a fatura.");
  return res.parsed_output;
}

/** Há um modelo para a 2.ª leitura (Definições → Modelos de IA, ou AI_MODEL_FORTE), usada quando a 1.ª não passa nas validações. */
export async function temModeloForte(): Promise<boolean> {
  return fornecedor() !== null && (await modelosDaTarefa("leitura_forte")).modelos.length > 0;
}

/** Lê uma fatura (um PDF, ou uma ou mais fotos) com o modelo escolhido para a tarefa. `forte`: 2.ª leitura; `ate`: hora limite (ms). */
export async function extrairFatura(paginas: Pagina[], forte = false, ate = Date.now() + TEMPO_LEITURA_MS): Promise<FaturaExtraida> {
  const { modelos } = await modelosDaTarefa(forte ? "leitura_forte" : "leitura");
  if (fornecedor() === "anthropic") {
    // Com a chave direta da Anthropic só servem modelos Claude; sem um Claude escolhido, usa o Opus.
    const claude = modelos.map(idAnthropic).find(Boolean);
    return viaAnthropic(paginas, claude ?? "claude-opus-5-5");
  }
  if (!modelos.length) throw new Error("Não há modelo de IA escolhido para esta tarefa (Definições → Modelos de IA).");
  return viaOpenRouter(paginas, modelos, ate);
}
