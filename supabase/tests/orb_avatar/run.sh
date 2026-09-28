#!/usr/bin/env bash
# Valida `supabase/migrations/20260924113000_orb_avatar.sql` (feature 151) num Postgres 16
# descartável em Docker — sem tocar no banco remoto.
#
# Não há Supabase local neste projeto e `supabase db push` aplica em produção, então esta é a forma
# de provar a migration antes de o usuário aplicá-la: stubs de `auth.users`/`auth.uid()`/
# `enforce_app_access`/`storage` e um `wipe_own_data` com a lista anterior, dois usuários, um
# controle negativo provando que nada disto existia, e então as assertivas reais — schema, os dois
# índices (inclusive o parcial que garante "uma ativa por dono"), FK, RLS, a RPC `security
# definer`, o bucket de 5 MB só para PNG, o wipe reescrito sem perder tabela, e o comportamento
# (duas ativas barradas, troca pela RPC, id alheio recusado, zero ativas válido, wipe por dono).
#
# Uso: bash supabase/tests/orb_avatar/run.sh
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATION="$HERE/../../migrations/20260924113000_orb_avatar.sql"
CONTAINER=orbyva-orb-avatar-pg

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

# Controle negativo, antes da migration: sem ele, as assertivas do 02 poderiam estar passando por
# causa dos stubs em vez da migration em teste.
docker exec "$CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres -d orbyva -q \
  -f /sql/00_stubs.sql \
  -f /sql/01_seed.sql \
  -c "do \$\$
      declare txt text;
      begin
        if to_regclass('public.orb_avatar') is not null then
          raise exception 'FALHOU (controle negativo): orb_avatar já existia antes da migration';
        end if;
        begin
          execute 'insert into public.orb_avatar (user_id, prompt, url, model) values (null, null, null, null)';
          raise exception 'FALHOU (controle negativo): gravar versão funcionou sem a migration';
        exception
          when undefined_table then null;
        end;
        if to_regprocedure('public.orb_avatar_set_active(uuid)') is not null then
          raise exception 'FALHOU (controle negativo): a RPC já existia antes da migration';
        end if;
        if exists (select 1 from storage.buckets where id = 'orb-avatars') then
          raise exception 'FALHOU (controle negativo): o bucket orb-avatars já existia';
        end if;
        if exists (select 1 from pg_policies
                    where schemaname='storage' and tablename='objects'
                      and policyname like 'orb_avatars%') then
          raise exception 'FALHOU (controle negativo): as policies do bucket já existiam';
        end if;
        select pg_get_functiondef(p.oid) into txt
          from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
         where ns.nspname='public' and p.proname='wipe_own_data';
        if txt like '%orb_avatar%' then
          raise exception 'FALHOU (controle negativo): wipe_own_data já conhecia orb_avatar';
        end if;
        if txt not like '%''link_icon_rule''%' then
          raise exception 'FALHOU (controle negativo): o baseline do wipe não é o da migration anterior';
        end if;
        raise notice 'OK (controle negativo): sem a migration não há tabela, RPC, bucket nem wipe de orb_avatar';
      end \$\$;"

# 02 roda depois de cada aplicação (a segunda prova a idempotência: reaplicar não erra, não duplica
# índice/policy/bucket e não inventa linha).
docker exec "$CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres -d orbyva -q \
  -f /sql/10_migration.sql \
  -f /sql/02_assert_schema.sql \
  -f /sql/10_migration.sql `# reaplicação: tem que ser idempotente` \
  -f /sql/02_assert_schema.sql

# 03 por último porque escreve de verdade e termina chamando `wipe_own_data`, que apaga o cenário.
docker exec "$CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres -d orbyva -q \
  -f /sql/03_assert_behavior.sql

echo "OK: 20260924113000_orb_avatar.sql validada em Postgres 16."
