\set ON_ERROR_STOP on

-- Assertivas de schema da migration 20260816210000_health_metric.sql (feature 063): a tabela nasce
-- com as colunas e os tipos do contrato, o check de `metric_type` recusa tipo inventado, o índice
-- de leitura do dashboard existe, a RLS está ligada com as quatro policies, o trigger do gate Pro
-- está no lugar e `wipe_own_data` passou a levar a tabela junto.
do $$
declare
  n int;
begin
  -- ---- tabela e colunas ---------------------------------------------------------------------
  if to_regclass('public.health_metric') is null then
    raise exception 'FALHOU: public.health_metric não foi criada';
  end if;

  perform 1 from information_schema.columns
   where table_schema='public' and table_name='health_metric' and column_name='user_id'
     and data_type='uuid' and is_nullable='NO';
  if not found then raise exception 'FALHOU: health_metric.user_id deveria ser uuid not null'; end if;

  perform 1 from information_schema.columns
   where table_schema='public' and table_name='health_metric' and column_name='metric_type'
     and data_type='text' and is_nullable='NO';
  if not found then raise exception 'FALHOU: health_metric.metric_type deveria ser text not null'; end if;

  perform 1 from information_schema.columns
   where table_schema='public' and table_name='health_metric' and column_name='value'
     and data_type='numeric' and is_nullable='NO';
  if not found then raise exception 'FALHOU: health_metric.value deveria ser numeric not null'; end if;

  perform 1 from information_schema.columns
   where table_schema='public' and table_name='health_metric' and column_name='recorded_date'
     and data_type='date' and is_nullable='NO';
  if not found then raise exception 'FALHOU: health_metric.recorded_date deveria ser date not null'; end if;

  -- `notes` é opcional: medição sem observação é o caso comum.
  perform 1 from information_schema.columns
   where table_schema='public' and table_name='health_metric' and column_name='notes'
     and data_type='text' and is_nullable='YES';
  if not found then raise exception 'FALHOU: health_metric.notes deveria ser text nullable'; end if;

  perform 1 from information_schema.columns
   where table_schema='public' and table_name='health_metric' and column_name='created_at'
     and is_nullable='NO' and column_default like '%now()%';
  if not found then raise exception 'FALHOU: health_metric.created_at deveria ser not null default now()'; end if;

  -- ---- FK com cascade: apagar a conta leva as medições junto ---------------------------------
  perform 1 from pg_constraint
   where conrelid='public.health_metric'::regclass and contype='f' and confdeltype='c'
     and confrelid='auth.users'::regclass;
  if not found then
    raise exception 'FALHOU: health_metric.user_id deveria referenciar auth.users on delete cascade';
  end if;

  -- ---- check de metric_type: aceita os seis tipos e recusa o resto ---------------------------
  perform 1 from pg_constraint
   where conrelid='public.health_metric'::regclass and conname='health_metric_type_check';
  if not found then raise exception 'FALHOU: health_metric_type_check não existe'; end if;

  begin
    insert into public.health_metric (user_id, metric_type, value, recorded_date) values
      ('11111111-1111-1111-1111-111111111111', 'imc', 24, '2026-08-17');
    raise exception 'FALHOU: metric_type inválido deveria ser recusado pelo check';
  exception when check_violation then null;
  end;

  -- Os seis válidos passam (e saem em seguida — este arquivo não deixa resíduo pro 04).
  insert into public.health_metric (user_id, metric_type, value, recorded_date)
  select '11111111-1111-1111-1111-111111111111', t, 1, '2026-08-17'
    from unnest(array['weight','height','waist','hip','chest','arm']) as t;
  select count(*) into n from public.health_metric;
  if n <> 6 then raise exception 'FALHOU: os 6 metric_type válidos deveriam entrar, entraram %', n; end if;
  delete from public.health_metric;

  -- ---- índice de leitura do dashboard --------------------------------------------------------
  perform 1 from pg_indexes
   where schemaname='public' and tablename='health_metric'
     and indexname='health_metric_user_type_date_idx';
  if not found then
    raise exception 'FALHOU: índice health_metric_user_type_date_idx não foi criado';
  end if;

  -- ---- documentação do contrato ---------------------------------------------------------------
  if coalesce(obj_description('public.health_metric'::regclass, 'pg_class'), '') = '' then
    raise exception 'FALHOU: falta comment on table public.health_metric';
  end if;

  -- ---- RLS + policies --------------------------------------------------------------------------
  perform 1 from pg_class where oid='public.health_metric'::regclass and relrowsecurity;
  if not found then raise exception 'FALHOU: RLS de public.health_metric não está ligada'; end if;

  select count(*) into n from pg_policies
   where schemaname='public' and tablename='health_metric';
  if n <> 4 then raise exception 'FALHOU: esperadas 4 policies em health_metric, achadas %', n; end if;

  select count(*) into n from pg_policies
   where schemaname='public' and tablename='health_metric'
     and coalesce(qual, '') || coalesce(with_check, '') like '%uid()%';
  if n <> 4 then
    raise exception 'FALHOU: % de 4 policies de health_metric não usam auth.uid() — dado de saúde não tem exceção', 4 - n;
  end if;

  -- ---- trigger do gate Pro ----------------------------------------------------------------------
  perform 1 from pg_trigger t join pg_proc p on p.oid = t.tgfoid
   where t.tgrelid='public.health_metric'::regclass and t.tgname='trg_enforce_app_access'
     and p.proname='enforce_app_access' and not t.tgisinternal;
  if not found then
    raise exception 'FALHOU: trigger trg_enforce_app_access ausente em public.health_metric';
  end if;

  -- ---- wipe_own_data passou a levar a tabela ----------------------------------------------------
  perform 1 from pg_proc where proname='wipe_own_data' and prosrc like '%health_metric%';
  if not found then
    raise exception 'FALHOU: wipe_own_data não inclui health_metric — apagar a conta deixaria dado de saúde para trás';
  end if;

  raise notice 'OK: health_metric — colunas, check de tipo, índice, RLS/policies, trigger e wipe conferidos';
end $$;
