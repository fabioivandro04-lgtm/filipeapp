import Link from "next/link";
import { editaDireto, requireUser } from "@/lib/auth";
import { lerConfig } from "@/lib/config";
import { faturasDoPacote, lerFiltro, paraQuery } from "@/lib/contabilidade";
import { emailConfigurado } from "@/lib/email";
import { dataPt, mesExtenso, money } from "@/lib/format";
import { todasEmpresas } from "@/lib/queries";
import { marcarEnviadas, enviarContabilidade } from "@/app/actions";
import { PageHeader, Stat } from "@/components/Ui";

export default async function Contabilidade({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const filtro = lerFiltro(sp);
  const [faturas, empresas, emailGuardado] = await Promise.all([faturasDoPacote(user, filtro), todasEmpresas(), lerConfig("email_contabilidade")]);

  const total = faturas.reduce((s, f) => s + (f.total ?? 0), 0);
  const porRever = faturas.filter((f) => f.alerta && !f.revisada).length;
  const semFicheiro = faturas.filter((f) => !f.ficheiro_id).length;
  const empresa = empresas.find((e) => e.id === filtro.empresaId);
  const podeEnviar = editaDireto(user); // contabilista só descarrega
  const podeEmail = emailConfigurado();
  const mensagem = `Bom dia,\n\nSeguem em anexo as faturas de ${mesExtenso(filtro.mes)}${empresa ? ` da empresa ${empresa.nome}` : ""}: ${faturas.length} documentos, no total de ${money(total)}.\n\nO ficheiro Excel resume os dados e os originais (PDF/foto) mantêm o QR code fiscal.\n\nCumprimentos,\n${user.nome}`;
  const oculto = (
    <>
      <input type="hidden" name="mes" value={filtro.mes} />
      <input type="hidden" name="empresa" value={filtro.empresaId ?? ""} />
      <input type="hidden" name="estado" value={filtro.estado} />
    </>
  );

  return (
    <>
      <PageHeader titulo="Contabilidade" subtitulo="Prepare o pacote do mês: um Excel com os dados e as faturas originais (com o QR code fiscal, que o TOConline lê sozinho)." />
      {sp.ok && <p className="mb-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{sp.ok}</p>}
      {sp.erro && <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{sp.erro}</p>}

      <form className="mb-6 flex flex-col gap-2 sm:flex-row">
        <input type="month" name="mes" defaultValue={filtro.mes} className="field sm:max-w-[12rem]" aria-label="Mês" />
        <select name="empresa" defaultValue={filtro.empresaId ?? ""} className="field sm:max-w-xs">
          <option value="">Todas as empresas</option>
          {empresas.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
        </select>
        <select name="estado" defaultValue={filtro.estado} className="field sm:max-w-xs">
          <option value="pendentes">Só as ainda não enviadas</option>
          <option value="todas">Todas, mesmo as já enviadas</option>
        </select>
        <button className="btn-ghost">Aplicar</button>
      </form>

      <div className="mb-6 grid grid-cols-3 gap-3">
        <Stat rotulo="Faturas" valor={String(faturas.length)} />
        <Stat rotulo="Total" valor={money(total)} />
        <Stat rotulo="Por rever" valor={String(porRever)} destaque={porRever > 0} />
      </div>
      {porRever > 0 && <p className="mb-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{porRever} fatura(s) têm avisos por rever. <Link href="/alertas" className="underline">Ver alertas</Link> antes de enviar.</p>}
      {semFicheiro > 0 && <p className="mb-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{semFicheiro} fatura(s) não têm ficheiro anexo e só aparecem no Excel.</p>}

      <div className="card mb-6 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr><th className="px-4 py-3">Data</th><th className="px-4 py-3">Fornecedor</th><th className="px-4 py-3">Empresa</th><th className="px-4 py-3">Enviada</th><th className="px-4 py-3 text-right">Total</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {faturas.map((f) => (
              <tr key={f.id}>
                <td className="whitespace-nowrap px-4 py-2">{dataPt(f.data)}</td>
                <td className="px-4 py-2"><Link href={`/faturas/${f.id}`} className="hover:text-brand-600">{f.fornecedor ?? "Sem nome"}</Link> <span className="text-xs text-slate-400">{f.numero}</span></td>
                <td className="px-4 py-2 text-slate-600">{f.empresa_nome ?? "—"}</td>
                <td className="px-4 py-2 text-slate-600">{f.enviada_em ? f.enviada_em.slice(0, 10) : "—"}</td>
                <td className="px-4 py-2 text-right font-medium">{money(f.total)}</td>
              </tr>
            ))}
            {!faturas.length && <tr><td colSpan={5} className="p-6 text-center text-slate-500">Não há faturas neste período.</td></tr>}
          </tbody>
        </table>
      </div>

      {faturas.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="card space-y-3 p-5">
            <h2 className="font-semibold">Descarregar e enviar você mesmo</h2>
            <p className="text-sm text-slate-500">Um ZIP com o Excel e a pasta «documentos» com os originais. Envie por email, WhatsApp ou como preferir.</p>
            <a href={`/api/contabilidade/zip?${paraQuery(filtro)}`} className="btn-primary w-full">Descarregar ZIP</a>
            {podeEnviar && <form action={marcarEnviadas}>{oculto}<button className="btn-ghost w-full">Já enviei: marcar como enviadas</button></form>}
          </div>

          {podeEnviar && <form action={enviarContabilidade} className="card space-y-3 p-5">
            {oculto}
            <h2 className="font-semibold">Enviar por email daqui</h2>
            <input name="para" defaultValue={emailGuardado ?? ""} placeholder="Email da contabilista" required className="field" />
            <input name="assunto" defaultValue={`Faturas de ${mesExtenso(filtro.mes)}${empresa ? ` — ${empresa.nome}` : ""}`} className="field" />
            <textarea name="mensagem" defaultValue={mensagem} rows={7} className="field" />
            <button disabled={!podeEmail} className="btn-primary w-full">Enviar por email</button>
            {!podeEmail && (
              <p className="text-xs text-slate-500">
                Ainda não configurado. Na Vercel, crie as variáveis <code>SMTP_HOST</code>, <code>SMTP_PORT</code>, <code>SMTP_USER</code>, <code>SMTP_PASS</code> e <code>SMTP_FROM</code>.
                Com Gmail: <code>smtp.gmail.com</code>, porta <code>465</code> e uma «palavra-passe de aplicação».
              </p>
            )}
          </form>}
        </div>
      )}
    </>
  );
}
