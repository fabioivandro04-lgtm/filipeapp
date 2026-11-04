import { lerConfig, guardarConfig } from "./config";
import { cifrar, decifrar } from "./segredo";
import { query } from "./db";

/**
 * Ligação ao Moloni (faturação online), uma conta por empresa do grupo.
 * Documentação: https://www.moloni.pt/dev/ — autenticação OAuth (código → access_token de 1 h + refresh_token de 14 dias).
 * Tudo o que diz respeito à conta (incluindo a Client Secret e os tokens) fica cifrado na tabela config,
 * na chave `moloni_conta_<empresa_id>`. A app só cria faturas de fornecedor em RASCUNHO: quem fecha é a contabilista.
 */

const API = () => (process.env.MOLONI_API_URL || "https://api.moloni.pt/v1").replace(/\/$/, "");
const AUTORIZAR = () => process.env.MOLONI_AUTH_URL || "https://www.moloni.pt/ac/root/oauth/";

export const PROGRAMAS = { moloni: "Moloni", wintouch: "WinTouch" } as const;
export type Programa = keyof typeof PROGRAMAS;
export const ePrograma = (v: unknown): v is Programa => typeof v === "string" && v in PROGRAMAS;

export type ContaMoloni = {
  developer_id: string;
  client_secret: string;
  redirect_uri?: string;
  access_token?: string;
  access_expira?: number;   // ms desde 1970
  refresh_token?: string;
  refresh_expira?: number;  // ms desde 1970
  company_id?: number;
  company_nome?: string;
  document_set_id?: number;
  document_set_nome?: string;
  /** categoria da app → artigo do Moloni usado na linha da fatura */
  artigos?: Record<string, { id: number; nome: string }>;
  ligado_em?: string;
};

const chaveConta = (empresaId: number) => `moloni_conta_${empresaId}`;

export async function lerConta(empresaId: number): Promise<ContaMoloni | null> {
  const v = decifrar(await lerConfig(chaveConta(empresaId)));
  if (!v) return null;
  try { return JSON.parse(v) as ContaMoloni; } catch { return null; }
}

export async function guardarConta(empresaId: number, conta: ContaMoloni) {
  await guardarConfig(chaveConta(empresaId), cifrar(JSON.stringify(conta)));
}

export async function apagarConta(empresaId: number) {
  await query("DELETE FROM config WHERE chave = ?", [chaveConta(empresaId)]);
}

/** A ligação está ativa (há refresh_token ainda válido)? */
export const ligada = (c: ContaMoloni | null) => !!c?.refresh_token && (c.refresh_expira ?? 0) > Date.now();

export class ErroMoloni extends Error {}

/** Endereço da página do Moloni onde se autoriza a app. */
export function urlAutorizacao(conta: Pick<ContaMoloni, "developer_id">, redirectUri: string) {
  const u = new URL(AUTORIZAR());
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", conta.developer_id);
  u.searchParams.set("redirect_uri", redirectUri);
  return u.toString();
}

type Tokens = { access_token: string; expires_in: number; refresh_token: string };

async function pedirTokens(params: Record<string, string>): Promise<Tokens> {
  const u = new URL(`${API()}/grant/`);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  let r: Response;
  try {
    r = await fetch(u, { cache: "no-store", signal: AbortSignal.timeout(15000) });
  } catch {
    throw new ErroMoloni("O Moloni não respondeu. Tente outra vez daqui a pouco.");
  }
  const j = (await r.json().catch(() => null)) as (Partial<Tokens> & { error?: string; error_description?: string }) | null;
  if (!r.ok || !j?.access_token || !j.refresh_token) {
    const motivo = j?.error_description || j?.error || `resposta ${r.status}`;
    throw new ErroMoloni(`O Moloni recusou a ligação (${motivo}). Confirme o Developer ID, a Client Secret e a Redirect URI.`);
  }
  return { access_token: j.access_token, refresh_token: j.refresh_token, expires_in: Number(j.expires_in) || 3600 };
}

function aplicarTokens(conta: ContaMoloni, t: Tokens): ContaMoloni {
  return {
    ...conta,
    access_token: t.access_token,
    access_expira: Date.now() + t.expires_in * 1000,
    refresh_token: t.refresh_token,
    refresh_expira: Date.now() + 14 * 24 * 3600 * 1000,
  };
}

/** Troca o código que o Moloni devolve à Redirect URI pelos tokens. */
export async function trocarCodigo(conta: ContaMoloni, code: string, redirectUri: string): Promise<ContaMoloni> {
  const t = await pedirTokens({
    grant_type: "authorization_code", client_id: conta.developer_id, client_secret: conta.client_secret, redirect_uri: redirectUri, code,
  });
  return aplicarTokens({ ...conta, redirect_uri: redirectUri, ligado_em: new Date().toISOString() }, t);
}

