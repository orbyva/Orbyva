#!/usr/bin/env bash
# Valida `supabase/migrations/20260816170000_note_links.sql` (feature 056) num Postgres 16
# descartável em Docker — sem tocar no banco remoto.
#
# Mesmo formato de supabase/tests/notes_core/run.sh: stubs de `auth.users`/`auth.uid()`/
# `enforce_app_access`, `public.project` e `public.note` como a 055 deixou, e então assertivas
# reais — schema, `check` do entity_type, `unique` do trio, índices, FKs e seus `on delete`,
# RLS por `auth.uid()` com o papel `authenticated`, `wipe_own_data` e a reaplicação idempotente.
#
# Cobre o roteiro que a feature mandava fazer à mão no SQL editor depois do `db push`.
#
# Uso: bash supabase/tests/note_links/run.sh
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATION="$HERE/../../migrations/20260816170000_note_links.sql"
CONTAINER=orbyva-note-links-pg

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
  -f /sql/04_assert_constraints_fk_wipe.sql \
  -f /sql/10_migration.sql `# reaplicação: tem que ser idempotente` \
  -f /sql/02_assert_schema.sql

echo "OK: 20260816170000_note_links.sql validada em Postgres 16."
