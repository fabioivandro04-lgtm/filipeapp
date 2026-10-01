import Link from "next/link";
import { editaDireto, type User } from "@/lib/auth";
import { contarPrazos, contarPropostasPendentes } from "@/lib/queries";
import { seccoes } from "@/lib/menu";
import { sair } from "@/app/actions";
import Icone from "./Icone";
import MenuLateral from "./MenuLateral";
import BotaoCapturar from "./BotaoCapturar";

export default async function Nav({ user }: { user: User }) {
  const [pendentes, prazos] = await Promise.all([
    user.cargo === "admin" ? contarPropostasPendentes() : Promise.resolve(0),
    contarPrazos().then((p) => p.caducados + p.urgentes).catch(() => 0),
  ]);
  const carrega = editaDireto(user);
  const menu = seccoes(user, { pendentes, prazos });
  // Barra do telemóvel: o botão «Capturar» fica ao centro, em destaque
  const barra = [
    { href: "/", nome: "Faturas", icon: "faturas" },
    { href: "/maquinas", nome: "Máquinas", icon: "maquinas" },
    null,
    { href: "/predios", nome: "Prédios", icon: "predios" },
    { href: "/mais", nome: pendentes + prazos ? `Mais (${pendentes + prazos})` : "Mais", icon: "menu" },
  ];
  return (
    <>
      {/* Computador: menu lateral */}
      <MenuLateral seccoes={menu} nome={user.nome} cargo={user.cargo} carrega={carrega} />

      {/* Telemóvel: barra de cima e barra de baixo */}
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur md:hidden">
        <div className="flex h-14 items-center gap-3 px-4">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-white">G</span>
          </Link>
          <div className="ml-auto flex items-center gap-3">
            <Link href="/definicoes" className="text-right leading-tight">
              <p className="text-sm font-medium">{user.nome}</p>
              <p className="text-xs text-slate-500">{user.cargo}</p>
            </Link>
            <form action={sair}><button className="btn-ghost px-3 py-1.5">Sair</button></form>
          </div>
        </div>
      </header>
      <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden">
        {barra.map((l) => l === null
          ? (carrega ? <BotaoCapturar key="capturar" /> : <Link key="rel" href="/relatorios" className="flex flex-col items-center gap-0.5 py-2 text-xs text-slate-600"><Icone nome="relatorios" className="h-6 w-6" />Relatórios</Link>)
          : (
            <Link key={l.href} href={l.href} className="flex flex-col items-center gap-0.5 py-2 text-xs text-slate-600">
              <Icone nome={l.icon} className="h-6 w-6" />{l.nome}
            </Link>
          ))}
      </nav>
    </>
  );
}
