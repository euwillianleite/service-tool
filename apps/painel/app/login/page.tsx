import { entrar } from "./actions";

export default async function Login({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const { erro } = await searchParams;
  return (
    <main className="login">
      <form className="card" action={entrar}>
        <h1 style={{ textAlign: "center" }}>Fluxo de Etapas</h1>
        <p className="muted small" style={{ textAlign: "center" }}>Acesso restrito a colaboradores autorizados</p>
        <label className="f">E-mail<input name="email" type="email" required autoComplete="email" /></label>
        <label className="f">Senha<input name="senha" type="password" required autoComplete="current-password" /></label>
        {erro && <p className="err">{erro}</p>}
        <button className="btn primary" style={{ justifyContent: "center" }}>Entrar</button>
        <p className="muted small" style={{ textAlign: "center" }}>Usuários são criados pelo gestor no painel do Supabase (Authentication → Users).</p>
      </form>
    </main>
  );
}
