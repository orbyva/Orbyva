#!/usr/bin/env bash
# Valida os dois `drop column` legados num Postgres 16 descartável em Docker, sem tocar no remoto:
#   supabase/migrations/20260921100000_project_drop_notes.sql        (feature 058, herdado da 055)
#   supabase/migrations/20260921110000_task_drop_external_columns.sql (feature 085)
#
# O que se está provando não é "o alter roda" — é que ele roda **e não leva junto** o que mora ao
# lado: `project_event` e `project.status` nasceram na mesma migration que `project.notes`, e
# `task_external_link` é justamente o destino da cópia que autoriza o drop da 085.
#
# Uso: bash supabase/tests/drop_legacy_columns/run.sh
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
M_PROJECT="$HERE/../../migrations/20260921100000_project_drop_notes.sql"
M_TASK="$HERE/../../migrations/20260921110000_task_drop_external_columns.sql"
CONTAINER=orbyva-drop-legacy-columns-pg

cleanup() { docker rm -f "$CONTAINER" >/dev/null 2>&1 || true; }
trap cleanup EXIT
cleanup

docker run -d --name "$CONTAINER" -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=orbyva postgres:16 >/dev/null

ready=""
for _ in $(seq 1 90); do
  if docker exec "$CONTAINER" psql -U postgres -d orbyva -tAc 'select 1' >/dev/null 2>&1; then ready=1; break; fi
  sleep 1
done
[ -n "$ready" ] || { echo "FALHOU: Postgres não ficou pronto a tempo" >&2; exit 1; }

WORK="$(mktemp -d)"
cp "$HERE"/*.sql "$WORK/"
cp "$M_PROJECT" "$WORK/10_drop_notes.sql"
cp "$M_TASK"    "$WORK/11_drop_external.sql"
docker cp "$WORK" "$CONTAINER:/sql" >/dev/null

# Controle negativo: as três colunas TÊM de existir antes, senão as assertivas de ausência lá
# embaixo passariam por vacuidade (schema errado passando por migration bem-sucedida).
docker exec "$CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres -d orbyva -q \
  -f /sql/00_seed.sql \
  -c "do \$\$
      begin
        if to_regclass('public.project') is null or to_regclass('public.task') is null then
          raise exception 'FALHOU (controle negativo): seed não criou as tabelas';
        end if;
        if not exists (select 1 from information_schema.columns
                        where table_schema='public' and table_name='project' and column_name='notes') then
          raise exception 'FALHOU (controle negativo): project.notes já não existia antes do drop';
        end if;
        if not exists (select 1 from information_schema.columns
                        where table_schema='public' and table_name='task' and column_name='external_url') then
          raise exception 'FALHOU (controle negativo): task.external_url já não existia antes do drop';
        end if;
        if not exists (select 1 from information_schema.columns
                        where table_schema='public' and table_name='task' and column_name='external_provider') then
          raise exception 'FALHOU (controle negativo): task.external_provider já não existia antes do drop';
        end if;
      end \$\$;"

# As migrations, na ordem do timestamp.
docker exec "$CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres -d orbyva -q \
  -f /sql/10_drop_notes.sql -f /sql/11_drop_external.sql

# Reaplicação: `drop column if exists` tem de ser no-op, não erro.
docker exec "$CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres -d orbyva -q \
  -f /sql/10_drop_notes.sql -f /sql/11_drop_external.sql

docker exec "$CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres -d orbyva -q \
  -c "do \$\$
      declare n int;
      begin
        -- 1. As três colunas sumiram.
        if exists (select 1 from information_schema.columns
                    where table_schema='public' and table_name='project' and column_name='notes') then
          raise exception 'FALHOU: project.notes continua lá';
        end if;
        if exists (select 1 from information_schema.columns
                    where table_schema='public' and table_name='task'
                      and column_name in ('external_url','external_provider')) then
          raise exception 'FALHOU: task.external_url/external_provider continuam lá';
        end if;

        -- 2. O que mora ao lado ficou intacto. project_event nasceu na MESMA migration que
        --    project.notes — é o arrasto que a tarefa mandou evitar por escrito.
        if to_regclass('public.project_event') is null then
          raise exception 'FALHOU: project_event foi arrastada junto';
        end if;
        select count(*) into n from public.project_event;
        if n <> 2 then raise exception 'FALHOU: project_event perdeu linha (esperado 2, veio %)', n; end if;

        if not exists (select 1 from information_schema.columns
                        where table_schema='public' and table_name='project' and column_name='status') then
          raise exception 'FALHOU: project.status foi arrastada junto';
        end if;
        select count(*) into n from public.project where status = 'planned';
        if n <> 1 then raise exception 'FALHOU: project.status perdeu valor (esperado 1 planned, veio %)', n; end if;

        -- 3. Os projetos e as tarefas continuam inteiros (o drop é de coluna, não de linha).
        select count(*) into n from public.project;
        if n <> 2 then raise exception 'FALHOU: project perdeu linha (esperado 2, veio %)', n; end if;
        select count(*) into n from public.task;
        if n <> 2 then raise exception 'FALHOU: task perdeu linha (esperado 2, veio %)', n; end if;

        -- 4. O destino da cópia da 085 está intacto — é ele que passa a ser a única fonte do link.
        select count(*) into n from public.task_external_link;
        if n <> 2 then raise exception 'FALHOU: task_external_link perdeu linha (esperado 2, veio %)', n; end if;
        select count(*) into n from public.task_external_link
         where task_id = 'bbbbbbbb-0000-0000-0000-000000000001'
           and url = 'https://github.com/o/r/pull/1';
        if n <> 1 then raise exception 'FALHOU: o link legado copiado sumiu do destino'; end if;

        -- 5. RLS continua ligada e a policy de pé (drop de coluna não pode derrubar policy).
        if not exists (select 1 from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
                        where ns.nspname='public' and c.relname='project' and c.relrowsecurity) then
          raise exception 'FALHOU: RLS de project foi desligada';
        end if;
        if not exists (select 1 from pg_policies
                        where schemaname='public' and tablename='project' and policyname='project_select_own') then
          raise exception 'FALHOU: a policy de project sumiu';
        end if;
      end \$\$;"

echo "OK: 20260921100000_project_drop_notes.sql e 20260921110000_task_drop_external_columns.sql validadas em Postgres 16."
