import { query, queryOne } from "./db";
import { extrairFatura, temModeloForte, type FaturaExtraida, type Pagina } from "./extract";
import { validarFatura, nomesParecidos } from "./validacao";
import { avaliar } from "./alertas";
import { registar } from "./historico";
import { maquinaPorNumero } from "./queries";

type Item = { total: number | null };

/** Todos os avisos automáticos de uma fatura: duplicados, valor fora do normal, ligação ao prédio e as validações dos dados. */
export async function avisosFatura(d: {
  id?: number; fornecedor: string | null; nif: string | null; nifCliente?: string | null; numero: string | null; data: string | null;
  total: number | null; iva: number | null; categoria: string; atcud?: string | null; predioId?: number | null; itens?: Item[] | null;
}): Promise<string[]> {
  const conhecido = d.nif
    ? await queryOne<{ fornecedor: string }>("SELECT fornecedor FROM faturas WHERE nif_fornecedor = ? AND fornecedor IS NOT NULL AND id <> ? AND apagada_em IS NULL ORDER BY id DESC LIMIT 1", [d.nif, d.id ?? 0])
    : undefined;
  let clienteNoGrupo: boolean | null = null;
  if (d.nifCliente) {
    const n = await queryOne<{ n: number }>("SELECT COUNT(*)::int AS n FROM empresas WHERE nif IS NOT NULL AND apagada_em IS NULL");
    if (n && n.n > 0) clienteNoGrupo = !!(await queryOne("SELECT 1 FROM empresas WHERE nif = ? AND apagada_em IS NULL", [d.nifCliente]));
  }
  const dup = await avaliar({
    fornecedor: d.fornecedor, nif: d.nif, numero: d.numero, data: d.data, total: d.total, categoria: d.categoria,
    excluirId: d.id, atcud: d.atcud ?? null, predioId: d.predioId,
  });
  return [...dup, ...validarFatura({
    nif: d.nif, nifCliente: d.nifCliente, data: d.data, total: d.total, iva: d.iva, numero: d.numero, fornecedor: d.fornecedor,
    itens: d.itens, nomeConhecido: conhecido?.fornecedor ?? null, clienteNoGrupo,
  })];
}

const dataOk = (t: string | null) => (t && /^\d{4}-\d{2}-\d{2}$/.test(t) && !Number.isNaN(Date.parse(t)) ? t : null);

type Linha = {
  id: number; criado_por: number; fornecedor: string | null; nif_fornecedor: string | null; numero: string | null; data: string | null;
  total: number | null; iva: number | null; categoria: string; empresa_id: number | null; predio_id: number | null; maquina_id: number | null;
  identificador: string | null; itens: string | null; atcud: string | null; nif_adquirente: string | null; qr_lido: number; revisada: number;
};

/**
 * Lê a fatura com IA depois de já estar guardada (corre em segundo plano, para a pessoa não esperar).
 * Só preenche o que ainda está vazio: o que veio do QR ou o que a pessoa já corrigiu não é tocado.
 */
