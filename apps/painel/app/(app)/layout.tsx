import { usuarioAtual } from "@/lib/supabase/server";
import { sair } from "@/app/login/actions";
import { NavLinks } from "./nav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await usuarioAtual();
  return (
    <div className="wrap">
      <header className="bar">
        <div><h1>Fluxo de Etapas</h1><p className="muted small">Demandas por cliente, com etapas e responsáveis</p></div>
      </header>
      <nav className="top">
        <NavLinks />
        <form className="me" action={sair}>
          <span>{me?.nome ?? ""}{me?.papel === "gestor" ? " · gestor" : ""}</span>
          <button className="btn ghost" type="submit">Sair</button>
        </form>
      </nav>
      {children}
    </div>
  );
}
