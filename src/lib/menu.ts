import type { User } from "./auth";

/** `icon` = nome de um ícone de components/Icone.tsx; `contador` = número em destaque (ex.: pendentes). */
export type ItemMenu = { href: string; nome: string; desc: string; icon: string; contador?: number };
export type Seccao = { titulo: string; itens: ItemMenu[] };

/** Atalhos da barra de baixo no telemóvel (as restantes páginas ficam em «Mais»). */
export const BARRA_TELEMOVEL = ["/", "/predios", "/maquinas"];

/** Todas as páginas, agrupadas, conforme o cargo. Usado no menu lateral (computador) e em «Mais» (telemóvel). */
export function seccoes(u: User, c: { pendentes?: number; prazos?: number } = {}): Seccao[] {
  const admin = u.cargo === "admin";
  return [
    { titulo: "Dia a dia", itens: [
      { href: "/", nome: "Faturas", desc: "Todas as faturas", icon: "faturas" },
      { href: "/predios", nome: "Prédios", desc: "Água, energia e despesas", icon: "predios" },
      { href: "/maquinas", nome: "Máquinas", desc: "Stock, ficha e custos de cada máquina", icon: "maquinas" },
      { href: "/prazos", nome: "Prazos e documentos", desc: "Seguros, inspeções, IUC e certificados a caducar", icon: "prazos", contador: c.prazos },
    ] },
    { titulo: "Análise", itens: [
      { href: "/relatorios", nome: "Relatórios", desc: "Gastos por mês, empresa e categoria", icon: "relatorios" },
      { href: "/rentabilidade", nome: "Rentabilidade", desc: "O que cada máquina rende em alugueres contra o que custa", icon: "rentabilidade" },
      { href: "/alertas", nome: "Alertas", desc: "Duplicados, valores estranhos e meses em falta", icon: "alertas" },
    ] },
    { titulo: "Contabilidade", itens: [
      { href: "/contabilidade", nome: "Envio à contabilidade", desc: "Pacote do mês para a contabilista (Excel + originais)", icon: "contabilidade" },
      ...(admin
        ? [{ href: "/aprovacoes", nome: "Aprovações", desc: c.pendentes ? `${c.pendentes} alteração(ões) à espera de decisão` : "Alterações propostas pelos contabilistas", icon: "aprovacoes", contador: c.pendentes }]
        : u.cargo === "contabilista" ? [{ href: "/aprovacoes", nome: "As minhas propostas", desc: "Alterações à espera de um administrador", icon: "aprovacoes" }] : []),
    ] },
    ...(admin ? [{ titulo: "Administração", itens: [
      { href: "/empresas", nome: "Empresas", desc: "Nome, NIF e morada das suas empresas", icon: "empresas" },
      { href: "/utilizadores", nome: "Utilizadores", desc: "Pessoas, cargos e quem está online", icon: "utilizadores" },
      { href: "/historico", nome: "Histórico", desc: "Quem fez o quê e quando", icon: "historico" },
      { href: "/apagados", nome: "Apagados", desc: "Restaurar faturas, empresas, prédios, máquinas e utilizadores", icon: "apagados" },
      { href: "/copias", nome: "Cópia de segurança", desc: "Descarregar todos os dados e faturas", icon: "copias" },
    ] }] : []),
  ];
}

/** A página atual pertence a este item? («/» só conta para a lista e as fichas de faturas.) */
export const ativo = (href: string, caminho: string) =>
  href === "/" ? caminho === "/" || caminho.startsWith("/faturas") : caminho === href || caminho.startsWith(`${href}/`);
