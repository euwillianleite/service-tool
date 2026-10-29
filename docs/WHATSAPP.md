# WhatsApp: gateway, histórico e tela Conversas

## O que é
`services/whatsapp` é o único ponto de contato com o WhatsApp. Ele:
1. **Recebe** webhooks da Z-API e da Meta Cloud API, grava cada mensagem (recebida ou enviada, inclusive as que um humano manda pelo celular) em `wa_mensagens`, e encaminha as recebidas à Cláudia já normalizadas.
2. **Envia** (`POST /api/enviar`) para a Cláudia e para o painel, escolhendo o provedor e gravando no histórico.
3. **Lista grupos** (`GET /api/grupos`) para você copiar o id de cada grupo para a ficha do cliente.

A tela **Conversas** do painel mostra tudo como no aplicativo: lista à esquerda (com nome do cliente ou da pessoa, não lidas), balões à direita (recebidas, enviadas pela Cláudia, pelo painel ou pelo celular), status ✓ ✓✓ lida, mídia e link para a tarefa. Dá para responder dali, pelo número da Cláudia, assinado com seu nome.

## Meta Cloud API × Z-API: o que cada um faz

| | Meta Cloud API (oficial) | Z-API (número conectado como aplicativo) |
|---|---|---|
| Conversa individual | sim | sim |
| **Grupos** | **não** (a API oficial não entra nem lê grupos) | sim |
| Mensagem iniciada pela empresa | só com template aprovado ou dentro de 24 h após o cliente escrever | livre |
| Ver mensagens que um humano mandou pelo celular | não | sim ("notificar enviadas por mim") |
| Estabilidade | alta, suportada pela Meta | depende do número ficar conectado |

Como os clientes são atendidos em grupos, a Z-API é obrigatória para o fluxo da Cláudia. A Cloud API fica para o 1:1 (cobrança no privado, tutor) se você quiser um número oficial para isso; o gateway usa Z-API para tudo por padrão e Meta só quando pedido (`provedor: "meta"`) ou quando a Z-API não está configurada.

## Credenciais da Meta já enviadas
| Dado | Valor | Variável |
|---|---|---|
| Número | +55 17 95693-1415 (Cláudia - Atendimento) | — |
| Phone number ID | `1425944217261984` | `META_PHONE_NUMBER_ID` |
| WABA ID (Messaging Account) | `707514845256475` | `META_WABA_ID` |
| Portfólio empresarial | CapiHub `2272934976217518` | — |
| App em uso | `tool_autoprime` · ID `1102108092255924` | `META_APP_ID` |
| App Secret | do app `1102108092255924` (no `.env`; **gire** depois: developers.facebook.com → App → Settings → Basic → Reset) | `META_APP_SECRET` |
| Token permanente | System User vinculado ao CapiHub (no `.env`; gire quando possível) | `META_ACCESS_TOKEN` |
| Outro app visto antes | ID `27892944206967410` | não usado; se o webhook estiver cadastrado nele, mova para o app `1102108092255924` |

Regra: webhook, App Secret e token têm de ser do **mesmo app**, e o System User do token precisa ter a conta WhatsApp como ativo. `scripts/testar-meta.sh` confere isso em 3 chamadas e, opcionalmente, envia uma mensagem de teste.

## Configurar
**Meta:** developers.facebook.com → App → WhatsApp → Configuration → Webhook: URL `https://whatsapp.capihub.com.br/api/webhook-meta`, Verify token = `META_VERIFY_TOKEN`; assine o campo `messages`.

**Z-API:** painel → instância → Webhooks: "Ao receber", "Ao enviar" e "Status da mensagem" → `https://whatsapp.capihub.com.br/api/webhook-zapi?s=<ZAPI_WEBHOOK_SECRET>`; ligue "Notificar as enviadas por mim também". Credenciais em `ZAPI_INSTANCE_ID`, `ZAPI_INSTANCE_TOKEN`, `ZAPI_CLIENT_TOKEN`.

**Ficha do cliente:** preencha `grupo_whatsapp_id` com o id que `GET /api/grupos` devolve (ou que aparece em Conversas na primeira mensagem do grupo). A partir daí a conversa fica vinculada ao cliente e a Cláudia sabe de quem é.

**Vercel:** quinto projeto, Root Directory `services/whatsapp`, variáveis de `services/whatsapp/.env.example`. No painel, `WHATSAPP_GATEWAY_URL` e `WHATSAPP_GATEWAY_SECRET`; na Cláudia, as mesmas duas mais `WHATSAPP_WEBHOOK_SECRET` = `CLAUDIA_WEBHOOK_SECRET` do gateway.

## Banco
Migração `20261029000004_whatsapp.sql`: `wa_conversas` (uma por grupo ou telefone, com vínculo automático a cliente ou usuário) e `wa_mensagens` (texto, mídia, status, quem enviou, tarefa relacionada, payload bruto). Mídias da Meta vêm com URL temporária; para guardar, o próximo passo é copiar para o Storage.
