"use client";
import { useActionState } from "react";
import { alterarSenha } from "@/app/actions";

/** Alterar a própria palavra-passe (termina as outras sessões abertas). */
export default function FormSenha() {
  const [r, action, pendente] = useActionState(alterarSenha, null);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-3">
      <div><label className="label">Palavra-passe atual</label><input name="atual" type="password" required autoComplete="current-password" className="field" /></div>
      <div><label className="label">Nova (mín. 10)</label><input name="nova" type="password" required minLength={10} autoComplete="new-password" className="field" /></div>
      <div><label className="label">Repetir a nova</label><input name="confirmar" type="password" required minLength={10} autoComplete="new-password" className="field" /></div>
      {r?.erro && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700 sm:col-span-3">{r.erro}</p>}
      {r?.ok && <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800 sm:col-span-3">Palavra-passe alterada. As outras sessões abertas foram terminadas.</p>}
      <div className="sm:col-span-3"><button disabled={pendente} className="btn-primary">{pendente ? "A guardar…" : "Alterar palavra-passe"}</button></div>
    </form>
  );
}