/** Renova o acesso com o refresh_token (e com ele também um refresh_token novo, que dura mais 14 dias). */
export async function renovar(empresaId: number, conta: ContaMoloni): Promise<ContaMoloni> {
  if (!ligada(conta)) throw new ErroMoloni("A ligação ao Moloni expirou. Volte a ligar em Definições → Programas de faturação.");
  const t = await pedirTokens({
    grant_type: "refresh_token", client_id: conta.developer_id, client_secret: conta.client_secret, refresh_token: conta.refresh_token!,
  });
  const nova = aplicarTokens(conta, t);
  await guardarConta(empresaId, nova);
  return nova;
}

/** Corpo no formato que o Moloni espera (como os formulários PHP: products[0][product_id]=…). */
export function codificar(dados: Record<string, unknown>): URLSearchParams {
  const p = new URLSearchParams();
  const juntar = (prefixo: string, v: unknown) => {
    if (v === undefined || v === null) return;
    if (Array.isArray(v)) v.forEach((x, i) => juntar(`${prefixo}[${i}]`, x));
    else if (typeof v === "object") for (const [k, x] of Object.entries(v)) juntar(`${prefixo}[${k}]`, x);
    else p.append(prefixo, String(v));
  };
  for (const [k, v] of Object.entries(dados)) juntar(k, v);
  return p;
}

type Erro = { code?: string; field?: string; description?: string };

/** Chama um método da API (p. ex. "supplierInvoices/insert"), renovando o acesso se for preciso. */
export async function chamar<T = unknown>(empresaId: number, metodo: string, dados: Record<string, unknown> = {}): Promise<T> {
  let conta = await lerConta(empresaId);
  if (!conta) throw new ErroMoloni("Esta empresa ainda não está ligada ao Moloni (Definições → Programas de faturação).");
  if (!conta.access_token || (conta.access_expira ?? 0) < Date.now() + 60000) conta = await renovar(empresaId, conta);
  const u = new URL(`${API()}/${metodo.replace(/^\/|\/$/g, "")}/`);
  u.searchParams.set("access_token", conta.access_token!);
  u.searchParams.set("human_errors", "true");
  let r: Response;
  try {
    r = await fetch(u, {
      method: "POST", cache: "no-store", signal: AbortSignal.timeout(20000),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: codificar(dados),
    });
  } catch {
    throw new ErroMoloni("O Moloni não respondeu. Tente outra vez daqui a pouco.");
  }
  const j = (await r.json().catch(() => null)) as unknown;
  const comErro = j as { error?: string; error_description?: string } | null;
  if (comErro && !Array.isArray(comErro) && comErro.error) throw new ErroMoloni(`Moloni: ${comErro.error_description || comErro.error}`);
  if (Array.isArray(j) && j.length && (j as Erro[]).every((e) => e && typeof e === "object" && "description" in e && !("valid" in e))) {
    throw new ErroMoloni(`Moloni: ${(j as Erro[]).map((e) => e.description).filter(Boolean).join("; ")}`);
  }
  if (!r.ok) throw new ErroMoloni(`O Moloni respondeu com erro (${r.status}).`);
  return j as T;
}

// ---------- Leituras para as Definições ----------
export type Empresa = { company_id: number; name: string; vat?: string };
export type SerieDoc = { document_set_id: number; name: string };
export type Artigo = { product_id: number; name: string; reference?: string; categoria: string };

/** Empresas a que a conta tem acesso (normalmente uma). Não leva company_id. */
export const empresasDaConta = (empresaId: number) => chamar<Empresa[]>(empresaId, "companies/getAll");

export async function seriesDocumentos(empresaId: number, companyId: number) {
  return (await chamar<SerieDoc[]>(empresaId, "documentSets/getAll", { company_id: companyId })) ?? [];
}

/** Artigos da conta, agrupados pelas categorias que já existem no Moloni. Limitado para não demorar demasiado. */
export async function artigosDaConta(empresaId: number, companyId: number): Promise<Artigo[]> {
  type Cat = { category_id: number; name: string; num_categories?: number };
  const categorias: Cat[] = [];
  const porVer: { parent: number; prefixo: string }[] = [{ parent: 0, prefixo: "" }];
  while (porVer.length && categorias.length < 40) {
    const { parent, prefixo } = porVer.shift()!;
    const filhas = (await chamar<Cat[]>(empresaId, "productCategories/getAll", { company_id: companyId, parent_id: parent })) ?? [];
    for (const c of filhas) {
      const nome = prefixo ? `${prefixo} › ${c.name}` : c.name;
      categorias.push({ ...c, name: nome });
      if (Number(c.num_categories) > 0) porVer.push({ parent: c.category_id, prefixo: nome });
    }
  }
  const artigos: Artigo[] = [];
  for (const c of categorias) {
    for (let offset = 0; offset < 200; offset += 50) {
      const lote = (await chamar<{ product_id: number; name: string; reference?: string }[]>(empresaId, "products/getAll",
        { company_id: companyId, category_id: c.category_id, qty: 50, offset })) ?? [];
      artigos.push(...lote.map((a) => ({ product_id: a.product_id, name: a.name, reference: a.reference, categoria: c.name })));
      if (lote.length < 50) break;
    }
  }
  return artigos;
}

