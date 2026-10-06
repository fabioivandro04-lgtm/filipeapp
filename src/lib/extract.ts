import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { CATEGORIAS } from "./db";

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
  duvidas: texto.describe("O que está ilegível ou incerto"),
});
export type FaturaExtraida = z.infer<typeof Fatura>;

const PROMPT = `Lê esta fatura portuguesa e extrai os dados. Categorias: energia (eletricidade/gás), agua, contabilidade (serviços de contabilidade, impostos, seguros), predio (obras, condomínio, manutenção de prédios), maquinas (peças, pneus, filtros, combustível de máquinas), outros. Não inventes valores: usa null quando não estiver legível ou visível (a foto pode estar cortada) e descreve o problema em "duvidas". A "data" é a data de EMISSÃO da fatura, nunca a data limite de pagamento, o período de consumo nem a data de hoje.`;

const FORMATO_JSON = `Responde APENAS com um objeto JSON (sem texto antes ou depois, sem markdown) com estas chaves:
{"fornecedor": string|null, "nif_fornecedor": string|null (9 dígitos, do emitente), "nif_cliente": string|null (9 dígitos, do cliente a quem a fatura é emitida), "numero": string|null (nº da fatura), "data": "YYYY-MM-DD"|null, "total": number|null (valor total com IVA, ponto decimal), "iva": number|null (valor do IVA), "categoria": "${CATEGORIAS.join('"|"')}", "identificador": string|null (nº de contador, CPE/CUI ou código de cliente), "morada_servico": string|null, "numero_interno_maquina": string|null, "itens": [{"descricao": string, "quantidade": number|null, "preco_unitario": number|null, "total": number|null}], "duvidas": string|null}`;

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

/** Modelos pela ordem de preferência (o OpenRouter experimenta o seguinte se um falhar). Por omissão, só gratuitos com visão. */
const MODELOS_PADRAO = "google/gemma-4-31b-it:free,google/gemma-4-26b-a4b-it:free,dots-studio/dots-3-note-preview:free";
const modelosOpenRouter = (forte = false) => ((forte && process.env.AI_MODEL_FORTE) || process.env.AI_MODEL || MODELOS_PADRAO).split(",").map((m) => m.trim()).filter(Boolean).slice(0, 3);

/** Primeiro objeto JSON do texto (os modelos às vezes rodeiam-no de ```json ... ```). */
function jsonDoTexto(t: string): unknown {
  const limpo = t.replace(/```(?:json)?/gi, "");
  const ini = limpo.indexOf("{");
  const fim = limpo.lastIndexOf("}");
  if (ini < 0 || fim <= ini) throw new Error("A IA não devolveu dados legíveis.");
  return JSON.parse(limpo.slice(ini, fim + 1));
}

async function viaOpenRouter(paginas: Pagina[], forte: boolean): Promise<FaturaExtraida> {
  const conteudo: unknown[] = paginas.map((p) =>
    p.mime === "application/pdf"
      ? { type: "file", file: { filename: "fatura.pdf", file_data: `data:application/pdf;base64,${p.bytes.toString("base64")}` } }
      : { type: "image_url", image_url: { url: `data:${p.mime};base64,${p.bytes.toString("base64")}` } },
  );
  conteudo.push({ type: "text", text: `${PROMPT}\n\n${FORMATO_JSON}` });
  const modelos = modelosOpenRouter(forte);
  const res = await fetch(`${process.env.AI_BASE_URL || "https://openrouter.ai/api/v1"}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "X-Title": "GESTAO APP",
    },
    body: JSON.stringify({
      model: modelos[0],
      ...(modelos.length > 1 ? { models: modelos } : {}),
      messages: [{ role: "user", content: conteudo }],
      response_format: { type: "json_object" },
      temperature: 0,
      max_tokens: 4000,
    }),
    signal: AbortSignal.timeout(50_000),
  });
  // O OpenRouter pode devolver 200 com o erro dentro do corpo (ou só espaços e depois o JSON): lê-se como texto
  const bruto = await res.text().catch(() => "");
  let corpo: { choices?: { message?: { content?: string | null } }[]; error?: { message?: string; code?: number | string; metadata?: { raw?: string; provider_name?: string } } } | null = null;
  try { corpo = JSON.parse(bruto.trim()); } catch { /* corpo inválido: tratado abaixo */ }
  if (!res.ok || !corpo?.choices?.length) {
    const e = corpo?.error;
    const motivo = [e?.message, e?.metadata?.provider_name, typeof e?.metadata?.raw === "string" ? e.metadata.raw : null].filter(Boolean).join(" · ")
      || bruto.trim().slice(0, 120) || "resposta vazia";
    if (res.status === 429 || e?.code === 429) throw new Error("Os modelos gratuitos da IA estão sobrecarregados (limite de pedidos). Use «Ler outra vez» daqui a pouco.");
    throw new Error(`A IA não respondeu (${res.status}: ${motivo.slice(0, 160)}). Use «Ler outra vez» ou preencha à mão.`);
  }
  const t = corpo.choices[0].message?.content;
  if (!t) throw new Error("A IA não devolveu dados. Use «Ler outra vez» ou preencha à mão.");
  const r = Fatura.safeParse(jsonDoTexto(t));
  if (!r.success) throw new Error("A IA devolveu dados num formato inesperado.");
  return r.data;
}

async function viaAnthropic(paginas: Pagina[]): Promise<FaturaExtraida> {
  const client = new Anthropic();
  const fontes = paginas.map((p) => {
    const b64 = p.bytes.toString("base64");
    return p.mime === "application/pdf"
      ? ({ type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } } as const)
      : ({ type: "image", source: { type: "base64", media_type: p.mime as "image/jpeg" | "image/png" | "image/webp" | "image/gif", data: b64 } } as const);
  });
  const res = await client.messages.parse({
    model: "claude-opus-5-5",
    max_tokens: 16000,
    output_config: { effort: "medium", format: zodOutputFormat(Fatura) },
    messages: [{ role: "user", content: [...fontes, { type: "text", text: PROMPT }] }],
  });
  if (res.stop_reason === "refusal" || !res.parsed_output) throw new Error("Não foi possível ler a fatura.");
  return res.parsed_output;
}

/** Há um modelo mais forte configurado (AI_MODEL_FORTE) para uma segunda leitura quando a primeira não passa nas validações. */
export const temModeloForte = () => fornecedor() === "openrouter" && Boolean(process.env.AI_MODEL_FORTE);

/** Lê uma fatura (um PDF, ou uma ou mais fotos) com o fornecedor de IA configurado. `forte`: usa AI_MODEL_FORTE. */
export async function extrairFatura(paginas: Pagina[], forte = false): Promise<FaturaExtraida> {
  return fornecedor() === "anthropic" ? viaAnthropic(paginas) : viaOpenRouter(paginas, forte);
}
