import { supabaseServer } from "@/lib/supabase/server";
import { NovaTarefaForm } from "./form";

export default async function NovaTarefa({ searchParams }: { searchParams: Promise<{ erro?: string; cliente?: string; fluxo?: string }> }) {
  const sp = await searchParams, sb = await supabaseServer();
  const [{ data: clientes }, { data: fluxos }, { data: equipe }, { data: produtos }] = await Promise.all([
    sb.from("clientes").select("id,nome").eq("ativo", true).order("nome"),
    sb.from("fluxos").select("id,nome,fluxo_etapas(ordem,nome,responsavel_padrao_id,dias,tipo)").eq("ativo", true).order("nome"),
    sb.from("usuarios").select("id,nome").eq("ativo", true).order("nome"),
    sb.from("cliente_produtos").select("id,cliente_id,nome").eq("ativo", true).order("nome"),
  ]);
  return (
    <section className="narrow" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <h2>Nova tarefa</h2>
      {sp.erro && <p className="err">{sp.erro}</p>}
      <NovaTarefaForm clientes={clientes ?? []} fluxos={(fluxos ?? []) as never} equipe={equipe ?? []} produtos={produtos ?? []} clienteInicial={sp.cliente ?? ""} fluxoInicial={sp.fluxo ?? ""} />
    </section>
  );
}
