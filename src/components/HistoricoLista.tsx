import Link from "next/link";
import type { Registo } from "@/lib/historico";
import type { Diferencas } from "@/lib/historico";
import { dataHoraPt, dataPt, money } from "@/lib/format";

const CAMPO_MAQUINA: Record<string, string> = {
  numero_interno: "Nº interno", empresa_id: "Empresa", designacao: "Designação", marca: "Marca", modelo: "Modelo", ano: "Ano",
  id_fornecedor: "ID fornecedor", numero_serie: "Nº de série", peso_kg: "Peso (kg)", matricula: "Matrícula", horas: "Horas",
  data_compra: "Data de compra", data_chegada: "Data de chegada", fornecedor: "Fornecedor", agencia: "Agência", valor_compra: "Valor de compra",
  facturada: "Facturada", observacoes: "Observações", estado: "Estado", venda_fatura: "Fatura de venda", comprador: "Comprador", data_venda: "Data da venda",
};
const txt = (v: unknown) => (v == null || v === "" ? "(vazio)" : String(v));
import type { Nomes } from "@/lib/queries";
import DiffLista from "./Diff";
import { restaurarFatura, reverterAlteracao } from "@/app/actions";

const TIPO: Record<string, string> = { empresa: "a empresa", predio: "o prédio", maquina: "a máquina", utilizador: "o utilizador", documento: "o documento", aluguer: "o aluguer" };
const VERBO: Record<string, string> = { criada: "criou", editada: "editou", apagada: "apagou", restaurada: "restaurou", renovada: "renovou" };
/** «empresa_apagada» → «apagou a empresa» */
function acaoEntidade(acao: string): string | null {
  const [tipo, estado] = acao.split("_");
  return TIPO[tipo] && VERBO[estado] ? `${VERBO[estado]} ${TIPO[tipo]}` : null;
}

const ACAO: Record<string, string> = {
  leitura_ia: "(IA) leu os dados de", leitura_ia_falhou: "(IA) não conseguiu ler",
  criada: "criou a fatura", editada: "editou", apagada: "apagou a fatura", restaurada: "restaurou a fatura",
  revertida: "desfez uma alteração", maquinas_importadas: "importou stock:", proposta: "propôs uma alteração a", proposta_aceite: "aceitou uma proposta de alteração a", proposta_rejeitada: "rejeitou uma proposta de alteração a", enviada: "enviou à contabilidade", copia: "descarregou uma cópia de segurança",
  sessao_entrou: "entrou na app", sessao_saiu: "saiu da app", utilizador_cargo: "mudou o cargo de", utilizador_senha: "redefiniu a palavra-passe de",
  utilizador_senha_propria: "alterou a própria palavra-passe", perfil_alterado: "mudou o nome:", definicoes_alertas: "alterou os alertas por email:",
  definicoes_email: "alterou o servidor de email:", definicoes_contabilidade: "alterou o email da contabilidade:", alertas_enviados: "enviou os alertas por email:", documento_renovada: "renovou o prazo de",
};

export default function HistoricoLista({ registos, nomes, podeDesfazer, mostrarFatura }: { registos: Registo[]; nomes: Nomes; podeDesfazer: boolean; mostrarFatura: boolean }) {
  if (!registos.length) return <div className="card p-6 text-center text-sm text-slate-500">Ainda não há registos.</div>;
  const val = (c: string, v: unknown) => (c === "empresa_id" && v != null ? nomes.empresas[Number(v)] ?? String(v) : txt(v));
  const desfeitos = new Set(registos.filter((r) => r.acao === "revertida").map((r) => (JSON.parse(r.detalhe ?? "{}") as { desfeito?: number }).desfeito));
  return (
    <ul className="card divide-y divide-slate-100">
      {registos.map((r) => {
        const det = r.detalhe ? JSON.parse(r.detalhe) : null;
        return (
          <li key={r.id} className="p-4 text-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p>
                <span className="font-medium">{r.user_nome ?? "Sistema"}</span> {ACAO[r.acao] ?? acaoEntidade(r.acao) ?? r.acao}
                {!r.fatura_id && det?.nome && r.acao !== "utilizador_senha_propria" && <> {det.maquina_id
                  ? <Link href={`/maquinas/${det.maquina_id}`} className="font-medium text-brand-600 hover:underline">{det.nome}</Link>
                  : <span className="font-medium">{det.nome}</span>}</>}
                {r.acao === "utilizador_cargo" && det?.cargo && <> para <span className="font-medium">{det.cargo}</span></>}
                {det?.resumo && !r.fatura_id && <> <span className="font-medium">{det.resumo}</span></>}
                {mostrarFatura && r.fatura_id && (
                  <> — {r.fatura_apagada === null
                    ? <Link href={`/faturas/${r.fatura_id}`} className="text-brand-600 hover:underline">{r.fatura_fornecedor ?? `fatura #${r.fatura_id}`} {r.fatura_numero}</Link>
                    : <span className="text-slate-500">{r.fatura_fornecedor ?? `fatura #${r.fatura_id}`} (apagada)</span>}</>
                )}
              </p>
              <time className="text-xs text-slate-400">{dataHoraPt(r.quando)}</time>
            </div>
            {(r.acao === "editada" || r.acao === "proposta") && det && <div className="mt-2"><DiffLista diff={det as Diferencas} nomes={nomes} /></div>}
            {(r.acao === "proposta_aceite" || r.acao === "proposta_rejeitada") && det && (
              <p className="mt-1 text-slate-500">Proposta de {det.autor}{det.motivo ? ` — motivo: ${det.motivo}` : ""}</p>
            )}
            {r.acao === "maquina_editada" && det?.mudou && (
              <ul className="mt-2 space-y-0.5 text-slate-600">
                {Object.entries(det.mudou as Record<string, [unknown, unknown]>).map(([c, [a, b]]) => (
                  <li key={c}><span className="text-slate-500">{CAMPO_MAQUINA[c] ?? c}:</span> {val(c, a)} → <span className="font-medium">{val(c, b)}</span></li>
                ))}
              </ul>
            )}
            {r.acao === "documento_renovada" && det && <p className="mt-1 text-slate-500">Validade: {dataPt(det.antes)} → <span className="font-medium">{dataPt(det.validade)}</span></p>}
            {(r.acao === "documento_criada" || r.acao === "documento_editada") && det?.validade && <p className="mt-1 text-slate-500">Válido até {dataPt(det.validade)}</p>}
            {r.acao.startsWith("aluguer_") && det?.valor != null && <p className="mt-1 text-slate-500">{money(det.valor)}</p>}
            {r.acao === "criada" && det && <p className="mt-1 text-slate-500">{det.fornecedor ?? "sem nome"} · {money(det.total)}{det.qr ? " · QR fiscal lido" : ""}</p>}
            {podeDesfazer && r.acao === "editada" && !desfeitos.has(r.id) && r.fatura_apagada === null && (
              <form action={reverterAlteracao.bind(null, r.id)} className="mt-2"><button className="btn-ghost px-3 py-1 text-xs">Desfazer esta alteração</button></form>
            )}
            {podeDesfazer && r.acao === "apagada" && r.fatura_apagada !== null && r.fatura_id && (
              <form action={restaurarFatura.bind(null, r.fatura_id)} className="mt-2"><button className="btn-ghost px-3 py-1 text-xs">Restaurar fatura</button></form>
            )}
          </li>
        );
      })}
    </ul>
  );
}
