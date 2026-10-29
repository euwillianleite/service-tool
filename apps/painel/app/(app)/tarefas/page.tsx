import Link from "next/link";
import { supabaseServer, usuarioAtual } from "@/lib/supabase/server";
import { Av, Logo, Ring, Prio, fmt } from "@/lib/ui";

type Row = {
  id: string; titulo: string; prioridade: string; status: string; etapa_atual: number; entrega_em: string | null; criado_em: string;
  etapa_nome: string; responsavel_id: string | null; etapa_prazo: string | null; devolucoes: number; total_etapas: number; etapas_concluidas: number;
  atrasada: boolean; cliente_id: string; cliente_nome: string; cliente_logo: string | null; responsavel_nome: string | null; responsavel_foto: string | null;
};
const pct = (t: Row) => (t.status === "concluida" ? 100 : Math.round((t.etapas_concluidas / Math.max(1, t.total_etapas)) * 100));
const rank = (p: string) => (p === "urgente" ? 0 : p === "alta" ? 1 : 2);

export default async function Tarefas({ searchParams }: { searchParams: Promise<{ f?: string; v?: string; cliente?: string; g?: string }> }) {
  const sp = await searchParams, f = sp.f ?? "abertas", v = sp.v ?? "kanban", g = sp.g ?? "etapa";
  const sb = await supabaseServer(); const me = await usuarioAtual();
  let q = sb.from("tarefas_resumo").select("*");
  q = f === "concluidas" ? q.eq("status", "concluida").order("concluida_em", { ascending: false }).limit(100) : q.eq("status", "aberta");
  if (f === "minha" && me) q = q.eq("responsavel_id", me.id);
  if (sp.cliente) q = q.eq("cliente_id", sp.cliente);
  const [{ data }, { data: clientes }] = await Promise.all([q, sb.from("clientes").select("id,nome").eq("ativo", true).order("nome")]);
  const rows = ((data ?? []) as Row[]).sort((a, b) => f === "concluidas" ? 0 : rank(a.prioridade) - rank(b.prioridade) || (a.etapa_prazo ?? a.entrega_em ?? "9999").localeCompare(b.etapa_prazo ?? b.entrega_em ?? "9999") || b.criado_em.localeCompare(a.criado_em));
  const href = (p: Record<string, string | undefined>) => "/tarefas?" + new URLSearchParams(Object.fromEntries(Object.entries({ f, v, g, cliente: sp.cliente, ...p }).filter(([, x]) => x)) as Record<string, string>).toString();

  const card = (t: Row) => (
    <Link key={t.id} href={`/tarefas/${t.id}`} className="kcard">
      <span className="k1"><div style={{ minWidth: 0 }}><span className="cli"><Logo nome={t.cliente_nome} url={t.cliente_logo} />{t.cliente_nome}</span><br /><b>{t.titulo}</b></div><Ring pct={pct(t)} /></span>
      <span className="k2"><Prio p={t.prioridade} />{t.status === "concluida" ? <span className="pill">Concluída</span> : <>
        {g === "responsavel" ? <strong style={{ color: "var(--ink)" }}>{t.etapa_nome}</strong> : <span className="who"><Av nome={t.responsavel_nome} foto={t.responsavel_foto} />{t.responsavel_nome ?? "Sem responsável"}</span>}
        <span>{t.etapa_atual + 1}/{t.total_etapas}</span>{t.atrasada ? <span className="pill late">Atrasada</span> : t.etapa_prazo ? <span>até {fmt(t.etapa_prazo)}</span> : null}
        {t.devolucoes > 0 && <span className="pill plain">Devolvida {t.devolucoes}×</span>}</>}</span>
    </Link>
  );

  let body: React.ReactNode;
  if (!rows.length) body = <div className="empty">{f === "minha" ? "Nenhuma etapa aguardando você agora." : f === "concluidas" ? "Nenhuma tarefa concluída ainda." : "Nenhuma tarefa em andamento. Crie a primeira em \"Nova tarefa\"."}</div>;
  else if (v === "lista") body = <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{rows.map(card)}</div>;
  else {
    const grupos = new Map<string, Row[]>();
    rows.forEach((t) => { const k = t.status === "concluida" ? "Concluídas" : g === "responsavel" ? t.responsavel_nome ?? "Sem responsável" : t.etapa_nome; (grupos.get(k) ?? grupos.set(k, []).get(k)!).push(t); });
    body = <div className="kan">{[...grupos].map(([k, ts]) => <div key={k} className="col"><div className="col-h"><span>{k}</span><span className="muted">{ts.length}</span></div>{ts.map(card)}</div>)}</div>;
  }

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="bar">
        <div className="chips">
          <Link className="chip" aria-current={f === "abertas"} href={href({ f: "abertas" })}>Em andamento</Link>
          <Link className="chip" aria-current={f === "minha"} href={href({ f: "minha" })}>Minha fila</Link>
          <Link className="chip" aria-current={f === "concluidas"} href={href({ f: "concluidas" })}>Concluídas</Link>
        </div>
        <div className="row">
          <form><input type="hidden" name="f" value={f} /><input type="hidden" name="v" value={v} /><input type="hidden" name="g" value={g} />
            <select name="cliente" defaultValue={sp.cliente ?? ""} style={{ width: "auto" }} aria-label="Filtrar por cliente"><option value="">Todos os clientes</option>{clientes?.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select>
            <button className="btn ghost" type="submit">Filtrar</button></form>
          {v === "kanban" && <Link className="btn ghost" href={href({ g: g === "etapa" ? "responsavel" : "etapa" })}>{g === "etapa" ? "Colunas por responsável" : "Colunas por etapa"}</Link>}
          <Link className="btn" href={href({ v: v === "kanban" ? "lista" : "kanban" })}>{v === "kanban" ? "Lista" : "Kanban"}</Link>
          <Link className="btn primary" href="/tarefas/nova">Nova tarefa</Link>
        </div>
      </div>
      {body}
    </section>
  );
}
