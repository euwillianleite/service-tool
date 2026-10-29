import { supabaseServer, usuarioAtual } from "@/lib/supabase/server";
import { Logo, fmtAt } from "@/lib/ui";
import { sincronizar, salvarVinculo } from "@/lib/actions/vinculos";

export const dynamic = "force-dynamic";
type Conta = { id: string; nome: string | null; status: number | null; business_nome: string | null; sincronizada_em: string };
type Grupo = { id: string; nome: string | null; participantes: number | null; sincronizado_em: string };

export default async function Vinculos({ searchParams }: { searchParams: Promise<{ ok?: string; erro?: string }> }) {
  const sp = await searchParams, sb = await supabaseServer(), me = await usuarioAtual();
  const [{ data: clientes }, { data: contas }, { data: grupos }, { data: vinc }] = await Promise.all([
    sb.from("clientes").select("id,nome,logo_url,grupo_whatsapp_id").eq("ativo", true).order("nome"),
    sb.from("contas_anuncio").select("*").order("nome"),
    sb.from("wa_grupos").select("*").order("nome"),
    sb.from("cliente_contas_anuncio").select("conta_id,cliente_id"),
  ]);
  const gestor = me?.papel === "gestor";
  const donoDaConta = new Map((vinc ?? []).map((v) => [v.conta_id, v.cliente_id]));
  const ultSync = [...(contas ?? []).map((c) => c.sincronizada_em), ...(grupos ?? []).map((g) => g.sincronizado_em)].sort().pop();
  const gruposUsados = new Map((clientes ?? []).filter((c) => c.grupo_whatsapp_id).map((c) => [c.grupo_whatsapp_id!, c.nome]));

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="bar">
        <p className="muted small" style={{ maxWidth: "62ch" }}>Para cada cliente, escolha o grupo de WhatsApp (por onde a Cláudia atende) e as contas de anúncio da Meta. As listas vêm do portfólio CapiHub e do número da Cláudia; sincronize quando criar um grupo ou uma conta nova.</p>
        {gestor && <form action={sincronizar}><button className="btn primary">Sincronizar listas</button></form>}
      </div>
      {sp.ok && <p className="small" style={{ color: "var(--go)" }}>{sp.ok}</p>}
      {sp.erro && <p className="err">{sp.erro}</p>}
      <p className="muted small">{(contas ?? []).length} contas de anúncio · {(grupos ?? []).length} grupos{ultSync ? ` · última sincronização ${fmtAt(ultSync)}` : " · ainda não sincronizado"}</p>

      {!clientes?.length && <div className="empty">Cadastre clientes na aba Clientes; eles aparecem aqui para vincular.</div>}
      {clientes?.map((c) => {
        const minhas = (vinc ?? []).filter((v) => v.cliente_id === c.id).map((v) => v.conta_id);
        return (
          <form key={c.id} action={salvarVinculo} className="card"><input type="hidden" name="cliente_id" value={c.id} />
            <div className="row"><Logo nome={c.nome} url={c.logo_url} /><strong>{c.nome}</strong></div>
            <div className="grid2" style={{ alignItems: "start" }}>
              <label className="f">Grupo de WhatsApp
                <select name="grupo_whatsapp_id" defaultValue={c.grupo_whatsapp_id ?? ""} disabled={!gestor}>
                  <option value="">Nenhum</option>
                  {c.grupo_whatsapp_id && !(grupos ?? []).some((g) => g.id === c.grupo_whatsapp_id) && <option value={c.grupo_whatsapp_id}>{c.grupo_whatsapp_id} (não está na lista sincronizada)</option>}
                  {(grupos as Grupo[] | null)?.map((g) => { const dono = gruposUsados.get(g.id); return <option key={g.id} value={g.id}>{g.nome ?? g.id}{g.participantes ? ` · ${g.participantes}` : ""}{dono && dono !== c.nome ? ` · já é de ${dono}` : ""}</option>; })}
                </select>
                <span className="muted" style={{ fontSize: 12, fontWeight: 400 }}>Se o grupo não aparece, o número da Cláudia não está nele ou falta sincronizar.</span>
              </label>
              <label className="f">Contas de anúncio (Meta)
                <select name="contas" multiple size={Math.min(6, Math.max(3, (contas ?? []).length))} defaultValue={minhas} disabled={!gestor}>
                  {(contas as Conta[] | null)?.map((a) => { const dono = donoDaConta.get(a.id); const outro = dono && dono !== c.id; return <option key={a.id} value={a.id} disabled={!!outro}>{a.nome ?? a.id} · {a.id.replace("act_", "")}{a.status !== 1 ? " · inativa" : ""}{outro ? ` · ${clientes.find((x) => x.id === dono)?.nome ?? "outro cliente"}` : ""}</option>; })}
                </select>
                <span className="muted" style={{ fontSize: 12, fontWeight: 400 }}>Segure ⌘ (Mac) ou Ctrl para escolher mais de uma. Contas em cinza já pertencem a outro cliente.</span>
              </label>
            </div>
            {gestor && <div className="bar"><span className="muted small">{minhas.length} conta{minhas.length === 1 ? "" : "s"} vinculada{minhas.length === 1 ? "" : "s"}</span><button className="btn">Salvar vínculo</button></div>}
          </form>
        );
      })}
    </section>
  );
}
