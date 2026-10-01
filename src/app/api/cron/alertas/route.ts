import { enviarAlertas } from "@/lib/alertas-email";
import { registar } from "@/lib/historico";

/** Chamado todos os dias pela Vercel (vercel.json → crons). Só responde com o segredo CRON_SECRET. */
export async function GET(req: Request) {
  const segredo = process.env.CRON_SECRET;
  if (!segredo || req.headers.get("authorization") !== `Bearer ${segredo}`) return new Response("Não autorizado", { status: 401 });
  try {
    const r = await enviarAlertas({ automatico: true });
    if (r.enviado) await registar(null, null, "alertas_enviados", { resumo: r.motivo, automatico: true });
    return Response.json(r);
  } catch (e) {
    return Response.json({ enviado: false, motivo: (e as Error).message }, { status: 500 });
  }
}
