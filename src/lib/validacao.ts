import { nifValido } from "./nif";

type Item = { total: number | null };
export type DadosValidacao = {
  nif: string | null; nifCliente?: string | null; data: string | null; total: number | null; iva: number | null;
  numero?: string | null; fornecedor?: string | null; itens?: Item[] | null;
  /** Nome já guardado para este NIF (de faturas anteriores), se existir. */
  nomeConhecido?: string | null;
  /** Só se conhece o grupo quando há NIFs de empresas; `null` = não verificar. */
  clienteNoGrupo?: boolean | null;
  hoje?: Date;
};

const norm = (t: string) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\b(lda|sa|unipessoal|s a|sociedade|de|da|do|e)\b/g, " ");
/** Nomes parecidos: partilham pelo menos uma palavra (≥3 letras). */
export function nomesParecidos(a: string, b: string): boolean {
  const pa = new Set(norm(a).split(/\s+/).filter((w) => w.length >= 3));
  return norm(b).split(/\s+/).some((w) => w.length >= 3 && pa.has(w));
}

const eur = (n: number) => n.toFixed(2).replace(".", ",") + " €";

/**
 * Verificações automáticas de uma fatura (rede de segurança contra erros de leitura).
 * Devolve avisos curtos; vazio = nada a assinalar.
 */
export function validarFatura(d: DadosValidacao): string[] {
  const av: string[] = [];
  if (d.nif && !nifValido(d.nif)) av.push(`NIF ${d.nif} inválido (dígito de controlo): confirme.`);
  if (d.nif && d.nomeConhecido && d.fornecedor && !nomesParecidos(d.nomeConhecido, d.fornecedor))
    av.push(`Este NIF está registado como «${d.nomeConhecido}», mas a fatura diz «${d.fornecedor}».`);

  if (d.total == null) av.push("Falta o total.");
  if (!d.data) av.push("Falta a data.");
  else {
    const t = Date.parse(d.data);
    const hoje = (d.hoje ?? new Date()).getTime();
    if (Number.isNaN(t)) av.push(`Data «${d.data}» inválida.`);
    else if (t > hoje + 86_400_000) av.push(`A data ${d.data} está no futuro.`);
    else if (t < hoje - 3 * 365 * 86_400_000) av.push(`A data ${d.data} tem mais de 3 anos.`);
  }

  if (d.total != null && d.iva != null && d.iva > 0) {
    const base = d.total - d.iva;
    // Taxas em Portugal: 4 a 23% (continente, Madeira, Açores). Fora disto, um dos valores foi mal lido.
    if (base <= 0 || d.iva / base < 0.03 || d.iva / base > 0.235)
      av.push(`IVA (${eur(d.iva)}) não condiz com o total (${eur(d.total)}): confirme os valores.`);
  }
  if (d.total != null && d.itens?.length) {
    const soma = d.itens.reduce((s, i) => s + (i.total ?? 0), 0);
    const base = d.total - (d.iva ?? 0);
    const perto = (a: number, b: number) => Math.abs(a - b) <= Math.max(0.05, 0.1 * Math.abs(b));
    if (soma > 0 && !perto(soma, d.total) && !perto(soma, base))
      av.push(`A soma dos artigos (${eur(soma)}) não bate com o total (${eur(d.total)}).`);
  }
  if (d.clienteNoGrupo === false && d.nifCliente) av.push(`O NIF do cliente ${d.nifCliente} não é de nenhuma empresa do grupo.`);
  return av;
}
