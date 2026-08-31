\set ON_ERROR_STOP on

-- Assertivas de schema da migration 20260819100000_task_is_quick.sql (feature 070).
-- Cobre o roteiro que a feature manda conferir depois do `db push`: a coluna nasce
-- `boolean not null default false`, todas as tarefas antigas herdam `false` (nenhuma muda de
-- comportamento na agenda), as flags de 037/049/061 e a `estimated_duration` (032) ficam intactas, e
-- nada de RLS/trigger é derrubado no caminho.
do $$
declare
  n int;
  flag text;
begin
  -- ---- coluna nova ------------------------------------------------------------------------
  perform 1 from information_schema.columns
   where table_schema='public' and table_name='task' and column_name='is_quick'
     and data_type='boolean' and is_nullable='NO' and column_default like '%false%';
  if not found then
    raise exception 'FALHOU: task.is_quick deveria ser boolean not null default false';
  end if;

  -- ---- as flags das features anteriores continuam exatamente como estavam --------------------
  foreach flag in array array['is_milestone', 'is_medication', 'is_consultation']
  loop
    perform 1 from information_schema.columns
     where table_schema='public' and table_name='task' and column_name=flag
       and data_type='boolean' and is_nullable='NO' and column_default like '%false%';
    if not found then
      raise exception 'FALHOU: a migration mexeu em task.%', flag;
    end if;
  end loop;

  perform 1 from information_schema.columns
   where table_schema='public' and table_name='task' and column_name='estimated_duration'
     and is_nullable='YES';
  if not found then
    raise exception 'FALHOU: a migration mexeu em task.estimated_duration (feature 032)';
  end if;

  -- ---- tarefas antigas herdaram false, sem update nenhum ------------------------------------
  select count(*) into n from public.task where is_quick is distinct from false;
  if n <> 0 then
    raise exception 'FALHOU: % tarefa(s) pré-existente(s) não ficaram com is_quick = false', n;
  end if;

  select count(*) into n from public.task;
  if n <> 5 then
    raise exception 'FALHOU: a migration mudou a contagem de tarefas (esperadas 5, achadas %)', n;
  end if;

  -- Derivar "pontual" de duração ausente foi descartado no refino: a tarefa comum sem
  -- `estimated_duration` do seed tem que continuar não-pontual depois da migration.
  select count(*) into n from public.task where estimated_duration is null and is_quick;
  if n <> 0 then
    raise exception 'FALHOU: tarefa sem duração virou pontual sozinha (% linha(s))', n;
  end if;

  -- As flags continuam independentes e com os mesmos donos de antes.
  select count(*) into n from public.task where is_medication;
  if n <> 1 then raise exception 'FALHOU: esperada 1 medicação intacta, achadas %', n; end if;
  select count(*) into n from public.task where is_consultation;
  if n <> 1 then raise exception 'FALHOU: esperada 1 consulta intacta, achadas %', n; end if;
  select count(*) into n from public.task where estimated_duration = 60;
  if n <> 1 then raise exception 'FALHOU: a duração de 60min sumiu da tarefa com bloco'; end if;

  -- ---- comentário de coluna (documentação do contrato) --------------------------------------
  if coalesce(col_description('public.task'::regclass,
       (select ordinal_position from information_schema.columns
         where table_schema='public' and table_name='task' and column_name='is_quick')::int), '') = '' then
    raise exception 'FALHOU: falta comment on column public.task.is_quick';
  end if;

  -- ---- o que já existia continua de pé ------------------------------------------------------
  perform 1 from pg_class where oid='public.task'::regclass and relrowsecurity;
  if not found then raise exception 'FALHOU: RLS de public.task foi desligada pela migration'; end if;

  select count(*) into n from pg_policies where schemaname='public' and tablename='task';
  if n <> 4 then raise exception 'FALHOU: esperadas 4 policies em task, achadas %', n; end if;

  perform 1 from pg_trigger t join pg_proc p on p.oid = t.tgfoid
   where t.tgrelid='public.task'::regclass and t.tgname='trg_enforce_app_access'
     and p.proname='enforce_app_access' and not t.tgisinternal;
  if not found then
    raise exception 'FALHOU: trigger trg_enforce_app_access sumiu de public.task';
  end if;

  raise notice 'OK: is_quick, default nas tarefas antigas, flags 037/049/061 e duração intactas, RLS e trigger conferidos';
end $$;
