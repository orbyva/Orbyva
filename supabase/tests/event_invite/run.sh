#!/usr/bin/env bash
# Valida as três migrations da feature 076 num Postgres 16 descartável em Docker — sem tocar no
# banco remoto (não há Supabase local neste projeto e `supabase db push` aplica em produção).
#
#   20260820110000_project_event_project_optional.sql
#   20260820120000_event_invite.sql
#   20260820130000_event_invite_rpcs.sql
#
# Roteiro:
#   00_stubs         auth.users/uid()/jwt()/role(), profiles e o gate Pro REAL (is_db_admin,
#                    has_app_access, enforce_app_access verbatim de 20260723120000), mais
#                    `project`/`project_event` no schema pré-076 (project_id NOT NULL)
#   01_seed          anfitrião Pro com dois eventos, convidado FORA do trial, terceiro Pro
#   02_assert_pre    controle: antes das migrations, project_id nulo é rejeitado e event_invite não existe
#   migrations       primeira aplicação (as três, na ordem)
#   03_assert_schema coluna nulável + comment + FK intacta, event_invite com colunas/RLS/4 policies/
#                    índices/trigger, RPCs security definer com search_path fixo e grants, wipe_own_data
#   migrations       segunda aplicação (o `supabase db push` pode ser repetido)
#   03_assert_schema idempotência: mesmas assertivas, e nenhuma policy duplicada
#   04_assert_rls    como `authenticated`: anfitrião cria/lê, terceiro não lê/revoga/apaga, não dá para
#                    convidar para evento alheio nem forjar created_by, mesmo e-mail duas vezes é
#                    barrado, revogado libera reconvite, e a pré-visualização por token não vaza nada
#                    do anfitrião
#   05_assert_accept aceite cria a cópia (project_id nulo), aceitar duas vezes é no-op, expirado/
#                    revogado/e-mail errado/token inexistente não passam, segundo convite não duplica
#                    a agenda, autoconvite barrado, e — o ponto do security definer — o convidado
#                    fora do trial aceita mesmo com o INSERT direto sendo derrubado com 42501
#   06_assert_wipe   wipe_own_data leva convites e eventos do dono, e só os dele
#
# Depois, um controle negativo de banco inteiro: um segundo container com stubs + seed e SEM as
# migrations, onde 03_assert_schema tem de FALHAR. Sem ele, um arquivo de assertivas que não
# assertasse nada passaria despercebido.
#
# Uso: bash supabase/tests/event_invite/run.sh
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATIONS_DIR="$HERE/../../migrations"
CONTAINER=orbyva-event-invite-pg
CONTROL=orbyva-event-invite-control-pg

cleanup() {
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  docker rm -f "$CONTROL" >/dev/null 2>&1 || true
}
trap cleanup EXIT
cleanup

start_pg() {
  local name="$1"
  docker run -d --name "$name" -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=orbyva postgres:16 >/dev/null
  # `pg_isready` sozinho não serve: durante o bootstrap o initdb sobe um servidor temporário que já
  # responde, mas ainda não criou o banco `orbyva` — esperar por uma query de verdade evita a corrida.
  local ready=""
  for _ in $(seq 1 90); do
    if docker exec "$name" psql -U postgres -d orbyva -tAc 'select 1' >/dev/null 2>&1; then
      ready=1
      break
    fi
    sleep 1
  done
  if [ -z "$ready" ]; then
    echo "FALHOU: Postgres ($name) não ficou pronto a tempo" >&2
    exit 1
  fi
}

WORK="$(mktemp -d)"
cp "$HERE"/*.sql "$WORK/"
cp "$MIGRATIONS_DIR/20260820110000_project_event_project_optional.sql" "$WORK/10_migration_a.sql"
cp "$MIGRATIONS_DIR/20260820120000_event_invite.sql" "$WORK/11_migration_b.sql"
cp "$MIGRATIONS_DIR/20260820130000_event_invite_rpcs.sql" "$WORK/12_migration_c.sql"

start_pg "$CONTAINER"
docker cp "$WORK" "$CONTAINER:/sql" >/dev/null

docker exec "$CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres -d orbyva -q \
  -f /sql/00_stubs.sql \
  -f /sql/01_seed.sql \
  -f /sql/02_assert_pre.sql \
  -f /sql/10_migration_a.sql \
  -f /sql/11_migration_b.sql \
  -f /sql/12_migration_c.sql \
  -f /sql/03_assert_schema.sql \
  -f /sql/10_migration_a.sql `# reaplicação: tem que ser idempotente` \
  -f /sql/11_migration_b.sql \
  -f /sql/12_migration_c.sql \
  -f /sql/03_assert_schema.sql \
  -f /sql/04_assert_rls.sql \
  -f /sql/05_assert_accept.sql \
  -f /sql/06_assert_wipe.sql

# ---- controle negativo: sem as migrations, as assertivas têm de acusar ------------------------
start_pg "$CONTROL"
docker cp "$WORK" "$CONTROL:/sql" >/dev/null

if docker exec "$CONTROL" psql -v ON_ERROR_STOP=1 -U postgres -d orbyva -q \
  -f /sql/00_stubs.sql \
  -f /sql/01_seed.sql \
  -f /sql/03_assert_schema.sql >/dev/null 2>&1
then
  echo "FALHOU: as assertivas passaram num banco SEM as migrations — elas não estão provando nada" >&2
  exit 1
fi

echo "OK: migrations 20260820110000 / 20260820120000 / 20260820130000 validadas em Postgres 16 (com controle negativo)."
