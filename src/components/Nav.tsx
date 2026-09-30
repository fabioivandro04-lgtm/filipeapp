import Link from "next/link";
import type { User } from "@/lib/auth";
import { sair } from "@/app/actions";

const LINKS = [
  { href: "/", nome: "Faturas", icon: "🧾" },
  { href: "/predios", nome: "Prédios", icon: "🏢" },
  { href: "/maquinas", nome: "Máquinas", icon: "🚜" },
];

export default function Nav({ user }: { user: User }) {
  return (
    <>
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-white">G</span>
            <span className="hidden sm:inline">GESTAO APP</span>
          </Link>
          <nav className="hidden gap-1 md:flex">
            {LINKS.map((l) => (
              <Link key={l.href} href={l.href} className="rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-900">
                {l.nome}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <Link href="/upload" className="btn-primary hidden md:inline-flex">+ Carregar faturas</Link>
            <div className="text-right leading-tight">
              <p className="text-sm font-medium">{user.nome}</p>
              <p className="text-xs text-slate-500">{user.cargo}</p>
            </div>
            <form action={sair}><button className="btn-ghost px-3 py-1.5">Sair</button></form>
          </div>
        </div>
      </header>

      {/* Barra inferior no telemóvel */}
      <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden">
        {[LINKS[0], { href: "/upload", nome: "Carregar", icon: "📷" }, LINKS[1], LINKS[2]].map((l) => (
          <Link key={l.href} href={l.href} className="flex flex-col items-center gap-0.5 py-2 text-xs text-slate-600">
            <span className="text-xl">{l.icon}</span>{l.nome}
          </Link>
        ))}
      </nav>
    </>
  );
}
