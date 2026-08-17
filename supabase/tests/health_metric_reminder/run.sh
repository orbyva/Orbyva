#!/usr/bin/env bash
# Valida `supabase/migrations/20260816210000_health_metric.sql` (feature 063) num Postgres 16
# descartável em Docker — sem tocar no banco remoto.
#
# Não há Supabase local neste projeto e `supabase db push` aplica em produção, então esta é a forma
# de provar a migration antes de o usuário aplicá-la: stubs de `auth.users`/`auth.uid()`/
# `enforce_app_access`/default privileges, os dois usuários do seed, a migration, e então assertivas
# reais (colunas e tipos, check de `metric_type`, índice, RLS com as quatro policies por
# `auth.uid()`, trigger do gate Pro, `wipe_own_data` levando a tabela, cascade de conta), mais
# controles negativos que sabotam o banco e exigem que as assertivas acusem.
#
# Uso: bash supabase/tests/health_metric_reminder/run.sh
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
METRIC_MIGRATION="$HERE/../../migrations/20260816210000_health_metric.sql"
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
docker cp "$WORK" "$CONTAINER:/sql" >/dev/null

# 04_assert_rls roda por último de propósito: ele termina chamando `wipe_own_data` e apagando um
# usuário — qualquer assertiva sobre as linhas do teste precisa vir antes dele.
docker exec "$CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres -d orbyva -q \
  -f /sql/00_stubs.sql \
  -f /sql/01_seed.sql \
  -f /sql/10_metric_migration.sql \
  -f /sql/02_assert_schema.sql \
  -f /sql/10_metric_migration.sql `# reaplicação: tem que ser idempotente` \
  -f /sql/02_assert_schema.sql \
  -f /sql/03_negative_controls.sql \
  -f /sql/04_assert_rls.sql

echo "OK: 20260816210000_health_metric.sql validada em Postgres 16."
