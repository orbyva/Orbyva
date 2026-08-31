#!/usr/bin/env bash
# Valida as duas migrations da feature 063 — `20260816210000_health_metric.sql` e
# `20260816220000_reminder_preference.sql` — num Postgres 16 descartável em Docker, sem tocar no
# banco remoto.
#
# Não há Supabase local neste projeto e `supabase db push` aplica em produção, então esta é a forma
# de provar as migrations antes de o usuário aplicá-las: stubs de `auth.users`/`auth.uid()`/
# `enforce_app_access`/default privileges, os dois usuários do seed, as migrations na ordem em que o
# CLI as aplicaria, e então assertivas reais (colunas e tipos, checks de `metric_type`,
# `entity_type` e `frequency`, índice, unique do upsert, RLS com as quatro policies por `auth.uid()`
# em cada tabela, trigger do gate Pro, `wipe_own_data` levando as duas, cascade de conta), mais
# controles negativos que sabotam o banco e exigem que as assertivas acusem.
#
# Uso: bash supabase/tests/health_metric_reminder/run.sh
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
METRIC_MIGRATION="$HERE/../../migrations/20260816210000_health_metric.sql"
REMINDER_MIGRATION="$HERE/../../migrations/20260816220000_reminder_preference.sql"
CONTAINER=orbyva-health-metric-pg

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
cp "$METRIC_MIGRATION" "$WORK/10_metric_migration.sql"
cp "$REMINDER_MIGRATION" "$WORK/11_reminder_migration.sql"
docker cp "$WORK" "$CONTAINER:/sql" >/dev/null

# Ordem: as duas migrations, as assertivas de schema, a reaplicação (têm que ser idempotentes), os
# controles negativos e por fim as de RLS. 04_assert_rls fica no fim de tudo porque termina apagando
# um usuário de `auth.users` — qualquer assertiva sobre as linhas do teste precisa vir antes dele.
docker exec "$CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres -d orbyva -q \
  -f /sql/00_stubs.sql \
  -f /sql/01_seed.sql \
  -f /sql/10_metric_migration.sql \
  -f /sql/11_reminder_migration.sql \
  -f /sql/02_assert_schema.sql \
  -f /sql/05_assert_reminder_schema.sql \
  -f /sql/10_metric_migration.sql `# reaplicação: tem que ser idempotente` \
  -f /sql/11_reminder_migration.sql \
  -f /sql/02_assert_schema.sql \
  -f /sql/05_assert_reminder_schema.sql \
  -f /sql/03_negative_controls.sql \
  -f /sql/06_reminder_negative_controls.sql \
  -f /sql/07_assert_reminder_rls.sql \
  -f /sql/04_assert_rls.sql

echo "OK: 20260816210000_health_metric.sql e 20260816220000_reminder_preference.sql validadas em Postgres 16."
