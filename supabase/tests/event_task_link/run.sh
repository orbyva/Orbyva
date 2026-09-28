#!/usr/bin/env bash
# Valida `supabase/migrations/20260817120000_event_task_link.sql` (feature 066) num Postgres 16
# descartável em Docker — sem tocar no banco remoto.
#
# Não há Supabase local neste projeto e `supabase db push` aplica em produção, então esta é a forma
# de provar a migration antes de o usuário aplicá-la: stubs de `auth.users`/`auth.uid()`/
# `enforce_app_access`, `public.project_event` no schema exato que a feature 006 deixou
# (`project_id not null`, sem coluna de tarefa), eventos de projeto gravados antes da migration, e
# então assertivas reais (project_id nullable, `task_id` com cascade, os três estados de vínculo,
# as duas check constraints, RLS por `user_id`, cascade de tarefa/projeto, `wipe_own_data` e a
# reaplicação idempotente).
#
# Uso: bash supabase/tests/event_task_link/run.sh
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATION="$HERE/../../migrations/20260817120000_event_task_link.sql"
CONTAINER=orbyva-event-task-link-pg

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

# 03_assert_rls roda por último de propósito: ele termina chamando `wipe_own_data`, que apaga as
# linhas do seed — qualquer assertiva sobre o estado pré-migration precisa vir antes dele.
docker exec "$CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres -d orbyva -q \
  -f /sql/00_stubs.sql \
  -f /sql/01_seed.sql \
  -f /sql/10_migration.sql \
  -f /sql/02_assert_schema.sql \
  -f /sql/10_migration.sql `# reaplicação: tem que ser idempotente` \
  -f /sql/02_assert_schema.sql \
  -f /sql/03_assert_rls.sql

echo "OK: 20260817120000_event_task_link.sql validada em Postgres 16."
