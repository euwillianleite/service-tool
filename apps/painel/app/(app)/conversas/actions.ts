"use server";
import { redirect } from "next/navigation";
import { supabaseServer, usuarioAtual } from "@/lib/supabase/server";

/** Envia pelo gateway de WhatsApp (services/whatsapp), que grava no histórico. */
export async function responder(fd: FormData) {
  const para = String(fd.get("para") ?? ""), texto = String(fd.get("texto") ?? "").trim();
  const volta = `/conversas?c=${encodeURIComponent(para)}`;
  if (!texto) redirect(volta);
  const me = await usuarioAtual();
  if (!process.env.WHATSAPP_GATEWAY_URL) redirect(volta + "&erro=" + encodeURIComponent("WHATSAPP_GATEWAY_URL não configurada no painel."));
  const r = await fetch(`${process.env.WHATSAPP_GATEWAY_URL}/api/enviar`, { method: "POST", headers: { "content-type": "application/json", "x-gateway-secret": process.env.WHATSAPP_GATEWAY_SECRET ?? "" },
    body: JSON.stringify({ para, texto: me ? `${texto}\n— ${me.nome}` : texto, por: "painel" }) });
  if (!r.ok) redirect(volta + "&erro=" + encodeURIComponent((await r.json().catch(() => ({}))).erro ?? "Falha ao enviar."));
  redirect(volta);
}

export async function marcarLida(id: string) {
  const sb = await supabaseServer();
  await sb.from("wa_conversas").update({ nao_lidas: 0 }).eq("id", id);
}
