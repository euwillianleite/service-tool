import type { VercelRequest, VercelResponse } from "@vercel/node";
import { registrar, atualizarStatus, encaminharClaudia } from "../lib/db.js";

/**
 * Webhooks da Z-API. No painel da Z-API → sua instância → Webhooks, aponte para esta URL:
 *   "Ao receber" (ReceivedCallback), "Ao enviar" (SentCallback, para registrar o que humanos mandam pelo celular)
 *   e "Status da mensagem" (MessageStatusCallback). Marque "Notificar as enviadas por mim também".
 * Proteção: a Z-API não assina; use um caminho secreto: /api/webhook-zapi?s=<ZAPI_WEBHOOK_SECRET>
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).end();
  if (process.env.ZAPI_WEBHOOK_SECRET && req.query.s !== process.env.ZAPI_WEBHOOK_SECRET) return res.status(401).end();
  res.status(200).json({ ok: true });
  const b = req.body ?? {};

  if (b.type === "MessageStatusCallback" && b.ids?.length) { for (const id of b.ids) await atualizarStatus(id, String(b.status ?? "").toLowerCase()); return; }
  if (b.type !== "ReceivedCallback") return;

  const conversa: string = b.phone;                 // grupo: "1203…-group" ou "…@g.us"; privado: "5547…"
  const grupo = !!b.isGroup;
  const texto: string = b.text?.message ?? b.image?.caption ?? b.video?.caption ?? b.document?.caption ?? b.buttonsResponseMessage?.message ?? b.listResponseMessage?.message ?? "";
  const midia = b.image ? ["image", b.image.imageUrl] : b.video ? ["video", b.video.videoUrl] : b.audio ? ["audio", b.audio.audioUrl] : b.document ? ["document", b.document.documentUrl] : b.sticker ? ["sticker", b.sticker.stickerUrl] : null;
  const de: string = grupo ? (b.participantPhone ?? "") : conversa;
  const deNome: string = b.senderName ?? b.chatName ?? "";
  const minha = !!b.fromMe;                         // mensagem que saiu do próprio número (Cláudia ou um humano pelo celular)

  await registrar(conversa, grupo ? "grupo" : "privado", grupo ? b.chatName ?? null : deNome || null, "zapi",
    { externo_id: b.messageId, direcao: minha ? "enviada" : "recebida", de: minha ? undefined : de, de_nome: minha ? undefined : deNome, texto, midia_url: midia?.[1], midia_tipo: midia?.[0], enviada_por: minha && !b.fromApi ? "humano" : undefined, bruto: b });
  if (!minha && texto) await encaminharClaudia({ conversa_id: conversa, tipo: grupo ? "grupo" : "privado", de, de_nome: deNome, texto, midia_url: midia?.[1], externo_id: b.messageId });
}
