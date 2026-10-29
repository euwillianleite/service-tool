"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const url = (u: string) => { if (!u) return ""; if (!/^https?:\/\//i.test(u)) u = "https://" + u; try { return new URL(u).href; } catch { return ""; } };
const centavos = (v: string) => { v = v.replace(/[^\d.,]/g, ""); if (v.includes(",")) v = v.replace(/\./g, "").replace(",", "."); const n = parseFloat(v); return isFinite(n) ? Math.round(n * 100) : 0; };

async function enviarImagem(fd: FormData, campo: string, pasta: string) {
  const f = fd.get(campo); if (!(f instanceof File) || !f.size) return null;
  if (!f.type.startsWith("image/") || f.size > 2 * 1024 * 1024) return null;
  const sb = await supabaseServer(); const path = `${pasta}/${crypto.randomUUID()}.${f.name.split(".").pop() || "png"}`;
  const { error } = await sb.storage.from("imagens").upload(path, f, { contentType: f.type });
  if (error) return null;
  return sb.storage.from("imagens").getPublicUrl(path).data.publicUrl;
}

export async function criarCliente(fd: FormData) {
  const sb = await supabaseServer(); const nome = s(fd, "nome"); if (!nome) redirect("/clientes");
  const logo_url = await enviarImagem(fd, "logo", "logos");
  const { data, error } = await sb.from("clientes").insert({ nome, logo_url }).select("id").single();
  if (error) redirect("/clientes?erro=" + encodeURIComponent(error.message));
  revalidatePath("/clientes"); redirect(`/clientes/${data.id}`);
}

export async function salvarCliente(fd: FormData) {
  const id = s(fd, "id"), sb = await supabaseServer();
  const logo_url = await enviarImagem(fd, "logo", "logos");
  const dados: Record<string, unknown> = { nome: s(fd, "nome"), razao_social: s(fd, "razao_social") || null, documento: s(fd, "documento") || null, contato: s(fd, "contato") || null,
    telefone: s(fd, "telefone") || null, email: s(fd, "email") || null, cliente_desde: s(fd, "cliente_desde") || null, observacoes: s(fd, "observacoes").slice(0, 600) || null, atualizado_em: new Date().toISOString() };
  if (logo_url) dados.logo_url = logo_url;
  const { error } = await sb.from("clientes").update(dados).eq("id", id);
  if (error) redirect(`/clientes/${id}?erro=` + encodeURIComponent(error.message));
  revalidatePath("/clientes"); redirect(`/clientes/${id}`);
}

export async function adicionarProduto(fd: FormData) {
  const id = s(fd, "cliente_id"), sb = await supabaseServer(); if (!s(fd, "nome")) redirect(`/clientes/${id}`);
  await sb.from("cliente_produtos").insert({ cliente_id: id, nome: s(fd, "nome"), valor_centavos: centavos(s(fd, "valor")), cobranca: s(fd, "cobranca") === "unico" ? "unico" : "mensal" });
  redirect(`/clientes/${id}`);
}
export async function removerProduto(fd: FormData) {
  const sb = await supabaseServer(); await sb.from("cliente_produtos").update({ ativo: false }).eq("id", s(fd, "id")); redirect(`/clientes/${s(fd, "cliente_id")}`);
}
export async function adicionarAcesso(fd: FormData) {
  const id = s(fd, "cliente_id"), u = url(s(fd, "url")); if (!u) redirect(`/clientes/${id}?erro=` + encodeURIComponent("Endereço inválido."));
  const sb = await supabaseServer();
  await sb.from("cliente_acessos").insert({ cliente_id: id, tipo: s(fd, "tipo") || "outro", rotulo: s(fd, "rotulo") || null, url: u });
  redirect(`/clientes/${id}`);
}
export async function removerAcesso(fd: FormData) {
  const sb = await supabaseServer(); await sb.from("cliente_acessos").delete().eq("id", s(fd, "id")); redirect(`/clientes/${s(fd, "cliente_id")}`);
}
export async function desativarCliente(fd: FormData) {
  const sb = await supabaseServer(); await sb.from("clientes").update({ ativo: false }).eq("id", s(fd, "id")); revalidatePath("/clientes"); redirect("/clientes");
}

export async function salvarUsuario(fd: FormData) {
  const id = s(fd, "id"), sb = await supabaseServer();
  const foto_url = await enviarImagem(fd, "foto", "fotos");
  const dados: Record<string, unknown> = { nome: s(fd, "nome"), funcao: s(fd, "funcao") || null };
  if (foto_url) dados.foto_url = foto_url;
  if (fd.has("papel")) dados.papel = s(fd, "papel") === "gestor" ? "gestor" : "membro";
  if (fd.has("ativo")) dados.ativo = s(fd, "ativo") === "1";
  const { error } = await sb.from("usuarios").update(dados).eq("id", id);
  redirect("/equipe" + (error ? "?erro=" + encodeURIComponent(error.message) : ""));
}

export async function salvarFluxo(fd: FormData) {
  const sb = await supabaseServer(); let id = s(fd, "id"); const nome = s(fd, "nome"); if (!nome) redirect("/fluxos");
  const etapas = (JSON.parse(s(fd, "etapas") || "[]") as { nome: string; responsavel_padrao_id: string; dias: string; tipo: string }[]).filter((e) => e.nome.trim());
  if (!id) { const { data, error } = await sb.from("fluxos").insert({ nome }).select("id").single(); if (error) redirect("/fluxos?erro=" + encodeURIComponent(error.message)); id = data.id; }
  else { await sb.from("fluxos").update({ nome }).eq("id", id); await sb.from("fluxo_etapas").delete().eq("fluxo_id", id); }
  if (etapas.length) await sb.from("fluxo_etapas").insert(etapas.map((e, i) => ({ fluxo_id: id, ordem: i, nome: e.nome.trim(), responsavel_padrao_id: e.responsavel_padrao_id || null, dias: Math.max(0, parseInt(e.dias) || 0), tipo: e.tipo === "aprovacao" ? "aprovacao" : "normal" })));
  revalidatePath("/fluxos"); redirect("/fluxos");
}
export async function desativarFluxo(fd: FormData) {
  const sb = await supabaseServer(); await sb.from("fluxos").update({ ativo: false }).eq("id", s(fd, "id")); revalidatePath("/fluxos"); redirect("/fluxos");
}
