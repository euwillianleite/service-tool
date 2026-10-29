import type { VercelRequest, VercelResponse } from "@vercel/node";
import { assinaturaValida, urlMidia } from "../lib/meta.js";
import { registrar, atualizarStatus, encaminharClaudia } from "../lib/db.js";

export const config = { api: { bodyParser: false } };  // precisamos do corpo bruto para validar a assinatura

/**
 * Webhook da Meta (Cloud API). Cadastre em developers.facebook.com → seu app → WhatsApp → Configuration:
 *   Callback URL: https://<este-serviço>/api/webhook-meta   Verify token: META_VERIFY_TOKEN   Campos: messages
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "GET") {  // verificação inicial da Meta
    const q = req.query as Record<string, string>;
    if (q["hub.mode"] === "subscribe" && q["hub.verify_token"] === process.env.META_VERIFY_TOKEN) return res.status(200).send(q["hub.challenge"]);
    return res.status(403).end();
  }
  if (req.method !== "POST") return res.status(405).end();
  const raw = await lerCorpo(req);
  const sig = req.headers["x-hub-signature-256"] as string | undefined;
  // Vindo direto da Meta (ou repassado com o corpo bruto): valida a assinatura. Repassado sem assinatura: exige ?s=META_REPASSE_SECRET.
  const ok = sig ? assinaturaValida(raw, sig) : !!process.env.META_REPASSE_SECRET && req.query.s === process.env.META_REPASSE_SECRET;
  if (!ok) return res.status(401).end();
  res.status(200).json({ ok: true });  // responder rápido; a Meta reenvia se demorar

  const body = JSON.parse(raw);
  for (const entry of body.entry ?? []) for (const ch of entry.changes ?? []) {
    const v = ch.value ?? {};
    const nomes: Record<string, string> = Object.fromEntries((v.contacts ?? []).map((c: { wa_id: string; profile?: { name?: string } }) => [c.wa_id, c.profile?.name ?? ""]));
    for (const m of v.messages ?? []) {
      const texto = m.text?.body ?? m.button?.text ?? m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? m.image?.caption ?? m.document?.caption ?? "";
      const midiaTipo = ["image", "video", "audio", "document", "sticker"].includes(m.type) ? m.type : undefined;
      const midiaUrl = midiaTipo ? await urlMidia(m[m.type]?.id) : undefined;
      await registrar(m.from, "privado", nomes[m.from] || null, "meta", { externo_id: m.id, direcao: "recebida", de: m.from, de_nome: nomes[m.from], texto, midia_url: midiaUrl, midia_tipo: midiaTipo, bruto: m });
      await encaminharClaudia({ conversa_id: m.from, tipo: "privado", de: m.from, de_nome: nomes[m.from], texto, midia_url: midiaUrl });
    }
    for (const s of v.statuses ?? []) await atualizarStatus(s.id, s.status);  // sent | delivered | read | failed
  }
}

function lerCorpo(req: VercelRequest): Promise<string> {
  return new Promise((ok, err) => { let d = ""; req.on("data", (c) => (d += c)); req.on("end", () => ok(d)); req.on("error", err); });
}
