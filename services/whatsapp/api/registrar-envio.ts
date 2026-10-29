import type { VercelRequest, VercelResponse } from "@vercel/node";
import { registrar } from "../lib/db.js";

/** Para serviços que enviam por conta própria registrarem a mensagem no histórico. POST { para, texto, externo_id?, por?, tarefa_id?, provedor? } header x-gateway-secret */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).end();
  if (req.headers["x-gateway-secret"] !== process.env.GATEWAY_SECRET) return res.status(401).json({ erro: "não autorizado" });
  const { para, texto, externo_id, por = "claudia", tarefa_id, provedor = "meta" } = req.body ?? {};
  if (!para || !texto) return res.status(400).json({ erro: "para e texto são obrigatórios" });
  const grupo = /group|@g\.us/.test(String(para));
  await registrar(String(para), grupo ? "grupo" : "privado", null, provedor === "zapi" ? "zapi" : "meta", { externo_id, direcao: "enviada", texto, status: "sent", enviada_por: por, tarefa_id });
  res.json({ ok: true });
}
