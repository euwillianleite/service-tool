#!/usr/bin/env bash
# Aplica as migrações no Supabase. Duas opções; use UMA.
#
# A) Com a CLI do Supabase (recomendado; guarda o histórico de migrações no projeto):
#      supabase login
#      supabase link --project-ref vyyumqtwneobopwyeafx     # pede a senha do banco
#      supabase db push
#    Para o ambiente de TESTE, depois: psql "$DATABASE_URL" -f supabase/seed_teste.sql
#
# B) Com psql direto (não deixa histórico na CLI, mas funciona igual):
#      export DATABASE_URL='postgresql://postgres:SENHA@db.vyyumqtwneobopwyeafx.supabase.co:5432/postgres?sslmode=require'
#      ./scripts/aplicar-migracoes.sh
set -euo pipefail
: "${DATABASE_URL:?defina DATABASE_URL (veja o cabeçalho deste script)}"
cd "$(dirname "$0")/.."
for f in supabase/migrations/*.sql; do
  echo "→ $f"; psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f "$f"
done
echo "✔ migrações aplicadas"
if [ "${COM_SEED_TESTE:-0}" = "1" ]; then psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f supabase/seed_teste.sql; echo "✔ seed de teste aplicado"; fi
