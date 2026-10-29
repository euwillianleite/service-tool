# Fase 1 — painel no ar, Z-API conectada, Cláudia só observa

Objetivo desta fase: usar o painel de verdade (tarefas, clientes, equipe), ver as conversas dos grupos chegando, e acompanhar o que a Cláudia *faria* com cada mensagem, sem que ela envie ou crie nada. A Meta Cloud API fica de fora por enquanto.

## Travas ativas nesta fase
| Trava | Onde | Efeito |
|---|---|---|
| `SOMENTE_LEITURA=1` | serviço `whatsapp` | recusa qualquer envio (`/api/enviar` responde 423), venha da Cláudia ou do painel |
| `CLAUDIA_MODO=observar` | serviço `claudia` | interpreta cada mensagem e grava a observação; não cria tarefa, não conclui, não cobra, não envia |
| `GATEWAY_SOMENTE_LEITURA=1` | painel | desabilita o campo de resposta na tela Conversas |

Na tela **Conversas**, embaixo de cada mensagem recebida aparece um quadro "Cláudia observou: …" com a intenção que ela identificou, o que faria e o que responderia. É assim que você avalia a interpretação dela antes de ligar.

Para ligar a Cláudia depois: `CLAUDIA_MODO=agir`, `SOMENTE_LEITURA=0`, `GATEWAY_SOMENTE_LEITURA=0`, redeploy. Dá para fazer por partes (ex.: deixar ela criar tarefas mas manter o envio travado).

## Passo a passo

### 1. Banco (uma vez)
```bash
supabase login && supabase link --project-ref vyyumqtwneobopwyeafx && supabase db push    # 5 migrações
```
Depois, no SQL Editor, as chaves dos agentes (gere com `openssl rand -hex 32`; guarde o valor, o banco fica só com o hash):
```sql
update usuarios set chave_api_hash = encode(sha256('COLE-A-CHAVE-DA-CLAUDIA'::bytea),'hex'), webhook_url = 'https://claudia.capihub.com.br/api/eventos' where nome = 'Cláudia';
```
(Os outros dois agentes só quando os serviços deles entrarem.)

### 2. Usuários
Supabase → Authentication → Users → **Add user** (e-mail + senha) para cada pessoa da equipe. O primeiro vira gestor. Depois, no painel → Equipe, cada um completa nome, função, **telefone** (com DDI, ex.: +5547999990000; é por ele que a conversa privada fica vinculada à pessoa) e foto. Gestor define papéis e o tutor da Cláudia (por SQL nesta fase: `update usuarios set tutor_id = (select id from usuarios where email='seu@email') where papel='agente';`).

### 3. Projetos na Vercel (três nesta fase)
| Projeto | Root Directory | Domínio sugerido | Variáveis |
|---|---|---|---|
| painel | `apps/painel` | service-tool.capihub.com.br | as de `apps/painel/.env.local` |
| whatsapp | `services/whatsapp` | whatsapp.capihub.com.br | as de `services/whatsapp/.env` (Z-API preenchida, Meta pode ficar vazia) |
| claudia | `services/claudia` | claudia.capihub.com.br | as de `services/claudia/.env.example`, com `CLAUDIA_MODO=observar` |

Segredos que precisam bater entre projetos: `GATEWAY_SECRET` (whatsapp) = `WHATSAPP_GATEWAY_SECRET` (painel e claudia); `CLAUDIA_WEBHOOK_SECRET` (whatsapp) = `WHATSAPP_WEBHOOK_SECRET` (claudia); `WEBHOOK_SECRET` (painel) = `WEBHOOK_SECRET` (claudia).

### 4. Z-API
Painel da Z-API → instância → **Webhooks**: "Ao receber", "Ao enviar" e "Status" → `https://whatsapp.capihub.com.br/api/webhook-zapi?s=<ZAPI_WEBHOOK_SECRET>`; ligar "Notificar as enviadas por mim também". Credenciais da instância em `ZAPI_INSTANCE_ID`, `ZAPI_INSTANCE_TOKEN`, `ZAPI_CLIENT_TOKEN` do serviço whatsapp.

### 5. Clientes e grupos
Painel → Clientes → cadastre cada cliente. Para vincular o grupo: `curl -H "x-gateway-secret: …" https://whatsapp.capihub.com.br/api/grupos` lista id e nome de todos os grupos do número; cole o id em `grupo_whatsapp_id` (nesta fase, por SQL ou pela primeira mensagem que aparecer em Conversas, cujo cabeçalho mostra o id). Sem esse vínculo, a Cláudia registra "grupo não vinculado a cliente" e não interpreta.

### 6. Conferir
- Mande uma mensagem num grupo de teste → aparece em Conversas em até alguns segundos, com o quadro "Cláudia observou".
- Crie uma tarefa no painel e conclua etapas: tudo funciona sem a Cláudia; etapas dela ficam paradas (esperado nesta fase) e aparecem em "travadas" para o tutor quando ela for ligada.
- Vercel → projeto claudia → Logs: cada mensagem mostra `modo: observar`.

## Pendente para a fase 2
Campo `grupo_whatsapp_id` e tutor editáveis pelo painel (hoje por SQL); ligar a Cláudia por partes; serviço de anúncios com Drive; Meta Cloud API (se for usar para 1:1).
