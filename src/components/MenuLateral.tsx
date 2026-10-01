"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ativo, type Seccao } from "@/lib/menu";
import { sair } from "@/app/actions";
import Icone from "./Icone";

const CARGO: Record<string, string> = { admin: "Administrador", operador: "Operador", contabilista: "Contabilista" };

/** Menu lateral do computador: secções, página atual em destaque, contadores e a conta no fundo. */
export default function MenuLateral({ seccoes, nome, cargo, carrega }: { seccoes: Seccao[]; nome: string; cargo: string; carrega: boolean }) {
  const caminho = usePathname();
  return (
    <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 flex-col border-r border-slate-200 bg-white md:flex">
      <Link href="/" className="flex h-14 shrink-0 items-center gap-2 px-5 font-semibold">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-white">G</span>GESTAO APP
      </Link>
      {carrega && (
        <div className="px-4 pb-2">
          <Link href="/upload" className="btn-primary w-full"><Icone nome="camara" className="h-4 w-4" />Carregar faturas</Link>
        </div>
      )}
      <nav className="flex-1 overflow-y-auto px-3 py-2">
        {seccoes.map((s) => (
          <div key={s.titulo} className="mb-3">
            <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{s.titulo}</p>
            <ul className="space-y-0.5">
              {s.itens.map((l) => {
                const aqui = ativo(l.href, caminho);
                return (
                  <li key={l.href}>
                    <Link href={l.href} aria-current={aqui ? "page" : undefined}
                      className={`flex items-center gap-3 rounded-lg px-3 py-1.5 text-sm transition ${aqui ? "bg-brand-50 font-medium text-brand-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"}`}>
                      <Icone nome={l.icon} className={`h-[18px] w-[18px] shrink-0 ${aqui ? "text-brand-600" : "text-slate-400"}`} />
                      <span className="flex-1 truncate">{l.nome}</span>
                      {!!l.contador && <span className="rounded-full bg-amber-500 px-1.5 text-xs font-medium text-white">{l.contador}</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
      <div className="flex shrink-0 items-center gap-3 border-t border-slate-200 p-4">
        <Link href="/definicoes" title="Definições" className="min-w-0 flex-1 hover:opacity-70">
          <p className="truncate text-sm font-medium">{nome}</p>
          <p className="truncate text-xs text-slate-500">{CARGO[cargo] ?? cargo}</p>
        </Link>
        <form action={sair}><button className="btn-ghost px-3 py-1.5 text-xs">Sair</button></form>
      </div>
    </aside>
  );
}
