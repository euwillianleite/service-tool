import type { VercelRequest, VercelResponse } from "@vercel/node";
export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.json({ ok: true, servico: process.env.VERCEL_PROJECT_PRODUCTION_URL ?? "local", painel: !!process.env.PAINEL_URL });
}
