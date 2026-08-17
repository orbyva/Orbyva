\set ON_ERROR_STOP on

-- Controles negativos da migration de `reminder_preference`: mesma ideia de
-- `03_negative_controls.sql` — sabotar o banco e exigir que a assertiva de
-- `05_assert_reminder_schema.sql` acuse. Cada sabotagem vive num sub-bloco que termina em exceção,
-- o que desfaz o DDL/DML pelo savepoint implícito.

-- ---- 1. unique removido: o upsert perderia o alvo e a assertiva tem que acusar ----------------
do $$
begin
  begin
    alter table public.reminder_preference drop constraint reminder_preference_user_entity_key;
    perform 1 from pg_constraint
     where conrelid='public.reminder_preference'::regclass
       and conname='reminder_preference_user_entity_key' and contype='u';
    if not found then raise exception 'CONTROLE OK'; end if;
    raise exception 'CONTROLE NEGATIVO FALHOU: 05 passaria sem o unique (user_id, entity_type)';
  exception when others then
    if sqlerrm <> 'CONTROLE OK' then raise; end if;
  end;
end $$;

-- ---- 2. check de entity_type removido ---------------------------------------------------------
do $$
begin
  begin
    alter table public.reminder_preference drop constraint reminder_preference_entity_type_check;
    begin
      insert into public.reminder_preference (user_id, entity_type) values
        ('11111111-1111-1111-1111-111111111111', 'sono');
      raise exception 'CONTROLE OK';
    exception when check_violation then
      raise exception 'CONTROLE NEGATIVO FALHOU: check de entity_type ainda barrou depois de removido';
    end;
  exception when others then
    if sqlerrm <> 'CONTROLE OK' then raise; end if;
  end;
end $$;

-- ---- 3. check de frequency removido -----------------------------------------------------------
do $$
begin
  begin
    alter table public.reminder_preference drop constraint reminder_preference_frequency_check;
    begin
      insert into public.reminder_preference (user_id, entity_type, frequency) values
        ('11111111-1111-1111-1111-111111111111', 'water', 'hourly');
      raise exception 'CONTROLE OK';
    exception when check_violation then
      raise exception 'CONTROLE NEGATIVO FALHOU: check de frequency ainda barrou depois de removido';
    end;
  exception when others then
    if sqlerrm <> 'CONTROLE OK' then raise; end if;
  end;
end $$;

-- ---- 4. default de `enabled` invertido: a assertiva do default tem que acusar ------------------
do $$
begin
  begin
    alter table public.reminder_preference alter column enabled set default false;
    perform 1 from information_schema.columns
     where table_schema='public' and table_name='reminder_preference' and column_name='enabled'
       and column_default like '%true%';
    if not found then raise exception 'CONTROLE OK'; end if;
    raise exception 'CONTROLE NEGATIVO FALHOU: 05 aceitaria enabled default false';
  exception when others then
    if sqlerrm <> 'CONTROLE OK' then raise; end if;
  end;
end $$;

-- ---- 5. policy frouxa (using true): dado sensível não pode passar ------------------------------
do $$
declare n int;
begin
  begin
    drop policy reminder_preference_select_own on public.reminder_preference;
    create policy reminder_preference_select_own on public.reminder_preference
      for select to authenticated using (true);
    select count(*) into n from pg_policies
     where schemaname='public' and tablename='reminder_preference'
       and coalesce(qual, '') || coalesce(with_check, '') like '%uid()%';
    if n <> 4 then raise exception 'CONTROLE OK'; end if;
    raise exception 'CONTROLE NEGATIVO FALHOU: 05 aceitaria uma policy using (true)';
  exception when others then
    if sqlerrm <> 'CONTROLE OK' then raise; end if;
  end;
end $$;

-- ---- 6. wipe_own_data sem reminder_preference -------------------------------------------------
do $$
begin
  begin
    create or replace function public.wipe_own_data()
    returns void language plpgsql security definer set search_path = public
    as $f$ begin perform 1; end; $f$;
    perform 1 from pg_proc where proname='wipe_own_data' and prosrc like '%reminder_preference%';
    if not found then raise exception 'CONTROLE OK'; end if;
    raise exception 'CONTROLE NEGATIVO FALHOU: 05 passaria com wipe_own_data sem reminder_preference';
  exception when others then
    if sqlerrm <> 'CONTROLE OK' then raise; end if;
  end;
end $$;

-- ---- estado real restaurado depois das sabotagens ---------------------------------------------
do $$
declare n int;
begin
  perform 1 from pg_constraint
   where conrelid='public.reminder_preference'::regclass
     and conname='reminder_preference_user_entity_key';
  if not found then raise exception 'FALHOU: controle negativo deixou o unique removido'; end if;

  select count(*) into n from pg_constraint
   where conrelid='public.reminder_preference'::regclass and contype='c'
     and conname in ('reminder_preference_entity_type_check', 'reminder_preference_frequency_check');
  if n <> 2 then raise exception 'FALHOU: controle negativo deixou % de 2 checks', n; end if;

  select count(*) into n from pg_policies
   where schemaname='public' and tablename='reminder_preference'
     and coalesce(qual, '') || coalesce(with_check, '') like '%uid()%';
  if n <> 4 then raise exception 'FALHOU: controle negativo deixou % policy(s) por user_id', n; end if;

  perform 1 from pg_proc where proname='wipe_own_data' and prosrc like '%reminder_preference%';
  if not found then raise exception 'FALHOU: controle negativo deixou wipe_own_data sem a tabela'; end if;

  select count(*) into n from public.reminder_preference;
  if n <> 0 then raise exception 'FALHOU: controle negativo deixou % linha(s) na tabela', n; end if;

  raise notice 'OK: 6 controles negativos de reminder_preference acusaram a sabotagem e o estado real foi restaurado';
end $$;
