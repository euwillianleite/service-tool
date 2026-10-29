"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [["/tarefas", "Tarefas"], ["/clientes", "Clientes"], ["/fluxos", "Modelos de fluxo"], ["/equipe", "Equipe"], ["/conversas", "Conversas"], ["/vinculos", "Vínculos"]];

export function NavLinks() {
  const p = usePathname();
  return <>{links.map(([href, label]) => <Link key={href} href={href} aria-current={p.startsWith(href) ? "page" : undefined}>{label}</Link>)}</>;
}
