#!/usr/bin/env bash
# Valida `supabase/migrations/20260818120000_project_notes_drop.sql` (última tarefa da feature 058,
# herdada da 055) num Postgres 16 descartável em Docker — sem tocar no banco remoto.
#
# Esta é a única migration do módulo de Notas que **destrói** dado: ela remove `project.notes`,
# cuja cópia para a tabela `note` foi feita pela 055. Por isso o harness não roda o drop isolado —
# ele encena a sequência real do banco do usuário: `public.project` com a coluna da feature 006 e
# dado dentro, a migration da 055 copiando para `note`, e só então o drop. O que as assertivas
# provam é o que a tarefa mandava conferir à mão no SQL editor: a coluna sumiu, as notas migradas
# continuam byte a byte, `project_event` (criada pela MESMA migration da 006) não foi arrastada
# junto, as policies e o check de `status` continuam de pé, e o CRUD de projeto segue funcionando.
#
# Uso: bash supabase/tests/project_notes_drop/run.sh
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NOTES_CORE_MIGRATION="$HERE/../../migrations/20260816160000_notes_core.sql"
DROP_MIGRATION="$HERE/../../pending/20260818120000_project_notes_drop.sql"
CONTAINER=orbyva-project-notes-drop-pg

cleanup() { docker rm -f "$CONTAINER" >/dev/null 2>&1 || true; }
trap cleanup EXIT
cleanup

docker run -d --name "$CONTAINER" -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=orbyva postgres:16 >/dev/null

# `pg_isready` sozinho não serve: durante o bootstrap o initdb sobe um servidor temporário que já
# responde, mas ainda não criou o banco `orbyva` — esperar por uma query de verdade evita a corrida
# (mesma nota dos harnesses de task_consultation e note_canvas).
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
cp "$NOTES_CORE_MIGRATION" "$WORK/10_notes_core.sql"
cp "$DROP_MIGRATION" "$WORK/20_drop.sql"
docker cp "$WORK" "$CONTAINER:/sql" >/dev/null

# Ordem: stubs + dado da 006, a migration da 055 (cópia), o retrato do que precisa sobreviver, o
# drop, as assertivas, os controles negativos, e o drop de novo com as mesmas assertivas — o
# `if exists` tem de tornar a reaplicação inofensiva.
docker exec "$CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres -d orbyva -q \
  -f /sql/00_stubs.sql \
  -f /sql/01_seed.sql \
  -f /sql/10_notes_core.sql \
  -f /sql/11_snapshot.sql \
  -f /sql/20_drop.sql \
  -f /sql/02_assert_schema.sql \
  -f /sql/03_assert_behavior.sql \
  -f /sql/04_negative_controls.sql \
  -f /sql/20_drop.sql `# reaplicação: tem que ser idempotente` \
  -f /sql/02_assert_schema.sql \
  -f /sql/03_assert_behavior.sql

echo "OK: 20260818120000_project_notes_drop.sql validada em Postgres 16."
