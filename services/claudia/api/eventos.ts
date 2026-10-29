import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Painel, type Evento } from "../lib/painel.js";
import { enviarGrupo, enviarPrivado } from "../lib/whatsapp.js";

/**
 * Cláudia — recebe as etapas dela e os avisos ao tutor.
 *   "Aprovação / Grupo de WhatsApp"  → envia o link das artes no grupo e pede aprovação (a resposta chega em /api/whatsapp)
 *   "Informar publicação no grupo" / "Confirmação no WhatsApp" / "Encerrar tarefa" → informa no grupo e conclui
 *   aviso_tutor → repassa ao tutor no privado
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).end();
  if (process.env.WEBHOOK_SECRET && req.headers["x-webhook-secret"] !== process.env.WEBHOOK_SECRET) return res.status(401).json({ erro: "segredo inválido" });
  const eventos: Evento[] = req.body?.eventos ?? (req.body?.record ? [req.body.record] : []);
  if (process.env.CLAUDIA_MODO === "observar") return res.json({ ok: true, modo: "observar", acao: "nada feito" });
  const painel = new Painel();
  const resultado: Record<number, string> = {};
  for (const ev of eventos) { try { resultado[ev.id] = await tratar(ev, painel); } catch (e) { resultado[ev.id] = "erro: " + (e as Error).message; } }
  res.json({ ok: true, resultado });
}

async function tratar(ev: Evento, painel: Painel): Promise<string> {
  const p = ev.payload;
  if (ev.tipo === "aviso_tutor") {
    const tutor = (await painel.cobrancas())[0]?.tutor_telefone ?? process.env.TUTOR_TELEFONE;
    if (tutor) await enviarPrivado(tutor, `⚠️ ${p.de ?? "Sistema"}: ${p.texto}${p.tarefa_id ? `\n${process.env.PAINEL_URL}/tarefas/${p.tarefa_id}` : ""}`);
    return "tutor avisado";
  }
  if (!ev.tarefa_id || !p.grupo_whatsapp_id) return "sem grupo do cliente";
  switch (p.etapa) {
    case "Aprovação / Grupo de WhatsApp":
      await enviarGrupo(p.grupo_whatsapp_id, `Olá! ${p.titulo}: as artes estão prontas para aprovação. Respondam *aprovado* ou digam o que ajustar.`, p.entrega_anterior ?? undefined, ev.tarefa_id);
      await painel.comentar(ev.tarefa_id, "Pedido de aprovação enviado no grupo.");
      return "aprovação pedida";   // a etapa só é concluída quando o cliente responder (ver /api/whatsapp)
    case "Informar publicação no grupo":
      await enviarGrupo(p.grupo_whatsapp_id, `✅ ${p.titulo}: anúncios publicados${p.dados?.anuncios ? "" : ""}.`);
      await painel.concluirEtapa(ev.tarefa_id);
      return "publicação informada";
    case "Confirmação no WhatsApp":
    case "Encerrar tarefa":
      await enviarGrupo(p.grupo_whatsapp_id, `✅ ${p.titulo}: concluído. Qualquer ajuste é só chamar.`);
      await painel.concluirEtapa(ev.tarefa_id);
      return "confirmado e encerrado";
    case "Solicitação do cliente":
      await painel.concluirEtapa(ev.tarefa_id);   // a solicitação já foi registrada ao criar a tarefa
      return "registrada";
    default: return "não é minha";
  }
}
