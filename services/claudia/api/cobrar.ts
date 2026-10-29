import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Painel } from "../lib/painel.js";
import { enviarGrupo, enviarPrivado } from "../lib/whatsapp.js";

/**
 * Cobrança de prazos — chamado pelo cron (vercel.json) em horário comercial.
 * Tarefa interna → privado do responsável (telefone cadastrado na Equipe).
 * Solicitação de cliente (origem whatsapp) → formaliza no grupo do cliente.
 * Sem telefone do responsável → avisa o tutor. Também avisa o tutor de etapas de agentes travadas há mais de 2 h.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) return res.status(401).json({ erro: "não autorizado" });
  if (process.env.CLAUDIA_MODO === "observar") return res.json({ ok: true, modo: "observar", acao: "nada feito" });
  const painel = new Painel();
  const feitas: string[] = [];
  for (const c of await painel.cobrancas()) {
    const atraso = c.vencida ? `está atrasada há ${c.dias_atraso} dia${c.dias_atraso > 1 ? "s" : ""}` : "vence amanhã";
    const link = `${process.env.PAINEL_URL}/tarefas/${c.tarefa_id}`;
    if (c.canal_sugerido === "grupo" && c.grupo_whatsapp_id) {
      await enviarGrupo(c.grupo_whatsapp_id, `Atualização sobre *${c.titulo}*: a etapa "${c.etapa}" ${atraso}. ${c.responsavel} está cuidando e retorno aqui assim que concluir.`, undefined, c.tarefa_id);
      if (c.responsavel_telefone) await enviarPrivado(c.responsavel_telefone, `Oi ${c.responsavel}, a etapa "${c.etapa}" de *${c.titulo}* (${c.cliente}) ${atraso}. Já formalizei no grupo do cliente. ${link}`, c.tarefa_id);
      await painel.registrarCobranca(c.etapa_id, "formalizado no grupo do cliente");
    } else if (c.responsavel_telefone) {
      await enviarPrivado(c.responsavel_telefone, `Oi ${c.responsavel}, a etapa "${c.etapa}" de *${c.titulo}* (${c.cliente}) ${atraso}. Consegue me dar uma previsão? ${link}`, c.tarefa_id);
      await painel.registrarCobranca(c.etapa_id, "cobrado no privado");
    } else {
      await painel.avisarTutor(`${c.responsavel} está com "${c.etapa}" de "${c.titulo}" ${atraso} e não tem telefone cadastrado.`, c.tarefa_id);
      await painel.registrarCobranca(c.etapa_id, "sem telefone; tutor avisado");
    }
    feitas.push(`${c.titulo} / ${c.etapa} → ${c.canal_sugerido}`);
  }
  for (const t of (await painel.travadas()) as { titulo: string; etapa: string; agente: string; tarefa_id: string }[]) {
    await painel.avisarTutor(`${t.agente} está há mais de 2 h sem concluir "${t.etapa}" de "${t.titulo}".`, t.tarefa_id);
    feitas.push(`travada: ${t.titulo} / ${t.etapa}`);
  }
  res.json({ ok: true, cobrancas: feitas });
}
