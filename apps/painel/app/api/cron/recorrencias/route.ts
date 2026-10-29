import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

// Chamado pelo Vercel Cron (vercel.json). Usa a service role porque não há usuário logado.
export async function GET(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const { data, error } = await sb.rpc("processar_recorrencias");
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  return NextResponse.json({ criadas: data });
}
