\set ON_ERROR_STOP on

-- Assertivas de schema da migration 20260816200000_habit_is_health.sql (feature 062).
-- Cobre o que a feature manda conferir depois do `db push`: a coluna nasce
-- `boolean not null default false`, os hábitos antigos herdam `false` sem update, nada do que a
-- 20260727143000 (kind/goal) deixou é tocado, o índice parcial existe e RLS/trigger/logs continuam
-- de pé.
do $$
declare
  n int;
begin
  -- ---- coluna nova ------------------------------------------------------------------------
  perform 1 from information_schema.columns
   where table_schema='public' and table_name='habit' and column_name='is_health'
     and data_type='boolean' and is_nullable='NO' and column_default like '%false%';
  if not found then
    raise exception 'FALHOU: habit.is_health deveria ser boolean not null default false';
  end if;

  -- ---- as colunas da 20260727143000 continuam exatamente como estavam ----------------------
  perform 1 from information_schema.columns
   where table_schema='public' and table_name='habit' and column_name='kind'
     and is_nullable='NO';
  if not found then raise exception 'FALHOU: a migration mexeu em habit.kind'; end if;

  perform 1 from information_schema.columns
   where table_schema='public' and table_name='habit' and column_name='goal_id';
  if not found then raise exception 'FALHOU: a migration mexeu em habit.goal_id'; end if;

  perform 1 from pg_constraint
   where conrelid='public.habit'::regclass and conname='habit_kind_check';
  if not found then raise exception 'FALHOU: habit_kind_check sumiu'; end if;

  -- ---- hábitos antigos herdaram false, sem update nenhum -----------------------------------
  select count(*) into n from public.habit where is_health is distinct from false;
  if n <> 0 then
    raise exception 'FALHOU: % hábito(s) pré-existente(s) não ficaram com is_health = false', n;
  end if;

  select count(*) into n from public.habit;
  if n <> 3 then
    raise exception 'FALHOU: esperados 3 hábitos pré-existentes intactos, achados %', n;
  end if;

  -- O vínculo com meta e o anti-hábito continuam como estavam: a flag nova não reescreveu nada.
  select count(*) into n from public.habit
   where goal_id = '99999999-0000-0000-0000-000000000001' and goal_increment = 1;
  if n <> 1 then raise exception 'FALHOU: vínculo hábito↔meta perdido pela migration'; end if;

  select count(*) into n from public.habit where kind = 'avoid';
  if n <> 1 then raise exception 'FALHOU: anti-hábito pré-existente alterado pela migration'; end if;

  -- Check-ins antigos continuam lá (o histórico é o que dá streak).
  select count(*) into n from public.habit_log where completed;
  if n <> 3 then raise exception 'FALHOU: esperados 3 check-ins pré-existentes, achados %', n; end if;

  -- ---- comentário de coluna (documentação do contrato) --------------------------------------
  if coalesce(col_description('public.habit'::regclass,
       (select ordinal_position from information_schema.columns
         where table_schema='public' and table_name='habit' and column_name='is_health')::int), '') = '' then
    raise exception 'FALHOU: falta comment on column public.habit.is_health';
  end if;

  -- ---- índice parcial que o dashboard usa ---------------------------------------------------
  perform 1 from pg_indexes
   where schemaname='public' and tablename='habit' and indexname='habit_user_health_idx';
  if not found then
    raise exception 'FALHOU: índice parcial habit_user_health_idx não foi criado';
  end if;

  -- ---- o que já existia continua de pé ------------------------------------------------------
  perform 1 from pg_class where oid='public.habit'::regclass and relrowsecurity;
  if not found then raise exception 'FALHOU: RLS de public.habit foi desligada pela migration'; end if;

  perform 1 from pg_class where oid='public.habit_log'::regclass and relrowsecurity;
  if not found then raise exception 'FALHOU: RLS de public.habit_log foi desligada pela migration'; end if;

  select count(*) into n from pg_policies where schemaname='public' and tablename='habit';
  if n <> 4 then raise exception 'FALHOU: esperadas 4 policies em habit, achadas %', n; end if;

  select count(*) into n from pg_policies where schemaname='public' and tablename='habit_log';
  if n <> 1 then raise exception 'FALHOU: esperada 1 policy em habit_log, achadas %', n; end if;

  perform 1 from pg_trigger t join pg_proc p on p.oid = t.tgfoid
   where t.tgrelid='public.habit'::regclass and t.tgname='trg_enforce_app_access'
     and p.proname='enforce_app_access' and not t.tgisinternal;
  if not found then
    raise exception 'FALHOU: trigger trg_enforce_app_access sumiu de public.habit';
  end if;

  raise notice 'OK: is_health, default nos hábitos antigos, kind/goal intactos, índice, RLS e trigger conferidos';
end $$;
