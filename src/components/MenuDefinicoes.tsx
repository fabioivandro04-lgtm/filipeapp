"use client";
import { useEffect, useState } from "react";

type Aba = { id: string; nome: string };

/** Menu das Definições: à direita e fixo no computador (destaca a secção visível); em linha no telemóvel. */
export default function MenuDefinicoes({ abas }: { abas: Aba[] }) {
  const [ativa, setAtiva] = useState(abas[0]?.id);

  useEffect(() => {
    const ids = abas.map((a) => a.id);
    const atualizar = () => {
      // A secção ativa é a última cujo topo já passou da linha de leitura (um pouco abaixo do topo do ecrã)
      let atual = ids[0];
      for (const id of ids) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= 140) atual = id;
      }
      // No fim da página a última secção é curta e nunca chega ao topo: conta como ativa
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) atual = ids[ids.length - 1];
      setAtiva(atual);
    };
    atualizar();
    window.addEventListener("scroll", atualizar, { passive: true });
    window.addEventListener("resize", atualizar);
    return () => { window.removeEventListener("scroll", atualizar); window.removeEventListener("resize", atualizar); };
  }, [abas]);

  return (
    <>
      {/* Telemóvel */}
      <nav className="mb-6 flex gap-2 overflow-x-auto pb-1 lg:hidden">
        {abas.map((a) => (
          <a key={a.id} href={`#${a.id}`} className={`shrink-0 rounded-full border px-3 py-1.5 text-sm ${ativa === a.id ? "border-brand-500 bg-brand-50 text-brand-700" : "border-slate-200 bg-white text-slate-600"}`}>{a.nome}</a>
        ))}
      </nav>
      {/* Computador: menu à direita */}
      <aside className="hidden lg:block">
        <nav className="sticky top-8 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
          <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Nesta página</p>
          <ul className="space-y-0.5">
            {abas.map((a) => (
              <li key={a.id}>
                <a href={`#${a.id}`} aria-current={ativa === a.id ? "true" : undefined}
                  className={`block rounded-lg px-3 py-2 text-sm transition ${ativa === a.id ? "bg-brand-50 font-medium text-brand-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"}`}>{a.nome}</a>
              </li>
            ))}
          </ul>
        </nav>
      </aside>
    </>
  );
}
