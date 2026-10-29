import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Painel } from "../lib/painel.js";
import { enviarGrupo } from "../lib/whatsapp.js";

/**
 * Webhook da API de WhatsApp (mensagens recebidas nos grupos). Aqui a Cláudia:
 *   - registra demandas novas (cria a tarefa no painel com origem "whatsapp"), e
 *   - trata respostas de aprovação ("aprovado" conclui; pedido de ajuste devolve para a etapa das artes).
 * A interpretação da mensagem (qual tipo de demanda é, se é aprovação ou ajuste) fica em `interpretar()`;
 * em produção, é a IA da Cláudia; em simulação, palavras-chave simples.
 * Corpo (enviado pelo gateway services/whatsapp, já normalizado): { grupo_id | telefone, de, de_nome, texto, midia_url }
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).end();
  if (process.env.WHATSAPP_WEBHOOK_SECRET && req.headers["x-webhook-secret"] !== process.env.WHATSAPP_WEBHOOK_SECRET) return res.status(401).json({ erro: "segredo inválido" });
  const { grupo_id, telefone, texto, externo_id, conversa_id } = req.body ?? {};
  if (!texto) return res.status(400).json({ erro: "texto é obrigatório" });
  const painel = new Painel();
  const observar = process.env.CLAUDIA_MODO === "observar";
  if (!grupo_id) {
    if (observar) await painel.registrarObservacao({ conversa_id: conversa_id ?? telefone, mensagem_externo_id: externo_id, texto_mensagem: texto, intencao: "privado", acao_sugerida: "Mensagem privada: sem ação automática prevista." });
    return res.json({ ok: true, acao: `mensagem privada de ${telefone} registrada; sem ação automática` });
  }
  const cliente = (await painel.clientes()).find((c) => c.grupo_whatsapp_id === grupo_id);
  if (!cliente) {
    if (observar) await painel.registrarObservacao({ conversa_id: grupo_id, mensagem_externo_id: externo_id, texto_mensagem: texto, intencao: "grupo_desconhecido", acao_sugerida: "Grupo não está vinculado a nenhum cliente (preencha o id do grupo na ficha do cliente)." });
    return res.json({ ok: true, acao: "grupo não é de nenhum cliente" });
  }

  const fila = (await painel.minhaFila()).filter((t) => t.cliente_id === cliente.id && t.etapa_nome === "Aprovação / Grupo de WhatsApp") as { id: string; titulo: string }[];
  const intencao = interpretar(texto, fila.length > 0);

  if (observar) {  // MODO OBSERVAÇÃO: registra o que faria e para por aqui; nada é enviado nem criado
    const obs = intencao.tipo === "aprovado" && fila[0] ? { acao: `Concluiria a aprovação de "${fila[0].titulo}" e pediria a publicação.`, resp: undefined }
      : intencao.tipo === "ajuste" && fila[0] ? { acao: `Devolveria "${fila[0].titulo}" para as artes com o motivo: ${texto}`, resp: "Anotado! Vamos ajustar e mando a nova versão aqui." }
      : intencao.tipo === "demanda" ? { acao: `Criaria tarefa "${intencao.titulo}" (${intencao.fluxo}, prioridade ${intencao.prioridade}) para ${cliente.nome}.`, resp: `Registrado: *${intencao.titulo}*. Vou acompanhar e aviso aqui quando concluir.` }
      : { acao: "Nenhuma ação: mensagem sem demanda ou aprovação identificada.", resp: undefined };
    await painel.registrarObservacao({ conversa_id: grupo_id, mensagem_externo_id: externo_id, texto_mensagem: texto, intencao: intencao.tipo, acao_sugerida: obs.acao, resposta_sugerida: obs.resp, dados: { cliente_id: cliente.id, aguardando_aprovacao: fila.length > 0 } });
    return res.json({ ok: true, modo: "observar", intencao: intencao.tipo, acao_sugerida: obs.acao });
  }

  if (intencao.tipo === "aprovado" && fila[0]) { await painel.concluirEtapa(fila[0].id); await painel.comentar(fila[0].id, `Cliente aprovou: "${texto}"`); return res.json({ ok: true, acao: "aprovado", tarefa_id: fila[0].id }); }
  if (intencao.tipo === "ajuste" && fila[0]) { await painel.devolverEtapa(fila[0].id, 1, `Cliente pediu ajuste: ${texto}`); await enviarGrupo(grupo_id, "Anotado! Vamos ajustar e mando a nova versão aqui."); return res.json({ ok: true, acao: "ajuste", tarefa_id: fila[0].id }); }
  if (intencao.tipo === "demanda") {
    const fluxo = (await painel.fluxos()).find((f) => f.nome === intencao.fluxo);
    const { tarefa_id } = await painel.criarTarefa({ cliente_id: cliente.id, titulo: intencao.titulo, fluxo_id: fluxo?.id, descricao: texto.slice(0, 600), origem: "whatsapp", prioridade: intencao.prioridade });
    await enviarGrupo(grupo_id, `Registrado: *${intencao.titulo}*. Vou acompanhar e aviso aqui quando concluir.`);
    return res.json({ ok: true, acao: "demanda registrada", tarefa_id });
  }
  res.json({ ok: true, acao: "sem ação" });
}

type Intencao = { tipo: "aprovado" } | { tipo: "ajuste" } | { tipo: "demanda"; fluxo: string; titulo: string; prioridade: "normal" | "alta" | "urgente" } | { tipo: "nada" };
function interpretar(texto: string, aguardandoAprovacao: boolean): Intencao {
  const t = texto.toLowerCase();
  // TODO: em produção, substituir por chamada ao modelo da Cláudia com o contexto do grupo.
  if (aguardandoAprovacao && /\b(aprovad|pode publicar|ok|perfeito|ótimo|otimo)\b/.test(t)) return { tipo: "aprovado" };
  if (aguardandoAprovacao && /\b(troca|ajust|muda|corrig|não gostei|nao gostei|outra)\b/.test(t)) return { tipo: "ajuste" };
  if (/\b(desativ|tira|retira|remov|vendido|vendeu)\b/.test(t)) return { tipo: "demanda", fluxo: "Desativar anúncio", titulo: "Desativar anúncio: " + texto.slice(0, 60), prioridade: "alta" };
  if (/\b(pixel|não está|nao esta|erro|parou|bug|problema)\b/.test(t)) return { tipo: "demanda", fluxo: "Suporte / Manutenção (ADS)", titulo: "Suporte: " + texto.slice(0, 60), prioridade: "normal" };
  if (/\b(campanha|promoç|promoc|black friday|feirão|feirao)\b/.test(t)) return { tipo: "demanda", fluxo: "Campanha especial (ADS)", titulo: "Campanha: " + texto.slice(0, 60), prioridade: "normal" };
  return { tipo: "nada" };
}
