/**
 * Adaptador do WhatsApp da Cláudia: fala com o gateway `services/whatsapp`, que decide o provedor
 * (Z-API para grupos e privado; Meta Cloud API só para privado) e grava tudo no histórico.
 * Variáveis: WHATSAPP_GATEWAY_URL, WHATSAPP_GATEWAY_SECRET. Em MODO_SIMULACAO=1 só registra no log.
 */
const simulacao = process.env.MODO_SIMULACAO === "1";

async function enviar(body: Record<string, unknown>) {
  if (simulacao) { console.log(`[simulação] ${JSON.stringify(body)}`); return; }
  const r = await fetch(`${process.env.WHATSAPP_GATEWAY_URL}/api/enviar`, { method: "POST", headers: { "content-type": "application/json", "x-gateway-secret": process.env.WHATSAPP_GATEWAY_SECRET ?? "" }, body: JSON.stringify({ por: "claudia", ...body }) });
  if (!r.ok) throw new Error(`gateway: ${(await r.json().catch(() => ({}))).erro ?? r.status}`);
}
export const enviarGrupo = (grupoId: string, texto: string, link?: string, tarefa_id?: string) => enviar({ para: grupoId, texto, link, tarefa_id });
export const enviarPrivado = (telefone: string, texto: string, tarefa_id?: string) => enviar({ para: telefone, texto, tarefa_id });
