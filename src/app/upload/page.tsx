"use client";
import { useActionState } from "react";
import Link from "next/link";
import { carregarFaturas } from "../actions";

export default function Upload() {
  const [erro, action, pendente] = useActionState(carregarFaturas, null);
  return (
    <main className="mx-auto max-w-xl p-6">
      <Link href="/" className="text-sm underline">← Voltar</Link>
      <h1 className="my-4 text-2xl font-semibold">Carregar faturas</h1>
      <form action={action} className="space-y-4">
        <input name="ficheiros" type="file" multiple accept="image/*,application/pdf" capture="environment" required className="block w-full" />
        <input name="empresa" placeholder="Empresa (opcional)" className="w-full rounded border p-2" />
        <select name="categoria" className="w-full rounded border p-2">
          <option value="">Categoria: detetar automaticamente</option>
          {["energia", "agua", "contabilidade", "predio", "maquinas", "outros"].map((c) => <option key={c}>{c}</option>)}
        </select>
        {erro && <p className="text-sm text-red-600">{erro}</p>}
        <button disabled={pendente} className="rounded bg-black px-4 py-2 text-white disabled:opacity-50">
          {pendente ? "A ler faturas…" : "Enviar"}
        </button>
      </form>
    </main>
  );
}
