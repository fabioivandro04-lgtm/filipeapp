import ExcelJS from "exceljs";

// ---------------------------------------------------------------------------------------------
// Leitura dos ficheiros de stock (Excel) e plano de importação.
// Folhas típicas: STOCK, VENDIDO, ABATE. O cabeçalho não está na 1ª linha e as colunas mudam
// ligeiramente de folha para folha, por isso procura-se pelo NOME das colunas, nunca pela posição.
// ---------------------------------------------------------------------------------------------

import type { Estado, EstadoFolha } from "./estados";
export { ESTADOS, ROTULO_ESTADO } from "./estados";
export type { Estado, EstadoFolha } from "./estados";
const PRIORIDADE: Record<Estado, number> = { stock: 0, vendido: 1, abatido: 2, outro: 3 };

export type Maquina = {
  numero: string;               // sem asterisco
  assinalada: boolean;          // vinha com asterisco
  designacao: string | null; marca: string | null; modelo: string | null; ano: number | null;
  id_fornecedor: string | null; numero_serie: string | null; peso_kg: number | null; matricula: string | null;
  horas: number | null; data_compra: string | null; data_chegada: string | null;
  fornecedor: string | null; agencia: string | null;
  valor_compra: number | null; valor_compra_original: string | null;
  facturada: string | null; observacoes: string | null;
  venda_fatura: string | null; comprador: string | null; data_venda: string | null;
};
export type LinhaStock = Maquina & { folha: string; linha: number; estado: Estado };

export type FolhaLida = { nome: string; sugerido: EstadoFolha; linhas: (Maquina & { linha: number })[]; ignoradas: { linha: number; texto: string }[] };

// ---------- utilitários de texto e números ----------
const norm = (s: unknown) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
/** «SL 005», «sl005» e «SL 005*» são a mesma máquina. */
export const normNumero = (s: string) => s.toUpperCase().replace(/[\s*]/g, "");
const normSerie = (s: string | null) => (s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

const txt = (v: unknown): string | null => {
  if (v == null || v instanceof Date) return null;
  const s = String(v).replace(/\s+/g, " ").trim();
  return s || null;
};

/** 4906,2 → 4906.2 · 10.814 → 10814 (ponto de milhares) · 1.5 → 1.5 */
function numeroPt(s: string): number | null {
  const t = s.trim().replace(/\s/g, "");
  if (!t) return null;
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) return Number(t.replace(/\./g, "").replace(",", "."));
  if (/^\d+([.,]\d+)?$/.test(t)) return Number(t.replace(",", "."));
  return null;
}

function dataIso(v: unknown): string | null {
  if (v instanceof Date) return Number.isNaN(+v) ? null : v.toISOString().slice(0, 10);
  const s = txt(v);
  const m = s && /^(\d{1,2})[-,./](\d{1,2})[-,./](\d{4})$/.exec(s);
  if (!m) return null;
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function valorEuros(v: unknown): { valor: number | null; original: string | null } {
  if (typeof v === "number") return { valor: v, original: null };
  const s = txt(v);
  if (!s) return { valor: null, original: null };
  const limpo = s.replace(/€/g, "").replace(/\s/g, "");
  if (/^[\d.,+]+$/.test(limpo)) {
    const partes = limpo.split("+").map(numeroPt);
    if (partes.every((p): p is number => p != null)) return { valor: partes.reduce((a, b) => a + b, 0), original: partes.length > 1 ? s : null };
  }
  return { valor: null, original: s }; // libras, texto, etc.: fica guardado como estava e não entra nos totais em €
}

const pesoKg = (v: unknown): number | null => {
  if (typeof v === "number") return Math.round(v);
  const s = txt(v);
  const n = s ? numeroPt(s.replace(/kgs?/i, "")) : null;
  return n == null ? null : Math.round(n);
};

const anoDe = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : Number(txt(v));
  return Number.isInteger(n) && n >= 1900 && n <= 2100 ? n : null;
};

/** «FACTURA Nº1/1384 - AKIMAT - 18,01,2019» → nº da fatura, comprador e data da venda. */
function lerVenda(s: string | null) {
  const m = s && /^\s*F[A-Z]{3,7}\s+([^-]*\d[^-]*?)\s*-\s*(.+?)(?:\s*-\s*(\d{1,2}[-,./]\d{1,2}[-,./]\d{4}))?\s*$/i.exec(s);
  return m ? { venda_fatura: m[1].trim(), comprador: m[2].trim(), data_venda: dataIso(m[3]) } : { venda_fatura: null, comprador: null, data_venda: null };
}

