"use server";
import { createClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseServer, usuarioAtual } from "@/lib/supabase/server";

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const volta = (msg?: string, erro = false) => redirect("/vinculos" + (msg ? `?${erro ? "erro" : "ok"}=${encodeURIComponent(msg)}` : ""));
const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

/** Busca as contas de anúncio da Meta e os grupos do WhatsApp e grava nas tabelas de cache. Só gestor. */
export async function sincronizar() {
  const me = await usuarioAtual(); if (me?.papel !== "gestor") volta("Só gestores sincronizam.", true);
  const db = admin(); const avisos: string[] = []; let nContas = 0, nGrupos = 0;

  // --- Meta: contas do portfólio (owned + client) ou, sem business id, as visíveis para o token (/me/adaccounts)
  const token = process.env.META_ACCESS_TOKEN, biz = process.env.META_BUSINESS_ID;
  if (!token) avisos.push("META_ACCESS_TOKEN não configurado no painel; contas de anúncio não sincronizadas.");
  else {
    const campos = "id,name,account_status,currency,business{name}";
    const urls = biz
      ? [`https://graph.facebook.com/v21.0/${biz}/owned_ad_accounts?fields=${campos}&limit=200`, `https://graph.facebook.com/v21.0/${biz}/client_ad_accounts?fields=${campos}&limit=200`]
      : [`https://graph.facebook.com/v21.0/me/adaccounts?fields=${campos}&limit=200`];
    for (let url of urls) {
      while (url) {
        const r = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
        const j = await r.json();
        if (!r.ok) { avisos.push(`Meta: ${j.error?.message ?? r.status}`); break; }
        for (const a of j.data ?? []) {
          await db.from("contas_anuncio").upsert({ id: a.id, nome: a.name, moeda: a.currency, status: a.account_status, business_nome: a.business?.name ?? null, sincronizada_em: new Date().toISOString() });
          nContas++;
        }
        url = j.paging?.next ?? "";
      }
    }
  }

  // --- Z-API via gateway
  if (!process.env.WHATSAPP_GATEWAY_URL) avisos.push("WHATSAPP_GATEWAY_URL não configurada; grupos não sincronizados.");
  else {
    try {
      const r = await fetch(`${process.env.WHATSAPP_GATEWAY_URL}/api/grupos`, { headers: { "x-gateway-secret": process.env.WHATSAPP_GATEWAY_SECRET ?? "" }, signal: AbortSignal.timeout(20000) });
      const j = await r.json();
      if (!r.ok) avisos.push(`Grupos: ${j.erro ?? r.status}`);
      else for (const g of j.grupos ?? []) { await db.from("wa_grupos").upsert({ id: g.id, nome: g.nome, participantes: g.participantes ?? null, sincronizado_em: new Date().toISOString() }); nGrupos++; }
    } catch (e) { avisos.push(`Grupos: ${(e as Error).message}`); }
  }
  revalidatePath("/vinculos");
  volta(`${nContas} contas de anúncio e ${nGrupos} grupos sincronizados.${avisos.length ? " " + avisos.join(" ") : ""}`, avisos.length > 0 && nContas + nGrupos === 0);
}

/** Salva grupo e contas de um cliente. */
export async function salvarVinculo(fd: FormData) {
  const sb = await supabaseServer(); const cliente_id = s(fd, "cliente_id"); const grupo = s(fd, "grupo_whatsapp_id") || null;
  const contas = fd.getAll("contas").map(String).filter(Boolean);
  const { error: e1 } = await sb.from("clientes").update({ grupo_whatsapp_id: grupo, atualizado_em: new Date().toISOString() }).eq("id", cliente_id);
  if (e1) volta(e1.message, true);
  await sb.from("cliente_contas_anuncio").delete().eq("cliente_id", cliente_id);
  if (contas.length) {
    const { error: e2 } = await sb.from("cliente_contas_anuncio").upsert(contas.map((conta_id) => ({ conta_id, cliente_id })));
    if (e2) volta(e2.code === "23505" ? "Uma dessas contas já está vinculada a outro cliente." : e2.message, true);
  }
  revalidatePath("/vinculos"); revalidatePath("/clientes");
  volta("Vínculo salvo.");
}