export async function completarComIa(faturaId: number, paginas: Pagina[]): Promise<void> {
  const row = await queryOne<Linha>("SELECT * FROM faturas WHERE id = ?", [faturaId]);
  if (!row) return;
  const notas: string[] = [];
  let d: FaturaExtraida | null = null;
  try {
    d = await extrairFatura(paginas);
    // Conta validações falhadas e campos essenciais por ler: se houver, vale a pena uma segunda leitura com o modelo mais forte
    const problemas = (x: FaturaExtraida) => validarFatura({ nif: x.nif_fornecedor, data: dataOk(x.data), total: x.total, iva: x.iva, itens: x.itens }).length + (x.fornecedor ? 0 : 1) + (x.numero ? 0 : 1);
    // Segunda leitura com o modelo mais forte, só quando a primeira não passa nas validações
    if (problemas(d) > 0 && temModeloForte()) {
      try { const d2 = await extrairFatura(paginas, true); if (problemas(d2) <= problemas(d)) d = d2; } catch { /* fica a primeira */ }
    }
  } catch (e) {
    notas.push(`Leitura automática falhou: ${(e as Error).message}`);
  }

  if (!d) {
    const avisos = [...notas, ...(row.qr_lido && !row.fornecedor ? ["Falta o nome do fornecedor."] : [])];
    await query("UPDATE faturas SET leitura = ?, alerta = ? WHERE id = ?", [row.qr_lido ? "qr" : "falhou", avisos.join(" ") || null, faturaId]);
    await registar(null, faturaId, "leitura_ia_falhou", { motivo: notas[0] ?? null });
    return;
  }

  const nif = row.nif_fornecedor ?? d.nif_fornecedor;
  const h = nif
    ? await queryOne<{ fornecedor: string | null; categoria: string }>("SELECT fornecedor, categoria FROM faturas WHERE nif_fornecedor = ? AND id <> ? AND apagada_em IS NULL ORDER BY id DESC LIMIT 1", [nif, faturaId])
    : undefined;
  // Mesmo NIF e nome parecido: usa o nome já guardado (fica tudo igual); se for muito diferente, mantém o lido e a validação avisa
  let fornecedor = row.fornecedor ?? d.fornecedor ?? h?.fornecedor ?? null;
  if (!row.fornecedor && d.fornecedor && h?.fornecedor && nomesParecidos(h.fornecedor, d.fornecedor)) fornecedor = h.fornecedor;

  const total = row.total ?? d.total;
  if (row.qr_lido && row.total != null && d.total != null && Math.abs(d.total - row.total) > 0.01)
    notas.push(`A leitura automática (${d.total}) difere do QR (${row.total}); foi usado o valor do QR.`);

  const nifCliente = row.nif_adquirente ?? d.nif_cliente;
  let empresaId = row.empresa_id;
  if (!empresaId && nifCliente) empresaId = (await queryOne<{ id: number }>("SELECT id FROM empresas WHERE nif = ? AND apagada_em IS NULL", [nifCliente]))?.id ?? null;

  const identificador = row.identificador ?? d.identificador;
  let predioId = row.predio_id;
  if (!predioId && identificador) {
    predioId = (await queryOne<{ id: number }>("SELECT id FROM predios WHERE codigo_contador = ? AND apagada_em IS NULL", [identificador]))?.id ?? null;
    if (!predioId && (d.categoria === "energia" || d.categoria === "agua")) notas.push(`Identificador ${identificador} não corresponde a nenhum prédio.`);
  }
  let maquinaId = row.maquina_id;
  if (!maquinaId && d.numero_interno_maquina) {
    maquinaId = (await maquinaPorNumero(d.numero_interno_maquina))?.id ?? null;
    if (!maquinaId) notas.push(`Máquina ${d.numero_interno_maquina} não existe.`);
  }
  if (d.duvidas) notas.push(d.duvidas);

  const categoria = row.categoria === "outros" ? d.categoria ?? h?.categoria ?? "outros" : row.categoria;
  const numero = row.numero ?? d.numero;
  const data = row.data ?? dataOk(d.data);
  const iva = row.iva ?? d.iva;
  notas.push(...(await avisosFatura({
    id: faturaId, fornecedor, nif, nifCliente, numero, data, total, iva, categoria, atcud: row.atcud, predioId, itens: d.itens,
  })));

  await query(
    `UPDATE faturas SET fornecedor=?, nif_fornecedor=?, numero=?, data=?, total=?, iva=?, categoria=?, empresa_id=?, predio_id=?, maquina_id=?,
       identificador=?, nif_adquirente=?, itens=COALESCE(itens, ?), alerta=?, leitura='ia' WHERE id=?`,
    [fornecedor, nif, numero, data, total, iva, categoria, empresaId, predioId, maquinaId, identificador, nifCliente ?? null,
      JSON.stringify(d.itens), notas.length ? notas.join(" ") : null, faturaId],
  );
  await registar(null, faturaId, "leitura_ia", { fornecedor, numero, total });
}
