import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { listarFaturas } from "@/lib/queries";
import { CATEGORIAS } from "@/lib/db";
import { sair } from "./actions";

export default async function Home({ searchParams }: { searchParams: Promise<{ categoria?: string; q?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const faturas = listarFaturas(user, sp);
  const qs = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]).toString();
  const total = faturas.reduce((s, f) => s + (f.total ?? 0), 0);

  return (
    <main className="mx-auto max-w-6xl p-6">
      <header className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-2xl font-semibold">Faturas</h1>
        <span className="text-sm text-gray-600">{user.nome} ({user.cargo})</span>
        <Link href="/upload" className="rounded bg-black px-3 py-1.5 text-white">+ Carregar</Link>
        <a href={`/api/export?${qs}`} className="rounded border px-3 py-1.5">Exportar Excel</a>
        {user.cargo === "admin" && <Link href="/cadastros" className="rounded border px-3 py-1.5">Prédios e máquinas</Link>}
        <form action={sair}><button className="text-sm underline">Sair</button></form>
      </header>

      <form className="mb-4 flex gap-2">
        <select name="categoria" defaultValue={sp.categoria ?? ""} className="rounded border p-2">
          <option value="">Todas as categorias</option>
          {CATEGORIAS.map((c) => <option key={c}>{c}</option>)}
        </select>
        <input name="q" defaultValue={sp.q ?? ""} placeholder="Fornecedor ou nº" className="rounded border p-2" />
        <button className="rounded border px-3">Filtrar</button>
      </form>

      <div className="overflow-x-auto rounded border">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-100 text-gray-700">
            <tr>{["Data", "Fornecedor", "Nº", "Categoria", "Prédio / Máquina", "Total €", "IVA €", "Carregada por", ""].map((h) => <th key={h} className="p-2">{h}</th>)}</tr>
          </thead>
          <tbody>
            {faturas.map((f) => (
              <tr key={f.id} className="border-t align-top">
                <td className="p-2">{f.data ?? "—"}</td>
                <td className="p-2">{f.fornecedor ?? "—"}{f.alerta && <div className="text-xs text-amber-700">⚠ {f.alerta}</div>}</td>
                <td className="p-2">{f.numero ?? "—"}</td>
                <td className="p-2">{f.categoria}</td>
                <td className="p-2">{f.predio_nome ?? f.maquina_numero ?? "—"}</td>
                <td className="p-2">{f.total?.toFixed(2) ?? "—"}</td>
                <td className="p-2">{f.iva?.toFixed(2) ?? "—"}</td>
                <td className="p-2">{f.criado_por_nome}</td>
                <td className="p-2">{f.ficheiro && <a className="underline" href={`/api/file/${f.id}`} target="_blank">ver</a>}</td>
              </tr>
            ))}
            {!faturas.length && <tr><td colSpan={9} className="p-6 text-center text-gray-500">Sem faturas.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-right text-sm text-gray-600">Total: {total.toFixed(2)} €</p>
    </main>
  );
}