const cellValue = (v: ExcelJS.CellValue): unknown => {
  if (v && typeof v === "object" && !(v instanceof Date)) {
    const o = v as unknown as Record<string, unknown>;
    if ("result" in o) return o.result;
    if ("richText" in o) return (o.richText as { text: string }[]).map((r) => r.text).join("");
    if ("text" in o) return o.text;
    return null;
  }
  return v;
};

const ALIAS: Record<string, string[]> = {
  designacao: ["designacaodoequipamento", "designacao"], marca: ["marca"], modelo: ["modelo"],
  numero: ["ninterno", "numerointerno"], ano: ["ano"], idFornecedor: ["idfornecedor"], serie: ["nserie", "numeroserie"],
  peso: ["peso"], matricula: ["matricula"], horas: ["horas"], dataCompra: ["datacompra", "data"], dataChegada: ["datachegada"],
  fornecedor: ["fornecedor"], agencia: ["agencia"], valor: ["vcompra", "valorcompra"], facturada: ["facturada", "faturada"],
  obs: ["observacoes", "observacao"],
};

export function estadoDaFolha(nome: string): EstadoFolha {
  const n = norm(nome);
  if (n.includes("stock")) return "stock";
  if (n.includes("vend")) return "vendido";
  if (n.includes("abate")) return "abatido";
  return "outro"; // folhas desconhecidas: o utilizador escolhe na pré-visualização
}

export async function lerFicheiroStock(dados: Buffer | Uint8Array): Promise<FolhaLida[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(dados as unknown as ArrayBuffer);
  const folhas: FolhaLida[] = [];
  for (const ws of wb.worksheets) {
    // O cabeçalho é a 1ª linha com «Designação…» e «Nº Interno»
    let cab = 0;
    ws.eachRow((row, i) => {
      if (cab) return;
      const chaves = (row.values as ExcelJS.CellValue[]).map((v) => norm(cellValue(v)));
      if (chaves.some((k) => k.startsWith("designacao")) && chaves.some((k) => ALIAS.numero.includes(k))) cab = i;
    });
    if (!cab) continue;
    const idx: Record<string, number> = {};
    (ws.getRow(cab).values as ExcelJS.CellValue[]).forEach((v, i) => { const k = norm(cellValue(v)); if (k) idx[k] = i; });
    const col = (nome: string) => { for (const a of ALIAS[nome]) if (idx[a] != null) return idx[a]; return -1; };
    const C = Object.fromEntries(Object.keys(ALIAS).map((k) => [k, col(k)])) as Record<string, number>;

    const folha: FolhaLida = { nome: ws.name, sugerido: estadoDaFolha(ws.name), linhas: [], ignoradas: [] };
    ws.eachRow((row, i) => {
      if (i <= cab) return;
      const v = row.values as ExcelJS.CellValue[];
      const g = (k: string) => (C[k] >= 0 ? cellValue(v[C[k]]) : null);
      const bruto = txt(g("numero"));
      const numero = bruto?.replace(/\*/g, "").replace(/\s+/g, " ").trim();
      if (!numero) {
        const primeira = v.map(cellValue).map(txt).find(Boolean);
        if (primeira) folha.ignoradas.push({ linha: i, texto: primeira }); // legendas e notas soltas
        return;
      }
      const notas: string[] = [];
      const horasBruto = txt(g("horas"));
      let horas: number | null = typeof g("horas") === "number" ? (g("horas") as number) : null;
      if (horas == null && horasBruto) {
        const m = /^([\d.,]+)\s*h?$/i.exec(horasBruto);
        horas = m ? numeroPt(m[1]) : null;
        if (horas == null) notas.push(`Horas: ${horasBruto}`);
      }
      const dc = g("dataCompra"), dch = g("dataChegada");
      const dataCompra = dataIso(dc), dataChegada = dataIso(dch);
      if (dataCompra == null && txt(dc)) notas.push(`Data compra: ${txt(dc)}`);
      if (dataChegada == null && txt(dch)) notas.push(`Data chegada: ${txt(dch)}`);
      const { valor, original } = valorEuros(g("valor"));
      const facturada = txt(g("facturada"));
      const obs = [txt(g("obs")), ...notas].filter(Boolean).join(" · ") || null;
      folha.linhas.push({
        linha: i, numero, assinalada: !!bruto?.includes("*"),
        designacao: txt(g("designacao")), marca: txt(g("marca")), modelo: txt(g("modelo")), ano: anoDe(g("ano")),
        id_fornecedor: txt(g("idFornecedor")), numero_serie: txt(g("serie")), peso_kg: pesoKg(g("peso")), matricula: txt(g("matricula")),
        horas, data_compra: dataCompra, data_chegada: dataChegada, fornecedor: txt(g("fornecedor")), agencia: txt(g("agencia")),
        valor_compra: valor, valor_compra_original: original, facturada, observacoes: obs, ...lerVenda(facturada),
      });
    });
    if (folha.linhas.length || folha.ignoradas.length) folhas.push(folha);
  }
  return folhas;
}

