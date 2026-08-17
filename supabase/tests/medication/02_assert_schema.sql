\set ON_ERROR_STOP on

-- Assertivas de schema da migration 20260816230000_medication.sql (feature 064): a tabela nasce
-- com as colunas e os tipos do contrato, os checks recusam `times` vazio e `interval_days` zero,
-- o índice de leitura existe, a RLS está ligada com as quatro policies por `auth.uid()`, o trigger
-- do gate Pro está no lugar, `wipe_own_data` passou a levar a tabela junto (depois de `task`), e
-- `public.task` ganhou `medication_id` (com `on delete set null`) + `dose_time`.
do $$
declare
  n int;
  pos_task int;
  pos_med int;
  src text;
begin
  -- ---- tabela e colunas ---------------------------------------------------------------------
  if to_regclass('public.medication') is null then
    raise exception 'FALHOU: public.medication não foi criada';
  end if;

  perform 1 from information_schema.columns
   where table_schema='public' and table_name='medication' and column_name='user_id'
     and data_type='uuid' and is_nullable='NO';
  if not found then raise exception 'FALHOU: medication.user_id deveria ser uuid not null'; end if;

  perform 1 from information_schema.columns
   where table_schema='public' and table_name='medication' and column_name='name'
     and data_type='text' and is_nullable='NO';
  if not found then raise exception 'FALHOU: medication.name deveria ser text not null'; end if;

  perform 1 from information_schema.columns
   where table_schema='public' and table_name='medication' and column_name='dose_amount'
     and data_type='numeric' and is_nullable='YES';
  if not found then raise exception 'FALHOU: medication.dose_amount deveria ser numeric nullable'; end if;

  perform 1 from information_schema.columns
   where table_schema='public' and table_name='medication' and column_name='dose_unit'
     and data_type='text' and is_nullable='YES';
  if not found then raise exception 'FALHOU: medication.dose_unit deveria ser text nullable'; end if;

  perform 1 from information_schema.columns
   where table_schema='public' and table_name='medication' and column_name='instructions'
     and data_type='text' and is_nullable='YES';
  if not found then raise exception 'FALHOU: medication.instructions deveria ser text nullable'; end if;

  -- O coração da feature: N horários por dia. `time[]` (ARRAY de time without time zone).
  perform 1 from information_schema.columns
   where table_schema='public' and table_name='medication' and column_name='times'
     and data_type='ARRAY' and udt_name='_time' and is_nullable='NO';
  if not found then raise exception 'FALHOU: medication.times deveria ser time[] not null'; end if;

  perform 1 from information_schema.columns
   where table_schema='public' and table_name='medication' and column_name='interval_days'
     and data_type='integer' and is_nullable='NO' and column_default like '%1%';
  if not found then raise exception 'FALHOU: medication.interval_days deveria ser int not null default 1'; end if;

  perform 1 from information_schema.columns
   where table_schema='public' and table_name='medication' and column_name='started_on'
     and data_type='date' and is_nullable='NO';
  if not found then raise exception 'FALHOU: medication.started_on deveria ser date not null'; end if;

  perform 1 from information_schema.columns
   where table_schema='public' and table_name='medication' and column_name='ended_on'
     and data_type='date' and is_nullable='YES';
  if not found then raise exception 'FALHOU: medication.ended_on deveria ser date nullable'; end if;

  perform 1 from information_schema.columns
   where table_schema='public' and table_name='medication' and column_name='active'
     and data_type='boolean' and is_nullable='NO' and column_default like '%true%';
  if not found then raise exception 'FALHOU: medication.active deveria ser boolean not null default true'; end if;

  perform 1 from information_schema.columns
   where table_schema='public' and table_name='medication' and column_name='created_at'
     and is_nullable='NO' and column_default like '%now()%';
  if not found then raise exception 'FALHOU: medication.created_at deveria ser not null default now()'; end if;

  -- ---- FK com cascade: apagar a conta leva os tratamentos junto -------------------------------
  perform 1 from pg_constraint
   where conrelid='public.medication'::regclass and contype='f' and confdeltype='c'
     and confrelid='auth.users'::regclass;
  if not found then
    raise exception 'FALHOU: medication.user_id deveria referenciar auth.users on delete cascade';
  end if;

  -- ---- checks ---------------------------------------------------------------------------------
  perform 1 from pg_constraint
   where conrelid='public.medication'::regclass and conname='medication_times_check';
  if not found then raise exception 'FALHOU: medication_times_check não existe'; end if;

  begin
    insert into public.medication (user_id, name, times, started_on) values
      ('11111111-1111-1111-1111-111111111111', 'Vazia', array[]::time[], '2026-08-17');
    raise exception 'FALHOU: medication sem nenhum horário deveria ser recusada pelo check';
  exception when check_violation then null;
  end;

  begin
    insert into public.medication (user_id, name, times, interval_days, started_on) values
      ('11111111-1111-1111-1111-111111111111', 'Zero', array['08:00'::time], 0, '2026-08-17');
    raise exception 'FALHOU: interval_days = 0 deveria ser recusado pelo check';
  exception when check_violation then null;
  end;

  -- Múltiplos horários no mesmo tratamento entram (é o gap que a 049 não cobria) — e saem em
  -- seguida: este arquivo não deixa resíduo pro backfill nem pro teste de RLS.
  insert into public.medication (user_id, name, dose_amount, dose_unit, times, started_on) values
    ('11111111-1111-1111-1111-111111111111', 'Losartana', 2, 'comprimidos',
     array['08:00'::time, '20:00'::time], '2026-08-17');
  select array_length(times, 1) into n from public.medication where name = 'Losartana';
  if n <> 2 then raise exception 'FALHOU: times deveria guardar 2 horários, guardou %', n; end if;
  delete from public.medication where name = 'Losartana';

  -- ---- índice ---------------------------------------------------------------------------------
  perform 1 from pg_indexes
   where schemaname='public' and tablename='medication' and indexname='medication_user_active_idx';
  if not found then
    raise exception 'FALHOU: índice medication_user_active_idx não foi criado';
  end if;

  -- ---- documentação do contrato ---------------------------------------------------------------
  if coalesce(obj_description('public.medication'::regclass, 'pg_class'), '') = '' then
    raise exception 'FALHOU: falta comment on table public.medication';
  end if;

  -- ---- RLS + policies --------------------------------------------------------------------------
  perform 1 from pg_class where oid='public.medication'::regclass and relrowsecurity;
  if not found then raise exception 'FALHOU: RLS de public.medication não está ligada'; end if;

  select count(*) into n from pg_policies
   where schemaname='public' and tablename='medication';
  if n <> 4 then raise exception 'FALHOU: esperadas 4 policies em medication, achadas %', n; end if;

  select count(*) into n from pg_policies
   where schemaname='public' and tablename='medication'
     and coalesce(qual, '') || coalesce(with_check, '') like '%uid()%';
  if n <> 4 then
    raise exception 'FALHOU: % de 4 policies de medication não usam auth.uid() — dado de saúde não tem exceção', 4 - n;
  end if;

  -- ---- trigger do gate Pro ----------------------------------------------------------------------
  perform 1 from pg_trigger t join pg_proc p on p.oid = t.tgfoid
   where t.tgrelid='public.medication'::regclass and t.tgname='trg_enforce_app_access'
     and p.proname='enforce_app_access' and not t.tgisinternal;
  if not found then
    raise exception 'FALHOU: trigger trg_enforce_app_access ausente em public.medication';
  end if;

  -- ---- wipe_own_data: leva a tabela, e depois de `task` ------------------------------------------
  select prosrc into src from pg_proc where proname='wipe_own_data';
  if src not like '%medication%' then
    raise exception 'FALHOU: wipe_own_data não inclui medication — apagar a conta deixaria tratamento para trás';
  end if;
  if src not like '%health_metric%' then
    raise exception 'FALHOU: wipe_own_data perdeu health_metric (a 064 reescreveu a lista da 063 por cima)';
  end if;
  -- Ordem de FK: a dose (task) é filha do tratamento (medication_id), então tem de sair antes.
  pos_task := position(E'\'task\'' in src);
  pos_med  := position(E'\'medication\'' in src);
  if pos_task = 0 or pos_med = 0 or pos_task > pos_med then
    raise exception 'FALHOU: wipe_own_data deveria apagar task (pos %) antes de medication (pos %)',
      pos_task, pos_med;
  end if;

  -- ---- o lado da dose, em public.task ------------------------------------------------------------
  perform 1 from information_schema.columns
   where table_schema='public' and table_name='task' and column_name='medication_id'
     and data_type='uuid' and is_nullable='YES';
  if not found then raise exception 'FALHOU: task.medication_id deveria ser uuid nullable'; end if;

  perform 1 from information_schema.columns
   where table_schema='public' and table_name='task' and column_name='dose_time'
     and udt_name='time' and is_nullable='YES';
  if not found then raise exception 'FALHOU: task.dose_time deveria ser time nullable'; end if;

  -- `set null` (confdeltype 'n'): apagar o tratamento não pode evaporar o histórico de doses.
  perform 1 from pg_constraint
   where conrelid='public.task'::regclass and contype='f'
     and confrelid='public.medication'::regclass and confdeltype='n';
  if not found then
    raise exception 'FALHOU: task.medication_id deveria referenciar medication on delete set null';
  end if;

  perform 1 from pg_indexes
   where schemaname='public' and tablename='task' and indexname='task_medication_due_idx';
  if not found then raise exception 'FALHOU: índice task_medication_due_idx não foi criado'; end if;

  raise notice 'OK: medication — colunas, checks, índice, RLS/policies, trigger, wipe e o lado da dose em task conferidos';
end $$;