// ---------- Enviar uma fatura ----------
export type FaturaParaMoloni = {
  id: number; fornecedor: string | null; nif_fornecedor: string | null; numero: string | null; data: string | null;
  total: number | null; iva: number | null; categoria: string; tipo_doc: string | null;
};

/** Taxa de IVA da fatura (23, 13, 6 ou 0), a partir do total e do IVA. null se não bater com nenhuma (várias taxas). */
export function taxaIva(total: number, iva: number): number | null {
  const base = total - iva;
  if (base <= 0) return null;
  const taxa = (iva / base) * 100;
  const certa = [23, 22, 16, 13, 12, 9, 6, 5, 4, 0].find((t) => Math.abs(t - taxa) < 0.6);
  return certa ?? null;
}

/** Cria a fatura de fornecedor no Moloni, como RASCUNHO. Devolve o document_id. */
export async function enviarFatura(empresaId: number, f: FaturaParaMoloni): Promise<number> {
  const conta = await lerConta(empresaId);
  if (!conta || !ligada(conta)) throw new ErroMoloni("Esta empresa não está ligada ao Moloni (Definições → Programas de faturação).");
  if (!conta.company_id) throw new ErroMoloni("Falta escolher a empresa do Moloni nas Definições.");
  if (!conta.document_set_id) throw new ErroMoloni("Falta escolher a série de documentos do Moloni nas Definições.");
  const artigo = conta.artigos?.[f.categoria] ?? conta.artigos?.outros;
  if (!artigo) throw new ErroMoloni(`Falta escolher, nas Definições, o artigo do Moloni para a categoria «${f.categoria}».`);
  if (f.tipo_doc === "NC") throw new ErroMoloni("As notas de crédito ainda não são enviadas automaticamente: lance-a à mão no Moloni.");
  if (!f.nif_fornecedor) throw new ErroMoloni("A fatura não tem o NIF do fornecedor.");
  if (!f.data) throw new ErroMoloni("A fatura não tem data.");
  if (f.total == null || f.iva == null) throw new ErroMoloni("A fatura tem de ter o total e o IVA preenchidos.");
  const taxa = taxaIva(f.total, f.iva);
  if (taxa === null) throw new ErroMoloni("O IVA não corresponde a uma só taxa (23%, 13%, 6%…). Faturas com várias taxas têm de ser lançadas à mão.");
  if (taxa === 0) throw new ErroMoloni("Fatura sem IVA: o Moloni pede o motivo de isenção, por isso lance-a à mão.");

  const company_id = conta.company_id;
  const nif = f.nif_fornecedor.replace(/\D/g, "");
  const fornecedores = (await chamar<{ supplier_id: number; name: string }[]>(empresaId, "suppliers/getByVat", { company_id, vat: nif })) ?? [];
  if (!fornecedores.length) throw new ErroMoloni(`O fornecedor ${f.fornecedor ?? ""} (NIF ${nif}) não existe no Moloni. Crie-o lá primeiro e envie outra vez.`);
  const impostos = (await chamar<{ tax_id: number; value: number | string; name: string; type?: number | string }[]>(empresaId, "taxes/getAll", { company_id })) ?? [];
  const imposto = impostos.find((t) => Number(t.value) === taxa && (t.type === undefined || Number(t.type) === 1));
  if (!imposto) throw new ErroMoloni(`Não encontrei a taxa de IVA de ${taxa}% nos impostos do Moloni.`);

  const base = Math.round((f.total - f.iva) * 100) / 100;
  const r = await chamar<{ valid?: number; document_id?: number }>(empresaId, "supplierInvoices/insert", {
    company_id,
    date: f.data,
    expiration_date: f.data,
    document_set_id: conta.document_set_id,
    supplier_id: fornecedores[0].supplier_id,
    your_reference: f.numero ?? "",
    products: [{
      product_id: artigo.id,
      name: artigo.nome,
      summary: [f.fornecedor, f.numero].filter(Boolean).join(" · "),
      qty: 1,
      price: base,
      taxes: [{ tax_id: imposto.tax_id }],
    }],
    notes: `Enviada pela GESTAO APP (fatura n.º ${f.id} na app).`,
    status: 0,
  });
  if (!r || Number(r.valid) !== 1 || !r.document_id) throw new ErroMoloni("O Moloni não confirmou a criação da fatura.");
  return Number(r.document_id);
}

/** Chamado pelo cron diário: renova todas as ligações, para o refresh_token (14 dias) nunca chegar a expirar. */
export async function renovarTodas(): Promise<{ renovadas: number; falhas: string[] }> {
  const linhas = await query<{ chave: string }>("SELECT chave FROM config WHERE chave LIKE 'moloni_conta_%'");
  let renovadas = 0;
  const falhas: string[] = [];
  for (const { chave } of linhas) {
    const empresaId = Number(chave.slice("moloni_conta_".length));
    const conta = await lerConta(empresaId);
    if (!conta?.refresh_token) continue;
    try { await renovar(empresaId, conta); renovadas++; } catch (e) { falhas.push(`${empresaId}: ${(e as Error).message}`); }
  }
  return { renovadas, falhas };
}
