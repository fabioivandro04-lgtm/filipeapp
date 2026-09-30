"use client";
import { useActionState } from "react";
import { alterarSenha } from "@/app/actions";
import { PageHeader } from "@/components/Ui";

export default function Conta() {
  const [r, action, pendente] = useActionState(alterarSenha, null);
  return (
    <div className="mx-auto max-w-md">
      <PageHeader titulo="Alterar palavra-passe" subtitulo="Escolha uma palavra-passe que só você conheça (mínimo 10 caracteres)." />
      <form action={action} className="card space-y-4 p-5">
        <div><label className="label">Palavra-passe atual</label><input name="atual" type="password" required autoComplete="current-password" className="field" /></div>
        <div><label className="label">Nova palavra-passe</label><input name="nova" type="password" required minLength={10} autoComplete="new-password" className="field" /></div>
        <div><label className="label">Repetir a nova</label><input name="confirmar" type="password" required minLength={10} autoComplete="new-password" className="field" /></div>
        {r?.erro && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{r.erro}</p>}
        {r?.ok && <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">Palavra-passe alterada com sucesso.</p>}
        <button disabled={pendente} className="btn-primary w-full">{pendente ? "A guardar…" : "Guardar"}</button>
      </form>
    </div>
  );
}
