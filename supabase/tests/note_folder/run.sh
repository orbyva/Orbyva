#!/usr/bin/env bash
# Valida `supabase/migrations/20260916173000_note_folder.sql` (feature 099) num Postgres 16
# descartável em Docker — sem tocar no banco remoto.
#
# Uso: bash supabase/tests/note_folder/run.sh
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATION="$HERE/../../migrations/20260916173000_note_folder.sql"
CONTAINER=orbyva-note-folder-pg

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
  -f /sql/10_migration.sql \
  -f /sql/02_assert_schema.sql

echo "OK: note_folder migration conferida (idempotente)."
