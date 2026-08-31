#!/usr/bin/env bash
# Valida `supabase/migrations/20260820140000_task_sort_order.sql` (feature 082) num Postgres 16
# descartável em Docker — sem tocar no banco remoto.
#
# Não há Supabase local neste projeto e `supabase db push` aplica em produção, então esta é a forma
# de provar a migration antes de o usuário aplicá-la: stubs de `auth.users`/`auth.uid()`/
# `enforce_app_access`, uma `public.task` no schema que as features 032/037/049/061/070 deixaram
# (com `priority`, `estimated_duration` e as flags, e SEM `sort_order`), tarefas gravadas antes da
# migration, um controle negativo provando que reordenar era impossível sem ela, e então assertivas
# reais (coluna `integer not null default 0`, linhas antigas herdando `0` sem update, colunas
# anteriores intactas, RLS e `trg_enforce_app_access` de pé, um `authenticated` não reordenando
# tarefa alheia nem em lote, e a reaplicação idempotente).
#
# Uso: bash supabase/tests/task_sort_order/run.sh
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATION="$HERE/../../migrations/20260820140000_task_sort_order.sql"
CONTAINER=orbyva-task-sort-order-pg

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

# 02_assert_before roda antes da migration (controle negativo) e 04_assert_rls por último de
# propósito: ele escreve `sort_order` de verdade e termina chamando `wipe_own_data`, que apaga as
# linhas do seed — qualquer assertiva sobre o estado pós-migration "intocado" precisa vir antes.
docker exec "$CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres -d orbyva -q \
  -f /sql/00_stubs.sql \
  -f /sql/01_seed.sql \
  -f /sql/02_assert_before.sql `# controle negativo: sem a migration não há sort_order` \
  -f /sql/10_migration.sql \
  -f /sql/03_assert_schema.sql \
  -f /sql/10_migration.sql `# reaplicação: tem que ser idempotente` \
  -f /sql/03_assert_schema.sql \
  -f /sql/04_assert_rls.sql

echo "OK: 20260820140000_task_sort_order.sql validada em Postgres 16."
