import Link from "next/link";
import type { User } from "@/lib/auth";
import { extras, PRINCIPAL } from "@/lib/menu";
import { sair } from "@/app/actions";

export default function Nav({ user }: { user: User }) {
  const mais = extras(user);
  return (
    <>
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-white">G</span>
            <span className="hidden sm:inline">GESTAO APP</span>
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            {PRINCIPAL.map((l) => (
              <Link key={l.href} href={l.href} className="rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-900">{l.nome}</Link>
            ))}
            <details className="group relative">
              <summary className="cursor-pointer list-none rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-900">Mais ▾</summary>
              <div className="absolute left-0 top-full z-30 mt-1 w-64 rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
                {mais.map((l) => (
                  <Link key={l.href} href={l.href} className="block rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-100">{l.icon} {l.nome}</Link>
                ))}
              </div>
            </details>
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <Link href="/upload" className="btn-primary hidden md:inline-flex">+ Carregar faturas</Link>
            <Link href="/conta" title="Alterar palavra-passe" className="text-right leading-tight hover:opacity-70">
              <p className="text-sm font-medium">{user.nome}</p>
              <p className="text-xs text-slate-500">{user.cargo}</p>
            </Link>
            <form action={sair}><button className="btn-ghost px-3 py-1.5">Sair</button></form>
          </div>
        </div>
      </header>

      {/* Barra inferior no telemóvel */}
      <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden">
        {[PRINCIPAL[0], { href: "/upload", nome: "Carregar", icon: "📷" }, PRINCIPAL[1], PRINCIPAL[2], { href: "/mais", nome: "Mais", icon: "☰" }].map((l) => (
          <Link key={l.href} href={l.href} className="flex flex-col items-center gap-0.5 py-2 text-xs text-slate-600">
            <span className="text-xl">{l.icon}</span>{l.nome}
          </Link>
        ))}
      </nav>
    </>
  );
}
