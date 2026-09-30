import { query, queryOne } from "./db";
import type { User } from "./auth";
import { listarFaturas } from "./queries";

const MES = /^\d{4}-(0[1-9]|1[0-2])$/;

export type FiltroPacote = { mes: string; empresaId?: number; estado: "pendentes" | "todas" };

/** Por defeito, o mês passado: é o que costuma ir para a contabilidade. */
export function mesAnterior(): string {
  const h = new Date();
  return new Date(Date.UTC(h.getUTCFullYear(), h.getUTCMonth() - 1, 1)).toISOString().slice(0, 7);
}

export function lerFiltro(v: { mes?: unknown; empresa?: unknown; estado?: unknown }): FiltroPacote {
  const mes = String(v.mes ?? "");
  return {
    mes: MES.test(mes) ? mes : mesAnterior(),
    empresaId: Number(v.empresa) || undefined,
    estado: v.estado === "todas" ? "todas" : "pendentes",
  };
}

export const paraQuery = (f: FiltroPacote) => `mes=${f.mes}&empresa=${f.empresaId ?? ""}&estado=${f.estado}`;

export const faturasDoPacote = (u: User, f: FiltroPacote) =>
  listarFaturas(u, { mes: f.mes, empresa_id: f.empresaId, pendentesEnvio: f.estado === "pendentes", limite: 2000 });

export const carregarFicheiro = async (id: number) => {
  const r = await queryOne<{ mime: string; dados: Uint8Array }>("SELECT mime, dados FROM ficheiros WHERE id = ?", [id]);
  return r ? { mime: r.mime, dados: new Uint8Array(r.dados) } : undefined;
};

export async function marcarComoEnviadas(ids: number[]) {
  if (!ids.length) return;
  await query(
    `UPDATE faturas SET enviada_em = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') WHERE id IN (${ids.map(() => "?").join(",")})`, ids);
}
