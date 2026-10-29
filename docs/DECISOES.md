# ADS_GEST — decisões e estado do projeto

Atualizado em 2026-10-29.

## Decisões
- **Produto:** gestão de demandas por cliente, tarefas em etapas sequenciais, um responsável por etapa (pessoa ou agente).
- **Banco:** Supabase (Postgres), regras de negócio em funções SQL e permissões por RLS. **Hospedagem:** Vercel, um projeto por parte (painel, Cláudia, serviço de anúncios, serviço de desativação), todos no mesmo repositório (`ads-gest`), com Root Directory por pasta para deploys independentes.
- **Agentes são membros da equipe** (`usuarios.papel = 'agente'`): recebem etapas, concluem e devolvem pela API `/api/agente` com chave própria; recebem eventos por webhook (cron 5 min) ou polling. Nenhum serviço acessa o banco direto.
- **Criação de anúncios (29/10):** o serviço gera a arte final (sem Design humano), sempre mais de uma, salva na pasta do cliente no Google Drive e entrega o link compartilhado; a Cláudia aprova no grupo; o serviço publica; a Cláudia informa a publicação e encerra.
- **Cobrança (29/10):** interna → privado do responsável; solicitação de cliente → formalizada no grupo do cliente; sem telefone ou agente travado → tutor.
- **Cláudia (29/10):** cria as demandas que identificar nos grupos; encerra tarefas informando no grupo; tem um tutor cadastrado (`usuarios.tutor_id`) para avisos e itens manuais.
- **Ambientes:** teste (Supabase próprio, Vercel Preview na branch `teste`, `MODO_SIMULACAO=1`) e produção (`main`). Detalhes em `docs/AMBIENTES.md`.
- **Visual:** tokens do painel Capihub.

## Entregas
- Protótipo navegável (artifact "Fluxo de Etapas").
- Repositório `ads-gest.zip` (29/10): painel Next.js, 3 serviços como funções Vercel com adaptadores em modo simulação, SDK, migrações 0001–0003 testadas em Postgres 16, seed de teste, `scripts/simular.sh`, docs.

## Pendências
1. Ligar os adaptadores reais (WhatsApp da Cláudia, Drive, API de anúncios, desativação) nos `TODO` de `services/*/lib`.
2. Trocar `interpretar()` da Cláudia pela IA dela.
3. Painel: editar tarefa após criação; formulário de recorrências; indicadores de gargalo.
4. Refinar as etapas de cada fluxo após as primeiras semanas de uso.
5. Opcional: Database Webhook do Supabase para eventos em tempo real.
