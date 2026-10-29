import { createHmac, timingSafeEqual } from "crypto";

/** Meta WhatsApp Cloud API — envio e validação de webhook. Só conversas individuais. */
const G = "https://graph.facebook.com/v21.0";

export function assinaturaValida(rawBody: string, header: string | undefined) {
  if (!process.env.META_APP_SECRET) return true;
  if (!header?.startsWith("sha256=")) return false;
  const esperado = createHmac("sha256", process.env.META_APP_SECRET).update(rawBody).digest("hex");
  const recebido = header.slice(7);
  return esperado.length === recebido.length && timingSafeEqual(Buffer.from(esperado), Buffer.from(recebido));
}

export async function enviarTexto(para: string, texto: string): Promise<string> {
  const r = await fetch(`${G}/${process.env.META_PHONE_NUMBER_ID}/messages`, { method: "POST", headers: { authorization: `Bearer ${process.env.META_ACCESS_TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to: para.replace(/\D/g, ""), type: "text", text: { body: texto, preview_url: true } }) });
  const j = await r.json();
  if (!r.ok) throw new Error(`meta: ${j.error?.message ?? r.status}`);
  return j.messages?.[0]?.id ?? "";
}

/** Baixa a URL temporária de uma mídia recebida (válida por pouco tempo; para guardar, reenvie ao Storage). */
export async function urlMidia(mediaId: string): Promise<string | undefined> {
  const r = await fetch(`${G}/${mediaId}`, { headers: { authorization: `Bearer ${process.env.META_ACCESS_TOKEN}` } });
  return r.ok ? (await r.json()).url : undefined;
}
