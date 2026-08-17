\set ON_ERROR_STOP on

-- Assertivas de schema da migration 20260816190000_task_consultation.sql (feature 061).
-- Cobre o roteiro que a feature manda conferir depois do `db push`: a coluna nasce
-- `boolean not null default false`, as tarefas antigas herdam `false` sem update, a flag de
-- medicação (049) fica intacta e nada de RLS/trigger/wipe é derrubado no caminho.
do $$
declare
  n int;
begin
  -- ---- coluna nova ------------------------------------------------------------------------
  perform 1 from information_schema.columns
   where table_schema='public' and table_name='task' and column_name='is_consultation'
     and data_type='boolean' and is_nullable='NO' and column_default like '%false%';
  if not found then
    raise exception 'FALHOU: task.is_consultation deveria ser boolean not null default false';
  end if;

  -- ---- a coluna da 049 continua exatamente como estava --------------------------------------
  perform 1 from information_schema.columns
   where table_schema='public' and table_name='task' and column_name='is_medication'
     and data_type='boolean' and is_nullable='NO' and column_default like '%false%';
  if not found then
    raise exception 'FALHOU: a migration mexeu em task.is_medication (feature 049)';
  end if;

  -- ---- tarefas antigas herdaram false, sem update nenhum ------------------------------------
  select count(*) into n from public.task where is_consultation is distinct from false;
  if n <> 0 then
    raise exception 'FALHOU: % tarefa(s) pré-existente(s) não ficaram com is_consultation = false', n;
  end if;

  -- Medicação continua medicação: a flag nova não pode ter reescrito nada.
  select count(*) into n from public.task where is_medication;
  if n <> 1 then
    raise exception 'FALHOU: esperada 1 medicação pré-existente intacta, achadas %', n;
  end if;
  select count(*) into n from public.task where is_medication and is_consultation;
  if n <> 0 then
    raise exception 'FALHOU: medicação da 049 virou consulta — as flags são independentes';
  end if;

  -- ---- comentário de coluna (documentação do contrato) --------------------------------------
  if coalesce(col_description('public.task'::regclass,
       (select ordinal_position from information_schema.columns
         where table_schema='public' and table_name='task' and column_name='is_consultation')::int), '') = '' then
    raise exception 'FALHOU: falta comment on column public.task.is_consultation';
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

  raise notice 'OK: is_consultation, default nas tarefas antigas, is_medication intacta, RLS e trigger conferidos';
end $$;
