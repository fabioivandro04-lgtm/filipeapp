"use client";
import { useActionState, useState } from "react";
import { carregarFaturas } from "@/app/actions";
import { CATEGORIAS } from "@/lib/categorias";
import { PageHeader } from "@/components/Ui";

export default function Upload() {
  const [erro, action, pendente] = useActionState(carregarFaturas, null);
  const [n, setN] = useState(0);
  const contar = (e: React.ChangeEvent<HTMLFormElement>) => {
    const total = [...e.currentTarget.querySelectorAll<HTMLInputElement>("input[type=file]")].reduce((s, i) => s + (i.files?.length ?? 0), 0);
    setN(total);
  };

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader titulo="Carregar faturas" subtitulo="Tire uma foto ou escolha ficheiros. A app lê os dados sozinha." />
      <form action={action} onChange={contar} className="card space-y-5 p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="btn-primary cursor-pointer py-4">
            📷 Tirar foto
            <input name="ficheiros" type="file" accept="image/*" capture="environment" className="sr-only" />
          </label>
          <label className="btn-ghost cursor-pointer py-4">
            📁 Escolher ficheiros
            <input name="ficheiros" type="file" multiple accept="image/*,application/pdf" className="sr-only" />
          </label>
        </div>
        <p className="text-center text-sm text-slate-500">{n ? `${n} ficheiro(s) selecionado(s)` : "Nenhum ficheiro selecionado"}</p>

        <div>
          <label className="label">Empresa (opcional)</label>
          <input name="empresa" placeholder="Ex.: Filipe Lda" className="field" />
        </div>
        <div>
          <label className="label">Categoria</label>
          <select name="categoria" className="field">
            <option value="">Detetar automaticamente</option>
            {CATEGORIAS.map(([v, nome]) => <option key={v} value={v}>{nome}</option>)}
          </select>
        </div>
        {erro && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{erro}</p>}
        <button disabled={pendente || !n} className="btn-primary w-full">{pendente ? "A ler as faturas… pode demorar" : "Enviar"}</button>
      </form>
    </div>
  );
}
