#!/usr/bin/env bash
# Valida `supabase/migrations/20260819110000_medication_dose_quick.sql` (feature 071) num Postgres 16
# descartável em Docker — sem tocar no banco remoto.
#
# Diferente da 070, esta migration não cria schema: ela **escreve em dado que já existe**. Por isso o
# roteiro aqui é o mesmo que a tarefa "Aguarda o usuário" manda executar contra o banco real —
# anotar o "antes", aplicar, comparar o "depois" — só que automatizado e contra um banco de mentira:
#   00_stubs        schema como 035/049/064/070 o deixam (icon_key, is_medication, medication_id, is_quick)
#   01_seed         doses cruas da 064, dose com ícone à mão, dose com upload, dose já convertida,
#                   medicação da 049 sem medication_id, pontual que não é dose, tarefa comum
#   02_snapshot_pre grava `pre_counts`/`pre_nao_doses` (o "antes" do roteiro) e valida o próprio seed
#   migration       primeira aplicação
#   03_assert       toda dose virou pontual e ganhou ícone; ícone à mão e upload sobrevivem; nada
#                   fora de `medication_id` mudou; nenhuma linha criada ou apagada
#   04_snapshot_post congela o estado pós-primeira-aplicação
#   migration       segunda aplicação (é o que acontece se o `supabase db push` for repetido)
#   03_assert       as mesmas assertivas continuam valendo
#   05_assert_idem  diff linha a linha contra `post_1`: reaplicar não mudou nada
#
# Uso: bash supabase/tests/medication_dose_quick/run.sh
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATION="$HERE/../../migrations/20260819110000_medication_dose_quick.sql"
CONTAINER=orbyva-medication-dose-quick-pg

cleanup() { docker rm -f "$CONTAINER" >/dev/null 2>&1 || true; }
trap cleanup EXIT
cleanup

docker run -d --name "$CONTAINER" -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=orbyva postgres:16 >/dev/null

# `pg_isready` sozinho não serve: durante o bootstrap o initdb sobe um servidor temporário que já
# responde, mas ainda não criou o banco `orbyva` — esperar por uma query de verdade evita a corrida.
ready=""
for _ in $(seq 1 90); do
  if docker exec "$CONTAINER" psql -U postgres -d orbyva -tAc 'select 1' >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 1
done
if [ -z "$ready" ]; then
  echo "FALHOU: Postgres não ficou pronto a tempo" >&2
  exit 1
fi

WORK="$(mktemp -d)"
cp "$HERE"/*.sql "$WORK/"
cp "$MIGRATION" "$WORK/10_migration.sql"
docker cp "$WORK" "$CONTAINER:/sql" >/dev/null

docker exec "$CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres -d orbyva -q \
  -f /sql/00_stubs.sql \
  -f /sql/01_seed.sql \
  -f /sql/02_snapshot_pre.sql \
  -f /sql/10_migration.sql \
  -f /sql/03_assert_backfill.sql \
  -f /sql/04_snapshot_post.sql \
  -f /sql/10_migration.sql `# reaplicação: tem que ser idempotente` \
  -f /sql/03_assert_backfill.sql \
  -f /sql/05_assert_idempotente.sql

echo "OK: 20260819110000_medication_dose_quick.sql validada em Postgres 16."
