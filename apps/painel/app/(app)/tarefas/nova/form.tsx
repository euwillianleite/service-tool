"use client";
import { useState } from "react";
import { criarTarefa } from "@/lib/actions/tarefas";

type FE = { ordem: number; nome: string; responsavel_padrao_id: string | null; dias: number; tipo: string };
type Fluxo = { id: string; nome: string; fluxo_etapas: FE[] };
type Etapa = { k: number; nome: string; responsavel_id: string; prazo: string; tipo: string };
let seq = 1;
const addDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

export function NovaTarefaForm({ clientes, fluxos, equipe, produtos, clienteInicial, fluxoInicial }:
  { clientes: { id: string; nome: string }[]; fluxos: Fluxo[]; equipe: { id: string; nome: string }[]; produtos: { id: string; cliente_id: string; nome: string }[]; clienteInicial: string; fluxoInicial: string }) {
  const fromFlow = (fid: string): Etapa[] => { const f = fluxos.find((x) => x.id === fid); if (!f) return [{ k: seq++, nome: "", responsavel_id: "", prazo: "", tipo: "normal" }];
    let acc = 0; return [...f.fluxo_etapas].sort((a, b) => a.ordem - b.ordem).map((e) => { acc += e.dias; return { k: seq++, nome: e.nome, responsavel_id: e.responsavel_padrao_id ?? "", prazo: e.dias ? addDays(acc) : "", tipo: e.tipo }; }); };
  const [cliente, setCliente] = useState(clienteInicial);
  const [fluxo, setFluxo] = useState(fluxoInicial);
  const [etapas, setEtapas] = useState<Etapa[]>(() => fromFlow(fluxoInicial));
  const [links, setLinks] = useState<{ k: number; rotulo: string; url: string }[]>([]);
  const [desc, setDesc] = useState("");
  const up = (i: number, p: Partial<Etapa>) => setEtapas((es) => es.map((e, j) => (j === i ? { ...e, ...p } : e)));
  const mv = (i: number, d: number) => setEtapas((es) => { const a = [...es]; const j = i + d; if (j < 0 || j >= a.length) return es; [a[i], a[j]] = [a[j], a[i]]; return a; });

  return (
    <form action={criarTarefa} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <input type="hidden" name="etapas" value={JSON.stringify(etapas)} /><input type="hidden" name="links" value={JSON.stringify(links)} />
      <div className="grid2">
        <label className="f">Cliente<select name="cliente_id" value={cliente} onChange={(e) => setCliente(e.target.value)} required><option value="">Escolher cliente…</option>{clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></label>
        <label className="f">Tipo de demanda<select name="fluxo_id" value={fluxo} onChange={(e) => { setFluxo(e.target.value); setEtapas(fromFlow(e.target.value)); }}><option value="">Em branco</option>{fluxos.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}</select></label>
        <label className="f">Produto contratado<select name="produto_id" defaultValue=""><option value="">Nenhum</option>{produtos.filter((p) => p.cliente_id === cliente).map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}</select></label>
      </div>
      <label className="f">Título<input name="titulo" maxLength={120} required placeholder="Ex.: Dia dos Pais, arte e postagem" /></label>
      <div className="grid2">
        <label className="f">Prioridade<select name="prioridade" defaultValue="normal"><option value="normal">Normal</option><option value="alta">Alta</option><option value="urgente">Urgente</option></select></label>
        <label className="f">Entrega ao cliente<input name="entrega_em" type="date" /></label>
      </div>
      <label className="f">Descrição<textarea name="descricao" maxLength={600} rows={5} value={desc} onChange={(e) => setDesc(e.target.value)} /><span className="muted small" style={{ alignSelf: "flex-end" }}>{desc.length}/600</span></label>

      <div><h3 style={{ marginBottom: 8 }}>Links de apoio</h3>
        {links.map((l, i) => <div key={l.k} className="row" style={{ marginBottom: 6 }}><input value={l.rotulo} onChange={(e) => setLinks((ls) => ls.map((x, j) => j === i ? { ...x, rotulo: e.target.value } : x))} placeholder="Nome (opcional)" maxLength={60} style={{ flex: 1 }} />
          <input value={l.url} onChange={(e) => setLinks((ls) => ls.map((x, j) => j === i ? { ...x, url: e.target.value } : x))} placeholder="https://…" maxLength={500} inputMode="url" style={{ flex: 2 }} /><button type="button" className="btn ghost danger" onClick={() => setLinks((ls) => ls.filter((_, j) => j !== i))}>×</button></div>)}
        {links.length < 10 && <button type="button" className="btn" onClick={() => setLinks((ls) => [...ls, { k: seq++, rotulo: "", url: "" }])}>Adicionar link</button>}</div>

      <div><h3>Etapas desta tarefa</h3><p className="muted small" style={{ marginBottom: 10 }}>Ajuste à vontade. Marque "Aprovação" nas etapas que dependem do cliente. O modelo não é alterado.</p>
        {etapas.map((e, i) => <div key={e.k} className="row" style={{ marginBottom: 6, flexWrap: "nowrap" }}>
          <span className="muted small" style={{ width: 18 }}>{i + 1}</span>
          <input value={e.nome} onChange={(ev) => up(i, { nome: ev.target.value })} placeholder="Nome da etapa" maxLength={60} style={{ flex: 2 }} />
          <select value={e.responsavel_id} onChange={(ev) => up(i, { responsavel_id: ev.target.value })} style={{ flex: 1 }}><option value="">Sem responsável</option>{equipe.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}</select>
          <input type="date" value={e.prazo} onChange={(ev) => up(i, { prazo: ev.target.value })} style={{ width: 150 }} />
          <label className="small muted" style={{ whiteSpace: "nowrap" }}><input type="checkbox" style={{ width: "auto" }} checked={e.tipo === "aprovacao"} onChange={(ev) => up(i, { tipo: ev.target.checked ? "aprovacao" : "normal" })} /> Aprovação</label>
          <button type="button" className="btn ghost" onClick={() => mv(i, -1)} disabled={i === 0}>↑</button><button type="button" className="btn ghost" onClick={() => mv(i, 1)} disabled={i === etapas.length - 1}>↓</button>
          <button type="button" className="btn ghost danger" onClick={() => setEtapas((es) => es.filter((_, j) => j !== i))}>×</button></div>)}
        <button type="button" className="btn" onClick={() => setEtapas((es) => [...es, { k: seq++, nome: "", responsavel_id: "", prazo: "", tipo: "normal" }])}>Adicionar etapa</button></div>
      <div className="bar"><span /><button className="btn primary">Criar tarefa</button></div>
    </form>
  );
}
