import Link from "next/link";
import { editaDireto, requireUser } from "@/lib/auth";
import { listarDocumentos, opcoesMaquinas, todasEmpresas } from "@/lib/queries";
import { COR_PRAZO, DIAS_AVISO, ROTULO_DOCUMENTO, TIPOS_DOCUMENTO, estadoPrazo, textoPrazo, type EstadoPrazo, type TipoDocumento } from "@/lib/prazos";
import { dataPt } from "@/lib/format";
import { apagarDocumento, guardarDocumento, renovarDocumento } from "@/app/actions";
import ConfirmarBotao from "@/components/ConfirmarBotao";
import { PageHeader, Stat, Vazio } from "@/components/Ui";

type SP = { ok?: string; erro?: string; empresa?: string; tipo?: string; ver?: string };
const VER: Record<string, string> = { tratar: "Caducados e a caducar", todos: "Todos" };

export default async function Prazos({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const empresaId = Number(sp.empresa) || undefined;
  const tipo = (TIPOS_DOCUMENTO as readonly string[]).includes(sp.tipo ?? "") ? sp.tipo : undefined;
  const ver = sp.ver === "todos" ? "todos" : "tratar";
  const [todos, empresas, maquinas] = await Promise.all([listarDocumentos({ empresaId, tipo }), todasEmpresas(), opcoesMaquinas()]);
  // Máquinas vendidas ou abatidas já não precisam de seguro/inspeção: não contam para os avisos
  const ativos = todos.filter((d) => !d.maquina_estado || !["vendido", "abatido"].includes(d.maquina_estado));
  const conta: Record<EstadoPrazo, number> = { caducado: 0, urgente: 0, ok: 0 };
  for (const d of ativos) conta[estadoPrazo(d.validade)]++;
  const lista = ver === "todos" ? todos : ativos.filter((d) => estadoPrazo(d.validade) !== "ok");
  const podeEditar = editaDireto(user);
  const qs = new URLSearchParams(Object.entries({ empresa: sp.empresa, tipo, ver: ver === "todos" ? "todos" : undefined }).filter(([, v]) => v) as [string, string][]).toString();
  const aqui = `/prazos${qs ? `?${qs}` : ""}`;

  return (
    <>
      <PageHeader titulo="Prazos e documentos" subtitulo={`Seguros, inspeções, IUC e certificados. Avisamos ${DIAS_AVISO} dias antes de caducarem.`} />
      {sp.ok && <p className="mb-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{sp.ok}</p>}
      {sp.erro && <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{sp.erro}</p>}

      <div className="mb-6 grid grid-cols-3 gap-3 md:max-w-2xl">
        <Stat rotulo="Caducados" valor={String(conta.caducado)} destaque={conta.caducado > 0} />
        <Stat rotulo={`A caducar (${DIAS_AVISO} dias)`} valor={String(conta.urgente)} destaque={conta.urgente > 0} />
        <Stat rotulo="Em dia" valor={String(conta.ok)} />
      </div>

      <form className="mb-4 flex flex-col gap-2 md:flex-row">
        <select name="ver" defaultValue={ver} className="field md:max-w-[14rem]">{Object.entries(VER).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <select name="tipo" defaultValue={tipo ?? ""} className="field md:max-w-[12rem]">
          <option value="">Todos os tipos</option>{TIPOS_DOCUMENTO.map((t) => <option key={t} value={t}>{ROTULO_DOCUMENTO[t]}</option>)}
        </select>
        <select name="empresa" defaultValue={sp.empresa ?? ""} className="field md:max-w-[14rem]">
          <option value="">Todas as empresas</option>{empresas.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
        </select>
        <button className="btn-ghost">Filtrar</button>
      </form>

      {!lista.length ? <Vazio texto={ver === "tratar" ? "Nada caducado nem a caducar. Tudo em dia." : "Ainda não há documentos registados."} /> : (
        <div className="card mb-8 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr><th className="px-4 py-3 text-left">Validade</th><th className="px-4 py-3 text-left">Documento</th><th className="px-4 py-3 text-left">Máquina / empresa</th>{podeEditar && <th className="px-4 py-3 text-left">Renovar</th>}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lista.map((d) => {
                const est = estadoPrazo(d.validade);
                return (
                  <tr key={d.id} className="align-top">
                    <td className="whitespace-nowrap px-4 py-3">{dataPt(d.validade)}<span className={`badge mt-1 block w-fit ${COR_PRAZO[est]}`}>{textoPrazo(d.validade)}</span></td>
                    <td className="px-4 py-3">
                      <p className="font-medium">{ROTULO_DOCUMENTO[d.tipo as TipoDocumento] ?? d.tipo}</p>
                      {d.descricao && <p className="text-slate-500">{d.descricao}</p>}
                      {d.ficheiro_id && <a href={`/api/documentos/${d.id}`} target="_blank" className="text-brand-600 hover:underline">ver documento</a>}
                    </td>
                    <td className="px-4 py-3">
                      {d.maquina_id ? <Link href={`/maquinas/${d.maquina_id}`} className="font-medium hover:text-brand-600">{d.maquina_numero}</Link> : null}
                      {d.maquina_descricao && <span className="block text-slate-500">{d.maquina_descricao}</span>}
                      <span className="block text-slate-500">{d.empresa_nome ?? ""}</span>
                    </td>
                    {podeEditar && (
                      <td className="px-4 py-3">
                        <form action={renovarDocumento.bind(null, d.id)} className="flex flex-wrap items-center gap-2">
                          <input type="hidden" name="voltar" value={aqui} />
                          <input type="date" name="validade" required className="field py-1.5" aria-label="Nova validade" />
                          <button className="btn-ghost px-3 py-1.5">Renovar</button>
                        </form>
                        {user.cargo === "admin" && (
                          <form action={apagarDocumento.bind(null, d.id)} className="mt-1"><input type="hidden" name="voltar" value={aqui} />
                            <ConfirmarBotao className="text-xs text-slate-400 hover:text-red-600" mensagem="Apagar este documento?">Apagar</ConfirmarBotao></form>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {podeEditar && (
        <div className="card p-4">
          <h2 className="mb-3 font-semibold">Adicionar documento</h2>
          <form action={guardarDocumento.bind(null, null)} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <input type="hidden" name="voltar" value={aqui} />
            <div><label className="label">Tipo</label>
              <select name="tipo" required className="field">{TIPOS_DOCUMENTO.map((t) => <option key={t} value={t}>{ROTULO_DOCUMENTO[t]}</option>)}</select></div>
            <div><label className="label">Máquina (nº interno)</label>
              <input name="maquina" list="lista-maquinas" autoComplete="off" placeholder="Ex.: SL 005 ou IN003" className="field" />
              <datalist id="lista-maquinas">{maquinas.map((m) => <option key={m.id} value={m.numero_interno}>{m.descricao ?? ""}</option>)}</datalist></div>
            <div><label className="label">…ou empresa</label>
              <select name="empresa" className="field"><option value="">—</option>{empresas.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}</select></div>
            <div><label className="label">Válido até</label><input type="date" name="validade" required className="field" /></div>
            <div><label className="label">Descrição (opcional)</label><input name="descricao" placeholder="Ex.: apólice nº, seguradora" className="field" /></div>
            <div><label className="label">Comprovativo (opcional)</label><input type="file" name="ficheiro" accept="application/pdf,image/*" className="field py-1.5" /></div>
            <input name="notas" placeholder="Notas (opcional)" className="field sm:col-span-2" />
            <button className="btn-primary">Guardar</button>
          </form>
        </div>
      )}
    </>
  );
}
