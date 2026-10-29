#!/usr/bin/env bash
# Simulação ponta a ponta no AMBIENTE DE TESTE. Requer: curl, jq.
# Uso: PAINEL_URL=https://painel-teste.vercel.app CHAVE_ANUNCIOS=teste-anuncios CHAVE_CLAUDIA=teste-claudia \
#      ANUNCIOS_URL=https://anuncios-teste.vercel.app CLAUDIA_URL=https://claudia-teste.vercel.app WEBHOOK_SECRET=... ./scripts/simular.sh
# Sem ANUNCIOS_URL/CLAUDIA_URL, o script faz o papel dos serviços chamando a API do painel diretamente (testa só o painel).
set -euo pipefail
: "${PAINEL_URL:?}" "${CHAVE_ANUNCIOS:?}" "${CHAVE_CLAUDIA:?}"
api() { curl -sS -X POST "$PAINEL_URL/api/agente" -H "x-api-key: $1" -H "content-type: application/json" -d "{\"acao\":\"$2\",\"args\":${3:-{\}}}"; }
passo() { printf '\n\033[1m%s\033[0m\n' "$*"; }
ok() { echo "  ✔ $*"; }

passo "1. Clientes e fluxos visíveis para os agentes"
CLIENTE=$(api "$CHAVE_ANUNCIOS" clientes | jq -r '.resultado[] | select(.nome|test("teste")) | .id' | head -1)
FLUXO=$(api "$CHAVE_ANUNCIOS" fluxos | jq -r '.resultado[] | select(.nome=="Criação de anúncios") | .id')
[ -n "$CLIENTE" ] && [ -n "$FLUXO" ] && ok "cliente $CLIENTE · fluxo $FLUXO" || { echo "rode supabase/seed_teste.sql"; exit 1; }

REF="veic-$(date +%s)"
passo "2. Serviço de anúncios detecta carro novo ($REF)"
if [ -n "${ANUNCIOS_URL:-}" ]; then
  T=$(curl -sS -X POST "$ANUNCIOS_URL/api/novo-veiculo" -H "content-type: application/json" -H "x-webhook-secret: ${WEBHOOK_SECRET:-}" \
      -d "{\"cliente_id\":\"$CLIENTE\",\"referencia_externa\":\"$REF\",\"veiculo\":{\"modelo\":\"Onix\",\"ano\":2022,\"cor\":\"prata\",\"preco\":78900}}" | jq -r .tarefa_id)
else
  T=$(api "$CHAVE_ANUNCIOS" criar_tarefa "{\"cliente_id\":\"$CLIENTE\",\"fluxo_id\":\"$FLUXO\",\"titulo\":\"Onix 2022 prata\",\"referencia_externa\":\"$REF\",\"dados\":{\"modelo\":\"Onix\",\"preco\":78900}}" | jq -r .resultado.tarefa_id)
  api "$CHAVE_ANUNCIOS" concluir_etapa "{\"tarefa_id\":\"$T\"}" >/dev/null
fi
ok "tarefa $T criada · abra $PAINEL_URL/tarefas/$T no painel"

passo "3. Eventos pendentes do serviço (etapa Artes)"
api "$CHAVE_ANUNCIOS" eventos | jq -c '.resultado[] | {tipo, etapa: .payload.etapa, drive: .payload.drive_folder_url}'
if [ -z "${ANUNCIOS_URL:-}" ]; then
  api "$CHAVE_ANUNCIOS" atualizar_dados "{\"tarefa_id\":\"$T\",\"dados\":{\"artes\":[\"https://drive/x/feed.png\",\"https://drive/x/story.png\"]}}" >/dev/null
  api "$CHAVE_ANUNCIOS" concluir_etapa "{\"tarefa_id\":\"$T\",\"entrega_url\":\"https://drive.google.com/drive/folders/TESTE/$REF\"}" >/dev/null
  ok "artes 'geradas' e etapa concluída com o link da pasta"
else ok "o serviço real deve gerar as artes ao receber o evento (cron de webhooks ≤ 5 min)"; sleep 2; fi

passo "4. Cláudia recebe a aprovação com o link do Drive"
api "$CHAVE_CLAUDIA" eventos | jq -c '.resultado[] | {tipo, etapa: .payload.etapa, link: .payload.entrega_anterior, grupo: .payload.grupo_whatsapp_id}'

passo "5. Cliente pede ajuste no grupo → volta para as artes"
if [ -n "${CLAUDIA_URL:-}" ]; then
  GRUPO=$(api "$CHAVE_CLAUDIA" clientes | jq -r ".resultado[] | select(.id==\"$CLIENTE\") | .grupo_whatsapp_id")
  curl -sS -X POST "$CLAUDIA_URL/api/whatsapp" -H "content-type: application/json" -d "{\"grupo_id\":\"$GRUPO\",\"de\":\"cliente\",\"texto\":\"podem trocar a foto do fundo?\"}" | jq -c .
else api "$CHAVE_CLAUDIA" devolver_etapa "{\"tarefa_id\":\"$T\",\"para\":1,\"motivo\":\"Cliente pediu ajuste: trocar a foto do fundo\"}" >/dev/null; fi
ok "devolvida"
[ -z "${ANUNCIOS_URL:-}" ] && api "$CHAVE_ANUNCIOS" concluir_etapa "{\"tarefa_id\":\"$T\",\"entrega_url\":\"https://drive.google.com/drive/folders/TESTE/$REF/v2\"}" >/dev/null && ok "v2 das artes entregue"

passo "6. Cliente aprova → serviço publica → Cláudia informa"
if [ -n "${CLAUDIA_URL:-}" ]; then
  curl -sS -X POST "$CLAUDIA_URL/api/whatsapp" -H "content-type: application/json" -d "{\"grupo_id\":\"$GRUPO\",\"de\":\"cliente\",\"texto\":\"aprovado!\"}" | jq -c .
else api "$CHAVE_CLAUDIA" concluir_etapa "{\"tarefa_id\":\"$T\"}" >/dev/null; fi
[ -z "${ANUNCIOS_URL:-}" ] && api "$CHAVE_ANUNCIOS" concluir_etapa "{\"tarefa_id\":\"$T\",\"entrega_url\":\"https://facebook.com/ads/simulado\"}" >/dev/null
[ -z "${CLAUDIA_URL:-}" ] && api "$CHAVE_CLAUDIA" concluir_etapa "{\"tarefa_id\":\"$T\"}" >/dev/null

passo "7. Estado final e histórico"
api "$CHAVE_CLAUDIA" tarefa "{\"tarefa_id\":\"$T\"}" | jq -r '.resultado | "status: \(.tarefa.status)", (.historico[] | "  · \(.texto)")'

passo "8. Cobranças pendentes (o que a Cláudia cobraria agora)"
api "$CHAVE_CLAUDIA" cobrancas | jq -c '.resultado[] | {titulo, etapa, responsavel, canal_sugerido, dias_atraso}'
echo; echo "Fim. Confira a tarefa no painel: $PAINEL_URL/tarefas/$T"
