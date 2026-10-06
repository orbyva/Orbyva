#!/usr/bin/env bash
# Valida `supabase/migrations/20261005170000_orb_usage_limit.sql` num Postgres 16
# descartável em Docker — sem tocar no banco remoto.
#
# Uso: bash supabase/tests/orb_usage/run.sh
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATION="$HERE/../../migrations/20261005170000_orb_usage_limit.sql"
CONTAINER=orbyva-orb-usage-pg

cleanup() { docker rm -f "$CONTAINER" >/dev/null 2>&1 || true; }
trap cleanup EXIT
cleanup

docker run -d --name "$CONTAINER" -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=orbyva postgres:16 >/dev/null

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
  -c "do \$\$
      begin
        if to_regclass('public.orb_api_usage') is not null then
          raise exception 'FALHOU (controle negativo): orb_api_usage já existia';
        end if;
        if to_regprocedure('public.orb_try_consume(uuid, integer, integer)') is not null then
          raise exception 'FALHOU (controle negativo): orb_try_consume já existia';
        end if;
        raise notice 'OK (controle negativo): limite da Orb ainda não existe';
      end \$\$;" \
  -f /sql/10_migration.sql \
  -f /sql/02_assert_schema.sql \
  -f /sql/10_migration.sql \
  -f /sql/02_assert_schema.sql \
  -f /sql/03_assert_behavior.sql

echo "OK: 20261005170000_orb_usage_limit.sql validada em Postgres 16."
