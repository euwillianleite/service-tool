# Fluxo de Etapas

Gestão de demandas por cliente, com etapas personalizadas e um responsável por etapa. Next.js 15 + Supabase, hospedado na Vercel.

## Subir em 15 minutos

### 1. Supabase
1. Crie um projeto em supabase.com (região South America, São Paulo).
2. Na raiz do repositório: `supabase login && supabase link --project-ref <ref> && supabase db push` (ou `scripts/aplicar-migracoes.sh` com psql). Isso cria tabelas, regras de negócio, permissões, o bucket de imagens, os seis modelos de fluxo e os agentes.
3. Em **Authentication → Providers**, deixe só *Email* ativo e desligue *Confirm email* (equipe interna; o gestor cria as contas).
4. Em **Authentication → Users → Add user**, crie o primeiro usuário (você). Ele vira **gestor** automaticamente. Os seguintes entram como membro; o gestor muda o papel na aba Equipe.
5. Em **Project Settings → API**, copie `Project URL`, `anon public` e `service_role`.

### 2. Vercel
1. Suba esta pasta para um repositório no GitHub.
2. Na Vercel, **Add New → Project**, importe o repositório (framework detectado: Next.js).
3. Em **Environment Variables**, preencha as quatro de `.env.example`. `CRON_SECRET` é qualquer texto longo e aleatório; a Vercel o envia automaticamente ao chamar o cron.
4. Deploy. Os crons de `vercel.json` passam a rodar: recorrências todo dia às 9h UTC (6h em Brasília) e entrega de webhooks a cada 5 minutos.
5. Cadastre as chaves dos agentes conforme `docs/AMBIENTES.md`.

Alternativa: na Vercel, **Storage → Marketplace → Supabase** cria o projeto e injeta as variáveis sozinho; o passo 2 do Supabase (rodar o SQL) continua necessário.

### 3. Rodar local
```
cp .env.example .env.local   # preencha
npm install
npm run dev
```

## Estrutura
```
supabase/migrations/0001_schema.sql   banco: tabelas, funções (criar_tarefa, concluir_etapa, devolver_etapa, reatribuir_etapa, processar_recorrencias), RLS, seed
app/login                             login por e-mail e senha
app/(app)/tarefas                     kanban e lista, nova tarefa, detalhe com concluir/devolver/comentar/entrega/links
app/(app)/clientes                    lista e ficha: dados, produtos com valores (só gestor), acessos rápidos
app/(app)/fluxos                      modelos de fluxo (tipos de demanda)
app/(app)/equipe                      perfis, papel, foto, carga por pessoa
app/api/agente                        API para a Cláudia e os microsserviços (docs/INTEGRACAO-AGENTES.md)
app/api/cron/recorrencias             rota do Vercel Cron (tarefas recorrentes)
app/api/cron/webhooks                 rota do Vercel Cron (entrega de eventos aos agentes)
lib/actions/*.ts                      Server Actions (toda escrita passa aqui)
lib/supabase/server.ts                cliente Supabase com cookies de sessão
lib/ui.tsx                            componentes pequenos (avatar, logo, anel de %, acessos)
app/globals.css                       tokens visuais do painel Capihub
```

## Regras de negócio (ficam no banco, em SQL)
- Uma etapa ativa por vez; concluir avança; na última, a tarefa é encerrada.
- Só o **responsável da etapa** ou um **gestor** conclui ou devolve.
- Devolver exige motivo e reabre todas as etapas do destino até a atual.
- Etapa do tipo *aprovação* mostra "Aprovado pelo cliente" e "Pedir ajuste".
- Editar o modelo não altera tarefas já criadas.
- Valores dos produtos só são lidos por gestores (RLS); membros não os recebem nem pela API.
- Clientes, usuários e modelos são desativados, nunca apagados (tarefas antigas os referenciam).

## O que ainda não está feito
- Edição de tarefa depois de criada (título, etapas futuras): hoje é possível trocar responsável e adicionar links; editar título e etapas é o próximo passo (`update` em `tarefas` e em `tarefa_etapas` com `status <> 'concluida'`, já permitido pela RLS).
- Tela de recorrências: a tabela `recorrencias` e o cron existem; falta o formulário na ficha do cliente.
- Avisos a pessoas por e-mail: a Cláudia já cobra pelo WhatsApp (ação `cobrancas`); e-mail é opcional (Resend).
- Indicadores de gargalo (tempo médio por etapa, devoluções por etapa): consultas simples sobre `tarefa_etapas` e `tarefa_historico`.
