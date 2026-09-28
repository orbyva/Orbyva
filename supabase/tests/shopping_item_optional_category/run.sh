#!/usr/bin/env bash
# Valida `supabase/migrations/20260818140000_shopping_item_optional_category.sql` (feature 050,
# reabertura de 2026-08-18) num Postgres 16 descartável em Docker — sem tocar no banco remoto.
#
# Não há Supabase local neste projeto e `supabase db push` aplica em produção, então esta é a forma
# de provar a migration antes de o usuário aplicá-la. O estado pré-migration não é um stub à mão:
# é a própria migration da 050 (`20260816130000_shopping_list.sql`), aplicada aqui, com um item
# categorizado gravado **antes** do `drop not null`.
#
# O que fica provado:
#   - antes:  `shopping_category_id` é NOT NULL e o insert sem categoria estoura (02_assert_pre);
#   - depois: a coluna é nullable, o item sem categoria entra, a linha legada sobrevive, o FK
#             continua com `on delete cascade` (e continua barrando categoria inexistente), o
#             `check` de status e os índices da 050 seguem de pé, e o `comment on column` documenta
#             o novo significado do nulo (03_assert_schema, rodado duas vezes: a migration é
#             idempotente);
#   - RLS:    as 4 policies valem igual para o item sem categoria — o dono vê/edita/apaga o seu,
#             outro usuário não vê nem alcança, forjar `user_id` é barrado, e `wipe_own_data` leva
#             o item sem categoria junto (04_assert_rls).
#
# Uso: bash supabase/tests/shopping_item_optional_category/run.sh
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASE_MIGRATION="$HERE/../../migrations/20260816130000_shopping_list.sql"
MIGRATION="$HERE/../../migrations/20260818140000_shopping_item_optional_category.sql"
CONTAINER=orbyva-shopping-optional-category-pg

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
cp "$BASE_MIGRATION" "$WORK/10_base_050.sql"
cp "$MIGRATION" "$WORK/11_migration.sql"
docker cp "$WORK" "$CONTAINER:/sql" >/dev/null

# 04_assert_rls roda por último de propósito: ele termina chamando `wipe_own_data`, que apaga as
# linhas do seed — qualquer assertiva sobre o estado pré-migration precisa vir antes dele.
docker exec "$CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres -d orbyva -q \
  -f /sql/00_stubs.sql \
  -f /sql/10_base_050.sql \
  -f /sql/01_seed.sql \
  -f /sql/02_assert_pre.sql `# controle positivo: antes, a coluna era NOT NULL` \
  -f /sql/11_migration.sql \
  -f /sql/03_assert_schema.sql \
  -f /sql/11_migration.sql `# reaplicação: tem que ser idempotente` \
  -f /sql/03_assert_schema.sql \
  -f /sql/04_assert_rls.sql

echo "OK: 20260818140000_shopping_item_optional_category.sql validada em Postgres 16."
