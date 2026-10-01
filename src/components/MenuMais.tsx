"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { ItemMenu } from "@/lib/menu";
import Icone from "./Icone";

/** Menu «Mais» do computador: fecha ao escolher uma opção, ao clicar fora, com Esc e ao mudar de página. */
export default function MenuMais({ itens, pendentes }: { itens: ItemMenu[]; pendentes: number }) {
  const caminho = usePathname();
  // Guarda a página em que foi aberto: ao mudar de página fica fechado sem mais nada
  const [abertoEm, setAbertoEm] = useState<string | null>(null);
  const aberto = abertoEm === caminho;
  const setAberto = (v: boolean | ((a: boolean) => boolean)) => setAbertoEm(((typeof v === "function" ? v(aberto) : v) ? caminho : null));
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setAbertoEm(null); };
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") setAbertoEm(null); };
    document.addEventListener("pointerdown", fora);
    document.addEventListener("keydown", tecla);
    return () => { document.removeEventListener("pointerdown", fora); document.removeEventListener("keydown", tecla); };
  }, [aberto]);

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setAberto((v) => !v)} aria-expanded={aberto}
        className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-900">
        Mais <Icone nome="seta" className={`h-4 w-4 transition-transform ${aberto ? "rotate-180" : ""}`} />
        {pendentes > 0 && <span className="ml-1 rounded-full bg-amber-500 px-1.5 text-xs font-medium text-white">{pendentes}</span>}
      </button>
      {aberto && (
        <div className="absolute left-0 top-full z-30 mt-1 w-72 rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
          {itens.map((l) => (
            <Link key={l.href} href={l.href} onClick={() => setAberto(false)}
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-100">
              <Icone nome={l.icon} className="h-4 w-4 text-slate-400" />{l.nome}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
