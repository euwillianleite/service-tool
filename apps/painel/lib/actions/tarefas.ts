"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const url = (u: string) => { if (!u) return ""; if (!/^https?:\/\//i.test(u)) u = "https://" + u; try { return new URL(u).href; } catch { return ""; } };

function erro(id: string, msg: string): never { redirect(`/tarefas/${id}?erro=${encodeURIComponent(msg)}`); }

export async function criarTarefa(fd: FormData) {
  const sb = await supabaseServer();
  const etapas = JSON.parse(s(fd, "etapas") || "[]") as { nome: string; responsavel_id: string; prazo: string; tipo: string }[];
  const links = JSON.parse(s(fd, "links") || "[]") as { rotulo: string; url: string }[];
  if (!s(fd, "cliente_id")) redirect("/tarefas/nova?erro=" + encodeURIComponent("Escolha o cliente."));
  if (!s(fd, "titulo")) redirect("/tarefas/nova?erro=" + encodeURIComponent("Dê um título à tarefa."));
  const lim = etapas.map((e) => ({ nome: e.nome.trim(), responsavel_id: e.responsavel_id || null, prazo: e.prazo || null, tipo: e.tipo === "aprovacao" ? "aprovacao" : "normal" })).filter((e) => e.nome);
  if (!lim.length) redirect("/tarefas/nova?erro=" + encodeURIComponent("Adicione pelo menos uma etapa."));
  const { data, error } = await sb.rpc("criar_tarefa", {
    p_cliente: s(fd, "cliente_id"), p_titulo: s(fd, "titulo"), p_fluxo: s(fd, "fluxo_id") || null,
    p_descricao: s(fd, "descricao").slice(0, 600) || null, p_prioridade: s(fd, "prioridade") || "normal",
    p_entrega: s(fd, "entrega_em") || null, p_produto: s(fd, "produto_id") || null,
    p_etapas: lim, p_links: links.map((l) => ({ rotulo: l.rotulo?.trim() || null, url: url(l.url) })).filter((l) => l.url),
  });
  if (error) redirect("/tarefas/nova?erro=" + encodeURIComponent(error.message));
  revalidatePath("/tarefas");
  redirect(`/tarefas/${data}`);
}

export async function concluirEtapa(fd: FormData) {
  const id = s(fd, "tarefa_id"), sb = await supabaseServer();
  const u = s(fd, "entrega_url"); if (u && !url(u)) erro(id, "O link da entrega não é um endereço válido.");
  const { error } = await sb.rpc("concluir_etapa", { p_tarefa: id, p_entrega_url: url(u) || null });
  if (error) erro(id, error.message);
  revalidatePath("/tarefas"); redirect(`/tarefas/${id}`);
}

export async function devolverEtapa(fd: FormData) {
  const id = s(fd, "tarefa_id"), sb = await supabaseServer();
  const { error } = await sb.rpc("devolver_etapa", { p_tarefa: id, p_para: Number(s(fd, "para")), p_motivo: s(fd, "motivo") });
  if (error) erro(id, error.message);
  revalidatePath("/tarefas"); redirect(`/tarefas/${id}`);
}

export async function reatribuirEtapa(fd: FormData) {
  const id = s(fd, "tarefa_id"), sb = await supabaseServer();
  const { error } = await sb.rpc("reatribuir_etapa", { p_etapa: s(fd, "etapa_id"), p_usuario: s(fd, "usuario_id") || null });
  if (error) erro(id, error.message);
  revalidatePath("/tarefas"); redirect(`/tarefas/${id}`);
}

export async function comentar(fd: FormData) {
  const id = s(fd, "tarefa_id"), texto = s(fd, "texto").slice(0, 400); if (!texto) redirect(`/tarefas/${id}`);
  const sb = await supabaseServer(); const { data: { user } } = await sb.auth.getUser();
  const { error } = await sb.from("etapa_comentarios").insert({ etapa_id: s(fd, "etapa_id"), autor_id: user!.id, texto });
  if (error) erro(id, error.message);
  redirect(`/tarefas/${id}`);
}

export async function adicionarLink(fd: FormData) {
  const id = s(fd, "tarefa_id"), u = url(s(fd, "url")); if (!u) erro(id, "Informe um endereço válido, como https://exemplo.com");
  const sb = await supabaseServer();
  const { error } = await sb.from("tarefa_links").insert({ tarefa_id: id, rotulo: s(fd, "rotulo") || null, url: u });
  if (error) erro(id, error.message);
  redirect(`/tarefas/${id}`);
}

export async function removerLink(fd: FormData) {
  const sb = await supabaseServer(); await sb.from("tarefa_links").delete().eq("id", s(fd, "link_id"));
  redirect(`/tarefas/${s(fd, "tarefa_id")}`);
}

export async function excluirTarefa(fd: FormData) {
  const sb = await supabaseServer(); const { error } = await sb.from("tarefas").delete().eq("id", s(fd, "tarefa_id"));
  if (error) erro(s(fd, "tarefa_id"), error.message);
  revalidatePath("/tarefas"); redirect("/tarefas");
}
