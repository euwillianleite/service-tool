# Ambientes, projetos na Vercel e variáveis

## Estrutura do repositório (um repositório, vários deploys)

```
ads-gest/
  apps/painel/            Next.js — painel web + API dos agentes + crons        → projeto Vercel "painel"
  services/claudia/       Cláudia — eventos, webhook do WhatsApp, cobrança       → projeto Vercel "claudia"
  services/anuncios/      Serviço de anúncios — novo veículo, artes, publicação  → projeto Vercel "anuncios"
  services/desativacao/   Serviço de desativação                                 → projeto Vercel "desativacao"
  services/whatsapp/      Gateway de WhatsApp (Z-API + Meta) e histórico        → projeto Vercel "whatsapp"  (docs/WHATSAPP.md)
  services/_template/     Base para um serviço novo (copie a pasta)
  packages/painel-sdk/    Cliente da API do painel; cada serviço tem uma CÓPIA em lib/painel.ts
  supabase/               Migrações do banco (compartilhado) e seed de teste
  scripts/simular.sh      Simulação ponta a ponta
  docs/                   Este arquivo e a integração dos agentes
```

**Por que cada serviço é um projeto separado na Vercel:** cada um tem seu próprio deploy, variáveis, logs e cron. Atualizar o serviço de anúncios não encosta na Cláudia nem no painel. Para isso, ao criar o projeto na Vercel, defina **Root Directory** = pasta do serviço (ex.: `services/anuncios`). Com isso a Vercel só faz deploy quando arquivos daquela pasta mudam (marque "Ignored Build Step" automático, que já faz isso por pasta).

**Por que o SDK é copiado, não compartilhado:** um serviço com cópia própria pode ser atualizado sem depender dos outros. Quando o SDK mudar, copie a nova versão para o serviço que precisa dela, e só para ele.

**Contrato entre as partes:** os serviços só falam com o painel pela API (`/api/agente`) e recebem eventos por webhook. Nenhum serviço acessa o banco direto, com uma exceção: o gateway de WhatsApp grava o histórico de mensagens (tabelas `wa_*`) com a chave secreta, porque é infraestrutura compartilhada pelo painel e pela Cláudia. Se um serviço sair do ar, as etapas dele ficam ativas no painel e aparecem em "travadas" para o tutor; ao voltar, ele puxa os eventos pendentes (`eventos`) e continua.

## Dois ambientes: teste e produção

| | Teste | Produção |
|---|---|---|
| Supabase | projeto `ads-gest-teste` | projeto `ads-gest` |
| Vercel | mesmo projeto, ambiente **Preview** (branch `teste`) | ambiente **Production** (branch `main`) |
| URLs | `painel-git-teste-<conta>.vercel.app` ou domínio fixo `painel-teste.<seu-dominio>` | `painel.<seu-dominio>` |
| Serviços externos | `MODO_SIMULACAO=1` (nada é enviado ao WhatsApp, Drive ou Meta) | integrações reais |
| Dados | `supabase/seed_teste.sql` | reais |

Como montar o teste:
1. Crie o segundo projeto no Supabase e rode as três migrações e o `seed_teste.sql`. Crie dois usuários em Authentication (`gestor@teste.com`, `designer@teste.com`; o primeiro vira gestor).
2. Na Vercel, em cada um dos quatro projetos, cadastre as variáveis **marcando só o ambiente Preview** com os valores de teste e **só Production** com os de produção. Crie a branch `teste` no GitHub; todo push nela gera o ambiente de teste.
3. Em **Settings → Domains**, dê um domínio fixo à branch `teste` de cada projeto (ex.: `painel-teste.seudominio.com`), para as URLs entre serviços não mudarem a cada deploy.
4. Rode `scripts/simular.sh` apontando para as URLs de teste.

Dica: a Vercel tem **Preview por pull request**; para testes de uma mudança isolada, abra um PR e use a URL do preview, mantendo o banco de teste.

## Variáveis por projeto

### painel (`apps/painel`)
| Variável | Para quê | Onde pegar |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL do projeto | Supabase → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | chave pública (login e leitura com RLS) | idem |
| `SUPABASE_SERVICE_ROLE_KEY` | usada só nas rotas `/api/agente` e `/api/cron/*` (servidor) | idem, nunca exposta ao navegador |
| `CRON_SECRET` | a Vercel envia como `Authorization: Bearer` aos crons | gere: `openssl rand -hex 24` |
| `WEBHOOK_SECRET` | enviado aos serviços no header `x-webhook-secret` | gere; mesmo valor nos serviços |
| `WHATSAPP_GATEWAY_URL`, `WHATSAPP_GATEWAY_SECRET` | tela Conversas responde pelo gateway | = `GATEWAY_SECRET` do serviço whatsapp |

