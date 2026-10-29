# Repasse do webhook da Meta para o gateway

Situação: o webhook do app `1102108092255924` já aponta para `https://api.capihub.tech/api/whatsapp/webhook` (verify token `c024f…08e8`), que é o serviço atual da Cláudia. A Meta aceita uma única URL por app, então esse serviço continua sendo o receptor e **repassa uma cópia** de cada POST ao gateway `services/whatsapp`, que grava o histórico (tela Conversas) e encaminha à Cláudia nova quando ela entrar no lugar.

## O que fazer em `api.capihub.tech`
Depois de responder 200 à Meta, reenviar o **corpo bruto** e o header de assinatura para o gateway. Assim o gateway valida a assinatura com o mesmo App Secret, sem precisar de outro segredo.

```ts
// dentro do handler de POST /api/whatsapp/webhook, após processar normalmente:
fetch("https://whatsapp.capihub.com.br/api/webhook-meta", {
  method: "POST",
  headers: { "content-type": "application/json", "x-hub-signature-256": req.headers["x-hub-signature-256"] as string },
  body: rawBody,            // string exata recebida da Meta (não re-serialize o JSON: a assinatura é do texto original)
}).catch(() => {});         // falha no repasse não pode derrubar o atendimento
```
Se o framework já fez o parse do corpo e o texto original não está disponível, há duas saídas: (a) habilitar o acesso ao corpo bruto (Express: `express.json({ verify: (req, _res, buf) => { req.rawBody = buf.toString() } })`); ou (b) repassar o JSON re-serializado **sem** o header de assinatura e proteger a rota com um segredo próprio. Para (b), o gateway aceita `?s=<META_REPASSE_SECRET>` na URL quando a assinatura não vem (veja `api/webhook-meta.ts`).

## Envio
O envio pode continuar no serviço atual. Para que as mensagens **enviadas** também apareçam na tela Conversas, use o gateway para enviar (`POST /api/enviar`, header `x-gateway-secret`) ou, no mínimo, chame `POST /api/registrar-envio` com `{ para, texto, externo_id }` depois de enviar.

## Quando migrar de vez
Se um dia o receptor passar a ser o gateway: trocar a URL de callback na Meta para `https://whatsapp.capihub.com.br/api/webhook-meta` com o mesmo verify token (já está no `.env` do gateway) e desligar o repasse.
