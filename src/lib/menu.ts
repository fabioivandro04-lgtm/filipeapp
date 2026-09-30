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

/** Restantes páginas, conforme o cargo. */
export function extras(u: User): ItemMenu[] {
  const admin = u.cargo === "admin";
  const edita = admin || u.cargo === "operador";
  return [
    ...(edita ? [{ href: "/contabilidade", nome: "Contabilidade", desc: "Enviar as faturas do mês à contabilista", icon: "📨" }] : []),
    ...(admin ? [
      { href: "/empresas", nome: "Empresas", desc: "Nomes e NIF das suas empresas", icon: "🏛️" },
      { href: "/utilizadores", nome: "Utilizadores", desc: "Criar pessoas e definir o que veem", icon: "👥" },
      { href: "/historico", nome: "Histórico", desc: "Quem fez o quê, com opção de desfazer", icon: "🕘" },
      { href: "/copias", nome: "Cópia de segurança", desc: "Descarregar todos os dados e faturas", icon: "💾" },
    ] : []),
    { href: "/conta", nome: "Alterar palavra-passe", desc: "A sua conta", icon: "🔑" },
  ];
}
