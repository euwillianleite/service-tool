import Link from "next/link";
import { supabaseServer, usuarioAtual } from "@/lib/supabase/server";
import { FluxoForm } from "./form";

export default async function Fluxos({ searchParams }: { searchParams: Promise<{ erro?: string; editar?: string; novo?: string }> }) {
  const sp = await searchParams, sb = await supabaseServer(), me = await usuarioAtual();
  const [{ data: fluxos }, { data: equipe }] = await Promise.all([
    sb.from("fluxos").select("id,nome,fluxo_etapas(ordem,nome,responsavel_padrao_id,dias,tipo,usuarios(nome))").eq("ativo", true).order("nome"),
    sb.from("usuarios").select("id,nome").eq("ativo", true).order("nome"),
  ]);
  const gestor = me?.papel === "gestor";
  const emEdicao = sp.novo ? { id: "", nome: "", fluxo_etapas: [] } : fluxos?.find((f) => f.id === sp.editar);
  return (
    <section className="narrow" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {sp.erro && <p className="err">{sp.erro}</p>}
      <div className="bar"><p className="muted small" style={{ maxWidth: "60ch" }}>Cada tipo de demanda recorrente é um modelo com sua sequência de etapas. A tarefa copia o modelo ao ser criada; mudar o modelo não altera tarefas existentes.</p>
        {gestor && !emEdicao && <Link className="btn primary" href="/fluxos?novo=1">Novo modelo</Link>}</div>
      {emEdicao && gestor && <FluxoForm fluxo={emEdicao as never} equipe={equipe ?? []} />}
      {fluxos?.map((f) => <div key={f.id} className="card"><div className="bar"><h3>{f.nome}</h3><span className="row">{gestor && <Link className="btn" href={`/fluxos?editar=${f.id}`}>Editar</Link>}<Link className="btn" href={`/tarefas/nova?fluxo=${f.id}`}>Usar em nova tarefa</Link></span></div>
        <div className="row small">{[...f.fluxo_etapas].sort((a, b) => a.ordem - b.ordem).map((e, i) => <span key={i} className="row" style={{ gap: 6 }}>{i > 0 && <span className="muted">→</span>}<span style={{ border: "1px solid var(--line)", borderRadius: 5, padding: "2px 8px" }}>{e.nome}{(e.usuarios as unknown as { nome: string } | null)?.nome ? ` · ${(e.usuarios as unknown as { nome: string }).nome}` : ""}{e.dias ? ` · ${e.dias}d` : ""}{e.tipo === "aprovacao" ? " · aprovação" : ""}</span></span>)}</div></div>)}
    </section>
  );
}
