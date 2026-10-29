import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseServer, usuarioAtual } from "@/lib/supabase/server";
import { Logo, Acessos, ACESSOS, brl } from "@/lib/ui";
import { salvarCliente, adicionarProduto, removerProduto, adicionarAcesso, removerAcesso, desativarCliente } from "@/lib/actions/cadastros";

export default async function Cliente({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ erro?: string }> }) {
  const { id } = await params, { erro } = await searchParams, sb = await supabaseServer(), me = await usuarioAtual();
  const gestor = me?.papel === "gestor";
  const [{ data: c }, { data: produtos }, { data: acessos }, { data: tarefas }] = await Promise.all([
    sb.from("clientes").select("*").eq("id", id).single(),
    gestor ? sb.from("cliente_produtos").select("*").eq("cliente_id", id).eq("ativo", true).order("nome") : Promise.resolve({ data: [] as never[] }),
    sb.from("cliente_acessos").select("*").eq("cliente_id", id).order("ordem"),
    sb.from("tarefas_resumo").select("id,status,atrasada").eq("cliente_id", id),
  ]);
  if (!c) notFound();
  const abertas = tarefas?.filter((t) => t.status === "aberta") ?? [], atrasadas = abertas.filter((t) => t.atrasada).length;
  const prods = (produtos ?? []) as { id: string; nome: string; valor_centavos: number; cobranca: string }[];
  const mensal = prods.filter((p) => p.cobranca === "mensal").reduce((a, p) => a + p.valor_centavos, 0), unico = prods.filter((p) => p.cobranca === "unico").reduce((a, p) => a + p.valor_centavos, 0);
  const usados = new Set((acessos ?? []).map((a) => a.tipo));
  const ro = !gestor;
  return (
    <section className="narrow" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {erro && <p className="err">{erro}</p>}
      <div className="bar"><span className="row"><Logo nome={c.nome} url={c.logo_url} /><div><h2>Ficha do cliente</h2><span className="muted small">{c.nome} · {abertas.length} em andamento{atrasadas ? ` · ${atrasadas} atrasada${atrasadas > 1 ? "s" : ""}` : ""}</span></div></span>
        <span className="row"><Link className="btn" href={`/tarefas?cliente=${id}`}>Ver tarefas</Link><Link className="btn" href={`/tarefas/nova?cliente=${id}`}>Nova tarefa</Link><Link className="btn ghost" href="/clientes">Voltar</Link></span></div>
      <Acessos itens={acessos ?? []} />

      <form action={salvarCliente} encType="multipart/form-data" className="card"><input type="hidden" name="id" value={id} />
        <div className="grid2">
          <label className="f">Nome do cliente<input name="nome" defaultValue={c.nome} required maxLength={80} readOnly={ro} /></label>
          <label className="f">Razão social<input name="razao_social" defaultValue={c.razao_social ?? ""} maxLength={120} readOnly={ro} /></label>
          <label className="f">CNPJ ou CPF<input name="documento" defaultValue={c.documento ?? ""} maxLength={20} readOnly={ro} /></label>
          <label className="f">Cliente desde<input name="cliente_desde" type="date" defaultValue={c.cliente_desde ?? ""} readOnly={ro} /></label>
          <label className="f">Contato principal<input name="contato" defaultValue={c.contato ?? ""} maxLength={80} readOnly={ro} /></label>
          <label className="f">Telefone ou WhatsApp<input name="telefone" defaultValue={c.telefone ?? ""} maxLength={30} readOnly={ro} /></label>
          <label className="f">E-mail<input name="email" defaultValue={c.email ?? ""} maxLength={120} readOnly={ro} /></label>
          {gestor && <label className="f">Trocar logotipo<input name="logo" type="file" accept="image/*" /></label>}
        </div>
        <label className="f">Observações<textarea name="observacoes" defaultValue={c.observacoes ?? ""} maxLength={600} rows={3} readOnly={ro} /></label>
        {gestor && <div className="bar"><span /><button className="btn primary">Salvar ficha</button></div>}
      </form>

      {gestor && <div className="sec"><h3>Produtos contratados</h3>
        {prods.length > 0 && <table><thead><tr><th>Produto</th><th className="num">Valor</th><th>Cobrança</th><th /></tr></thead><tbody>{prods.map((p) => <tr key={p.id}><td>{p.nome}</td><td className="num">{brl(p.valor_centavos)}</td><td>{p.cobranca === "unico" ? "Único" : "Mensal"}</td>
          <td><form action={removerProduto}><input type="hidden" name="cliente_id" value={id} /><input type="hidden" name="id" value={p.id} /><button className="btn ghost danger">×</button></form></td></tr>)}</tbody></table>}
        <form action={adicionarProduto} className="row"><input type="hidden" name="cliente_id" value={id} />
          <input name="nome" placeholder="Produto ou serviço" maxLength={80} required style={{ flex: 2 }} /><input name="valor" placeholder="0,00" inputMode="decimal" style={{ flex: 1 }} />
          <select name="cobranca" defaultValue="mensal" style={{ width: "auto" }}><option value="mensal">Mensal</option><option value="unico">Único</option></select><button className="btn">Adicionar</button></form>
        <p className="small" style={{ textAlign: "right" }}>Mensal <strong>{brl(mensal)}</strong>{unico > 0 && <> · Único <strong>{brl(unico)}</strong></>}</p></div>}

      {gestor && <div className="sec"><h3>Acessos rápidos</h3><p className="muted small">Escolha a plataforma, cole o endereço da conta deste cliente e adicione. O botão passa a abrir direto na ficha, na lista de clientes e nas tarefas dele.</p>
        {(acessos ?? []).map((a) => <div key={a.id} className="row"><span className="qbtn">{a.tipo === "outro" ? a.rotulo : ACESSOS[a.tipo]}</span><span className="muted small" style={{ overflowWrap: "anywhere" }}>{a.url}</span>
          <form action={removerAcesso}><input type="hidden" name="cliente_id" value={id} /><input type="hidden" name="id" value={a.id} /><button className="btn ghost danger">×</button></form></div>)}
        <form action={adicionarAcesso} className="row"><input type="hidden" name="cliente_id" value={id} />
          <select name="tipo" style={{ width: "auto" }}>{Object.entries(ACESSOS).filter(([k]) => k === "outro" || !usados.has(k)).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          <input name="rotulo" placeholder="Nome (só para “Outro link”)" maxLength={40} style={{ flex: 1 }} /><input name="url" placeholder="https://…" maxLength={500} inputMode="url" required style={{ flex: 2 }} /><button className="btn">Adicionar</button></form></div>}

      {gestor && <form action={desativarCliente} className="bar"><input type="hidden" name="id" value={id} /><span /><button className="btn ghost danger">Remover cliente</button></form>}
    </section>
  );
}
