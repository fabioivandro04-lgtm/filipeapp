// Ícones em linha (SVG), no lugar dos emojis: aspeto igual em todos os telemóveis e computadores.
const CAMINHOS: Record<string, string> = {
  faturas: "M7 3h7l5 5v13H7z M14 3v5h5 M10 12h6 M10 16h6",
  camara: "M4 8h3l2-3h6l2 3h3v11H4z M12 17a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7",
  predios: "M4 21V5l8-2v18 M12 8l8 2v11 M2 21h20 M7 8h2 M7 12h2 M7 16h2 M15 13h2 M15 17h2",
  maquinas: "M3 17h13v-4l-3-5H8v9 M16 13h3l2 3v1h-5 M6.5 19.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4 M17.5 19.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4",
  relatorios: "M4 20V10 M10 20V4 M16 20v-7 M22 20H2",
  alertas: "M12 3l10 18H2z M12 10v5 M12 18h.01",
  menu: "M4 6h16 M4 12h16 M4 18h16",
  contabilidade: "M4 6h16v12H4z M4 7l8 6 8-6",
  aprovacoes: "M5 12l4 4 10-10",
  empresas: "M3 21h18 M5 21V9l7-5 7 5v12 M9 21v-6h6v6",
  utilizadores: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M2 21a7 7 0 0 1 14 0 M17 11a3 3 0 1 0 0-6 M22 21a6 6 0 0 0-4-5.6",
  apagados: "M4 7h16 M9 7V4h6v3 M6 7l1 14h10l1-14",
  historico: "M12 21a9 9 0 1 0-9-9 M3 4v5h5 M12 7v5l3 2",
  copias: "M12 3v12 M7 10l5 5 5-5 M4 17v4h16v-4",
  conta: "M7 11V8a5 5 0 0 1 10 0v3 M5 11h14v10H5z",
  prazos: "M4 5h16v16H4z M4 10h16 M8 3v4 M16 3v4 M9 15l2 2 4-4",
  rentabilidade: "M3 17l6-6 4 4 8-8 M15 7h6v6",
  seta: "M6 9l6 6 6-6",
};

export default function Icone({ nome, className = "h-5 w-5" }: { nome: string; className?: string }) {
  const d = CAMINHOS[nome];
  if (!d) return null;
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      {d.split(" M").map((p, i) => <path key={i} d={i ? `M${p}` : p} />)}
    </svg>
  );
}
