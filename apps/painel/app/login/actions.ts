"use server";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";

export async function entrar(fd: FormData) {
  const sb = await supabaseServer();
  const { error } = await sb.auth.signInWithPassword({ email: String(fd.get("email")), password: String(fd.get("senha")) });
  if (error) redirect("/login?erro=" + encodeURIComponent("E-mail ou senha incorretos."));
  redirect("/tarefas");
}

export async function sair() {
  const sb = await supabaseServer();
  await sb.auth.signOut();
  redirect("/login");
}
