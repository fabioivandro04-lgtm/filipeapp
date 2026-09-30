import { CATEGORIA_INFO } from "@/lib/format";

export function CategoriaBadge({ categoria }: { categoria: string }) {
  const c = CATEGORIA_INFO[categoria] ?? CATEGORIA_INFO.outros;
  return <span className={`badge ${c.cor}`}>{c.nome}</span>;
}

export function PageHeader({ titulo, subtitulo, children }: { titulo: string; subtitulo?: string; children?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{titulo}</h1>
        {subtitulo && <p className="mt-1 text-sm text-slate-500">{subtitulo}</p>}
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

export function Stat({ rotulo, valor, destaque }: { rotulo: string; valor: string; destaque?: boolean }) {
  return (
    <div className="card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{rotulo}</p>
      <p className={`mt-1 text-xl font-semibold sm:text-2xl ${destaque ? "text-amber-600" : ""}`}>{valor}</p>
    </div>
  );
}

export function Vazio({ texto }: { texto: string }) {
  return <div className="card p-10 text-center text-sm text-slate-500">{texto}</div>;
}
