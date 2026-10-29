#!/usr/bin/env bash
# Confirma que o token da Meta enxerga o número da Cláudia e envia uma mensagem de teste.
# Uso: cd services/whatsapp && set -a && . ./.env && set +a && ../../scripts/testar-meta.sh [55DDDNUMERO-para-teste]
set -euo pipefail
G=https://graph.facebook.com/v21.0
echo "1) Token: a quem pertence e quais permissões"
curl -sS "$G/debug_token?input_token=$META_ACCESS_TOKEN&access_token=$META_APP_ID|$META_APP_SECRET" | python3 -c 'import sys,json;d=json.load(sys.stdin)["data"];print("  app_id:",d.get("app_id"),"| válido:",d.get("is_valid"),"| expira:",d.get("expires_at",0) or "nunca");print("  escopos:",", ".join(d.get("scopes",[])))'
echo "2) Número vinculado ao token"
curl -sS "$G/$META_PHONE_NUMBER_ID?fields=display_phone_number,verified_name,quality_rating,code_verification_status" -H "Authorization: Bearer $META_ACCESS_TOKEN"; echo
echo "3) Números da conta WhatsApp (WABA)"
curl -sS "$G/$META_WABA_ID/phone_numbers" -H "Authorization: Bearer $META_ACCESS_TOKEN"; echo
if [ -n "${1:-}" ]; then
  echo "4) Enviando 'teste do gateway' para $1 (só funciona se esse número escreveu para a Cláudia nas últimas 24 h, ou com template aprovado)"
  curl -sS -X POST "$G/$META_PHONE_NUMBER_ID/messages" -H "Authorization: Bearer $META_ACCESS_TOKEN" -H "content-type: application/json" \
    -d "{\"messaging_product\":\"whatsapp\",\"to\":\"$1\",\"type\":\"text\",\"text\":{\"body\":\"Teste do gateway da Cláudia ✅\"}}"; echo
fi
echo "Se o passo 2 ou 3 devolver erro 100/200, o System User do token não tem a conta WhatsApp como ativo: Business Settings → System Users → Add Assets → WhatsApp Accounts."
