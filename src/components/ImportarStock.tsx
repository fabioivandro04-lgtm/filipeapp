"use client";
import Link from "next/link";
import { useState } from "react";
import { processarStock, type ResultadoStock } from "@/app/actions";
import { nomeBase } from "@/lib/grupo";
import { ESTADOS, ROTULO_ESTADO, type EstadoFolha } from "@/lib/estados";

type Empresa = { id: number; nome: string };

export default function ImportarStock({ empresas }: { empresas: Empresa[] }) {
  const [ficheiro, setFicheiro] = useState<File | null>(null);
  const [empresa, setEmpresa] = useState("");
  const [estados, setEstados] = useState<Record<string, EstadoFolha>>({});
  const [vazios, setVazios] = useState<"manter" | "limpar">("manter");
  const [res, setRes] = useState<ResultadoStock | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function correr(modo: "analisar" | "importar", f = ficheiro, e = empresa, est = estados, v = vazios) {
    if (!f || !e) return;
    setOcupado(true);
    const fd = new FormData();
    fd.set("ficheiro", f); fd.set("empresa", e); fd.set("modo", modo); fd.set("estados", JSON.stringify(est)); fd.set("vazios", v);
    try {
      const r = await processarStock(fd);
      setRes(r);
      if (r.folhas && modo === "analisar") setEstados(Object.fromEntries(r.folhas.map((x) => [x.nome, x.estado])));
    } catch {
      setRes({ erro: "Não foi possível enviar o ficheiro. Verifique a ligação e tente novamente." });
    } finally {
      setOcupado(false);
    }
  }

  function escolherFicheiro(f: File | null) {
    setFicheiro(f); setRes(null); setEstados({});
    if (!f) return;
    // «STOCK_INDICO_31.08.2026.xlsx» → sugere a empresa cujo nome aparece no nome do ficheiro
    const nomeF = nomeBase(f.name.replace(/\.xlsx$/i, "").replace(/[_\d.]+/g, " "));
    const palpite = empresas.find((x) => nomeF.includes(nomeBase(x.nome)) && nomeBase(x.nome).length > 2);
    if (palpite) { setEmpresa(String(palpite.id)); void correr("analisar", f, String(palpite.id), {}, vazios); }
  }

  const r = res?.resumo;
  const nada = !!r && r.novas + r.atualizar === 0;

  return (
    <div className="space-y-6">
      <div className="card grid gap-4 p-5 md:grid-cols-2">
        <div>
          <label className="label">Ficheiro Excel (.xlsx)</label>
          <input type="file" accept=".xlsx" onChange={(e) => escolherFicheiro(e.target.files?.[0] ?? null)} className="field" />
        </div>
        <div>
          <label className="label">Empresa a que o ficheiro pertence</label>
          <select value={empresa} onChange={(e) => { setEmpresa(e.target.value); setRes(null); void correr("analisar", ficheiro, e.target.value, estados, vazios); }} className="field">
            <option value="">Escolha…</option>
            {empresas.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
          </select>
        </div>
        {ficheiro && empresa && !res && <button onClick={() => correr("analisar")} disabled={ocupado} className="btn-primary md:col-span-2">{ocupado ? "A analisar…" : "Analisar ficheiro"}</button>}
      </div>

      {ocupado && <p className="text-sm text-slate-500">A trabalhar…</p>}
      {res?.erro && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{res.erro}</p>}

      {res?.importado && r && (
        <div className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900">
          <p className="font-medium">Importação concluída para {res.empresa}: {r.novas} máquinas novas e {r.atualizar} atualizadas.</p>
          <p className="mt-1"><Link href={`/maquinas?empresa=${empresa}`} className="underline">Ver as máquinas desta empresa</Link></p>
        </div>
      )}

      {res?.folhas && r && !res.importado && (
        <>
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr><th className="px-4 py-3 text-left">Folha do Excel</th><th className="px-4 py-3 text-right">Máquinas</th><th className="px-4 py-3 text-left">Importar como</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {res.folhas.map((f) => (
                  <tr key={f.nome}>
                    <td className="px-4 py-2 font-medium">{f.nome}{f.ignoradas > 0 && <span className="ml-2 text-xs font-normal text-slate-400">{f.ignoradas} linha(s) de notas ignoradas</span>}</td>
                    <td className="px-4 py-2 text-right">{f.n}</td>
                    <td className="px-4 py-2">
                      <select value={estados[f.nome] ?? f.estado} disabled={ocupado} className="field py-1.5"
                        onChange={(e) => { const novo = { ...estados, [f.nome]: e.target.value as EstadoFolha }; setEstados(novo); void correr("analisar", ficheiro, empresa, novo, vazios); }}>
                        {ESTADOS.map((e) => <option key={e} value={e}>{ROTULO_ESTADO[e]}</option>)}
                        <option value="ignorar">Ignorar esta folha</option>
                      </select>
                      {f.sugerido === "outro" && <span className="ml-2 text-xs text-slate-500">nome não reconhecido</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Cartao rotulo="Máquinas novas" valor={r.novas} />
            <Cartao rotulo="A atualizar" valor={r.atualizar} />
            <Cartao rotulo="Já iguais" valor={r.iguais} />
            <Cartao rotulo="Total no ficheiro" valor={r.total} />
          </div>
          <p className="text-sm text-slate-600">
            {Object.entries(r.porEstado).map(([e, n]) => `${n} ${ROTULO_ESTADO[e as keyof typeof ROTULO_ESTADO]?.toLowerCase() ?? e}`).join(" · ")}
          </p>

          {(res.renumeradas?.length ?? 0) > 0 && (
            <details className="card p-4" open>
              <summary className="cursor-pointer text-sm font-medium text-amber-800">⚠ {res.renumeradas!.length} nº(s) repetido(s) para máquinas diferentes: entram com sufixo (-B) para rever</summary>
              <ul className="mt-2 space-y-1 text-sm text-slate-600">
                {res.renumeradas!.map((x, i) => <li key={i}><span className="font-medium">{x.de}</span> → <span className="font-medium">{x.para}</span> <span className="text-slate-400">({x.folha}, linha {x.linha}: {x.motivo})</span></li>)}
              </ul>
              <p className="mt-2 text-xs text-slate-500">Cada máquina precisa de um nº único, senão as faturas não sabem a qual pertencem. Depois pode corrigir o nº na ficha da máquina.</p>
            </details>
          )}
          {(res.duplicadas?.length ?? 0) > 0 && (
            <details className="card p-4">
              <summary className="cursor-pointer text-sm font-medium">{res.duplicadas!.length} linha(s) repetida(s) idêntica(s) ignoradas</summary>
              <ul className="mt-2 space-y-1 text-sm text-slate-600">{res.duplicadas!.map((x, i) => <li key={i}>{x.numero}: {x.folha} linha {x.linha} é igual a {x.comFolha} linha {x.comLinha}</li>)}</ul>
            </details>
          )}
          {(res.ignoradas?.length ?? 0) > 0 && (
            <details className="card p-4">
              <summary className="cursor-pointer text-sm font-medium">{res.ignoradas!.length} linha(s) sem nº interno ignoradas (notas/legendas)</summary>
              <ul className="mt-2 space-y-1 text-sm text-slate-600">{res.ignoradas!.map((x, i) => <li key={i}>{x.folha}, linha {x.linha}: «{x.texto}»</li>)}</ul>
            </details>
          )}
          {r.semValor > 0 && <p className="text-sm text-slate-600">{r.semValor} valor(es) de compra não estão em euros (ex.: libras): ficam guardados como estavam e não entram nos totais em €.</p>}
          {(res.atualizacoes?.length ?? 0) > 0 && (
            <details className="card p-4">
              <summary className="cursor-pointer text-sm font-medium">O que muda nas {r.atualizar} máquinas já existentes</summary>
              <ul className="mt-2 space-y-1 text-sm text-slate-600">{res.atualizacoes!.map((x) => <li key={x.numero}><span className="font-medium">{x.numero}</span>: {x.mudancas.join(", ")}</li>)}{r.atualizar > 40 && <li className="text-slate-400">…e mais {r.atualizar - 40}</li>}</ul>
            </details>
          )}

          {r.atualizar > 0 || r.iguais > 0 ? (
            <fieldset className="card space-y-2 p-4 text-sm">
              <legend className="px-1 text-xs font-medium uppercase tracking-wide text-slate-500">Campos vazios no ficheiro</legend>
              <p className="text-slate-600">Há campos vazios de propósito (ex.: os baldes não têm horas nem matrícula). E se uma máquina já tem esse dado na app?</p>
              {(["manter", "limpar"] as const).map((v) => (
                <label key={v} className="flex items-start gap-2">
                  <input type="radio" name="vazios" checked={vazios === v} onChange={() => { setVazios(v); void correr("analisar", ficheiro, empresa, estados, v); }} className="mt-1" />
                  <span>{v === "manter" ? "Manter o que já está na app (recomendado)" : "Apagar na app também (o ficheiro manda)"}</span>
                </label>
              ))}
            </fieldset>
          ) : null}

          <button onClick={() => correr("importar")} disabled={ocupado || nada} className="btn-primary w-full">
            {ocupado ? "A importar…" : nada ? "Nada a importar: já está tudo igual" : `Importar ${r.novas} novas e atualizar ${r.atualizar}`}
          </button>
          <p className="text-xs text-slate-500">Pode voltar a importar o mesmo ficheiro sem duplicar: só entra o que é novo ou mudou.</p>
        </>
      )}
    </div>
  );
}

function Cartao({ rotulo, valor }: { rotulo: string; valor: number }) {
  return <div className="card p-4"><p className="text-xs font-medium uppercase tracking-wide text-slate-500">{rotulo}</p><p className="mt-1 text-2xl font-semibold">{valor}</p></div>;
}
