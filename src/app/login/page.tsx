"use client";
import { useActionState } from "react";
import { entrar } from "../actions";

export default function Login() {
  const [erro, action, pendente] = useActionState(entrar, null);
  return (
    <main className="mx-auto mt-24 max-w-sm p-6">
      <h1 className="mb-6 text-2xl font-semibold">Filipe App</h1>
      <form action={action} className="space-y-3">
        <input name="email" type="email" placeholder="Email" required className="w-full rounded border p-2" />
        <input name="password" type="password" placeholder="Palavra-passe" required className="w-full rounded border p-2" />
        {erro && <p className="text-sm text-red-600">{erro}</p>}
        <button disabled={pendente} className="w-full rounded bg-black p-2 text-white disabled:opacity-50">Entrar</button>
      </form>
    </main>
  );
}
