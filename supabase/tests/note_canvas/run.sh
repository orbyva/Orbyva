#!/usr/bin/env bash
# Valida `supabase/migrations/20260816180000_note_canvas.sql` (feature 058) num Postgres 16
# descartável em Docker — sem tocar no banco remoto.
#
# Mesmo formato de supabase/tests/note_links/run.sh: stubs de `auth.users`/`auth.uid()`/
# `enforce_app_access`, `public.project` e `public.note` como a 055 a deixou, notas semeadas
# **antes** da migration, e então assertivas reais — colunas `kind`/`canvas_data`, o default
# 'markdown' herdado pelas notas antigas, o `check` rejeitando kind inválido, o round-trip do
# jsonb do Excalidraw, a RLS da 055 ainda valendo e o wipe de conta levando o canvas junto.
#
# Cobre o roteiro que a feature mandava fazer à mão no SQL editor depois do `db push`.
#
# Uso: bash supabase/tests/note_canvas/run.sh
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATION="$HERE/../../migrations/20260816180000_note_canvas.sql"
CONTAINER=orbyva-note-canvas-pg

cleanup() { docker rm -f "$CONTAINER" >/dev/null 2>&1 || true; }
trap cleanup EXIT
cleanup

docker run -d --name "$CONTAINER" -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=orbyva postgres:16 >/dev/null
# `pg_isready` sozinho NÃO basta: a imagem do postgres sobe um servidor temporário durante o
# initdb e o derruba antes de abrir o definitivo, então existe uma janela em que ele responde
# "pronto" e o `psql` seguinte falha com "No such file or directory". Quem dá o veredito é uma
# query de verdade — foi essa corrida que travou uma rodada anterior desta esteira.
ready=""
for _ in $(seq 1 90); do
  if docker exec "$CONTAINER" psql -U postgres -d orbyva -tAc 'select 1' >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 1
done
if [ -z "$ready" ]; then
  echo "FALHOU: Postgres não ficou pronto em 90s." >&2
  exit 1
fi

WORK="$(mktemp -d)"
cp "$HERE"/*.sql "$WORK/"
cp "$MIGRATION" "$WORK/10_migration.sql"
docker cp "$WORK" "$CONTAINER:/sql" >/dev/null

docker exec "$CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres -d orbyva -q \
  -f /sql/00_stubs.sql \
  -f /sql/01_seed.sql \
  -f /sql/10_migration.sql \
  -f /sql/02_assert_schema.sql \
  -f /sql/03_assert_behavior.sql \
  -f /sql/10_migration.sql `# reaplicação: tem que ser idempotente` \
  -f /sql/02_assert_schema.sql \
  -f /sql/03_assert_behavior.sql

echo "OK: 20260816180000_note_canvas.sql validada em Postgres 16."
