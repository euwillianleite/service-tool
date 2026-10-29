import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

// Entrega eventos pendentes por webhook aos agentes que têm webhook_url (Cláudia, microsserviços).
// Agentes sem webhook_url buscam seus eventos pela API (acao "eventos"). Roda a cada 5 min (vercel.json).
export async function GET(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const { data: agentes } = await sb.from("usuarios").select("id,nome,webhook_url").eq("papel", "agente").eq("ativo", true).not("webhook_url", "is", null);
  const resumo: Record<string, number> = {};
  for (const ag of agentes ?? []) {
    const { data: evs } = await sb.from("eventos").select("*").is("entregue_em", null).or(`responsavel_id.eq.${ag.id},responsavel_id.is.null`).order("id").limit(50);
    if (!evs?.length) continue;
    try {
      const r = await fetch(ag.webhook_url!, { method: "POST", headers: { "content-type": "application/json", "x-webhook-secret": process.env.WEBHOOK_SECRET ?? "" }, body: JSON.stringify({ agente: ag.nome, eventos: evs }), signal: AbortSignal.timeout(10000) });
      if (!r.ok) throw new Error(String(r.status));
      await sb.from("eventos").update({ entregue_em: new Date().toISOString() }).in("id", evs.map((e) => e.id));
      resumo[ag.nome] = evs.length;
    } catch (e) { resumo[ag.nome + " (falhou)"] = evs.length; }
  }
  return NextResponse.json(resumo);
}
