"use client";
import { useState } from "react";
import Link from "next/link";
import { salvarFluxo, desativarFluxo } from "@/lib/actions/cadastros";

type E = { k: number; nome: string; responsavel_padrao_id: string; dias: string; tipo: string };
let seq = 1;
export function FluxoForm({ fluxo, equipe }: { fluxo: { id: string; nome: string; fluxo_etapas: { ordem: number; nome: string; responsavel_padrao_id: string | null; dias: number; tipo: string }[] }; equipe: { id: string; nome: string }[] }) {
  const [etapas, setEtapas] = useState<E[]>(() => { const es = [...fluxo.fluxo_etapas].sort((a, b) => a.ordem - b.ordem).map((e) => ({ k: seq++, nome: e.nome, responsavel_padrao_id: e.responsavel_padrao_id ?? "", dias: String(e.dias || ""), tipo: e.tipo })); return es.length ? es : [{ k: seq++, nome: "", responsavel_padrao_id: "", dias: "", tipo: "normal" }]; });
  const up = (i: number, p: Partial<E>) => setEtapas((es) => es.map((e, j) => (j === i ? { ...e, ...p } : e)));
  const mv = (i: number, d: number) => setEtapas((es) => { const a = [...es], j = i + d; if (j < 0 || j >= a.length) return es; [a[i], a[j]] = [a[j], a[i]]; return a; });
  return (
    <form action={salvarFluxo} className="card"><input type="hidden" name="id" value={fluxo.id} /><input type="hidden" name="etapas" value={JSON.stringify(etapas)} />
      <h3>{fluxo.id ? "Editar modelo" : "Novo modelo"}</h3>
      <label className="f">Nome do modelo<input name="nome" defaultValue={fluxo.nome} required maxLength={80} placeholder="Ex.: Criação de anúncios" /></label>
      <p className="muted small">Responsável padrão e dias de prazo são opcionais. Os dias viram datas quando a tarefa é criada.</p>
      {etapas.map((e, i) => <div key={e.k} className="row" style={{ flexWrap: "nowrap" }}><span className="muted small" style={{ width: 18 }}>{i + 1}</span>
        <input value={e.nome} onChange={(ev) => up(i, { nome: ev.target.value })} placeholder="Nome da etapa" maxLength={60} style={{ flex: 2 }} />
        <select value={e.responsavel_padrao_id} onChange={(ev) => up(i, { responsavel_padrao_id: ev.target.value })} style={{ flex: 1 }}><option value="">Sem responsável</option>{equipe.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}</select>
        <input type="number" min={0} max={365} value={e.dias} onChange={(ev) => up(i, { dias: ev.target.value })} placeholder="dias" style={{ width: 80 }} />
        <label className="small muted" style={{ whiteSpace: "nowrap" }}><input type="checkbox" style={{ width: "auto" }} checked={e.tipo === "aprovacao"} onChange={(ev) => up(i, { tipo: ev.target.checked ? "aprovacao" : "normal" })} /> Aprovação</label>
        <button type="button" className="btn ghost" onClick={() => mv(i, -1)} disabled={i === 0}>↑</button><button type="button" className="btn ghost" onClick={() => mv(i, 1)} disabled={i === etapas.length - 1}>↓</button>
        <button type="button" className="btn ghost danger" onClick={() => setEtapas((es) => es.filter((_, j) => j !== i))}>×</button></div>)}
      <div className="bar"><button type="button" className="btn" onClick={() => setEtapas((es) => [...es, { k: seq++, nome: "", responsavel_padrao_id: "", dias: "", tipo: "normal" }])}>Adicionar etapa</button>
        <span className="row"><Link className="btn ghost" href="/fluxos">Cancelar</Link>{fluxo.id && <button className="btn ghost danger" formAction={desativarFluxo}>Excluir modelo</button>}<button className="btn primary">Salvar modelo</button></span></div>
    </form>
  );
}
