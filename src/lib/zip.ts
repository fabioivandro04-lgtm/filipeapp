import { Zip, ZipPassThrough } from "fflate";

type Adicionar = (nome: string, dados: Uint8Array) => void;

/**
 * Cria um ZIP em streaming (não guarda tudo em memória e não tem o limite de 4,5 MB da Vercel).
 * As fotos/PDFs já estão comprimidos, por isso os ficheiros são só guardados, sem recomprimir.
 */
export function respostaZip(nomeFicheiro: string, produzir: (adicionar: Adicionar) => Promise<void>): Response {
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const zip = new Zip((err, chunk, final) => {
        if (err) return controller.error(err);
        controller.enqueue(chunk);
        if (final) controller.close();
      });
      const adicionar: Adicionar = (nome, dados) => {
        const f = new ZipPassThrough(nome);
        zip.add(f);
        f.push(dados, true);
      };
      try {
        await produzir(adicionar);
        zip.end();
      } catch (e) {
        controller.error(e);
      }
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${nomeFicheiro}"`,
      "Cache-Control": "no-store",
    },
  });
}