// ---------- plano de importação ----------
export type Existente = Omit<Partial<Maquina>, "assinalada"> & { id: number; numero_interno: string; empresa_id: number | null; estado: string; assinalada?: number | boolean };
export type ItemPlano = { acao: "nova" | "atualizar" | "igual"; l: LinhaStock; numeroFinal: string; id?: number; mudancas: string[] };
export type Plano = {
  itens: ItemPlano[];
  duplicadas: { numero: string; folha: string; linha: number; comFolha: string; comLinha: number }[];
  renumeradas: { de: string; para: string; folha: string; linha: number; motivo: string }[];
  ignoradas: { folha: string; linha: number; texto: string }[];
  semValor: number;   // valores de compra que não eram números em €
};

const CAMPOS_COMPARAR: (keyof Maquina)[] = [
  "designacao", "marca", "modelo", "ano", "id_fornecedor", "numero_serie", "peso_kg", "matricula", "horas", "data_compra", "data_chegada",
  "fornecedor", "agencia", "valor_compra", "valor_compra_original", "facturada", "observacoes", "venda_fatura", "comprador", "data_venda",
];
export const ROTULO_CAMPO: Record<string, string> = {
  designacao: "designação", marca: "marca", modelo: "modelo", ano: "ano", id_fornecedor: "ID fornecedor", numero_serie: "nº de série", peso_kg: "peso",
  matricula: "matrícula", horas: "horas", data_compra: "data de compra", data_chegada: "data de chegada", fornecedor: "fornecedor", agencia: "agência",
  valor_compra: "valor de compra", valor_compra_original: "valor (original)", facturada: "facturada", observacoes: "observações",
  venda_fatura: "fatura de venda", comprador: "comprador", data_venda: "data da venda", estado: "estado", assinalada: "assinalada (*)",
};

export const descricaoDe = (m: Pick<Maquina, "designacao" | "marca" | "modelo">) => [m.designacao, m.marca, m.modelo].filter(Boolean).join(" ");

/**
 * Junta as folhas (com o estado escolhido para cada uma) e decide, máquina a máquina, o que fazer:
 *  - duplicada idêntica (mesmo nº e mesma máquina) → salta;
 *  - já existe (mesmo nº de série, ou mesmo nº interno) → atualiza só o que mudou. Um campo vazio no ficheiro é normal (ex.: os baldes não têm horas
 *    nem matrícula): por defeito mantém o que já está na app; com «limparVazios» apaga-o;
 *  - nº já usado por OUTRA máquina → entra com sufixo («SL 241-B») e fica registado para rever.
 * Quando um nº aparece em várias folhas, ficam com o nº original as em STOCK, depois VENDIDO, ABATE, outras.
 */
