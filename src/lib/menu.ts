import type { User } from "./auth";

/** `icon` = nome de um ícone de components/Icone.tsx */
export type ItemMenu = { href: string; nome: string; desc: string; icon: string };

/** Ligações que aparecem sempre na barra principal. */
export const PRINCIPAL: ItemMenu[] = [
  { href: "/", nome: "Faturas", desc: "Todas as faturas", icon: "faturas" },
  { href: "/predios", nome: "Prédios", desc: "Água, energia e despesas", icon: "predios" },
  { href: "/maquinas", nome: "Máquinas", desc: "Custos por máquina", icon: "maquinas" },
  { href: "/relatorios", nome: "Relatórios", desc: "Gastos por mês, empresa e categoria", icon: "relatorios" },
  { href: "/alertas", nome: "Alertas", desc: "Duplicados, valores estranhos e meses em falta", icon: "alertas" },
];

/** Restantes páginas, conforme o cargo. `pendentes` = propostas à espera de decisão (só conta para o admin). */
export function extras(u: User, pendentes = 0): ItemMenu[] {
  const admin = u.cargo === "admin";
  return [
    { href: "/prazos", nome: "Prazos e documentos", desc: "Seguros, inspeções, IUC e certificados a caducar", icon: "prazos" },
    { href: "/rentabilidade", nome: "Rentabilidade", desc: "O que cada máquina rende em alugueres contra o que custa", icon: "rentabilidade" },
    { href: "/contabilidade", nome: "Contabilidade", desc: "Pacote do mês para a contabilista (Excel + originais)", icon: "contabilidade" },
    ...(admin
      ? [{ href: "/aprovacoes", nome: pendentes ? `Aprovações (${pendentes})` : "Aprovações", desc: pendentes ? `${pendentes} alteração(ões) à espera de decisão` : "Alterações propostas pelos contabilistas", icon: "aprovacoes" }]
      : u.cargo === "contabilista" ? [{ href: "/aprovacoes", nome: "As minhas propostas", desc: "Alterações à espera de um administrador", icon: "aprovacoes" }] : []),
    ...(admin ? [
      { href: "/empresas", nome: "Empresas", desc: "Nome, NIF e morada das suas empresas", icon: "empresas" },
      { href: "/utilizadores", nome: "Utilizadores", desc: "Criar pessoas e definir o cargo", icon: "utilizadores" },
      { href: "/apagados", nome: "Apagados", desc: "Restaurar faturas, empresas, prédios, máquinas e utilizadores", icon: "apagados" },
      { href: "/historico", nome: "Histórico", desc: "Quem fez o quê, com opção de desfazer", icon: "historico" },
      { href: "/copias", nome: "Cópia de segurança", desc: "Descarregar todos os dados e faturas", icon: "copias" },
    ] : []),
    { href: "/conta", nome: "Alterar palavra-passe", desc: "A sua conta", icon: "conta" },
  ];
}
