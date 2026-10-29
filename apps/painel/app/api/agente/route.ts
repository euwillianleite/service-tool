import { createClient } from "@supabase/supabase-js";
import { createHash } from "crypto";
import { NextResponse } from "next/server";

/*
  API para agentes (Cláudia e microsserviços).
  POST /api/agente   headers: x-api-key: <chave do agente>
  body: { "acao": "criar_tarefa" | "concluir_etapa" | "devolver_etapa" | "comentar" | "registrar_cobranca"
                | "tarefa" | "buscar_tarefa" | "minha_fila" | "cobrancas" | "eventos" | "clientes" | "fluxos",
          "args": { ... } }
  Toda ação roda no banco como o agente dono da chave (função api_agente), com as mesmas regras de quem usa o painel.
*/
export async function POST(req: Request) {
  const chave = req.headers.get("x-api-key");
  if (!chave) return NextResponse.json({ erro: "x-api-key ausente" }, { status: 401 });
  let body: { acao?: string; args?: Record<string, unknown> };
  try { body = await req.json(); } catch { return NextResponse.json({ erro: "JSON inválido" }, { status: 400 }); }
  if (!body.acao) return NextResponse.json({ erro: "informe acao" }, { status: 400 });

  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const { data, error } = await sb.rpc("api_agente", { p_chave_hash: createHash("sha256").update(chave).digest("hex"), p_acao: body.acao, p_args: body.args ?? {} });
  if (error) return NextResponse.json({ erro: error.message }, { status: error.code === "28000" ? 401 : 400 });
  return NextResponse.json({ ok: true, resultado: data });
}
