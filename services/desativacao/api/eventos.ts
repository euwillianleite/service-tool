import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Painel, type Evento } from "../lib/painel.js";

/** Serviço de desativação — recebe a etapa "Desativação" do fluxo "Desativar anúncio". */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).end();
  if (process.env.WEBHOOK_SECRET && req.headers["x-webhook-secret"] !== process.env.WEBHOOK_SECRET) return res.status(401).json({ erro: "segredo inválido" });
  const eventos: Evento[] = req.body?.eventos ?? (req.body?.record ? [req.body.record] : []);
  const painel = new Painel();
  const resultado: Record<number, string> = {};
  for (const ev of eventos) {
    if (ev.payload.etapa !== "Desativação" || !ev.tarefa_id) { resultado[ev.id] = "não é minha"; continue; }
    try {
      const ids = await desativar({ referencia: ev.payload.referencia_externa ?? "", dados: ev.payload.dados ?? {} });
      await painel.atualizarDados(ev.tarefa_id, { desativados: ids, desativado_em: new Date().toISOString() });
      await painel.concluirEtapa(ev.tarefa_id);
      resultado[ev.id] = `desativados ${ids.length}`;
    } catch (e) { resultado[ev.id] = "erro: " + (e as Error).message; await painel.avisarTutor(`Serviço de desativação falhou: ${(e as Error).message}`, ev.tarefa_id); }
  }
  res.json({ ok: true, resultado });
}

async function desativar(a: { referencia: string; dados: Record<string, unknown> }): Promise<string[]> {
  if (process.env.MODO_SIMULACAO === "1") return [`an-${a.referencia || "x"}-meta`];
  // TODO: chamar a desativação já existente e funcional, identificando os anúncios por `referencia` (id do veículo) ou por `dados.anuncios`.
  throw new Error("desativar: integração real não configurada (defina MODO_SIMULACAO=1 para testar)");
}
