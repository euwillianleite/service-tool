# Credenciais e variáveis — onde cada uma nasce e onde cada uma é usada

Este arquivo NÃO guarda valores secretos; só diz o que é cada variável, onde pegar e onde colocar. Os valores ficam no `.env.local` (fora do Git) e nos painéis da Vercel e do Supabase.

## Projeto Supabase atual
- Ref: `vyyumqtwneobopwyeafx` · URL: `https://vyyumqtwneobopwyeafx.supabase.co`
- Painel web: `https://service-tool.capihub.com.br`

## Onde pegar cada credencial no Supabase
Supabase → seu projeto → **Project Settings** (engrenagem, canto inferior esquerdo):

| Credencial | Menu | Uso |
|---|---|---|
| URL do projeto | API → Project URL | `NEXT_PUBLIC_SUPABASE_URL` |
| Publishable key (`sb_publishable_…`) | API Keys → Publishable | `NEXT_PUBLIC_SUPABASE_ANON_KEY` (pode ir ao navegador; a RLS protege os dados) |
| Secret key (`sb_secret_…`) | API Keys → Secret keys | `SUPABASE_SERVICE_ROLE_KEY` (só servidor: API dos agentes e crons). Para girar: "Create new secret key", troque na Vercel, depois revogue a antiga |
| Chaves legadas `anon` / `service_role` (JWT `eyJ…`) | API Keys → Legacy | Equivalentes às duas acima no formato antigo. Use as novas (`sb_…`); as legadas podem ser desativadas |
| Senha do banco | Database → Database password → Reset | só para `supabase link` e `psql`; não entra em nenhuma variável do app |
| Connection string | Database → Connection string → URI | `DATABASE_URL` do `scripts/aplicar-migracoes.sh` |

## Variáveis que você mesmo gera (`openssl rand -hex 24`)
| Variável | Para quê | Mesmo valor em |
|---|---|---|
| `CRON_SECRET` | a Vercel envia aos crons como `Authorization: Bearer` | painel e claudia (cada projeto pode ter o seu) |
| `WEBHOOK_SECRET` | painel envia aos serviços no header `x-webhook-secret` | painel + claudia + anuncios + desativacao (um só valor) |
| `PAINEL_API_KEY` (uma por agente) | identifica Cláudia / anúncios / desativação na API do painel | no serviço (valor) e no banco (hash sha256 em `usuarios.chave_api_hash`) |
| `WHATSAPP_WEBHOOK_SECRET` | valida mensagens que a API de WhatsApp envia à Cláudia | claudia + configuração do webhook na API de WhatsApp |

## Onde colocar na Vercel (passo a passo)
1. vercel.com → projeto (painel, claudia, anuncios ou desativacao) → **Settings → Environment Variables**.
2. **Add New**: Key = nome da variável, Value = valor. Em **Environments** marque **Production** para valores de produção, e só **Preview** para os de teste (pode cadastrar a mesma Key duas vezes, uma por ambiente).
3. Variáveis que começam com `NEXT_PUBLIC_` vão para o navegador; todas as outras ficam só no servidor.
4. Depois de criar ou mudar uma variável, faça **Deployments → ⋯ → Redeploy** (variáveis só valem em deploy novo).
5. `CRON_SECRET`: a Vercel usa este nome automaticamente nos crons de `vercel.json`; não precisa configurar mais nada.

## Onde colocar para rodar local
- Painel: `apps/painel/.env.local` (já existe, preenchido; ajuste `CRON_SECRET` e `WEBHOOK_SECRET`).
- Serviços: copie `.env.example` → `.env` em cada pasta de `services/` e preencha.

## Quadro por projeto Vercel
| Variável | painel | claudia | anuncios | desativacao |
|---|:-:|:-:|:-:|:-:|
| NEXT_PUBLIC_SUPABASE_URL | ● | | | |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | ● | | | |
| SUPABASE_SERVICE_ROLE_KEY | ● | | | |
| CRON_SECRET | ● | ● | | |
| WEBHOOK_SECRET | ● | ● | ● | ● |
| PAINEL_URL | | ● | ● | ● |
| PAINEL_API_KEY | | ● | ● | ● |
| WHATSAPP_API_URL / WHATSAPP_API_TOKEN / WHATSAPP_WEBHOOK_SECRET / TUTOR_TELEFONE | | ● | | |
| GOOGLE_SERVICE_ACCOUNT_JSON | | | ● | |
| API_ANUNCIOS_URL / API_ANUNCIOS_TOKEN | | | ● | ● |
| MODO_SIMULACAO (`1` em teste) | | ● | ● | ● |

## Higiene
- Chaves que passaram por chat, e-mail ou print: gire depois que o ambiente estiver no ar.
- `.env.local` e `.env` estão no `.gitignore`; nunca faça commit deles.
- A `sb_secret` nunca entra em variável `NEXT_PUBLIC_` nem em serviço que não precise dela (os serviços usam só a `PAINEL_API_KEY`).
