"use client";
import { useEffect, useState } from "react";
import { aoMudar, eIOS, estaInstalada, pedidoAtual } from "@/lib/instalar";

type Estado = "a-verificar" | "instalada" | "android" | "ios" | "outro";

function Passo({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700">{n}</span>
      <span className="pt-0.5 text-sm">{children}</span>
    </li>
  );
}

// Ícone «Partilhar» do Safari (quadrado com seta para cima), para a pessoa o reconhecer
const IconePartilhar = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="inline h-4 w-4 align-[-3px] text-brand-600" aria-label="Partilhar">
    <path d="M12 3v12" /><path d="M8 7l4-4 4 4" /><path d="M6 11H5v10h14V11h-1" />
  </svg>
);
const IconeMais = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="inline h-4 w-4 align-[-3px] text-brand-600" aria-hidden="true">
    <rect x="4" y="4" width="16" height="16" rx="4" /><path d="M12 8v8" /><path d="M8 12h8" />
  </svg>
);

/** Secção «App no telemóvel» das Definições. Desaparece quando a app já está aberta como app instalada. */
export default function InstalarApp({ id }: { id: string }) {
  const [estado, setEstado] = useState<Estado>("a-verificar");
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    const atualizar = () => setEstado(estaInstalada() ? "instalada" : pedidoAtual() ? "android" : eIOS() ? "ios" : "outro");
    atualizar();
    const mq = window.matchMedia("(display-mode: standalone)");
    mq.addEventListener("change", atualizar);
    const parar = aoMudar(atualizar);
    return () => { mq.removeEventListener("change", atualizar); parar(); };
  }, []);

  if (estado === "instalada") return null;

  async function instalar() {
    const p = pedidoAtual();
    if (!p) return;
    await p.prompt();
    const { outcome } = await p.userChoice;
    setMsg(outcome === "accepted" ? "Pronto! A app já está no ecrã principal." : null);
  }

  return (
    <section id={id} className="card scroll-mt-20 p-5">
      <h2 className="font-semibold">App no telemóvel</h2>
      <p className="mt-1 text-sm text-slate-500">Ponha a GESTAO APP no ecrã principal: abre com um toque, em ecrã inteiro, como uma app normal.</p>
      <div className="mt-4">
        {estado === "a-verificar" && <p className="text-sm text-slate-500">A verificar…</p>}

        {estado === "android" && (
          <div className="space-y-2">
            <button type="button" onClick={instalar} className="btn-primary">Adicionar ao ecrã principal</button>
            {msg && <p className="text-sm text-emerald-700">{msg}</p>}
          </div>
        )}

        {estado === "ios" && (
          <ol className="space-y-3">
            <Passo n={1}>Abra esta página no <b>Safari</b>.</Passo>
            <Passo n={2}>Toque em <b>Partilhar</b> <IconePartilhar /> (em baixo, ou ao lado da barra de endereço).</Passo>
            <Passo n={3}>Deslize para baixo e toque em <b>Adicionar ao ecrã principal</b> <IconeMais />.</Passo>
            <Passo n={4}>Toque em <b>Adicionar</b>, no canto superior direito.</Passo>
          </ol>
        )}

        {estado === "outro" && (
          <ol className="space-y-3">
            <Passo n={1}><b>Android:</b> abra esta página no <b>Chrome</b>, toque no menu <b>⋮</b> (canto superior direito) e escolha <b>Adicionar ao ecrã principal</b> ou <b>Instalar app</b>.</Passo>
            <Passo n={2}><b>iPhone / iPad:</b> abra no <b>Safari</b>, toque em <b>Partilhar</b> <IconePartilhar /> e depois em <b>Adicionar ao ecrã principal</b>.</Passo>
            <Passo n={3}><b>Computador:</b> no Chrome ou Edge, clique no ícone de instalar na barra de endereço.</Passo>
          </ol>
        )}
      </div>
    </section>
  );
}
