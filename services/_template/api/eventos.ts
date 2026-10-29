import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Painel, type Evento } from "../lib/painel.js";

/** Recebe eventos do painel (cron de webhooks ou Database Webhook do Supabase). */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).end();
  if (process.env.WEBHOOK_SECRET && req.headers["x-webhook-secret"] !== process.env.WEBHOOK_SECRET) return res.status(401).json({ erro: "segredo inválido" });
  const eventos: Evento[] = req.body?.eventos ?? (req.body?.record ? [req.body.record] : []);
  const painel = new Painel();
  const resultado: Record<number, string> = {};
  for (const ev of eventos) {
    try { resultado[ev.id] = await tratar(ev, painel); }
    catch (e) { resultado[ev.id] = "erro: " + (e as Error).message; }
  }
  res.json({ ok: true, resultado });
}

async function tratar(ev: Evento, painel: Painel): Promise<string> {
  // Implemente aqui o que este serviço faz com cada etapa que recebe.
  switch (ev.payload.etapa) {
    default:
      await painel.comentar(ev.tarefa_id!, `[${ev.tipo}] recebido pelo serviço, sem ação configurada para "${ev.payload.etapa}".`);
      return "ignorado";
  }
}
