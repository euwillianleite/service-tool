import Link from "next/link";
import { supabaseServer, usuarioAtual } from "@/lib/supabase/server";
import { Logo, Acessos, brl } from "@/lib/ui";
import { criarCliente } from "@/lib/actions/cadastros";

export default async function Clientes({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const { erro } = await searchParams, sb = await supabaseServer(), me = await usuarioAtual();
  const [{ data: clientes }, { data: tarefas }, { data: produtos }] = await Promise.all([
    sb.from("clientes").select("id,nome,logo_url,cliente_acessos(tipo,rotulo,url)").eq("ativo", true).order("nome"),
    sb.from("tarefas").select("cliente_id,status"),
    me?.papel === "gestor" ? sb.from("cliente_produtos").select("cliente_id,valor_centavos,cobranca").eq("ativo", true) : Promise.resolve({ data: [] as { cliente_id: string; valor_centavos: number; cobranca: string }[] }),
  ]);
  const cont = (id: string, st: string) => tarefas?.filter((t) => t.cliente_id === id && t.status === st).length ?? 0;
  const mensal = (id: string) => (produtos ?? []).filter((p) => p.cliente_id === id && p.cobranca === "mensal").reduce((a, p) => a + p.valor_centavos, 0);
  return (
    <section className="narrow" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {erro && <p className="err">{erro}</p>}
      {me?.papel === "gestor" && <form action={criarCliente} className="card" encType="multipart/form-data"><div className="grid2" style={{ alignItems: "end" }}>
        <label className="f">Nome do cliente<input name="nome" required maxLength={80} /></label>
        <label className="f">Logotipo (opcional)<input name="logo" type="file" accept="image/*" /></label>
        <button className="btn primary">Cadastrar e abrir ficha</button></div></form>}
      {!clientes?.length && <div className="empty">Nenhum cliente cadastrado. Toda tarefa é vinculada a um cliente.</div>}
      {clientes?.map((c) => <div key={c.id} className="card"><div className="bar">
        <span className="row"><Logo nome={c.nome} url={c.logo_url} /><span><strong>{c.nome}</strong><br /><span className="muted small">{cont(c.id, "aberta")} em andamento · {cont(c.id, "concluida")} concluídas{me?.papel === "gestor" && mensal(c.id) > 0 && <> · {brl(mensal(c.id))}/mês</>}</span></span></span>
        <span className="row"><Link className="btn primary" href={`/clientes/${c.id}`}>Abrir ficha</Link><Link className="btn" href={`/tarefas?cliente=${c.id}`}>Ver tarefas</Link></span></div>
        <Acessos itens={c.cliente_acessos} /></div>)}
    </section>
  );
}
