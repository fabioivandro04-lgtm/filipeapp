// As empresas são diferentes mas têm o mesmo dono. Uma «venda» ou uma compra entre duas empresas do grupo é
// uma transferência interna: não é receita nem gasto do grupo e não pode contar a dobrar.

/** «INDICO, LDA.» e «Indico Lda» → «indico» (sem acentos, pontuação nem forma jurídica). */
export const nomeBase = (s: string | null | undefined) =>
  (s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[.,]/g, " ")
    .replace(/\b(lda|limitada|unipessoal|s a|sa)\b/g, " ").replace(/[^a-z0-9]+/g, " ").trim();

/** Devolve a empresa do grupo com este nome (ou null se for uma entidade externa). */
export function empresaDoGrupo<T extends { nome: string }>(nome: string | null | undefined, empresas: T[]): T | null {
  const b = nomeBase(nome);
  return b ? empresas.find((e) => nomeBase(e.nome) === b) ?? null : null;
}
