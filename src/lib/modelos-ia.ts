import { lerConfig } from "./config";

/**
 * Que modelo de IA faz cada tarefa. O administrador escolhe nas Definições (guardado na tabela config, chave
 * `ia_modelo_<tarefa>`); sem escolha, vale a variável da Vercel (AI_MODEL / AI_MODEL_FORTE) e depois a predefinição.
 * As chaves de API ficam sempre nas variáveis de ambiente, nunca na base de dados.
 */
export const TAREFAS_IA = {
  leitura: {
    nome: "Ler faturas",
    desc: "Lê cada fatura carregada (PDF ou fotos). É a tarefa que mais se usa.",
    env: "AI_MODEL",
    emUso: true,
    imagens: true,
  },
  leitura_forte: {
    nome: "Faturas difíceis (2.ª leitura)",
    desc: "Só entra quando a 1.ª leitura falha as validações (NIF, IVA, totais) ou não lê o fornecedor ou o número.",
    env: "AI_MODEL_FORTE",
    emUso: true,
    imagens: true,
  },
  analises: {
    nome: "Análises",
    desc: "Para os resumos e análises dos gastos, quando existirem na app.",
    env: "AI_MODEL_ANALISES",
    emUso: false,
    imagens: false,
  },
  perguntar: {
    nome: "Perguntar à app",
    desc: "Para responder a perguntas sobre os dados («quanto gastámos em gasóleo este ano?»), quando existir.",
    env: "AI_MODEL_PERGUNTAR",
    emUso: false,
    imagens: false,
  },
} as const;
export type TarefaIa = keyof typeof TAREFAS_IA;
export const LISTA_TAREFAS = Object.keys(TAREFAS_IA) as TarefaIa[];

/** Modelos que aparecem na lista (ids do OpenRouter). Os custos são aproximados, por fatura de 1–2 páginas. */
export const MODELOS_SUGERIDOS: { id: string; nome: string; nota: string }[] = [
  { id: "anthropic/claude-sonnet-5.5", nome: "Claude Sonnet 5.5", nota: "muito bom a ler faturas · ≈1,3 cêntimos por fatura" },
  { id: "anthropic/claude-opus-5.5", nome: "Claude Opus 5.5", nota: "o mais forte, para casos difíceis · ≈3 cêntimos por fatura" },
  { id: "anthropic/claude-haiku-5.5", nome: "Claude Haiku 5.5", nota: "rápido e barato · <1 cêntimo por fatura" },
  { id: "google/gemini-3.8-flash", nome: "Gemini 3.8 Flash", nota: "bom e barato · <1 cêntimo por fatura" },
  { id: "google/gemini-3.5-flash-lite", nome: "Gemini 3.5 Flash Lite", nota: "o mais barato · ≈0,2 cêntimos por fatura" },
  { id: "google/gemma-4-31b-it:free", nome: "Gemma 4 (gratuito)", nota: "só para testes: lento, com limites e pode guardar os pedidos" },
];

/** Por omissão, só gratuitos com visão (servem para testes). */
const PADRAO: Record<TarefaIa, string> = {
  leitura: "google/gemma-4-31b-it:free,google/gemma-4-26b-a4b-it:free,dots-studio/dots-3-note-preview:free",
  leitura_forte: "",
  analises: "",
  perguntar: "",
};

/** Valor guardado que desliga a tarefa (só faz sentido para a 2.ª leitura). */
export const DESLIGADO = "-";

/** Um id do OpenRouter tem a forma «empresa/modelo» (p. ex. anthropic/claude-sonnet-5.5 ou google/gemma-4-31b-it:free). */
export const idValido = (id: string) => /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._:-]*$/i.test(id);

/** Até 3 ids, sem repetidos, pela ordem de preferência. */
export const listaModelos = (texto: string | null | undefined) =>
  [...new Set((texto ?? "").split(/[,\s]+/).map((m) => m.trim()).filter(Boolean))].slice(0, 3);

export type OrigemModelo = "definicoes" | "vercel" | "padrao" | "desligado";

/** Os modelos de uma tarefa e de onde vem a escolha. Lista vazia: a tarefa não tem modelo (p. ex. sem 2.ª leitura). */
export async function modelosDaTarefa(tarefa: TarefaIa): Promise<{ modelos: string[]; origem: OrigemModelo }> {
  let guardado: string | null = null;
  try { guardado = await lerConfig(`ia_modelo_${tarefa}`); } catch { /* sem base de dados: usa a Vercel */ }
  if (guardado === DESLIGADO) return { modelos: [], origem: "desligado" };
  const doGuardado = listaModelos(guardado).filter(idValido);
  if (doGuardado.length) return { modelos: doGuardado, origem: "definicoes" };
  const daVercel = listaModelos(process.env[TAREFAS_IA[tarefa].env]);
  if (daVercel.length) return { modelos: daVercel, origem: "vercel" };
  return { modelos: listaModelos(PADRAO[tarefa]), origem: "padrao" };
}

/** Nome legível de um id (o da lista, se existir). */
export const nomeModelo = (id: string) => MODELOS_SUGERIDOS.find((m) => m.id === id)?.nome ?? id;

/** Id da API direta da Anthropic a partir do id do OpenRouter (anthropic/claude-sonnet-5.5 → claude-sonnet-5-5). */
export function idAnthropic(id: string | undefined): string | null {
  if (!id?.startsWith("anthropic/")) return null;
  return id.slice("anthropic/".length).replace(/\./g, "-");
}

type InfoOpenRouter = { id: string; architecture?: { input_modalities?: string[] } };

/**
 * Confere os ids na lista pública do OpenRouter (não precisa de chave). Devolve o problema encontrado, ou null.
 * Se o OpenRouter não responder, não impede de guardar.
 */
export async function conferirModelos(ids: string[], precisaImagens: boolean): Promise<string | null> {
  let lista: InfoOpenRouter[];
  try {
    const r = await fetch(`${process.env.AI_BASE_URL || "https://openrouter.ai/api/v1"}/models`, { signal: AbortSignal.timeout(6000), cache: "no-store" });
    if (!r.ok) return null;
    lista = ((await r.json()) as { data?: InfoOpenRouter[] }).data ?? [];
  } catch { return null; }
  if (!lista.length) return null;
  for (const id of ids) {
    const m = lista.find((x) => x.id === id);
    if (!m) return `O modelo «${id}» não existe no OpenRouter. Confira o nome em openrouter.ai/models.`;
    const entradas = m.architecture?.input_modalities;
    if (precisaImagens && entradas && !entradas.includes("image")) return `O modelo «${id}» não lê imagens, por isso não serve para ler faturas.`;
  }
  return null;
}
