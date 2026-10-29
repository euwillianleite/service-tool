import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Painel, type Evento } from "../lib/painel.js";
import { gerarArtes, publicarAnuncio } from "../lib/adaptadores.js";

/**
 * Serviço de anúncios — recebe as etapas dele no fluxo "Criação de anúncios":
 *   1 "Artes geradas e salvas no Drive"   → gera as artes, salva na pasta do cliente, conclui com o link compartilhado
 *   3 "Anúncios publicados / atualizados" → publica/atualiza os anúncios, conclui
 * Se a Cláudia devolver (etapa_devolvida em 1), gera de novo levando o motivo em conta.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).end();
  if (process.env.WEBHOOK_SECRET && req.headers["x-webhook-secret"] !== process.env.WEBHOOK_SECRET) return res.status(401).json({ erro: "segredo inválido" });
  const eventos: Evento[] = req.body?.eventos ?? (req.body?.record ? [req.body.record] : []);
  const painel = new Painel();
  const resultado: Record<number, string> = {};
  for (const ev of eventos) { try { resultado[ev.id] = await tratar(ev, painel); } catch (e) { resultado[ev.id] = "erro: " + (e as Error).message; await painel.avisarTutor(`Serviço de anúncios falhou em "${ev.payload.etapa}": ${(e as Error).message}`, ev.tarefa_id ?? undefined); } }
  res.json({ ok: true, resultado });
}

async function tratar(ev: Evento, painel: Painel): Promise<string> {
  if (ev.tipo === "tarefa_concluida" || !ev.tarefa_id) return "ignorado";
  const p = ev.payload;
  switch (p.etapa) {
    case "Artes geradas e salvas no Drive": {
      const motivo = ev.tipo === "etapa_devolvida" ? ultimaDevolucao(await painel.tarefa(ev.tarefa_id)) : undefined;
      const { pastaUrl, arquivos } = await gerarArtes({ veiculo: p.dados ?? {}, referencia: p.referencia_externa ?? "", pastaCliente: p.drive_folder_url ?? null, ajuste: motivo });
      await painel.atualizarDados(ev.tarefa_id, { artes: arquivos, pasta_artes: pastaUrl, versao: ((p.dados?.versao as number) ?? 0) + 1 });
      await painel.concluirEtapa(ev.tarefa_id, pastaUrl);   // o link compartilhado vai como entrega; a Cláudia recebe em entrega_anterior
      return `artes geradas (${arquivos.length})`;
    }
    case "Anúncios publicados / atualizados": {
      const ids = await publicarAnuncio({ veiculo: p.dados ?? {}, referencia: p.referencia_externa ?? "", artes: (p.dados?.artes as string[]) ?? [] });
      await painel.atualizarDados(ev.tarefa_id, { anuncios: ids, publicado_em: new Date().toISOString() });
      await painel.concluirEtapa(ev.tarefa_id, ids[0]?.url);
      return `publicado (${ids.length})`;
    }
    default: return "não é minha";
  }
}
const ultimaDevolucao = (t: { historico: Record<string, unknown>[] }) => [...t.historico].reverse().find((h) => String(h.texto).startsWith("devolveu"))?.texto as string | undefined;
