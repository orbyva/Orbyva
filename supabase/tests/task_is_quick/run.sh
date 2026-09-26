#!/usr/bin/env bash
# Valida `supabase/migrations/20260819100000_task_is_quick.sql` (feature 070) num Postgres 16
# descartável em Docker — sem tocar no banco remoto.
#
# Não há Supabase local neste projeto e `supabase db push` aplica em produção, então esta é a forma
# de provar a migration antes de o usuário aplicá-la: stubs de `auth.users`/`auth.uid()`/
# `enforce_app_access`, uma `public.task` no schema que as features 032/037/049/061 deixaram (com
# `estimated_duration`, `is_milestone`, `is_medication` e `is_consultation`, sem `is_quick`), tarefas
# gravadas antes da migration, e então assertivas reais (coluna `boolean not null default false`,
# linhas antigas herdando `false` sem update, flags anteriores intactas, RLS por `user_id` valendo
# para a pontual, `is_quick` + `is_medication` coexistindo na mesma linha — pré-requisito da 071 —,
# `wipe_own_data` levando as pontuais junto, e a reaplicação idempotente).
#
# Uso: bash supabase/tests/task_is_quick/run.sh
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATION="$HERE/../../migrations/20260819100000_task_is_quick.sql"
CONTAINER=orbyva-task-is-quick-pg

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

echo "OK: 20260819100000_task_is_quick.sql validada em Postgres 16."
