import { supabaseServer, usuarioAtual } from "@/lib/supabase/server";
import { Av } from "@/lib/ui";
import { salvarUsuario } from "@/lib/actions/cadastros";

export default async function Equipe({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const { erro } = await searchParams, sb = await supabaseServer(), me = await usuarioAtual();
  const [{ data: usuarios }, { data: carga }] = await Promise.all([
    sb.from("usuarios").select("*").order("nome"),
    sb.from("tarefa_etapas").select("responsavel_id,ordem,tarefas!inner(etapa_atual,status)").eq("tarefas.status", "aberta"),
  ]);
  const gestor = me?.papel === "gestor";
  const n = (id: string, fila: boolean) => (carga ?? []).filter((e) => e.responsavel_id === id && (fila ? e.ordem === (e.tarefas as unknown as { etapa_atual: number }).etapa_atual : e.ordem > (e.tarefas as unknown as { etapa_atual: number }).etapa_atual)).length;
  return (
    <section className="narrow" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {erro && <p className="err">{erro}</p>}
      <p className="muted small">Novos usuários são criados pelo gestor no painel do Supabase (Authentication → Users → Add user). No primeiro login o perfil aparece aqui; o primeiro usuário do sistema é gestor.</p>
      {usuarios?.map((u) => { const pode = gestor || u.id === me?.id; return (
        <form key={u.id} action={salvarUsuario} encType="multipart/form-data" className="person" style={{ opacity: u.ativo ? 1 : 0.55 }}><input type="hidden" name="id" value={u.id} />
          <div className="bar"><span className="row"><Av nome={u.nome} foto={u.foto_url} /><strong>{u.nome}</strong>{u.papel === "gestor" && <span className="pill">Gestor</span>}{!u.ativo && <span className="pill plain">Inativo</span>}</span>
            <span className="row small"><span className="pill">{n(u.id, true)} na fila</span><span className="muted">{n(u.id, false)} a caminho</span></span></div>
          {pode && <div className="grid2" style={{ alignItems: "end" }}>
            <label className="f">Nome<input name="nome" defaultValue={u.nome} required maxLength={60} /></label>
            <label className="f">Função<input name="funcao" defaultValue={u.funcao ?? ""} maxLength={60} placeholder="Ex.: Design" /></label>
            <label className="f">Foto<input name="foto" type="file" accept="image/*" /></label>
            {gestor && <label className="f">Papel<select name="papel" defaultValue={u.papel}><option value="membro">Membro</option><option value="gestor">Gestor</option></select></label>}
            {gestor && u.id !== me?.id && <label className="f">Situação<select name="ativo" defaultValue={u.ativo ? "1" : "0"}><option value="1">Ativo</option><option value="0">Inativo</option></select></label>}
            <button className="btn">Salvar</button></div>}
        </form>); })}
    </section>
  );
}
