import { createClient } from "@supabase/supabase-js";

export const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

export type Msg = { externo_id?: string; direcao: "recebida" | "enviada"; de?: string; de_nome?: string; texto?: string; midia_url?: string; midia_tipo?: string; status?: string; enviada_por?: string; tarefa_id?: string; bruto?: unknown };

/** Grava a mensagem e atualiza o resumo da conversa (função SQL wa_registrar). */
export async function registrar(conversa: string, tipo: "grupo" | "privado", nome: string | null, provedor: "meta" | "zapi", msg: Msg) {
  const { error } = await db.rpc("wa_registrar", { p_conversa: conversa, p_tipo: tipo, p_nome: nome, p_provedor: provedor, p_msg: msg });
  if (error) console.error("wa_registrar", error.message);
}
export async function atualizarStatus(externoId: string, status: string) {
  await db.rpc("wa_status", { p_externo_id: externoId, p_status: status });
}

/** Encaminha uma mensagem recebida, normalizada, para a Cláudia. */
export async function encaminharClaudia(payload: { conversa_id: string; tipo: "grupo" | "privado"; de: string; de_nome?: string; texto: string; midia_url?: string; externo_id?: string }) {
  if (!process.env.CLAUDIA_URL) return;
  try {
    await fetch(`${process.env.CLAUDIA_URL}/api/whatsapp`, { method: "POST", headers: { "content-type": "application/json", "x-webhook-secret": process.env.CLAUDIA_WEBHOOK_SECRET ?? "" },
      body: JSON.stringify({ grupo_id: payload.tipo === "grupo" ? payload.conversa_id : null, telefone: payload.tipo === "privado" ? payload.conversa_id : null, ...payload }), signal: AbortSignal.timeout(15000) });
  } catch (e) { console.error("encaminharClaudia", (e as Error).message); }
}
