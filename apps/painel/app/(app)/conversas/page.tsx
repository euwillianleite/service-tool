import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { fmtAt } from "@/lib/ui";
import { responder, marcarLida } from "./actions";

export const dynamic = "force-dynamic";

export default async function Conversas({ searchParams }: { searchParams: Promise<{ c?: string; erro?: string }> }) {
  const { c, erro } = await searchParams, sb = await supabaseServer();
  const { data: convs } = await sb.from("wa_conversas").select("*, clientes(nome), usuarios(nome)").order("ultima_mensagem_em", { ascending: false, nullsFirst: false }).limit(200);
  const atual = convs?.find((x) => x.id === c) ?? convs?.[0];
  const { data: msgs } = atual ? await sb.from("wa_mensagens").select("*").eq("conversa_id", atual.id).order("id", { ascending: false }).limit(200) : { data: [] };
  const { data: obs } = atual ? await sb.from("claudia_observacoes").select("*").eq("conversa_id", atual.id).order("id", { ascending: false }).limit(200) : { data: [] };
  const obsPor = new Map((obs ?? []).filter((o) => o.mensagem_externo_id).map((o) => [o.mensagem_externo_id as string, o]));
  if (atual && atual.nao_lidas > 0) await marcarLida(atual.id);
  const lista = (msgs ?? []).reverse();
  const titulo = (x: NonNullable<typeof convs>[number]) => (x.clientes as { nome: string } | null)?.nome ?? (x.usuarios as { nome: string } | null)?.nome ?? x.nome ?? x.id;

  return (
    <section className="chat">
      <aside className="chat-list">
        <div className="bar" style={{ padding: "0 4px 8px" }}><h3>Conversas</h3><Link className="btn ghost" href="/conversas">Atualizar</Link></div>
        {!convs?.length && <div className="empty">Nenhuma mensagem ainda. Quando a Z-API ou a Meta entregarem webhooks ao serviço <code>whatsapp</code>, as conversas aparecem aqui.</div>}
        {convs?.map((x) => <Link key={x.id} href={`/conversas?c=${encodeURIComponent(x.id)}`} className={`conv${atual?.id === x.id ? " on" : ""}`}>
          <span className="row" style={{ justifyContent: "space-between" }}><strong>{titulo(x)}</strong><span className="muted small">{x.ultima_mensagem_em ? fmtAt(x.ultima_mensagem_em) : ""}</span></span>
          <span className="row" style={{ justifyContent: "space-between" }}><span className="muted small" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.tipo === "grupo" ? "👥 " : ""}{x.ultima_mensagem}</span>{x.nao_lidas > 0 && <span className="pill">{x.nao_lidas}</span>}</span>
        </Link>)}
      </aside>
      <div className="chat-main">
        {atual ? <>
          <header className="bar" style={{ borderBottom: "1px solid var(--line)", paddingBottom: 8 }}>
            <div><strong>{titulo(atual)}</strong><br /><span className="muted small">{atual.tipo === "grupo" ? "Grupo" : "Privado"} · {atual.provedor === "meta" ? "Meta Cloud API" : "Z-API"} · <code>{atual.id}</code></span></div>
            {atual.cliente_id && <Link className="btn" href={`/clientes/${atual.cliente_id}`}>Ficha do cliente</Link>}
          </header>
          <div className="bubbles">
            {lista.map((m) => <div key={m.id} className={`bubble ${m.direcao}`}>
              {m.direcao === "recebida" && atual.tipo === "grupo" && <span className="who-name">{m.de_nome || m.de}</span>}
              {m.direcao === "enviada" && m.enviada_por && <span className="who-name">{m.enviada_por === "claudia" ? "Cláudia" : m.enviada_por === "painel" ? "Painel" : "Pelo celular"}</span>}
              {m.midia_url && (m.midia_tipo === "image" ? <a href={m.midia_url} target="_blank" rel="noopener noreferrer"><img src={m.midia_url} alt="" style={{ maxWidth: 240, borderRadius: 8, display: "block" }} /></a> : <a href={m.midia_url} target="_blank" rel="noopener noreferrer">📎 {m.midia_tipo}</a>)}
              {m.texto && <span style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{m.texto}</span>}
              {m.externo_id && obsPor.get(m.externo_id) && <span className="obs"><b>Cláudia observou</b> ({obsPor.get(m.externo_id)!.intencao}): {obsPor.get(m.externo_id)!.acao_sugerida}{obsPor.get(m.externo_id)!.resposta_sugerida && <><br /><i>Responderia: "{obsPor.get(m.externo_id)!.resposta_sugerida}"</i></>}</span>}
              <span className="meta">{fmtAt(m.criado_em)}{m.direcao === "enviada" && m.status ? ` · ${{ sent: "✓", delivered: "✓✓", read: "✓✓ lida", failed: "falhou" }[m.status as string] ?? m.status}` : ""}{m.tarefa_id && <> · <Link href={`/tarefas/${m.tarefa_id}`}>tarefa</Link></>}</span>
            </div>)}
          </div>
          {erro && <p className="err">{erro}</p>}
          <form action={responder} className="row" style={{ flexWrap: "nowrap" }}><input type="hidden" name="para" value={atual.id} />
            <input name="texto" placeholder={process.env.GATEWAY_SOMENTE_LEITURA === "1" ? "Modo observação: envios desligados neste ambiente" : "Responder como a agência (vai pelo número da Cláudia)"} maxLength={1000} required style={{ flex: 1 }} disabled={process.env.GATEWAY_SOMENTE_LEITURA === "1"} /><button className="btn primary" disabled={process.env.GATEWAY_SOMENTE_LEITURA === "1"}>Enviar</button></form>
        </> : <div className="empty">Escolha uma conversa.</div>}
      </div>
    </section>
  );
}
