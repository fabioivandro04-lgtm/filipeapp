import Link from "next/link";
import { notFound } from "next/navigation";
import { editaDireto, requireUser } from "@/lib/auth";
import { listarFaturas, maquinasComMesmaSerie, todasEmpresas, todasMaquinas } from "@/lib/queries";
import { empresaDoGrupo } from "@/lib/grupo";
import { ESTADOS, ROTULO_ESTADO } from "@/lib/estados";
import { COR_ESTADO, dataPt, money } from "@/lib/format";
import { apagarEntidade, atualizarMaquina, restaurarEntidade } from "@/app/actions";
import ConfirmarBotao from "@/components/ConfirmarBotao";
import { PageHeader, Stat, Vazio } from "@/components/Ui";

type Item = { descricao: string; quantidade: number | null; total: number | null };

export default async function MaquinaPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; erro?: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const sp = await searchParams;
  const m = (await todasMaquinas(true)).find((x) => x.id === Number(id)); // inclui apagadas, para os links antigos continuarem a abrir
  if (!m) notFound();
  const [faturas, empresas, mesmaSerie] = await Promise.all([listarFaturas(user, { maquina_id: m.id }), todasEmpresas(), maquinasComMesmaSerie(m)]);
  const total = faturas.reduce((s, f) => s + (f.total ?? 0), 0);
  const podeEditar = editaDireto(user);
  const empresa = empresas.find((e) => e.id === m.empresa_id);
  const compradorGrupo = m.estado === "vendido" ? empresaDoGrupo(m.comprador, empresas) : null;
  const fornecedorGrupo = empresaDoGrupo(m.fornecedor, empresas);
  // Histórico do que a máquina consumiu: uma linha por artigo comprado
  const consumos = faturas.flatMap((f) =>
    ((f.itens ? JSON.parse(f.itens) : []) as Item[]).map((i) => ({ ...i, data: f.data, fornecedor: f.fornecedor, fatura: f.id })));

  // Só se mostram os campos preenchidos: muitos ficam vazios de propósito (ex.: um balde não tem horas nem matrícula)
  const ficha: [string, string | null][] = [
    ["Designação", m.designacao], ["Marca", m.marca], ["Modelo", m.modelo], ["Ano", m.ano != null ? String(m.ano) : null],
    ["Nº de série", m.numero_serie], ["Matrícula", m.matricula], ["Peso", m.peso_kg != null ? `${m.peso_kg.toLocaleString("pt-PT")} kg` : null],
    ["Horas", m.horas != null ? `${m.horas.toLocaleString("pt-PT")} h` : null], ["ID fornecedor", m.id_fornecedor],
    ["Fornecedor", m.fornecedor ? m.fornecedor + (fornecedorGrupo ? " (empresa do grupo)" : "") : null], ["Agência", m.agencia],
    ["Data de compra", m.data_compra ? dataPt(m.data_compra) : null], ["Data de chegada", m.data_chegada ? dataPt(m.data_chegada) : null],
    ["Valor de compra", m.valor_compra != null ? money(m.valor_compra) : null], ["Valor (como veio no ficheiro)", m.valor_compra_original],
    ["Facturada", m.facturada && !m.venda_fatura ? m.facturada : null],
    ["Comprador", m.comprador ? m.comprador + (compradorGrupo ? " (empresa do grupo)" : "") : null], ["Fatura de venda", m.venda_fatura],
    ["Data da venda", m.data_venda ? dataPt(m.data_venda) : null], ["Observações", m.observacoes],
  ];

  return (
    <>
      <Link href="/maquinas" className="text-sm text-slate-500 hover:text-slate-900">← Máquinas</Link>
      <div className="mt-2">
        <PageHeader titulo={`Máquina ${m.numero_interno}${m.assinalada ? "*" : ""}`} subtitulo={m.descricao ?? undefined}>
          <span className={`badge ${COR_ESTADO[m.estado] ?? COR_ESTADO.outro}`}>{ROTULO_ESTADO[m.estado as keyof typeof ROTULO_ESTADO] ?? m.estado}</span>
          {empresa && <span className="badge bg-slate-100 text-slate-700">{empresa.nome}</span>}
          {compradorGrupo && <span className="badge bg-indigo-100 text-indigo-800">Transferida → {compradorGrupo.nome}</span>}
        </PageHeader>
      </div>
      {sp.ok && <p className="mb-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{sp.ok}</p>}
      {sp.erro && <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{sp.erro}</p>}
      {m.apagada_em && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-100 p-3 text-sm text-slate-700">
          <span>Esta máquina está apagada. As faturas ligadas mantêm-se.</span>
          {user.cargo === "admin" && <form action={restaurarEntidade.bind(null, "maquinas", m.id)}><button className="btn-primary px-3 py-1.5">Restaurar</button></form>}
        </div>
      )}

      {mesmaSerie.length > 0 && (
        <div className="mb-4 rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-900">
          <p className="font-medium">A mesma máquina (mesmo nº de série) está registada noutra empresa do grupo:</p>
          <ul className="mt-1 space-y-0.5">
            {mesmaSerie.map((o) => (
              <li key={o.id}><Link href={`/maquinas/${o.id}`} className="underline">{o.numero_interno}</Link> · {o.empresa ?? "sem empresa"} · {ROTULO_ESTADO[o.estado as keyof typeof ROTULO_ESTADO] ?? o.estado}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 md:max-w-xl md:grid-cols-3">
        <Stat rotulo="Gasto em faturas" valor={money(total)} />
        <Stat rotulo="Faturas" valor={String(faturas.length)} />
        {m.valor_compra != null && <Stat rotulo="Valor de compra" valor={money(m.valor_compra)} />}
      </div>

      {ficha.some(([, v]) => v) && (
        <dl className="card mb-6 grid gap-x-6 gap-y-3 p-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {ficha.filter(([, v]) => v).map(([k, v]) => (
            <div key={k}><dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{k}</dt><dd className="mt-0.5">{v}</dd></div>
          ))}
        </dl>
      )}

      {podeEditar && !m.apagada_em && (
        <details className="card mb-8 p-4">
          <summary className="cursor-pointer text-sm font-medium">Editar esta máquina</summary>
          <form action={atualizarMaquina.bind(null, m.id)} className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Campo n="numero" r="Nº interno" v={m.numero_interno} obrigatorio />
            <div><label className="label">Empresa</label>
              <select name="empresa" defaultValue={m.empresa_id ?? ""} className="field"><option value="">Sem empresa</option>{empresas.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}</select></div>
            <div><label className="label">Estado</label>
              <select name="estado" defaultValue={m.estado} className="field">{ESTADOS.map((e) => <option key={e} value={e}>{ROTULO_ESTADO[e]}</option>)}</select></div>
            <Campo n="ano" r="Ano" v={m.ano} tipo="number" />
            <Campo n="designacao" r="Designação" v={m.designacao} /><Campo n="marca" r="Marca" v={m.marca} /><Campo n="modelo" r="Modelo" v={m.modelo} />
            <Campo n="numero_serie" r="Nº de série" v={m.numero_serie} /><Campo n="matricula" r="Matrícula" v={m.matricula} />
            <Campo n="peso_kg" r="Peso (kg)" v={m.peso_kg} tipo="number" /><Campo n="horas" r="Horas" v={m.horas} tipo="number" />
            <Campo n="id_fornecedor" r="ID fornecedor" v={m.id_fornecedor} /><Campo n="fornecedor" r="Fornecedor" v={m.fornecedor} /><Campo n="agencia" r="Agência" v={m.agencia} />
            <Campo n="data_compra" r="Data de compra" v={m.data_compra} tipo="date" /><Campo n="data_chegada" r="Data de chegada" v={m.data_chegada} tipo="date" />
            <Campo n="valor_compra" r="Valor de compra (€)" v={m.valor_compra} tipo="number" />
            <Campo n="comprador" r="Comprador" v={m.comprador} /><Campo n="venda_fatura" r="Fatura de venda" v={m.venda_fatura} /><Campo n="data_venda" r="Data da venda" v={m.data_venda} tipo="date" />
            <Campo n="facturada" r="Facturada (nota)" v={m.facturada} /><Campo n="observacoes" r="Observações" v={m.observacoes} />
            <p className="text-xs text-slate-500 sm:col-span-2 lg:col-span-4">Pode deixar campos vazios: nem todas as máquinas têm horas, matrícula ou valor.</p>
            <button className="btn-primary sm:col-span-2 lg:col-span-4">Guardar alterações</button>
          </form>
          {user.cargo === "admin" && (
            <form action={apagarEntidade.bind(null, "maquinas", m.id)} className="mt-3">
              <ConfirmarBotao className="btn-danger" mensagem={`Apagar a máquina ${m.numero_interno}? As ${faturas.length} faturas ligadas mantêm-se. Pode restaurá-la em Apagados.`}>Apagar máquina</ConfirmarBotao>
            </form>
          )}
        </details>
      )}

      <h2 className="mb-3 text-lg font-semibold">Faturas desta máquina</h2>
      {!consumos.length ? <Vazio texto={faturas.length ? "As faturas ligadas não têm artigos lidos." : "Ainda não há faturas ligadas a esta máquina. Escreva o nº interno ao rever uma fatura."} /> : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr><th className="px-4 py-3 text-left">Data</th><th className="px-4 py-3 text-left">Artigo</th><th className="px-4 py-3 text-left">Fornecedor</th><th className="px-4 py-3 text-right">Qtd</th><th className="px-4 py-3 text-right">Valor</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {consumos.map((c, k) => (
                <tr key={k}>
                  <td className="whitespace-nowrap px-4 py-2">{dataPt(c.data)}</td>
                  <td className="px-4 py-2"><Link href={`/faturas/${c.fatura}`} className="hover:text-brand-600">{c.descricao}</Link></td>
                  <td className="px-4 py-2 text-slate-600">{c.fornecedor ?? "—"}</td>
                  <td className="px-4 py-2 text-right">{c.quantidade ?? "—"}</td>
                  <td className="px-4 py-2 text-right font-medium">{money(c.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function Campo({ n, r, v, tipo = "text", obrigatorio }: { n: string; r: string; v: string | number | null; tipo?: string; obrigatorio?: boolean }) {
  return (
    <div>
      <label className="label">{r}</label>
      <input name={n} type={tipo} step={tipo === "number" ? "any" : undefined} defaultValue={v ?? ""} required={obrigatorio} className="field" />
    </div>
  );
}
