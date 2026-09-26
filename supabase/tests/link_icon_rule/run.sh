#!/usr/bin/env bash
# Valida `supabase/migrations/20260823120000_link_icon_rule.sql` (feature 087) num Postgres 16
# descartável em Docker — sem tocar no banco remoto.
#
# Não há Supabase local neste projeto e `supabase db push` aplica em produção, então esta é a forma
# de provar a migration antes de o usuário aplicá-la: stubs de `auth.users`/`auth.uid()`/
# `enforce_app_access` e a `public.icon_asset` da feature 086, um controle negativo provando que a
# tabela de regras não existia, e então as assertivas reais — schema/constraint de pattern/índice/
# FK/RLS/`wipe_own_data`, a reaplicação idempotente, uma degradação deliberada do `wipe_own_data`
# (que a reaplicação tem de reparar) e o comportamento (teto de 200 caracteres, ordem por
# `position`, desligar sem perder, ícone sem FK, RLS por usuário, cascade e wipe).
#
# Uso: bash supabase/tests/link_icon_rule/run.sh
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATION="$HERE/../../migrations/20260823120000_link_icon_rule.sql"
CONTAINER=orbyva-link-icon-rule-pg

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
      declare n int; txt text;
      begin
        if to_regclass('public.link_icon_rule') is not null then
          raise exception 'FALHOU (controle negativo): link_icon_rule já existia antes da migration';
        end if;
        begin
          execute 'insert into public.link_icon_rule (user_id, name, pattern) values (null, null, null)';
          raise exception 'FALHOU (controle negativo): gravar regra funcionou sem a migration';
        exception
          when undefined_table then null;
        end;
        select pg_get_functiondef(p.oid) into txt
          from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
         where ns.nspname='public' and p.proname='wipe_own_data';
        if txt like '%link_icon_rule%' then
          raise exception 'FALHOU (controle negativo): wipe_own_data já conhecia link_icon_rule';
        end if;
        select count(*) into n from public.icon_asset;
        if n <> 2 then
          raise exception 'FALHOU: seed deveria ter 2 ícones na biblioteca, achados %', n;
        end if;
        raise notice 'OK (controle negativo): sem a migration não existem regras de ícone de link';
      end \$\$;"

# 02 roda depois de cada aplicação (a segunda prova a idempotência: reaplicar não duplica policy,
# índice nem constraint).
docker exec "$CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres -d orbyva -q \
  -f /sql/10_migration.sql \
  -f /sql/02_assert_schema.sql \
  -f /sql/10_migration.sql `# reaplicação: tem que ser idempotente` \
  -f /sql/02_assert_schema.sql

# Degradação deliberada: `wipe_own_data` é compartilhada e reescrita inteira por toda migration que
# acrescenta tabela — uma ordem de aplicação diferente pode deixar a versão antiga por cima, e o
# sintoma seria um vazamento silencioso no wipe de conta. Aqui a função é revertida à versão sem
# `link_icon_rule` e a migration é reaplicada; o 02 depois exige a regra de volta **e** as tabelas
# antigas preservadas.
docker exec "$CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres -d orbyva -q \
  -c "create or replace function public.wipe_own_data()
      returns void language plpgsql security definer set search_path = public as \$fn\$
      declare uid uuid := auth.uid(); t text;
      begin
        if uid is null then raise exception 'Não autenticado'; end if;
        foreach t in array array['task_external_link', 'task', 'icon_asset', 'project'] loop
          if to_regclass('public.' || t) is null then continue; end if;
          execute format('delete from public.%I where user_id = \$1', t) using uid;
        end loop;
      end \$fn\$;" \
  -f /sql/10_migration.sql \
  -f /sql/02_assert_schema.sql

# 03 por último porque escreve de verdade e termina chamando `wipe_own_data`, que apaga o seed.
docker exec "$CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres -d orbyva -q \
  -f /sql/03_assert_behavior.sql

echo "OK: 20260823120000_link_icon_rule.sql validada em Postgres 16."
