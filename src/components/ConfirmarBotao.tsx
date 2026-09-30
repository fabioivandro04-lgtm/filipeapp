"use client";

/** Botão de submissão que pede confirmação antes de avançar (para «Apagar»). */
export default function ConfirmarBotao({ mensagem, className, children }: { mensagem: string; className?: string; children: React.ReactNode }) {
  return (
    <button className={className} onClick={(e) => { if (!window.confirm(mensagem)) e.preventDefault(); }}>
      {children}
    </button>
  );
}
