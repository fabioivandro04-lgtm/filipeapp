import { timingSafeEqual } from "node:crypto";
import { enviarAlertas } from "@/lib/alertas-email";
import { registar } from "@/lib/historico";
import { renovarTodas } from "@/lib/moloni";

/** Chamado todos os dias pela Vercel (vercel.json → crons). Só responde com o segredo CRON_SECRET. */
export async function GET(req: Request) {
  const segredo = process.env.CRON_SECRET;
  const dado = req.headers.get("authorization") ?? "";
  const esperado = `Bearer ${segredo}`;
  // Comparação em tempo constante (não deixa adivinhar o segredo pelo tempo de resposta)
  const igual = !!segredo && dado.length === esperado.length && timingSafeEqual(Buffer.from(dado), Buffer.from(esperado));
  if (!igual) return new Response("Não autorizado", { status: 401 });
  // Renova as ligações ao Moloni todos os dias (o acesso caduca ao fim de 14 dias sem uso)
  const moloni = await renovarTodas().catch((e) => ({ renovadas: 0, falhas: [(e as Error).message] }));
  try {
    const r = await enviarAlertas({ automatico: true });
    if (r.enviado) await registar(null, null, "alertas_enviados", { resumo: r.motivo, automatico: true });
    return Response.json({ ...r, moloni });
  } catch (e) {
    return Response.json({ enviado: false, motivo: (e as Error).message }, { status: 500 });
  }
}
