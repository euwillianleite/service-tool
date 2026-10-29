# Integração: Cláudia e microsserviços

Como a Cláudia (agente de IA nos grupos de WhatsApp) e os microsserviços (criação e desativação de anúncios) participam do fluxo de etapas.

## Ideia central

**Agentes são membros da equipe.** Cláudia, o serviço de anúncios e o serviço de desativação são linhas em `usuarios` com `papel = 'agente'`. Cada etapa de um modelo tem um responsável padrão, que pode ser uma pessoa ou um agente. Assim:

- o sistema de tarefas não precisa saber *como* um agente trabalha, só *quem* está com a etapa;
- as mesmas regras valem para todos: só o responsável da etapa (ou um gestor) conclui ou devolve;
- o painel mostra as etapas automatizadas na mesma trilha, com o nome do agente;
- a carga, o histórico e os indicadores saem iguais para humanos e agentes.

Cada agente tem uma chave de API e, opcionalmente, uma URL de webhook para receber eventos.

## Quem faz o quê em cada fluxo

| Fluxo | Etapa | Responsável padrão |
|---|---|---|
| Criação de anúncios | Novo veículo identificado | **Serviço de anúncios** (cria a tarefa e conclui) |
| | Artes geradas e salvas no Drive | **Serviço de anúncios** (gera a arte final, salva na pasta do cliente, entrega o link compartilhado) |
| | Aprovação / Grupo de WhatsApp | **Cláudia** (envia o link no grupo; aprovado conclui, ajuste devolve para as artes) |
| | Anúncios publicados / atualizados | **Serviço de anúncios** |
| | Informar publicação no grupo | **Cláudia** (avisa e encerra) |
| Desativar anúncio | Solicitação do cliente → Desativação → Confirmação → Encerrar | **Cláudia** → **Serviço de desativação** → **Cláudia** → **Cláudia** |
| Demais fluxos | Aprovação, Confirmação e Encerrar tarefa | **Cláudia**; etapas de produção, pessoas |

Decisões de 29/10: o serviço gera a arte final (sem etapa humana de Design); sempre mais de uma arte, salvas no Google Drive, e a aprovação circula o **link compartilhado da pasta**; a Cláudia encerra as tarefas informando no grupo; a Cláudia cria as demandas que identificar; ela tem um **tutor** (pessoa cadastrada em `usuarios.tutor_id`) que recebe avisos e itens manuais.

**Cobrança por canal:** tarefa interna → privado do responsável (telefone da Equipe); solicitação de cliente (origem `whatsapp`) → formaliza no grupo do cliente e avisa o responsável no privado; sem telefone → tutor. Etapa de agente parada há mais de 2 h → tutor.

Tudo isso é configurável na aba Modelos de fluxo.

## Os três papéis da Cláudia

1. **Entender e registrar a demanda.** Ao identificar um pedido no grupo, chama `criar_tarefa` com `origem: "whatsapp"`, o `cliente_id` do grupo (lista em `clientes`, campo `grupo_whatsapp_id`) e o `fluxo_id` do tipo de demanda. Se a Cláudia não tiver certeza do tipo, cria com o fluxo mais próximo e comenta; um gestor ajusta no painel.
2. **Cobrar os responsáveis.** Periodicamente (sugestão: a cada hora em horário comercial) chama `cobrancas`. A resposta traz as etapas de pessoas vencidas ou vencendo em 1 dia, com responsável, cliente e grupo. Depois de avisar (no grupo ou no privado), chama `registrar_cobranca`, o que fica no histórico da tarefa e evita cobrar de novo nas próximas 20 horas.
3. **Executar as etapas dela.** Recebe o evento `etapa_atribuida` quando uma etapa de aprovação ou confirmação chega para ela; envia a mensagem no grupo; quando o cliente responde, chama `concluir_etapa` (aprovado) ou `devolver_etapa` com o motivo (pedido de ajuste), que reabre a etapa certa e avisa a pessoa.

## Os microsserviços

**Criação de anúncios**
1. Detecta carro novo na API do cliente → `criar_tarefa` com `fluxo_id` de "Criação de anúncios", `referencia_externa` = id do veículo e `dados` = `{placa, modelo, ano, preco, fotos…}`. A primeira etapa (Listagem) já é dele.
2. Gera a imagem → `concluir_etapa` com `entrega_url` = link da imagem. A etapa passa para Design (pessoa) ou direto para a Cláudia, conforme o modelo.
3. Quando a aprovação chega, recebe `etapa_atribuida` em "Anúncios programados / executados" → publica o anúncio → `concluir_etapa`.
4. Antes de criar, pode chamar `buscar_tarefa` com a `referencia_externa` para não duplicar.

**Desativação de anúncios**
1. A Cláudia cria a tarefa "Desativar anúncio" ao entender o pedido (ou o serviço cria, se o pedido chegar por outro canal).
2. O serviço recebe `etapa_atribuida` em "Desativação", desativa e chama `concluir_etapa`. A Cláudia recebe a próxima etapa e confirma no grupo.

