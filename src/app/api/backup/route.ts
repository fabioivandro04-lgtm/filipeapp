import { getUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { extensao, excelFaturas } from "@/lib/excel";
import { registar } from "@/lib/historico";
import { listarFaturas } from "@/lib/queries";
import { respostaZip } from "@/lib/zip";

const TABELAS = ["empresas", "predios", "maquinas", "faturas", "historico", "config"] as const;

export async function GET() {
  const u = await getUser();
  if (!u || u.cargo !== "admin") return new Response("Sem permissão", { status: 403 });
  const enc = new TextEncoder();
  const hoje = new Date().toISOString().slice(0, 10);

  return respostaZip(`copia-gestao-app-${hoje}.zip`, async (adicionar) => {
    // Dados de todas as tabelas (sem palavras-passe nem sessões), incluindo faturas apagadas
    const dados: Record<string, unknown[]> = {};
    for (const t of TABELAS) dados[t] = await query(`SELECT * FROM ${t} ORDER BY 1`);
    dados.users = await query("SELECT id, nome, email, cargo, ativo FROM users ORDER BY id");
    adicionar("dados.json", enc.encode(JSON.stringify({ criadaEm: new Date().toISOString(), ...dados }, null, 1)));
    adicionar("faturas.xlsx", new Uint8Array(await excelFaturas(await listarFaturas(u, { limite: 5000 }))));

    // Fotos e PDFs, um a um para não encher a memória
    const ficheiros = await query<{ id: number; mime: string }>("SELECT id, mime FROM ficheiros ORDER BY id");
    for (const f of ficheiros) {
      const [r] = await query<{ dados: Uint8Array }>("SELECT dados FROM ficheiros WHERE id = ?", [f.id]);
      if (r) adicionar(`ficheiros/${f.id}.${extensao(f.mime)}`, new Uint8Array(r.dados));
    }
    adicionar("LEIA-ME.txt", enc.encode(
      "Cópia de segurança da GESTAO APP.\r\n\r\n" +
      "dados.json: todas as tabelas (empresas, prédios, máquinas, faturas — incluindo as apagadas —, histórico e utilizadores sem palavras-passe).\r\n" +
      "faturas.xlsx: lista das faturas para abrir no Excel.\r\n" +
      "ficheiros/: as fotos e PDFs originais. O campo ficheiro_id de cada fatura em dados.json aponta para <id>.<extensão>.\r\n\r\n" +
      "Guarde este ficheiro num sítio seguro (disco externo ou nuvem privada). Contém dados fiscais.\r\n"));
    await registar(u, null, "copia", { ficheiros: ficheiros.length });
  });
}
