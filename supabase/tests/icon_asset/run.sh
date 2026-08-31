#!/usr/bin/env bash
# Valida `supabase/migrations/20260823110000_icon_asset.sql` (feature 086) num Postgres 16
# descartável em Docker — sem tocar no banco remoto.
#
# Não há Supabase local neste projeto e `supabase db push` aplica em produção, então esta é a forma
# de provar a migration antes de o usuário aplicá-la: stubs de `auth.users`/`auth.uid()`/
# `enforce_app_access`/`storage`, a migration de ícone da feature 035 aplicada de verdade (é ela que
# cria as colunas `icon_key`/`icon_url`, o bucket `task-icons` e as policies ancoradas no dono),
# tarefas gravadas antes desta migration — com e sem ícone, duas na **mesma** URL —, um controle
# negativo provando que a biblioteca não existia, e então as assertivas reais: schema/unique/
# índice/FK/RLS/`wipe_own_data`, a cópia do dado antigo, a reaplicação idempotente, o reparo do
# bucket e o comportamento (excluir não apaga arquivo, RLS por usuário, `library/` preso ao dono,
# wipe).
#
# Uso: bash supabase/tests/icon_asset/run.sh
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATION="$HERE/../../migrations/20260823110000_icon_asset.sql"
TASK_ICON="$HERE/../../migrations/20260814010000_task_icon.sql"
CONTAINER=orbyva-icon-asset-pg

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
cp "$TASK_ICON" "$WORK/05_task_icon.sql"
cp "$MIGRATION" "$WORK/10_migration.sql"
docker cp "$WORK" "$CONTAINER:/sql" >/dev/null

# Controle negativo, antes da migration: sem ele, as assertivas do 02 poderiam estar passando por
# causa dos stubs (ou da migration da 035) em vez da migration em teste.
docker exec "$CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres -d orbyva -q \
  -f /sql/00_stubs.sql \
  -f /sql/05_task_icon.sql \
  -f /sql/01_seed.sql \
  -c "do \$\$
      declare n int; txt text;
      begin
        if to_regclass('public.icon_asset') is not null then
          raise exception 'FALHOU (controle negativo): icon_asset já existia antes da migration';
        end if;
        begin
          execute 'insert into public.icon_asset (user_id, name, url) values (null, null, null)';
          raise exception 'FALHOU (controle negativo): gravar na biblioteca funcionou sem a migration';
        exception
          when undefined_table then null;
        end;
        select pg_get_functiondef(p.oid) into txt
          from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
         where ns.nspname='public' and p.proname='wipe_own_data';
        if txt like '%icon_asset%' then
          raise exception 'FALHOU (controle negativo): wipe_own_data já conhecia icon_asset';
        end if;
        select count(*) into n from public.task where icon_url is not null;
        if n <> 5 then
          raise exception 'FALHOU: seed deveria ter 5 tarefas com icon_url, achadas %', n;
        end if;
        select count(*) into n from public.task
         where icon_url is not null and btrim(icon_url) <> '';
        if n <> 4 then
          raise exception 'FALHOU: seed deveria ter 4 tarefas com icon_url não-vazia, achadas %', n;
        end if;
        raise notice 'OK (controle negativo): sem a migration não existe biblioteca de ícones';
      end \$\$;"

# 02 roda depois de cada aplicação (a segunda prova a idempotência da cópia de dados).
docker exec "$CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres -d orbyva -q \
  -f /sql/10_migration.sql \
  -f /sql/02_assert_schema.sql \
  -f /sql/10_migration.sql `# reaplicação: tem que ser idempotente` \
  -f /sql/02_assert_schema.sql

# Reparo do bucket: o `on conflict (id) do nothing` da 035 **preserva** um bucket criado antes dela,
# que pode não aceitar `image/svg+xml` — e sem esse mime o "colar SVG" desta feature falharia no
# upload, não na validação. Aqui o bucket é degradado de propósito e a migration reaplicada; o 02
# depois exige o mime de volta, o teto de 1 MB e os mimes antigos preservados.
docker exec "$CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres -d orbyva -q \
  -c "update storage.buckets
         set allowed_mime_types = array['image/png'], file_size_limit = 51200
       where id = 'task-icons';" \
  -f /sql/10_migration.sql \
  -f /sql/02_assert_schema.sql

# 03 por último porque escreve de verdade e termina chamando `wipe_own_data`, que apaga o seed.
docker exec "$CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres -d orbyva -q \
  -f /sql/03_assert_behavior.sql

echo "OK: 20260823110000_icon_asset.sql validada em Postgres 16."
