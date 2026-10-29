import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseServer, usuarioAtual } from "@/lib/supabase/server";
import { Av, Logo, Ring, Prio, Acessos, fmt, fmtAt } from "@/lib/ui";
import { concluirEtapa, devolverEtapa, reatribuirEtapa, comentar, adicionarLink, removerLink, excluirTarefa } from "@/lib/actions/tarefas";

export default async function Tarefa({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ erro?: string }> }) {
  const { id } = await params; const { erro } = await searchParams;
  const sb = await supabaseServer(); const me = await usuarioAtual();
  const [{ data: t }, { data: etapas }, { data: links }, { data: hist }, { data: equipe }] = await Promise.all([
    sb.from("tarefas").select("*, clientes(id,nome,logo_url,cliente_acessos(tipo,rotulo,url)), cliente_produtos(nome)").eq("id", id).single(),
    sb.from("tarefa_etapas").select("*, usuarios(nome,foto_url), etapa_comentarios(id,texto,criado_em,usuarios(nome))").eq("tarefa_id", id).order("ordem"),
    sb.from("tarefa_links").select("*").eq("tarefa_id", id),
    sb.from("tarefa_historico").select("*, usuarios(nome)").eq("tarefa_id", id).order("id", { ascending: false }).limit(200),
    sb.from("usuarios").select("id,nome").eq("ativo", true).order("nome"),
  ]);
  if (!t) notFound();
  const ets = etapas ?? [], ativa = t.status === "aberta" ? ets[t.etapa_atual] : null, hoje = new Date().toISOString().slice(0, 10);
  const late = !!ativa && ((ativa.prazo && ativa.prazo < hoje) || (t.entrega_em && t.entrega_em < hoje));
  const pct = t.status === "concluida" ? 100 : Math.round((ets.filter((e) => e.status === "concluida").length / Math.max(1, ets.length)) * 100);
  const cmEtapa = t.status === "concluida" ? ets[ets.length - 1] : ativa;
  const podeAgir = !!ativa && (ativa.responsavel_id === me?.id || me?.papel === "gestor");
  const prox = ativa ? ets[t.etapa_atual + 1] : null;
  const cli = t.clientes as unknown as { id: string; nome: string; logo_url: string | null; cliente_acessos: { tipo: string; rotulo: string | null; url: string }[] } | null;

  return (
    <section className="narrow" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {erro && <p className="err">{erro}</p>}
      <div className="bar" style={{ alignItems: "flex-start" }}>
        <div className="row" style={{ flexWrap: "nowrap" }}><Ring pct={pct} /><div>
          <h2>{t.titulo}</h2>
          <span className="row small muted"><Logo nome={cli?.nome} url={cli?.logo_url} /><Link href={`/clientes/${cli?.id}`}>{cli?.nome}</Link><span>{t.fluxo_nome ?? "Fluxo próprio"}</span></span>
          <span className="row small muted"><Prio p={t.prioridade} />{t.entrega_em && <span>Entrega {fmt(t.entrega_em)}</span>}{t.cliente_produtos && <span>Produto: {(t.cliente_produtos as { nome: string }).nome}</span>}</span>
        </div></div>
        <Link className="btn ghost" href="/tarefas">Voltar</Link>
      </div>
      {cli && cli.cliente_acessos.length > 0 && <div className="row"><span className="muted small">Acessos do cliente</span><Acessos itens={cli.cliente_acessos} /></div>}
      {t.descricao && <p style={{ whiteSpace: "pre-wrap" }}>{t.descricao}</p>}

      <div><h3 style={{ marginBottom: 8 }}>Links de apoio</h3>
        {links?.length ? <ul style={{ margin: 0, paddingLeft: 18 }}>{links.map((l) => <li key={l.id} className="row"><a href={l.url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)" }}>{l.rotulo || l.url.replace(/^https?:\/\//, "")}</a>
          <form action={removerLink}><input type="hidden" name="tarefa_id" value={id} /><input type="hidden" name="link_id" value={l.id} /><button className="btn ghost danger" aria-label="Remover link">×</button></form></li>)}</ul> : <p className="muted small">Nenhum link nesta tarefa.</p>}
        <form action={adicionarLink} className="row" style={{ marginTop: 8 }}><input type="hidden" name="tarefa_id" value={id} />
          <input name="rotulo" placeholder="Nome (opcional)" maxLength={60} style={{ flex: 1 }} /><input name="url" placeholder="https://…" maxLength={500} inputMode="url" style={{ flex: 2 }} /><button className="btn">Adicionar</button></form></div>

      <ol className="steps">{ets.map((e, i) => {
        const cls = e.status === "concluida" ? "concluida" : i === t.etapa_atual && t.status === "aberta" ? "ativa" + (late ? " late" : "") : "pendente";
        const u = e.usuarios as { nome: string; foto_url: string | null } | null;
        const cms = (e.etapa_comentarios as unknown as { id: string; texto: string; criado_em: string; usuarios: { nome: string } | null }[]).sort((a, b) => a.criado_em.localeCompare(b.criado_em));
        return <li key={e.id} className={`step ${cls}`}><span className="dot">{e.status === "concluida" ? "✓" : i + 1}</span><div className="body">
          <div className="l1"><span className="nm">{e.nome}</span>{e.tipo === "aprovacao" && <span className="pill plain">Aprovação</span>}{cls.startsWith("ativa") && <span className={`pill${late ? " late" : ""}`}>{late ? "Atrasada" : "Em andamento"}</span>}{e.devolucoes > 0 && <span className="pill plain">Devolvida {e.devolucoes}×</span>}</div>
          <div className="l2">{e.status === "concluida" ? <span className="who"><Av nome={u?.nome} foto={u?.foto_url} />{u?.nome ?? "Sem responsável"}</span>
            : <form action={reatribuirEtapa} className="row"><input type="hidden" name="tarefa_id" value={id} /><input type="hidden" name="etapa_id" value={e.id} /><Av nome={u?.nome} foto={u?.foto_url} />
              <select name="usuario_id" defaultValue={e.responsavel_id ?? ""} aria-label={`Responsável por ${e.nome}`}><option value="">Sem responsável</option>{equipe?.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}</select><button className="btn ghost">Trocar</button></form>}
            {e.prazo && <span>Prazo {fmt(e.prazo)}</span>}{e.concluida_em && <span>Concluída {fmtAt(e.concluida_em)}</span>}{e.entrega_url && <a className="qbtn" href={e.entrega_url} target="_blank" rel="noopener noreferrer">Entrega</a>}</div>
          {cms.length > 0 && <ul className="cm">{cms.map((c) => <li key={c.id}><span><strong>{c.usuarios?.nome ?? "Alguém"}</strong> <time>{fmtAt(c.criado_em)}</time></span><span>{c.texto}</span></li>)}</ul>}
        </div></li>; })}</ol>

      {cmEtapa && <form action={comentar} className="row"><input type="hidden" name="tarefa_id" value={id} /><input type="hidden" name="etapa_id" value={cmEtapa.id} />
        <input name="texto" maxLength={400} placeholder={`Comentar na etapa "${cmEtapa.nome}"`} style={{ flex: 1 }} /><button className="btn">Comentar</button></form>}

      {ativa ? <div className="card">
        {podeAgir ? <>
          <form action={concluirEtapa} style={{ display: "flex", flexDirection: "column", gap: 10 }}><input type="hidden" name="tarefa_id" value={id} />
            <label className="f">Link da entrega desta etapa (opcional)<input name="entrega_url" maxLength={500} inputMode="url" placeholder="https://… arte, texto, print da confirmação" /></label>
            <div className="row"><button className="btn primary">{ativa.tipo === "aprovacao" ? "Aprovado pelo cliente" : `Concluir "${ativa.nome}"`}</button>
              <span className="muted small">{prox ? `Depois passa para ${(prox.usuarios as unknown as { nome: string } | null)?.nome ?? "sem responsável"}, em "${prox.nome}".` : "É a última etapa: a tarefa será concluída."}</span></div></form>
          {t.etapa_atual > 0 && <details><summary style={{ cursor: "pointer", fontWeight: 600, color: "var(--muted)" }}>{ativa.tipo === "aprovacao" ? "Pedir ajuste: devolver para uma etapa anterior" : "Devolver para uma etapa anterior"}</summary>
            <form action={devolverEtapa} style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }}><input type="hidden" name="tarefa_id" value={id} />
              <label className="f">Devolver para<select name="para" defaultValue={t.etapa_atual - 1}>{ets.slice(0, t.etapa_atual).map((e, i) => <option key={e.id} value={i}>{i + 1}. {e.nome} ({(e.usuarios as unknown as { nome: string } | null)?.nome ?? "sem responsável"})</option>)}</select></label>
              <label className="f">Motivo<textarea name="motivo" maxLength={500} required placeholder="O que precisa ser ajustado?" /></label>
              <div><button className="btn">Devolver</button></div></form></details>}
        </> : <p className="muted small">Esta etapa está com {(ativa.usuarios as unknown as { nome: string } | null)?.nome ?? "ninguém"}. Só o responsável ou um gestor pode concluir ou devolver.</p>}
      </div> : <div className="card"><p><strong>Tarefa concluída</strong> <span className="muted">{fmtAt(t.concluida_em)}</span></p></div>}

      <div><h3 style={{ marginBottom: 8 }}>Histórico</h3><ul className="log">{hist?.map((h) => <li key={h.id}><time>{fmtAt(h.criado_em)}</time><strong>{(h.usuarios as unknown as { nome: string } | null)?.nome ?? "Sistema"}</strong> {h.texto}</li>)}</ul></div>
      {me?.papel === "gestor" && <form action={excluirTarefa} className="bar"><input type="hidden" name="tarefa_id" value={id} /><span /><button className="btn ghost danger">Excluir tarefa</button></form>}
    </section>
  );
}
