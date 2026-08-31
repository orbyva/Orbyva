#!/usr/bin/env bash
# Valida `supabase/migrations/20260823100000_task_external_links.sql` (feature 085) num Postgres 16
# descartável em Docker — sem tocar no banco remoto.
#
# Não há Supabase local neste projeto e `supabase db push` aplica em produção, então esta é a forma
# de provar a migration antes de o usuário aplicá-la: stubs de `auth.users`/`auth.uid()`/
# `enforce_app_access`, uma `public.task` no schema que as features anteriores deixaram (com
# `external_url`/`external_provider` da 013 e SEM `task_external_link`), tarefas gravadas antes da
# migration — com e sem link —, um controle negativo provando que a tabela não existia, e então as
# assertivas reais: schema/unique/índice/FKs/RLS/`wipe_own_data`, a cópia do dado antigo, a
# reaplicação idempotente e o comportamento (link repetido barrado, cascade, RLS por usuário, wipe).
#
# Uso: bash supabase/tests/task_external_links/run.sh
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATION="$HERE/../../migrations/20260823100000_task_external_links.sql"
CONTAINER=orbyva-task-external-links-pg

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
      declare n int;
      begin
        if to_regclass('public.task_external_link') is not null then
          raise exception 'FALHOU (controle negativo): task_external_link já existia antes da migration';
        end if;
        begin
          execute 'insert into public.task_external_link (user_id, task_id, url) values (null, null, null)';
          raise exception 'FALHOU (controle negativo): gravar link funcionou sem a migration';
        exception
          when undefined_table then null;
        end;
        select count(*) into n from public.task where external_url is not null;
        if n <> 4 then
          raise exception 'FALHOU: seed deveria ter 4 tarefas com external_url, achadas %', n;
        end if;
        raise notice 'OK (controle negativo): sem a migration não existe task_external_link';
      end \$\$;"

# 02 roda depois de cada aplicação (a segunda prova a idempotência); 03 por último porque escreve
# de verdade e termina chamando `wipe_own_data`, que apaga o seed.
docker exec "$CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres -d orbyva -q \
  -f /sql/10_migration.sql \
  -f /sql/02_assert_schema.sql \
  -f /sql/10_migration.sql `# reaplicação: tem que ser idempotente` \
  -f /sql/02_assert_schema.sql \
  -f /sql/03_assert_behavior.sql

echo "OK: 20260823100000_task_external_links.sql validada em Postgres 16."
