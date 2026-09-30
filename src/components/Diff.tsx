import { money } from "@/lib/format";
import { ROTULO_CAMPO, type Diferencas } from "@/lib/historico";
import type { Nomes } from "@/lib/queries";

function valor(campo: string, v: unknown, n: Nomes): string {
  if (v == null || v === "") return "—";
  if (campo === "empresa_id") return n.empresas[Number(v)] ?? `#${v}`;
  if (campo === "predio_id") return n.predios[Number(v)] ?? `#${v}`;
  if (campo === "maquina_id") return n.maquinas[Number(v)] ?? `#${v}`;
  if (campo === "revisada") return Number(v) ? "Sim" : "Não";
  if (campo === "total" || campo === "iva") return money(Number(v));
  return String(v);
}

/** Lista «Campo: antes → depois». */
export default function DiffLista({ diff, nomes }: { diff: Diferencas; nomes: Nomes }) {
  return (
    <ul className="space-y-0.5 text-slate-600">
      {Object.entries(diff).map(([campo, [a, d]]) => (
        <li key={campo}><span className="text-slate-500">{ROTULO_CAMPO[campo] ?? campo}:</span> {valor(campo, a, nomes)} → <span className="font-medium">{valor(campo, d, nomes)}</span></li>
      ))}
    </ul>
  );
}
