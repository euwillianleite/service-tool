/* Pequenos componentes compartilhados (servidor) */
export const fmt = (d?: string | null) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : "");
export const fmtAt = (iso?: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }) : "");
export const brl = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const ini = (n: string) => n.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();

export function Av({ nome, foto }: { nome?: string | null; foto?: string | null }) {
  if (!nome) return <span className="av" style={{ background: "#888" }}>?</span>;
  return foto ? <img className="av" src={foto} alt="" /> : <span className="av">{ini(nome)}</span>;
}
export function Logo({ nome, url }: { nome?: string | null; url?: string | null }) {
  if (!nome) return <span className="logo">?</span>;
  return url ? <img className="logo" src={url} alt="" /> : <span className="logo">{ini(nome)}</span>;
}
export function Ring({ pct }: { pct: number }) {
  const c = 2 * Math.PI * 16;
  return (
    <svg className="ring" viewBox="0 0 40 40" role="img" aria-label={`${pct}% concluído`}>
      <circle cx="20" cy="20" r="16" fill="none" stroke="var(--line)" strokeWidth="4" />
      {pct > 0 && <circle cx="20" cy="20" r="16" fill="none" stroke={pct === 100 ? "var(--go)" : "var(--accent)"} strokeWidth="4" strokeLinecap="round" strokeDasharray={`${(c * pct) / 100} ${c}`} transform="rotate(-90 20 20)" />}
      <text x="20" y="20" textAnchor="middle" dominantBaseline="central" fontSize={pct === 100 ? 9 : 10} fontWeight="700" fill="var(--ink)">{pct}%</text>
    </svg>
  );
}
export const PRIO: Record<string, [string, string]> = { alta: ["Alta", "warn"], urgente: ["Urgente", "late"] };
export function Prio({ p }: { p: string }) { const x = PRIO[p]; return x ? <span className={`pill ${x[1]}`}>{x[0]}</span> : null; }

export const ACESSOS: Record<string, string> = {
  meta: "Meta Ads", bm: "Gerenciador de Negócios", wpp: "Grupo do WhatsApp", gads: "Google Ads", ga: "Google Analytics",
  gmn: "Google Meu Negócio", gsc: "Search Console", tiktok: "TikTok Ads", insta: "Instagram", site: "Site",
  estoque: "Estoque de veículos", report: "Relatório", drive: "Pasta de arquivos", outro: "Outro link",
};
export function Acessos({ itens }: { itens: { tipo: string; rotulo: string | null; url: string }[] }) {
  if (!itens.length) return null;
  return <div className="row">{itens.map((a, i) => <a key={i} className="qbtn" href={a.url} target="_blank" rel="noopener noreferrer">{a.tipo === "outro" ? a.rotulo || a.url : ACESSOS[a.tipo] ?? a.tipo}</a>)}</div>;
}
