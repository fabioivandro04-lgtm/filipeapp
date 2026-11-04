"use client";

import { useState } from "react";

type Opcao = { id: string; nome: string; nota: string };

/** Lista de modelos para uma tarefa, com «Outro…» para escrever o id do OpenRouter à mão. */
export default function SeletorModelo({ tarefa, atual, opcoes, padrao, podeDesligar }: {
  tarefa: string; atual: string; opcoes: Opcao[]; padrao: string; podeDesligar: boolean;
}) {
  const conhecido = atual === "" || atual === "-" || opcoes.some((o) => o.id === atual);
  const [escolha, setEscolha] = useState(conhecido ? atual : "outro");
  const nota = opcoes.find((o) => o.id === escolha)?.nota;
  return (
    <div>
      <select name={`modelo_${tarefa}`} value={escolha} onChange={(e) => setEscolha(e.target.value)} className="field">
        <option value="">{padrao}</option>
        {podeDesligar && <option value="-">Desligada (não faz 2.ª leitura)</option>}
        {opcoes.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}
        <option value="outro">Outro modelo…</option>
      </select>
      {nota && <p className="mt-1 text-xs text-slate-500">{nota}</p>}
      {escolha === "outro" && (
        <div className="mt-2">
          <input name={`outro_${tarefa}`} defaultValue={conhecido ? "" : atual} placeholder="ex.: openai/gpt-5.2 (até 3, separados por vírgula)" className="field" autoComplete="off" />
          <p className="mt-1 text-xs text-slate-500">O nome exato como aparece em openrouter.ai/models. Com vários, o 2.º e o 3.º só entram se o anterior falhar.</p>
        </div>
      )}
    </div>
  );
}
