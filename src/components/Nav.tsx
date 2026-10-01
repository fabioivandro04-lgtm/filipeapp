import Link from "next/link";
import { editaDireto, type User } from "@/lib/auth";
import { contarPropostasPendentes } from "@/lib/queries";
import { extras, PRINCIPAL } from "@/lib/menu";
import { sair } from "@/app/actions";
import Icone from "./Icone";
import MenuMais from "./MenuMais";

export default async function Nav({ user }: { user: User }) {
  const pendentes = user.cargo === "admin" ? await contarPropostasPendentes() : 0;
  const mais = extras(user, pendentes);
  const carrega = editaDireto(user);
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
            <MenuMais itens={mais} pendentes={pendentes} />
          </nav>
          <div className="ml-auto flex items-center gap-3">
            {carrega && <Link href="/upload" className="btn-primary hidden md:inline-flex">+ Carregar faturas</Link>}
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
        {[PRINCIPAL[0], carrega ? { href: "/upload", nome: "Carregar", icon: "camara" } : PRINCIPAL[3], PRINCIPAL[1], PRINCIPAL[2], { href: "/mais", nome: pendentes ? `Mais (${pendentes})` : "Mais", icon: "menu" }].map((l) => (
          <Link key={l.href} href={l.href} className="flex flex-col items-center gap-0.5 py-2 text-xs text-slate-600">
            <Icone nome={l.icon} className="h-6 w-6" />{l.nome}
          </Link>
        ))}
      </nav>
    </>
  );
}