export function planear(folhas: FolhaLida[], estados: Record<string, EstadoFolha>, empresaId: number, existentes: Existente[], opcoes: { limparVazios?: boolean } = {}): Plano {
  const plano: Plano = { itens: [], duplicadas: [], renumeradas: [], ignoradas: [], semValor: 0 };
  const linhas: LinhaStock[] = [];
  folhas.forEach((f, ordem) => {
    const estado = estados[f.nome] ?? f.sugerido;
    if (estado === "ignorar") return;
    f.ignoradas.forEach((i) => plano.ignoradas.push({ folha: f.nome, linha: i.linha, texto: i.texto }));
    f.linhas.forEach((l) => linhas.push({ ...l, folha: f.nome, estado, ...{ _ordem: ordem } as object }));
  });
  const ordemDe = (l: LinhaStock) => (l as unknown as { _ordem: number })._ordem;
  linhas.sort((a, b) => PRIORIDADE[a.estado] - PRIORIDADE[b.estado] || ordemDe(a) - ordemDe(b) || a.linha - b.linha);

  const daEmpresa = (e: Existente) => e.empresa_id === empresaId || e.empresa_id == null;
  const porSerie = new Map<string, Existente>();
  for (const e of existentes) { const k = normSerie(e.numero_serie ?? null); if (k.length >= 4 && daEmpresa(e) && !porSerie.has(k)) porSerie.set(k, e); }
  const porNumero = new Map(existentes.map((e) => [normNumero(e.numero_interno), e]));
  const usados = new Set(porNumero.keys());
  const donosDoPlano = new Map<string, string>();   // nº → descrição, só para explicar conflitos dentro do próprio ficheiro
  const reivindicados = new Set<number>();
  const vistas = new Map<string, LinhaStock>();

  // Duas linhas com o mesmo nº só são a mesma máquina se forem parecidas (mesma designação, marca ou modelo);
  // senão um nº reutilizado (ex.: «SL 242» = um Bobcat e um martelo) faria uma sobrescrever a outra.
  const parecida = (e: Existente, l: LinhaStock) => {
    const igual = (a?: string | null, b?: string | null) => !!a && !!b && norm(a) === norm(b);
    if (!e.designacao && !e.marca && !e.modelo && !l.designacao && !l.marca && !l.modelo) return true;
    return igual(e.designacao, l.designacao) || igual(e.marca, l.marca) || igual(e.modelo, l.modelo);
  };
  const serieCompativel = (e: Existente, serie: string) => { const c = normSerie(e.numero_serie ?? null); return !c || !serie || c === serie; };

  for (const l of linhas) {
    const chaveMaquina = `${normNumero(l.numero)}|${normSerie(l.numero_serie)}|${norm(descricaoDe(l))}`;
    const igual = vistas.get(chaveMaquina);
    if (igual) { plano.duplicadas.push({ numero: l.numero, folha: l.folha, linha: l.linha, comFolha: igual.folha, comLinha: igual.linha }); continue; }
    vistas.set(chaveMaquina, l);
    if (l.valor_compra_original && l.valor_compra == null) plano.semValor++;

    // já existe? Por nº de série; senão pelo nº interno; senão pelo nº com sufixo (uma renumeração de uma importação anterior)
    const serie = normSerie(l.numero_serie);
    const livre = (e?: Existente) => (e && !reivindicados.has(e.id) ? e : undefined);
    let ex: Existente | undefined = serie.length >= 4 ? livre(porSerie.get(serie)) : undefined;
    if (!ex) {
      const c = livre(porNumero.get(normNumero(l.numero)));
      if (c && daEmpresa(c) && serieCompativel(c, serie) && parecida(c, l)) ex = c;
    }
    if (!ex) {
      const base = normNumero(l.numero) + "-";
      ex = existentes.find((e) => !reivindicados.has(e.id) && daEmpresa(e) && normNumero(e.numero_interno).startsWith(base) && serieCompativel(e, serie) && parecida(e, l));
    }

    if (ex) {
      reivindicados.add(ex.id);
      const mudancas: string[] = [];
      for (const k of CAMPOS_COMPARAR) {
        const novo = l[k];
        const atual = ex[k];
        if (novo == null || novo === "") {
          if (opcoes.limparVazios && atual != null && atual !== "") mudancas.push(k);   // vazio no ficheiro = limpar na app
          continue;                                                                       // por defeito, um vazio nunca apaga o que já lá está
        }
        if (String(novo) !== String(atual ?? "")) mudancas.push(k);
      }
      if (l.estado !== ex.estado) mudancas.push("estado");
      if ((l.assinalada ? 1 : 0) !== Number(ex.assinalada ?? 0)) mudancas.push("assinalada");
      if (ex.empresa_id == null) mudancas.push("empresa");
      plano.itens.push({ acao: mudancas.length ? "atualizar" : "igual", l, numeroFinal: ex.numero_interno, id: ex.id, mudancas });
      continue;
    }

    // nova (com sufixo se o nº já estiver ocupado por outra máquina)
    let final = l.numero;
    if (usados.has(normNumero(final))) {
      const dono = porNumero.get(normNumero(l.numero));
      const donoDoPlano = donosDoPlano.get(normNumero(l.numero));
      let n = 0, cand = final;
      do { cand = `${l.numero}-${String.fromCharCode(66 + n++)}`; } while (usados.has(normNumero(cand)) && n < 20);
      plano.renumeradas.push({ de: l.numero, para: cand, folha: l.folha, linha: l.linha, motivo: `o nº já pertence a outra máquina (${(dono ? descricaoDe(dono as Maquina) || dono.numero_interno : donoDoPlano) || "sem descrição"})` });
      final = cand;
    }
    usados.add(normNumero(final));
    donosDoPlano.set(normNumero(final), descricaoDe(l) || final);
    plano.itens.push({ acao: "nova", l, numeroFinal: final, mudancas: [] });
  }
  return plano;
}
