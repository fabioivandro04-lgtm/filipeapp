import { cookies } from "next/headers";
import { getUser } from "@/lib/auth";
import { registar } from "@/lib/historico";
import { empresasDaConta, ErroMoloni, guardarConta, lerConta, seriesDocumentos, trocarCodigo } from "@/lib/moloni";
import { enderecoApp } from "@/lib/endereco";

/**
 * Redirect URI do Moloni: depois de autorizar a app no Moloni, o browser volta aqui com ?code=…
 * A empresa do grupo que se estava a ligar vem no cookie «moloni_ligar» (posto em Definições).
 */
export async function GET(req: Request) {
  const base = await enderecoApp();
  const jar = await cookies();
  const empresaId = Number(jar.get("moloni_ligar")?.value);
  const volta = (tipo: "ok" | "erro", msg: string) => {
    jar.delete("moloni_ligar");
    const destino = empresaId > 0 ? `/definicoes/moloni/${empresaId}` : "/definicoes";
    return Response.redirect(`${base}${destino}?${tipo}=${encodeURIComponent(msg)}`, 303);
  };
  const u = await getUser();
  if (!u) return Response.redirect(`${base}/login`, 303);
  if (u.cargo !== "admin") return volta("erro", "Só um administrador pode ligar o Moloni.");
  if (!(empresaId > 0)) return volta("erro", "A ligação demorou demasiado. Comece outra vez em Definições → Programas de faturação.");

  const p = new URL(req.url).searchParams;
  const code = p.get("code");
  if (!code) return volta("erro", `O Moloni não autorizou a ligação${p.get("error") ? ` (${p.get("error_description") || p.get("error")})` : ""}.`);
  const conta = await lerConta(empresaId);
  if (!conta?.developer_id || !conta.client_secret) return volta("erro", "Faltam o Developer ID e a Client Secret. Comece outra vez.");

  try {
    let nova = await trocarCodigo(conta, code, conta.redirect_uri ?? `${base}/api/moloni/ligar`);
    await guardarConta(empresaId, nova);
    // Se a conta só tem uma empresa (o normal), fica logo escolhida; o mesmo para a série, se só houver uma
    const empresas = (await empresasDaConta(empresaId)) ?? [];
    if (empresas.length === 1 && !nova.company_id) {
      nova = { ...nova, company_id: empresas[0].company_id, company_nome: empresas[0].name };
      const series = await seriesDocumentos(empresaId, empresas[0].company_id);
      if (series.length === 1) nova = { ...nova, document_set_id: series[0].document_set_id, document_set_nome: series[0].name };
      await guardarConta(empresaId, nova);
    }
    await registar(u, null, "moloni_ligado", { resumo: `${nova.company_nome ?? "conta"} (empresa ${empresaId})` });
    return volta("ok", "Ligado ao Moloni. Escolha agora a série e os artigos de cada categoria.");
  } catch (e) {
    return volta("erro", e instanceof ErroMoloni ? e.message : `Erro inesperado: ${(e as Error).message}`);
  }
}
