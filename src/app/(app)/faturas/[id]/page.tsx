import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { carregarNomes, listarPropostas, obterFatura, todasEmpresas, opcoesMaquinas, todosPredios } from "@/lib/queries";
import { CATEGORIAS } from "@/lib/categorias";
import { money } from "@/lib/format";
import { aceitarProposta, apagarFatura, guardarFatura, lerOutraVez, rejeitarProposta } from "@/app/actions";
import { editaDireto } from "@/lib/auth";
import ConfirmarBotao from "@/components/ConfirmarBotao";
import DiffLista from "@/components/Diff";
import { listarHistorico } from "@/lib/historico";
import HistoricoLista from "@/components/HistoricoLista";
import { PageHeader } from "@/components/Ui";
import { Voltar } from "@/components/Voltar";
import AtualizarSePendente from "@/components/AtualizarSePendente";
import { CLASSE_SEMAFORO, semaforo } from "@/lib/semaforo";

type Item = { descricao: string; quantidade: number | null; preco_unitario: number | null; total: number | null };

export default async function FaturaPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; erro?: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const sp = await searchParams;
  const f = await obterFatura(user, Number(id));
  if (!f) notFound();
  const direto = editaDireto(user); // admin/operador editam; o contabilista propõe e o admin aceita
  const itens: Item[] = f.itens ? JSON.parse(f.itens) : [];
  const [predios, maquinas, empresas, registos, nomes, propostas] = await Promise.all([
    todosPredios(), opcoesMaquinas(), todasEmpresas(), listarHistorico({ faturaId: f.id, limite: 50 }), carregarNomes(),
    listarPropostas({ faturaId: f.id, estado: ["pendente"] }),
  ]);
  const minha = propostas.find((p) => p.user_id === user.id);
  // Se o prédio/máquina desta fatura foi apagado, continua a aparecer nas opções (senão gravar apagava a ligação sem querer)
  const prediosTodos = await todosPredios(true);
  const opcoesPredios = predios.some((p) => p.id === f.predio_id) ? predios : [...predios, ...prediosTodos.filter((p) => p.id === f.predio_id)];
  const pdf = f.ficheiro_mime === "application/pdf";

  return (
    <>
      <Voltar lista="/" texto="Faturas" />
      <AtualizarSePendente ativo={f.leitura === "pendente"} />
      <div className="mt-2"><PageHeader titulo={f.fornecedor ?? "Fatura sem nome"} subtitulo={`Carregada por ${f.criado_por_nome} em ${f.criado_em.slice(0, 10)}`}>
          {f.qr_lido ? <span className="badge bg-emerald-100 text-emerald-800" title={f.atcud ?? undefined}>QR fiscal lido{f.atcud ? ` · ${f.atcud}` : ""}</span> : null}
          {(() => { const e = semaforo(f); return <span className={`badge ${CLASSE_SEMAFORO[e.cor]}`}>{e.texto}</span>; })()}
          {f.enviada_em && <span className="badge bg-sky-100 text-sky-800">Enviada à contabilidade</span>}
        </PageHeader></div>

      {sp.ok && <p className="mb-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{sp.ok}</p>}
      {sp.erro && <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{sp.erro}</p>}

      {propostas.map((p) => (
        <div key={p.id} className="mb-4 rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm">
          <p className="font-medium text-sky-900">
            {p.user_id === user.id ? "A sua proposta está à espera de aprovação" : `Proposta de ${p.user_nome} à espera de aprovação`}
            <span className="ml-2 font-normal text-sky-700">{p.criado_em.slice(0, 16)}</span>
          </p>
          <div className="mt-2"><DiffLista diff={JSON.parse(p.alteracoes)} nomes={nomes} /></div>
          {user.cargo === "admin" && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <form action={aceitarProposta.bind(null, p.id)}><button className="btn-primary px-3 py-1.5">Aceitar</button></form>
              <form action={rejeitarProposta.bind(null, p.id)} className="flex gap-2">
                <input name="motivo" placeholder="Motivo (opcional)" className="field py-1.5" />
                <button className="btn-ghost px-3 py-1.5">Rejeitar</button>
              </form>
            </div>
          )}
        </div>
      ))}

      {f.leitura === "pendente" && <p className="mb-4 rounded-xl bg-slate-100 p-3 text-sm text-slate-700">A ler os dados da fatura… vão aparecer aqui dentro de instantes (pode preencher à mão, se preferir).</p>}
      {f.leitura === "ia" && !f.revisada && !f.alerta && <p className="mb-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Dados lidos por IA: confira com a imagem ao lado e marque «revista».</p>}
      {direto && f.leitura !== "pendente" && f.leitura !== "qr" && (
        <form action={lerOutraVez.bind(null, f.id)} className="mb-4"><button className="btn-ghost px-3 py-1.5 text-sm">Ler outra vez com IA</button></form>
      )}
      {f.alerta && !f.revisada && <p className="mb-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{f.alerta}</p>}

      <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
        <div className="card overflow-hidden lg:sticky lg:top-20 lg:self-start">
          {f.ficheiro_id ? (pdf
            ? <iframe src={`/api/file/${f.id}`} className="h-[70vh] w-full" title="Fatura" />
            // eslint-disable-next-line @next/next/no-img-element
            : <img src={`/api/file/${f.id}`} alt="Fatura" className="w-full" />)
            : <p className="p-10 text-center text-sm text-slate-500">Sem ficheiro.</p>}
        </div>

        <div className="space-y-6">
          <form action={guardarFatura.bind(null, f.id)} className="card space-y-4 p-5">
            <fieldset className="grid grid-cols-2 gap-4">
              <Campo nome="fornecedor" rotulo="Fornecedor" v={f.fornecedor} span />
              <Campo nome="nif" rotulo="NIF" v={f.nif_fornecedor} />
              <Campo nome="numero" rotulo="Nº da fatura" v={f.numero} />
              <Campo nome="data" rotulo="Data" v={f.data} tipo="date" />
              <Campo nome="total" rotulo="Total (€)" v={f.total?.toString() ?? null} tipo="number" />
              <Campo nome="iva" rotulo="IVA (€)" v={f.iva?.toString() ?? null} tipo="number" />
              <div>
                <label className="label">Categoria</label>
                <select name="categoria" defaultValue={f.categoria} className="field">
                  {CATEGORIAS.map(([v, n]) => <option key={v} value={v}>{n}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Empresa</label>
                <input name="empresa" defaultValue={f.empresa_nome ?? ""} list="empresas" className="field" />
                <datalist id="empresas">{empresas.map((e) => <option key={e.id} value={e.nome} />)}</datalist>
              </div>
              <div>
                <label className="label">Prédio</label>
                <select name="predio_id" defaultValue={f.predio_id ?? ""} className="field">
                  <option value="">—</option>
                  {opcoesPredios.map((p) => <option key={p.id} value={p.id}>{p.nome}{p.apagada_em ? " (apagado)" : ""}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Máquina (nº interno)</label>
                <input name="maquina" defaultValue={f.maquina_numero ?? ""} list="lista-maquinas" placeholder="Ex.: SL 005 ou IN003" autoComplete="off" className="field" />
                <datalist id="lista-maquinas">{maquinas.map((m) => <option key={m.id} value={m.numero_interno}>{m.descricao ?? ""}</option>)}</datalist>
              </div>
              <Campo nome="identificador" rotulo="Nº contador / cliente" v={f.identificador} span />
              <Campo nome="nif_adquirente" rotulo="NIF do cliente (a sua empresa)" v={f.nif_adquirente} span />
              {direto && (
                <label className="col-span-2 flex items-center gap-2 text-sm text-slate-600">
                  <input type="checkbox" name="memorizar_empresa" defaultChecked className="h-4 w-4" />
                  Memorizar este NIF na empresa escolhida (as próximas faturas ligam-se sozinhas)
                </label>
              )}
              {direto && (
                <label className="col-span-2 flex items-center gap-2 text-sm text-slate-600">
                  <input type="checkbox" name="memorizar" defaultChecked className="h-4 w-4" />
                  Memorizar este nº no prédio escolhido (liga as próximas faturas sozinho)
                </label>
              )}
              <label className="col-span-2 flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" name="revisada" defaultChecked={!!f.revisada} className="h-4 w-4" /> Marcar como revista
              </label>
            </fieldset>
            {direto ? (
              <button className="btn-primary w-full">Guardar</button>
            ) : (
              <>
                <button className="btn-primary w-full">{minha ? "Atualizar a minha proposta" : "Propor alteração"}</button>
                <p className="text-xs text-slate-500">As alterações não mudam a fatura já: ficam como proposta e só entram em vigor quando um administrador as aceitar.</p>
              </>
            )}
          </form>

          {itens.length > 0 && (
            <div className="card overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr><th className="px-4 py-2 text-left">Artigo</th><th className="px-2 py-2 text-right">Qtd</th><th className="px-4 py-2 text-right">Total</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {itens.map((i, k) => (
                    <tr key={k}><td className="px-4 py-2">{i.descricao}</td><td className="px-2 py-2 text-right">{i.quantidade ?? "—"}</td><td className="px-4 py-2 text-right">{money(i.total)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {user.cargo === "admin" && (
            <form action={apagarFatura.bind(null, f.id)}><ConfirmarBotao className="btn-danger" mensagem="Apagar esta fatura? Pode restaurá-la em Apagados.">Apagar fatura</ConfirmarBotao><p className="mt-1 text-xs text-slate-500">Pode ser restaurada em Definições → Apagados.</p></form>
          )}
        </div>
      </div>

      <h2 className="mb-3 mt-10 text-lg font-semibold">Histórico desta fatura</h2>
      <HistoricoLista registos={registos} nomes={nomes} podeDesfazer={direto} mostrarFatura={false} />
    </>
  );
}

function Campo({ nome, rotulo, v, tipo = "text", span }: { nome: string; rotulo: string; v: string | null; tipo?: string; span?: boolean }) {
  return (
    <div className={span ? "col-span-2" : ""}>
      <label className="label">{rotulo}</label>
      <input name={nome} type={tipo} step={tipo === "number" ? "0.01" : undefined} defaultValue={v ?? ""} className="field" />
    </div>
  );
}
