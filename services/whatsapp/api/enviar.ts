import type { VercelRequest, VercelResponse } from "@vercel/node";
import * as meta from "../lib/meta.js";
import * as zapi from "../lib/zapi.js";
import { registrar } from "../lib/db.js";

/**
 * Envio unificado. POST /api/enviar  header x-gateway-secret
 * body: { para, texto, link?, imagem_url?, por?: "claudia"|"painel", tarefa_id? , provedor?: "zapi"|"meta" }
 * Regra: grupo → sempre Z-API. Privado → ZAPI por padrão; "meta" se pedido (ou se a Z-API não estiver configurada).
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).end();
  if (req.headers["x-gateway-secret"] !== process.env.GATEWAY_SECRET) return res.status(401).json({ erro: "não autorizado" });
  if (process.env.SOMENTE_LEITURA === "1") return res.status(423).json({ erro: "Gateway em modo somente leitura: nenhuma mensagem é enviada neste ambiente." });
  const { para, texto, link, imagem_url, por = "claudia", tarefa_id, provedor } = req.body ?? {};
  if (!para || !(texto || imagem_url)) return res.status(400).json({ erro: "para e texto (ou imagem_url) são obrigatórios" });
  const grupo = /group|@g\.us/.test(String(para));
  const usarMeta = !grupo && (provedor === "meta" || !process.env.ZAPI_INSTANCE_ID);
  if (grupo && !process.env.ZAPI_INSTANCE_ID) return res.status(400).json({ erro: "grupos exigem Z-API configurada (a Cloud API da Meta não envia para grupos)" });
  try {
    let id: string;
    if (usarMeta) id = await meta.enviarTexto(para, [texto, link].filter(Boolean).join("\n"));
    else if (imagem_url) id = await zapi.enviarImagem(para, imagem_url, [texto, link].filter(Boolean).join("\n"));
    else if (link) id = await zapi.enviarLink(para, texto, link);
    else id = await zapi.enviarTexto(para, texto);
    await registrar(String(para), grupo ? "grupo" : "privado", null, usarMeta ? "meta" : "zapi", { externo_id: id || undefined, direcao: "enviada", texto: [texto, link].filter(Boolean).join("\n"), midia_url: imagem_url, midia_tipo: imagem_url ? "image" : undefined, status: "sent", enviada_por: por, tarefa_id });
    res.json({ ok: true, id, provedor: usarMeta ? "meta" : "zapi" });
  } catch (e) { res.status(502).json({ erro: (e as Error).message }); }
}
