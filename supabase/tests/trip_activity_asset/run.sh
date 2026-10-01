#!/usr/bin/env bash
# Valida as duas migrations da feature 102 — `20260930120000_trip_activity_asset.sql` e
# `20260930130000_trip_activity_boarding_time.sql` — num Postgres 16 descartável em Docker, sem
# tocar no banco remoto.
#
# Não há Supabase local neste projeto e `supabase db push` aplica em produção, então esta é a forma
# de provar as migrations antes de o usuário aplicá-las: stubs de `auth`/`storage`/
# `enforce_app_access`/`is_trip_member` e do roteiro, um seed com três usuários (dono, membro
# convidado, estranho) e duas viagens, um controle negativo provando que nada disso existia antes, e
# então as assertivas: schema/check/índice/FKs/RLS/trigger/bucket privado e o comportamento
# (formato do asset, invariante do trip_id, RLS nas duas pontas, cascade).
#
# Uso: bash supabase/tests/trip_activity_asset/run.sh
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ASSETS="$HERE/../../migrations/20260930120000_trip_activity_asset.sql"
BOARDING="$HERE/../../migrations/20260930130000_trip_activity_boarding_time.sql"
CONTAINER=orbyva-trip-activity-asset-pg

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
cp "$ASSETS" "$WORK/10_migration.sql"
cp "$BOARDING" "$WORK/11_boarding.sql"
docker cp "$WORK" "$CONTAINER:/sql" >/dev/null

# Controle negativo, antes das migrations: sem ele, as assertivas do 02 poderiam estar passando por
# causa dos stubs em vez das migrations em teste.
docker exec "$CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres -d orbyva -q \
  -f /sql/00_stubs.sql \
  -f /sql/01_seed.sql \
  -c "do \$\$
      declare n int;
      begin
        if to_regclass('public.trip_activity_asset') is not null then
          raise exception 'FALHOU (controle negativo): trip_activity_asset já existia';
        end if;
        if exists (
          select 1 from information_schema.columns
           where table_schema='public' and table_name='trip_itinerary_activity'
             and column_name='boarding_time'
        ) then
          raise exception 'FALHOU (controle negativo): boarding_time já existia';
        end if;
        if exists (select 1 from storage.buckets where id='trip-assets') then
          raise exception 'FALHOU (controle negativo): bucket trip-assets já existia';
        end if;
        select count(*) into n from public.trip_itinerary_activity;
        if n <> 3 then
          raise exception 'FALHOU: seed deveria ter 3 atividades, achadas %', n;
        end if;
        select count(*) into n from public.trip_itinerary_activity where category='transport';
        if n <> 2 then
          raise exception 'FALHOU: seed deveria ter 2 deslocamentos, achados %', n;
        end if;
        raise notice 'OK (controle negativo): sem as migrations não há assets nem embarque';
      end \$\$;"

# 02 roda depois de cada aplicação (a segunda prova idempotência).
docker exec "$CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres -d orbyva -q \
  -f /sql/10_migration.sql \
  -f /sql/11_boarding.sql \
  -f /sql/02_assert_schema.sql \
  -f /sql/10_migration.sql `# reaplicação: tem que ser idempotente` \
  -f /sql/11_boarding.sql \
  -f /sql/02_assert_schema.sql

# Reparo do bucket: o `on conflict (id) do nothing` **preserva** um bucket criado antes — inclusive
# um público, que é exatamente o que esta feature não pode ter. Aqui ele é degradado de propósito e
# a migration reaplicada; o 02 depois exige privado e o teto de volta.
docker exec "$CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres -d orbyva -q \
  -c "update storage.buckets set public = true, file_size_limit = 51200 where id = 'trip-assets';" \
  -f /sql/10_migration.sql \
  -f /sql/02_assert_schema.sql

# 03 por último porque escreve de verdade e termina apagando a viagem do seed (teste do cascade).
docker exec "$CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres -d orbyva -q \
  -f /sql/03_assert_behavior.sql

echo "OK: migrations da feature 102 validadas em Postgres 16."