### claudia (`services/claudia`)
| Variável | Para quê |
|---|---|
| `PAINEL_URL`, `PAINEL_API_KEY` | API do painel; a chave é a do agente "Cláudia" (hash em `usuarios.chave_api_hash`) |
| `WEBHOOK_SECRET` | valida eventos vindos do painel |
| `WHATSAPP_GATEWAY_URL`, `WHATSAPP_GATEWAY_SECRET` | gateway `services/whatsapp` (`lib/whatsapp.ts`) |
| `WHATSAPP_WEBHOOK_SECRET` | valida mensagens que o gateway encaminha a `/api/whatsapp` (= `CLAUDIA_WEBHOOK_SECRET` do gateway) |
| `TUTOR_TELEFONE` | fallback para avisos ao tutor (o normal é vir do cadastro) |
| `CRON_SECRET` | protege `/api/cobrar` (cron 9h, 12h, 15h, 18h de Brasília em dias úteis) |
| `MODO_SIMULACAO` | `1` em teste |

### anuncios (`services/anuncios`)
| Variável | Para quê |
|---|---|
| `PAINEL_URL`, `PAINEL_API_KEY`, `WEBHOOK_SECRET` | como acima; chave do agente "Serviço de anúncios" |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | conta de serviço com acesso às pastas dos clientes no Drive (`lib/adaptadores.ts`) |
| `API_ANUNCIOS_URL`, `API_ANUNCIOS_TOKEN` | API de anúncios já existente |
| `MODO_SIMULACAO` | `1` em teste |

### whatsapp (`services/whatsapp`)
Veja `docs/WHATSAPP.md`: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CLAUDIA_URL`, `CLAUDIA_WEBHOOK_SECRET`, `GATEWAY_SECRET`, `META_*`, `ZAPI_*`.

### desativacao (`services/desativacao`)
`PAINEL_URL`, `PAINEL_API_KEY` (agente "Serviço de desativação"), `WEBHOOK_SECRET`, `API_ANUNCIOS_URL`, `API_ANUNCIOS_TOKEN`, `MODO_SIMULACAO`.

## Conexões entre as partes

```
WhatsApp (grupos) ──mensagens──▶ claudia /api/whatsapp ──criar_tarefa / aprovar / devolver──▶ painel /api/agente ──▶ Supabase
                                                                                                    │
API do cliente ──carro novo──▶ anuncios /api/novo-veiculo ──criar_tarefa──────────────────────────▶ │
                                                                                                    ▼
painel /api/cron/webhooks (5 min) ──eventos──▶ claudia /api/eventos · anuncios /api/eventos · desativacao /api/eventos
                                                   │                       │
                                                   ▼                       ▼
                                             WhatsApp (envia)        Drive + API de anúncios
claudia /api/cobrar (cron) ──cobrancas──▶ painel ──▶ WhatsApp privado (interno) ou grupo (cliente)
```

Para latência menor que 5 minutos na entrega dos eventos: Supabase → Database → Webhooks → tabela `eventos`, INSERT → URL `https://<serviço>/api/eventos` com header `x-webhook-secret`. Um webhook por serviço, com filtro no código (cada um ignora o que não é dele). Com isso o cron de webhooks vira só um reprocessador de falhas.

## Cadastro das chaves dos agentes (uma vez por ambiente)

```bash
CHAVE=$(openssl rand -hex 32); echo "$CHAVE"; echo -n "$CHAVE" | sha256sum   # repita para cada agente
```
```sql
update usuarios set chave_api_hash = '<hash>', webhook_url = 'https://claudia-teste.seudominio.com/api/eventos' where nome = 'Cláudia';
update usuarios set chave_api_hash = '<hash>', webhook_url = 'https://anuncios-teste.seudominio.com/api/eventos' where nome = 'Serviço de anúncios';
update usuarios set chave_api_hash = '<hash>', webhook_url = 'https://desativacao-teste.seudominio.com/api/eventos' where nome = 'Serviço de desativação';
update usuarios set tutor_id = (select id from usuarios where email = 'voce@suaempresa.com') where papel = 'agente';
```
Em teste o `seed_teste.sql` já define chaves fixas (`teste-claudia`, `teste-anuncios`, `teste-desativacao`); falta só o `webhook_url`.

## Checklist do ambiente de teste
- [ ] Supabase de teste com 3 migrações + seed; 2 usuários criados
- [ ] 4 projetos na Vercel com Root Directory certo e variáveis em Preview
- [ ] Branch `teste` com domínio fixo em cada projeto
- [ ] `webhook_url` dos agentes apontando para os domínios de teste
- [ ] `MODO_SIMULACAO=1` nos três serviços
- [ ] `scripts/simular.sh` passa do passo 1 ao 8
- [ ] Logs dos serviços (Vercel → Logs) mostram as mensagens `[simulação]` da Cláudia
