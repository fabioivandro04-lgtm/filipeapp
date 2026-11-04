import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { queryOne } from "@/lib/db";
import { CATEGORIAS } from "@/lib/categorias";
import { artigosDaConta, empresasDaConta, lerConta, ligada, seriesDocumentos, type Artigo, type Empresa, type SerieDoc } from "@/lib/moloni";
import { redirectMoloni } from "@/lib/endereco";
import { dataHoraPt } from "@/lib/format";
import { desligarMoloni, guardarOpcoesMoloni, ligarMoloni } from "@/app/actions";
import ConfirmarBotao from "@/components/ConfirmarBotao";
import { PageHeader } from "@/components/Ui";
import { Voltar } from "@/components/Voltar";

export default async function MoloniEmpresa({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; erro?: string }> }) {
  const user = await requireUser();
  if (user.cargo !== "admin") redirect("/definicoes");
  const id = Number((await params).id);
  const sp = await searchParams;
  const empresa = await queryOne<{ id: number; nome: string; faturacao: string | null }>("SELECT id, nome, faturacao FROM empresas WHERE id = ? AND apagada_em IS NULL", [id]);
  if (!empresa) notFound();
  const conta = await lerConta(id);
  const ativa = ligada(conta);
  const redirectUri = await redirectMoloni();

  // Só com a ligação feita: o que existe no Moloni (empresas, séries, artigos) para escolher
  let empresasMoloni: Empresa[] = [], series: SerieDoc[] = [], artigos: Artigo[] = [];
  let erroMoloni: string | null = null;
  if (ativa) {
    try {
      empresasMoloni = (await empresasDaConta(id)) ?? [];
      if (conta!.company_id) [series, artigos] = await Promise.all([seriesDocumentos(id, conta!.company_id), artigosDaConta(id, conta!.company_id)]);
    } catch (e) { erroMoloni = (e as Error).message; }
  }
  const porCategoria = artigos.reduce<Record<string, Artigo[]>>((m, a) => ((m[a.categoria] ??= []).push(a), m), {});

  return (
    <>
      <Voltar lista="/definicoes#faturacao" texto="Definições" />
      <div className="mt-2"><PageHeader titulo={`Moloni · ${empresa.nome}`} subtitulo="Ligação da app à conta Moloni desta empresa. As faturas entram lá como rascunho." /></div>
      {sp.ok && <p className="mb-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{sp.ok}</p>}
      {sp.erro && <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{sp.erro}</p>}
      {empresa.faturacao !== "moloni" && (
        <p className="mb-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Esta empresa não está com o Moloni escolhido em Definições → Programas de faturação. Pode ligar na mesma, mas as faturas só vão para o Moloni quando o escolher lá (ou na própria fatura).</p>
      )}

      <div className="space-y-6">
        <section className="card p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">1. Ligar a conta</h2>
            {ativa
              ? <span className="badge bg-emerald-100 text-emerald-800">Ligada{conta!.ligado_em ? ` desde ${dataHoraPt(conta!.ligado_em.slice(0, 19).replace("T", " "))}` : ""}</span>
              : <span className="badge bg-amber-100 text-amber-800">{conta?.refresh_token ? "Ligação expirada" : "Não ligada"}</span>}
          </div>
          <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-slate-600">
            <li>No Moloni desta empresa (com login de administrador), vá a <b>Configurações → Developers → Configuração de conta e API</b>.</li>
            <li>Marque <b>Ativar API</b>, escolha um <b>Developer ID</b> (p. ex. <code>gestaoapp</code>) e, em <b>Redirect URI</b>, cole exatamente:
              <code className="mt-1 block break-all rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-800">{redirectUri}</code></li>
            <li>Carregue em <b>Atualizar</b>: o Moloni mostra a <b>Client Secret</b>. Copie-a para aqui (não a envie por mensagem).</li>
            <li>Carregue em «Ligar ao Moloni», entre com o login do Moloni e autorize.</li>
          </ol>
          <p className="mt-2 text-xs text-slate-500">É preciso o plano Flex ou Pro: o plano Base não tem API nem compras.</p>
          <form action={ligarMoloni.bind(null, id)} className="mt-4 grid gap-3 sm:grid-cols-2">
            <div><label className="label">Developer ID</label><input name="developer_id" defaultValue={conta?.developer_id ?? ""} required autoComplete="off" className="field" /></div>
            <div><label className="label">Client Secret</label>
              <input name="client_secret" type="password" placeholder={conta?.client_secret ? "(guardada — escreva só para mudar)" : ""} autoComplete="new-password" className="field" /></div>
            <div className="sm:col-span-2"><button className="btn-primary">{ativa ? "Ligar outra vez" : "Ligar ao Moloni"}</button></div>
          </form>
          {conta && (
            <form action={desligarMoloni.bind(null, id)} className="mt-3 border-t border-slate-100 pt-3">
              <ConfirmarBotao className="btn-ghost px-3 py-1.5 text-xs" mensagem="Remover a ligação ao Moloni desta empresa? As chaves deixam de estar guardadas na app.">Desligar e apagar as chaves</ConfirmarBotao>
            </form>
          )}
        </section>

        {ativa && (
          <section className="card p-5">
            <h2 className="font-semibold">2. Onde e como entram as faturas</h2>
            <p className="mt-1 text-sm text-slate-500">Cada fatura entra com uma linha só, no artigo escolhido para a sua categoria, com o valor sem IVA e a taxa de IVA da fatura. O número da fatura do fornecedor vai em «V/ Referência».</p>
            {erroMoloni && <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">Não consegui ler os dados do Moloni: {erroMoloni}</p>}
            <form action={guardarOpcoesMoloni.bind(null, id)} className="mt-4 space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="label">Empresa no Moloni</label>
                  <select name="company" defaultValue={conta!.company_id ? `${conta!.company_id}|${conta!.company_nome ?? ""}` : ""} className="field">
                    <option value="">—</option>
                    {empresasMoloni.map((e) => <option key={e.company_id} value={`${e.company_id}|${e.name}`}>{e.name}{e.vat ? ` (${e.vat})` : ""}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Série dos documentos</label>
                  <select name="document_set" defaultValue={conta!.document_set_id ? `${conta!.document_set_id}|${conta!.document_set_nome ?? ""}` : ""} className="field" disabled={!conta!.company_id}>
                    <option value="">—</option>
                    {series.map((s) => <option key={s.document_set_id} value={`${s.document_set_id}|${s.name}`}>{s.name}</option>)}
                  </select>
                </div>
              </div>
              {conta!.company_id ? (
                <fieldset>
                  <legend className="label">Artigo do Moloni para cada categoria da app</legend>
                  <p className="mb-2 text-xs text-slate-500">
                    {artigos.length ? `Mostra os ${artigos.length} artigos que já existem no Moloni, agrupados pelas categorias de lá. «Outros» serve de recurso para as categorias sem artigo.`
                      : "Não encontrei artigos no Moloni. Crie lá pelo menos um artigo (p. ex. «Compras diversas») e volte a esta página."}
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {CATEGORIAS.map(([c, nome]) => {
                      const atual = conta!.artigos?.[c];
                      return (
                        <div key={c}>
                          <label className="text-xs font-medium text-slate-600">{nome}</label>
                          <select name={`artigo_${c}`} defaultValue={atual ? `${atual.id}|${atual.nome}` : ""} className="field">
                            <option value="">{c === "outros" ? "—" : "— (usa o de «Outros»)"}</option>
                            {atual && !artigos.some((a) => a.product_id === atual.id) && <option value={`${atual.id}|${atual.nome}`}>{atual.nome}</option>}
                            {Object.entries(porCategoria).map(([cat, lista]) => (
                              <optgroup key={cat} label={cat}>
                                {lista.map((a) => <option key={a.product_id} value={`${a.product_id}|${a.name}`}>{a.name}{a.reference ? ` · ${a.reference}` : ""}</option>)}
                              </optgroup>
                            ))}
                          </select>
                        </div>
                      );
                    })}
                  </div>
                </fieldset>
              ) : <p className="text-sm text-slate-500">Escolha a empresa do Moloni e guarde: depois aparecem as séries e os artigos.</p>}
              <button className="btn-primary">Guardar opções</button>
            </form>
          </section>
        )}
      </div>
    </>
  );
}
