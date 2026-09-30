import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { CATEGORIAS } from "./db";

const Fatura = z.object({
  fornecedor: z.string().nullable(),
  nif_fornecedor: z.string().nullable(),
  numero: z.string().nullable(),
  data: z.string().nullable().describe("YYYY-MM-DD"),
  total: z.number().nullable(),
  iva: z.number().nullable(),
  categoria: z.enum(CATEGORIAS),
  identificador: z.string().nullable().describe("Nº de contador, CPE/CUI ou código de cliente/instalação, se existir"),
  morada_servico: z.string().nullable(),
  numero_interno_maquina: z.string().nullable().describe("Nº interno de máquina escrito à mão ou impresso, se existir"),
  itens: z.array(
    z.object({
      descricao: z.string(),
      quantidade: z.number().nullable(),
      preco_unitario: z.number().nullable(),
      total: z.number().nullable(),
    }),
  ),
  duvidas: z.string().nullable().describe("O que está ilegível ou incerto"),
});
export type FaturaExtraida = z.infer<typeof Fatura>;

const PROMPT = `Lê esta fatura portuguesa e extrai os dados. Categorias: energia (eletricidade/gás), agua, contabilidade (serviços de contabilidade, impostos, seguros), predio (obras, condomínio, manutenção de prédios), maquinas (peças, pneus, filtros, combustível de máquinas), outros. Não inventes valores: usa null quando não estiver legível e descreve o problema em "duvidas".`;

export const extracaoDisponivel = () => Boolean(process.env.ANTHROPIC_API_KEY);

export async function extrairFatura(bytes: Buffer, mime: string): Promise<FaturaExtraida> {
  const client = new Anthropic();
  const b64 = bytes.toString("base64");
  const fonte =
    mime === "application/pdf"
      ? ({ type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } } as const)
      : ({
          type: "image",
          source: { type: "base64", media_type: mime as "image/jpeg" | "image/png" | "image/webp" | "image/gif", data: b64 },
        } as const);

  const res = await client.messages.parse({
    model: "claude-opus-5-5",
    max_tokens: 16000,
    output_config: { effort: "medium", format: zodOutputFormat(Fatura) },
    messages: [{ role: "user", content: [fonte, { type: "text", text: PROMPT }] }],
  });
  if (res.stop_reason === "refusal" || !res.parsed_output) throw new Error("Não foi possível ler a fatura.");
  return res.parsed_output;
}
