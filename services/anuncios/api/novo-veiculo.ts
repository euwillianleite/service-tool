import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Painel } from "../lib/painel.js";

/**
 * Entrada do serviço já existente: quando identificar um carro novo na API do cliente, chame
 *   POST /api/novo-veiculo  { cliente_id, referencia_externa, veiculo: { placa, modelo, ano, preco, fotos[] } }
 * Cria a tarefa no painel (fluxo "Criação de anúncios") e conclui a etapa 0, o que dispara a geração das artes.
 * Idempotente: se já houver tarefa aberta com a mesma referência, não cria outra.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).end();
  if (process.env.WEBHOOK_SECRET && req.headers["x-webhook-secret"] !== process.env.WEBHOOK_SECRET) return res.status(401).json({ erro: "segredo inválido" });
  const { cliente_id, referencia_externa, veiculo } = req.body ?? {};
  if (!cliente_id || !referencia_externa) return res.status(400).json({ erro: "cliente_id e referencia_externa são obrigatórios" });
  const painel = new Painel();
  const existentes = await painel.buscarTarefa(referencia_externa);
  if (existentes.length) return res.json({ ok: true, tarefa_id: existentes[0].id, repetida: true });
  const fluxo = (await painel.fluxos()).find((f) => f.nome === "Criação de anúncios");
  if (!fluxo) return res.status(500).json({ erro: 'fluxo "Criação de anúncios" não encontrado no painel' });
  const titulo = [veiculo?.modelo, veiculo?.ano, veiculo?.cor].filter(Boolean).join(" ") || `Veículo ${referencia_externa}`;
  const { tarefa_id } = await painel.criarTarefa({ cliente_id, titulo, fluxo_id: fluxo.id, origem: "servico", referencia_externa, dados: { ...veiculo, versao: 0 } });
  await painel.concluirEtapa(tarefa_id);  // etapa 0 "Novo veículo identificado" é deste serviço
  res.json({ ok: true, tarefa_id });
}
