import { getUser } from "@/lib/auth";
import { carregarFicheiro, faturasDoPacote, lerFiltro } from "@/lib/contabilidade";
import { excelFaturas, nomeFicheiro } from "@/lib/excel";
import { respostaZip } from "@/lib/zip";

export async function GET(req: Request) {
  const u = await getUser();
  if (!u) return new Response("Não autenticado", { status: 401 }); // todos os cargos podem descarregar o pacote
  const sp = new URL(req.url).searchParams;
  const filtro = lerFiltro({ mes: sp.get("mes"), empresa: sp.get("empresa"), estado: sp.get("estado") });
  const faturas = await faturasDoPacote(u, filtro);
  const enc = new TextEncoder();

  return respostaZip(`contabilidade-${filtro.mes}.zip`, async (adicionar) => {
    // O Excel resume os dados; os originais (com o QR code fiscal) vão na pasta «documentos».
    adicionar("faturas.xlsx", new Uint8Array(await excelFaturas(faturas, "documentos/")));
    for (const f of faturas) {
      if (!f.ficheiro_id) continue;
      const fi = await carregarFicheiro(f.ficheiro_id);
      if (fi) adicionar(`documentos/${nomeFicheiro(f)}`, fi.dados);
    }
    adicionar("LEIA-ME.txt", enc.encode(
      `Faturas de ${filtro.mes} — ${faturas.length} documentos.\r\n\r\n` +
      "faturas.xlsx: resumo (data, nº, ATCUD, fornecedor, NIF, total, IVA).\r\n" +
      "documentos/: as faturas originais, com o QR code fiscal intacto para leitura automática.\r\n"));
  });
}
