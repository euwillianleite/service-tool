/** Z-API — número conectado "como aplicativo": grupos e privado. */
const base = () => `https://api.z-api.io/instances/${process.env.ZAPI_INSTANCE_ID}/token/${process.env.ZAPI_INSTANCE_TOKEN}`;
const headers = () => ({ "content-type": "application/json", "client-token": process.env.ZAPI_CLIENT_TOKEN ?? "" });

async function post(path: string, body: unknown) {
  const r = await fetch(`${base()}/${path}`, { method: "POST", headers: headers(), body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`zapi/${path}: ${j.error ?? j.message ?? r.status}`);
  return j as { zaapId?: string; messageId?: string; id?: string };
}

/** `para`: telefone (5547999990000) ou id de grupo (…-group ou …@g.us, conforme a Z-API devolve). */
export async function enviarTexto(para: string, texto: string) { const j = await post("send-text", { phone: para, message: texto }); return j.messageId ?? j.zaapId ?? ""; }
export async function enviarLink(para: string, texto: string, link: string) { const j = await post("send-link", { phone: para, message: `${texto}\n${link}`, linkUrl: link, title: "Abrir", linkDescription: link }); return j.messageId ?? j.zaapId ?? ""; }
export async function enviarImagem(para: string, imagemUrl: string, legenda?: string) { const j = await post("send-image", { phone: para, image: imagemUrl, caption: legenda }); return j.messageId ?? j.zaapId ?? ""; }

export async function listarGrupos(): Promise<{ id: string; nome: string }[]> {
  const r = await fetch(`${base()}/groups?page=1&pageSize=200`, { headers: headers() });
  if (!r.ok) throw new Error("zapi/groups " + r.status);
  const j = (await r.json()) as { phone: string; name: string }[];
  return j.map((g) => ({ id: g.phone, nome: g.name }));
}
