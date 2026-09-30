import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { obterFatura, todasEmpresas, todasMaquinas, todosPredios } from "@/lib/queries";
import { CATEGORIAS } from "@/lib/categorias";
import { money } from "@/lib/format";
import { apagarFatura, guardarFatura } from "@/app/actions";
import { listarHistorico } from "@/lib/historico";
import HistoricoLista from "@/components/HistoricoLista";
import { PageHeader } from "@/components/Ui";

type Item = { descricao: string; quantidade: number | null; preco_unitario: number | null; total: number | null };

export default async function FaturaPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const f = await obterFatura(user, Number(id));
  if (!f) notFound();
  const podeEditar = user.cargo === "admin" || user.cargo === "operador";
  const itens: Item[] = f.itens ? JSON.parse(f.itens) : [];
  const [predios, maquinas, empresas, registos] = await Promise.all([todosPredios(), todasMaquinas(), todasEmpresas(), listarHistorico({ faturaId: f.id, limite: 50 })]);
  const nomes = {
    empresas: Object.fromEntries(empresas.map((e) => [e.id, e.nome])),
    predios: Object.fromEntries(predios.map((p) => [p.id, p.nome])),
    maquinas: Object.fromEntries(maquinas.map((m) => [m.id, m.numero_interno])),
  };
  const pdf = f.ficheiro_mime === "application/pdf";

  return (
    <>
      <Link href="/" className="text-sm text-slate-500 hover:text-slate-900">← Faturas</Link>
      <div className="mt-2"><PageHeader titulo={f.fornecedor ?? "Fatura sem nome"} subtitulo={`Carregada por ${f.criado_por_nome} em ${f.criado_em.slice(0, 10)}`}>
          {f.qr_lido ? <span className="badge bg-emerald-100 text-emerald-800" title={f.atcud ?? undefined}>✓ QR fiscal lido{f.atcud ? ` · ${f.atcud}` : ""}</span> : null}
          {f.enviada_em && <span className="badge bg-sky-100 text-sky-800">Enviada à contabilidade</span>}
        </PageHeader></div>

      {f.alerta && !f.revisada && <p className="mb-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">⚠ {f.alerta}</p>}

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
            <fieldset disabled={!podeEditar} className="grid grid-cols-2 gap-4">
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
                  {predios.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Máquina</label>
                <select name="maquina_id" defaultValue={f.maquina_id ?? ""} className="field">
                  <option value="">—</option>
                  {maquinas.map((m) => <option key={m.id} value={m.id}>{m.numero_interno} {m.descricao}</option>)}
                </select>
              </div>
              <Campo nome="identificador" rotulo="Nº contador / cliente" v={f.identificador} span />
              <Campo nome="nif_adquirente" rotulo="NIF do cliente (a sua empresa)" v={f.nif_adquirente} span />
              <label className="col-span-2 flex items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" name="memorizar_empresa" defaultChecked className="h-4 w-4" />
                Memorizar este NIF na empresa escolhida (as próximas faturas ligam-se sozinhas)
              </label>
              <label className="col-span-2 flex items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" name="memorizar" defaultChecked className="h-4 w-4" />
                Memorizar este nº no prédio escolhido (liga as próximas faturas sozinho)
              </label>
              <label className="col-span-2 flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" name="revisada" defaultChecked={!!f.revisada} className="h-4 w-4" /> Marcar como revista
              </label>
            </fieldset>
            {podeEditar
              ? <button className="btn-primary w-full">Guardar</button>
              : <p className="text-sm text-slate-500">O seu cargo só permite consultar.</p>}
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
            <form action={apagarFatura.bind(null, f.id)}><button className="btn-danger">Apagar fatura</button><p className="mt-1 text-xs text-slate-500">Pode ser restaurada no Histórico.</p></form>
          )}
        </div>
      </div>

      <h2 className="mb-3 mt-10 text-lg font-semibold">Histórico desta fatura</h2>
      <HistoricoLista registos={registos} nomes={nomes} podeDesfazer={podeEditar} mostrarFatura={false} />
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
