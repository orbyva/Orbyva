#!/usr/bin/env bash
# Valida `supabase/migrations/20260911200000_billing_stripe_guard.sql` num Postgres 16
# descartável em Docker — sem tocar no banco remoto.
#
# Uso: bash supabase/tests/billing_stripe_guard/run.sh
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATION="$HERE/../../migrations/20260911200000_billing_stripe_guard.sql"
CONTAINER=orbyva-billing-stripe-guard-pg

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
        if to_regclass('public.billing_api_usage') is not null then
          raise exception 'FALHOU (controle negativo): billing_api_usage já existia';
        end if;
        if to_regprocedure('public.billing_try_consume(uuid, text, integer)') is not null then
          raise exception 'FALHOU (controle negativo): billing_try_consume já existia';
        end if;
        raise notice 'OK (controle negativo): trava Stripe ainda não existe';
      end \$\$;" \
  -f /sql/10_migration.sql \
  -f /sql/02_assert_schema.sql \
  -f /sql/10_migration.sql \
  -f /sql/02_assert_schema.sql \
  -f /sql/03_assert_behavior.sql

echo "OK: 20260911200000_billing_stripe_guard.sql validada em Postgres 16."
