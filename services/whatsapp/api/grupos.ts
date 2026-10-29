import type { VercelRequest, VercelResponse } from "@vercel/node";
import { listarGrupos } from "../lib/zapi.js";

/** Lista os grupos em que o número da Cláudia está (para copiar o id na ficha do cliente). GET /api/grupos  header x-gateway-secret */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.headers["x-gateway-secret"] !== process.env.GATEWAY_SECRET) return res.status(401).json({ erro: "não autorizado" });
  try { res.json({ ok: true, grupos: await listarGrupos() }); } catch (e) { res.status(502).json({ erro: (e as Error).message }); }
}
