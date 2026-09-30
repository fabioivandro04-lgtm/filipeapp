"use client";
import { useActionState } from "react";
import { entrar } from "../actions";

export default function Login() {
  const [erro, action, pendente] = useActionState(entrar, null);
  return (
    <main className="grid min-h-screen place-items-center bg-gradient-to-br from-brand-50 to-white p-4">
      <div className="card w-full max-w-sm p-8">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-brand-600 text-xl font-semibold text-white">G</div>
          <h1 className="text-xl font-semibold">GESTAO APP</h1>
          <p className="mt-1 text-sm text-slate-500">Entre para gerir as faturas</p>
        </div>
        <form action={action} className="space-y-4">
          <div><label className="label">Email</label><input name="email" type="email" required autoComplete="username" className="field" /></div>
          <div><label className="label">Palavra-passe</label><input name="password" type="password" required autoComplete="current-password" className="field" /></div>
          {erro && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{erro}</p>}
          <button disabled={pendente} className="btn-primary w-full">{pendente ? "A entrar…" : "Entrar"}</button>
        </form>
      </div>
    </main>
  );
}
