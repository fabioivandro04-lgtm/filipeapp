import type { User } from "./auth";

export type ItemMenu = { href: string; nome: string; desc: string; icon: string };

/** Ligações que aparecem sempre na barra principal. */
export const PRINCIPAL: ItemMenu[] = [
  { href: "/", nome: "Faturas", desc: "Todas as faturas", icon: "🧾" },
  { href: "/predios", nome: "Prédios", desc: "Água, energia e despesas", icon: "🏢" },
  { href: "/maquinas", nome: "Máquinas", desc: "Custos por máquina", icon: "🚜" },
  { href: "/relatorios", nome: "Relatórios", desc: "Gastos por mês, empresa e categoria", icon: "📊" },
  { href: "/alertas", nome: "Alertas", desc: "Duplicados, valores estranhos e meses em falta", icon: "⚠️" },
];

/** Restantes páginas, conforme o cargo. `pendentes` = propostas à espera de decisão (só conta para o admin). */
export function extras(u: User, pendentes = 0): ItemMenu[] {
  const admin = u.cargo === "admin";
  return [
    { href: "/contabilidade", nome: "Contabilidade", desc: "Pacote do mês para a contabilista (Excel + originais)", icon: "📨" },
    ...(admin
      ? [{ href: "/aprovacoes", nome: pendentes ? `Aprovações (${pendentes})` : "Aprovações", desc: pendentes ? `${pendentes} alteração(ões) à espera de decisão` : "Alterações propostas pelos contabilistas", icon: "✅" }]
      : u.cargo === "contabilista" ? [{ href: "/aprovacoes", nome: "As minhas propostas", desc: "Alterações à espera de um administrador", icon: "✅" }] : []),
    ...(admin ? [
      { href: "/empresas", nome: "Empresas", desc: "Nome, NIF e morada das suas empresas", icon: "🏛️" },
      { href: "/utilizadores", nome: "Utilizadores", desc: "Criar pessoas e definir o cargo", icon: "👥" },
      { href: "/historico", nome: "Histórico", desc: "Quem fez o quê, com opção de desfazer", icon: "🕘" },
      { href: "/copias", nome: "Cópia de segurança", desc: "Descarregar todos os dados e faturas", icon: "💾" },
    ] : []),
    { href: "/conta", nome: "Alterar palavra-passe", desc: "A sua conta", icon: "🔑" },
  ];
}