## API

`POST https://<app>.vercel.app/api/agente` com header `x-api-key: <chave do agente>` e corpo `{ "acao": "...", "args": { ... } }`. Resposta `{ ok: true, resultado }` ou `{ erro }` (401 chave inválida, 400 regra de negócio).

| Ação | Args | Retorna |
|---|---|---|
| `criar_tarefa` | `cliente_id`, `titulo`, `fluxo_id`, `descricao?`, `prioridade?`, `entrega_em?`, `produto_id?`, `origem?` (`whatsapp`/`servico`), `referencia_externa?`, `dados?`, `etapas?`, `links?` | `{ tarefa_id }` |
| `concluir_etapa` | `tarefa_id`, `entrega_url?` | `{}` |
| `devolver_etapa` | `tarefa_id`, `para` (índice da etapa), `motivo` | `{}` |
| `comentar` | `tarefa_id`, `texto` | `{}` |
| `registrar_cobranca` | `etapa_id`, `texto?` | `{}` |
| `avisar_tutor` | `texto`, `tarefa_id?` | `{}` (vira evento `aviso_tutor` para o tutor) |
| `atualizar_dados` | `tarefa_id`, `dados` (mesclado) | `{}` |
| `travadas` | — | etapas de agentes ativas há mais de 2 h |
| `usuario` | `usuario_id` | nome, telefone, e-mail |
| `tarefa` | `tarefa_id` | tarefa + etapas + histórico |
| `buscar_tarefa` | `referencia_externa` | tarefas abertas com essa referência |
| `minha_fila` | — | etapas ativas atribuídas ao agente |
| `cobrancas` | — | etapas humanas a cobrar |
| `eventos` | `todos?`, `limite?` | eventos pendentes do agente (e os marca como entregues) |
| `clientes` | — | id, nome, grupo_whatsapp_id |
| `fluxos` | — | modelos e etapas |

Exemplo (serviço de anúncios cria uma tarefa):
```bash
curl -X POST https://<app>.vercel.app/api/agente -H "x-api-key: $CHAVE" -H "content-type: application/json" -d '{
  "acao": "criar_tarefa",
  "args": { "cliente_id": "…", "fluxo_id": "…", "titulo": "Onix 2022 prata", "origem": "servico",
            "referencia_externa": "veic-777", "dados": { "placa": "ABC1D23", "preco": 78900 } } }'
```

## Eventos

Toda vez que uma etapa fica ativa, o banco grava um evento em `eventos`:

```json
{ "tipo": "etapa_atribuida" | "etapa_devolvida" | "tarefa_concluida",
  "responsavel_id": "…",
  "payload": { "tarefa_id", "titulo", "cliente_id", "cliente", "grupo_whatsapp_id", "etapa", "ordem", "tipo",
               "prazo", "prioridade", "referencia_externa", "dados", "fluxo" } }
```

Duas formas de receber:
- **Webhook (push):** cadastre `webhook_url` no agente. O cron `/api/cron/webhooks` roda a cada 5 minutos e faz `POST { agente, eventos: [...] }` na URL; marca como entregue só se a resposta for 2xx.
- **Polling (pull):** o agente chama `eventos` quando quiser; a resposta já marca os eventos como entregues.

Para latência menor que 5 minutos, troque o cron por um Database Webhook do Supabase (Database → Webhooks → tabela `eventos`, evento INSERT → URL do agente), que dispara na hora.

## Cadastro dos agentes

As migrações `0002` e `0003` criam Cláudia, Serviço de anúncios e Serviço de desativação, e os coloca como responsáveis padrão nas etapas da tabela acima. Falta só a chave de cada um:

```bash
# gera uma chave e o hash
CHAVE=$(openssl rand -hex 32); echo "chave: $CHAVE"; echo -n "$CHAVE" | sha256sum
```
```sql
update usuarios set chave_api_hash = '<hash>', webhook_url = 'https://claudia.exemplo.com/eventos' where nome = 'Cláudia';
```
A chave vai para o agente; o banco guarda só o hash. E no cliente, preencha `grupo_whatsapp_id` (ficha do cliente) para a Cláudia saber de qual cliente é cada grupo.

## Decisões para confirmar

1. **Design em "Criação de anúncios":** fica com uma pessoa (retoque) ou o serviço já gera a arte final e a etapa some do fluxo? Hoje o modelo mantém a etapa, atribuída a ninguém; defina o responsável padrão.
2. **Cobrança:** no grupo do cliente ou no privado do responsável? A view traz os dois contatos; a escolha é da Cláudia.
3. **Confirmação + Encerrar tarefa:** se a Cláudia confirma no grupo, "Encerrar tarefa" pode ser dela também, e a tarefa fecha sozinha. Hoje "Encerrar" está sem responsável.
4. **Quem cria tarefas de suporte:** a Cláudia pode criar tudo que identificar no grupo, ou só registrar e deixar uma pessoa criar? O risco de criar demais é pequeno (gestor pode excluir), então sugiro deixar a Cláudia criar.
