\set ON_ERROR_STOP on

-- Assertivas de schema da migration 20260816220000_reminder_preference.sql (feature 063): colunas e
-- defaults do contrato, os dois checks (`entity_type` e `frequency`), o unique que o upsert do app
-- usa como alvo, RLS com as quatro policies por `auth.uid()`, trigger do gate Pro e `wipe_own_data`
-- levando também esta tabela — sem perder `health_metric`, que a migration anterior tinha incluído.
do $$
declare
  n int;
  pref_id uuid;
begin
  if to_regclass('public.reminder_preference') is null then
    raise exception 'FALHOU: public.reminder_preference não foi criada';
  end if;

  -- ---- colunas e defaults ---------------------------------------------------------------------
  perform 1 from information_schema.columns
   where table_schema='public' and table_name='reminder_preference' and column_name='user_id'
     and data_type='uuid' and is_nullable='NO';
  if not found then raise exception 'FALHOU: reminder_preference.user_id deveria ser uuid not null'; end if;

  perform 1 from information_schema.columns
   where table_schema='public' and table_name='reminder_preference' and column_name='entity_type'
     and data_type='text' and is_nullable='NO';
  if not found then raise exception 'FALHOU: reminder_preference.entity_type deveria ser text not null'; end if;

  perform 1 from information_schema.columns
   where table_schema='public' and table_name='reminder_preference' and column_name='frequency'
     and data_type='text' and is_nullable='NO' and column_default like '%daily%';
  if not found then
    raise exception 'FALHOU: reminder_preference.frequency deveria ser text not null default ''daily''';
  end if;

  -- `time_of_day` nulo é caso legítimo (cai no padrão do cliente), então tem de ser nullable.
  perform 1 from information_schema.columns
   where table_schema='public' and table_name='reminder_preference' and column_name='time_of_day'
     and data_type like 'time%' and is_nullable='YES';
  if not found then raise exception 'FALHOU: reminder_preference.time_of_day deveria ser time nullable'; end if;

  perform 1 from information_schema.columns
   where table_schema='public' and table_name='reminder_preference' and column_name='enabled'
     and data_type='boolean' and is_nullable='NO' and column_default like '%true%';
  if not found then
    raise exception 'FALHOU: reminder_preference.enabled deveria ser boolean not null default true';
  end if;

  -- `last_notified_at` nulo = nunca notificado; é o estado inicial de toda preferência.
  perform 1 from information_schema.columns
   where table_schema='public' and table_name='reminder_preference'
     and column_name='last_notified_at' and is_nullable='YES'
     and data_type like 'timestamp%';
  if not found then
    raise exception 'FALHOU: reminder_preference.last_notified_at deveria ser timestamptz nullable';
  end if;

  perform 1 from pg_constraint
   where conrelid='public.reminder_preference'::regclass and contype='f' and confdeltype='c'
     and confrelid='auth.users'::regclass;
  if not found then
    raise exception 'FALHOU: reminder_preference.user_id deveria referenciar auth.users on delete cascade';
  end if;

  -- ---- defaults valendo na prática: linha mínima nasce ligada, diária e nunca notificada -------
  insert into public.reminder_preference (user_id, entity_type)
  values ('11111111-1111-1111-1111-111111111111', 'water')
  returning id into pref_id;

  perform 1 from public.reminder_preference
   where id = pref_id and enabled and frequency = 'daily'
     and time_of_day is null and last_notified_at is null;
  if not found then
    raise exception 'FALHOU: preferência mínima deveria nascer enabled/daily/sem horário/nunca notificada';
  end if;

  -- ---- checks: tipo e frequência inventados são recusados --------------------------------------
  begin
    insert into public.reminder_preference (user_id, entity_type) values
      ('11111111-1111-1111-1111-111111111111', 'sono');
    raise exception 'FALHOU: entity_type inválido deveria ser recusado pelo check';
  exception when check_violation then null;
  end;

  begin
    insert into public.reminder_preference (user_id, entity_type, frequency) values
      ('11111111-1111-1111-1111-111111111111', 'nutrition', 'hourly');
    raise exception 'FALHOU: frequency inválida deveria ser recusada pelo check';
  exception when check_violation then null;
  end;

  -- Os cinco entity_type válidos entram (o de água já entrou acima).
  insert into public.reminder_preference (user_id, entity_type)
  select '11111111-1111-1111-1111-111111111111', t
    from unnest(array['medication','consultation','nutrition','body_metric']) as t;
  select count(*) into n from public.reminder_preference;
  if n <> 5 then raise exception 'FALHOU: os 5 entity_type válidos deveriam entrar, entraram %', n; end if;

  -- ---- unique (user_id, entity_type): alvo do upsert -------------------------------------------
  perform 1 from pg_constraint
   where conrelid='public.reminder_preference'::regclass
     and conname='reminder_preference_user_entity_key' and contype='u';
  if not found then
    raise exception 'FALHOU: unique (user_id, entity_type) não existe — o upsert do app não teria alvo';
  end if;

  begin
    insert into public.reminder_preference (user_id, entity_type) values
      ('11111111-1111-1111-1111-111111111111', 'water');
    raise exception 'FALHOU: segunda preferência de água do mesmo usuário deveria violar o unique';
  exception when unique_violation then null;
  end;

  -- O upsert de verdade (on conflict) atualiza a linha existente em vez de duplicar.
  insert into public.reminder_preference (user_id, entity_type, frequency, time_of_day, enabled)
  values ('11111111-1111-1111-1111-111111111111', 'water', 'weekly', '08:30', false)
  on conflict (user_id, entity_type) do update
    set frequency = excluded.frequency,
        time_of_day = excluded.time_of_day,
        enabled = excluded.enabled;

  select count(*) into n from public.reminder_preference
   where entity_type = 'water' and frequency = 'weekly'
     and time_of_day = '08:30'::time and not enabled;
  if n <> 1 then raise exception 'FALHOU: upsert por (user_id, entity_type) não atualizou a linha (% linha(s))', n; end if;

  select count(*) into n from public.reminder_preference;
  if n <> 5 then raise exception 'FALHOU: o upsert duplicou preferências (% linhas)', n; end if;

  -- Outro usuário pode ter a preferência do mesmo tipo: o unique é por (user_id, entity_type).
  insert into public.reminder_preference (user_id, entity_type) values
    ('22222222-2222-2222-2222-222222222222', 'water');

  delete from public.reminder_preference;

  -- ---- documentação, RLS, policies, trigger ----------------------------------------------------
  if coalesce(obj_description('public.reminder_preference'::regclass, 'pg_class'), '') = '' then
    raise exception 'FALHOU: falta comment on table public.reminder_preference';
  end if;

  perform 1 from pg_class where oid='public.reminder_preference'::regclass and relrowsecurity;
  if not found then raise exception 'FALHOU: RLS de public.reminder_preference não está ligada'; end if;

  select count(*) into n from pg_policies
   where schemaname='public' and tablename='reminder_preference';
  if n <> 4 then raise exception 'FALHOU: esperadas 4 policies em reminder_preference, achadas %', n; end if;

  select count(*) into n from pg_policies
   where schemaname='public' and tablename='reminder_preference'
     and coalesce(qual, '') || coalesce(with_check, '') like '%uid()%';
  if n <> 4 then
    raise exception 'FALHOU: % de 4 policies de reminder_preference não usam auth.uid()', 4 - n;
  end if;

  perform 1 from pg_trigger t join pg_proc p on p.oid = t.tgfoid
   where t.tgrelid='public.reminder_preference'::regclass and t.tgname='trg_enforce_app_access'
     and p.proname='enforce_app_access' and not t.tgisinternal;
  if not found then
    raise exception 'FALHOU: trigger trg_enforce_app_access ausente em public.reminder_preference';
  end if;

  -- ---- wipe_own_data leva as duas tabelas da 063 ------------------------------------------------
  perform 1 from pg_proc where proname='wipe_own_data' and prosrc like '%reminder_preference%';
  if not found then
    raise exception 'FALHOU: wipe_own_data não inclui reminder_preference';
  end if;

  perform 1 from pg_proc where proname='wipe_own_data' and prosrc like '%health_metric%';
  if not found then
    raise exception 'FALHOU: a migration de reminder_preference derrubou health_metric do wipe_own_data';
  end if;

  raise notice 'OK: reminder_preference — colunas/defaults, checks, unique+upsert, RLS/policies, trigger e wipe conferidos';
end $$;
