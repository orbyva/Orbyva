#!/usr/bin/env bash
# Valida `supabase/migrations/20260816160000_notes_core.sql` (feature 055) num Postgres 16
# descartável em Docker — sem tocar no banco remoto.
#
# Não há Supabase local neste projeto e `supabase db push` aplica em produção, então esta é a
# forma de provar a migration antes de o usuário aplicá-la: stubs de `auth.users`/`auth.uid()`/
# `enforce_app_access`, um `public.project` com a coluna `notes` da feature 006, e então assertivas
# reais (RLS ligada com policies por `auth.uid()`, índices, defaults, FK e seu `on delete`,
# `wipe_own_data`, a cópia de `project.notes` e a reaplicação idempotente).
#
# Uso: bash supabase/tests/notes_core/run.sh
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATION="$HERE/../../migrations/20260816160000_notes_core.sql"
CONTAINER=orbyva-notes-core-pg

cleanup() { docker rm -f "$CONTAINER" >/dev/null 2>&1 || true; }
trap cleanup EXIT
cleanup

docker run -d --name "$CONTAINER" -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=orbyva postgres:16 >/dev/null
for _ in $(seq 1 60); do
  docker exec "$CONTAINER" pg_isready -U postgres -d orbyva >/dev/null 2>&1 && break
  sleep 1
done

WORK="$(mktemp -d)"
cp "$HERE"/*.sql "$WORK/"
cp "$MIGRATION" "$WORK/10_migration.sql"
docker cp "$WORK" "$CONTAINER:/sql" >/dev/null

docker exec "$CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres -d orbyva -q \
  -f /sql/00_stubs.sql \
  -f /sql/01_seed.sql \
  -f /sql/10_migration.sql \
  -f /sql/02_assert_schema.sql \
  -f /sql/03_assert_rls.sql \
  -f /sql/04_assert_fk_wipe.sql \
  -f /sql/10_migration.sql `# reaplicação: tem que ser idempotente` \
  -f /sql/02_assert_schema.sql

echo "OK: 20260816160000_notes_core.sql validada em Postgres 16."
