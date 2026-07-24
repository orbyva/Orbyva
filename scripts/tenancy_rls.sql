-- =============================================================================
-- Orbyva — Tenancy + RLS (P0)
-- Rode no SQL Editor do Supabase DEPOIS de backup.
-- Idempotente: pode reexecutar se a tentativa anterior parou no meio.
-- =============================================================================

-- ── Helper: garante user_id + backfill + índice em tabelas existentes ────────

create or replace function public._ft_ensure_user_id(p_table text)
returns void
language plpgsql
as $$
declare
  null_count bigint;
begin
  if to_regclass('public.' || p_table) is null then
    raise notice 'Tabela public.% ausente — pulando.', p_table;
    return;
  end if;

  execute format(
    'alter table public.%I add column if not exists user_id uuid references auth.users (id) on delete cascade',
    p_table
  );

  execute format(
    'update public.%I set user_id = (select id from auth.users order by created_at asc limit 1)
     where user_id is null and exists (select 1 from auth.users)',
    p_table
  );

  execute format('select count(*) from public.%I where user_id is null', p_table)
    into null_count;

  if null_count = 0 then
    execute format('alter table public.%I alter column user_id set not null', p_table);
  else
    raise notice '% ainda tem % linha(s) sem user_id — NOT NULL não aplicado.', p_table, null_count;
  end if;

  execute format(
    'create index if not exists %I on public.%I (user_id)',
    p_table || '_user_id_idx',
    p_table
  );
end;
$$;

do $$
declare
  sole_user uuid;
begin
  select id into sole_user from auth.users order by created_at asc limit 1;
  if sole_user is null then
    raise notice 'Nenhum usuário em auth.users — backfill de user_id será ignorado.';
  else
    raise notice 'Backfill com user_id = %', sole_user;
  end if;
end $$;

-- ── Movie: user_id + PK composta (user_id, imdb_id) ──────────────────────────

select public._ft_ensure_user_id('movie');

alter table public.movie
  add column if not exists notes text;

alter table public.movie
  add column if not exists would_recommend boolean default true;

-- Troca PK imdb_id → (user_id, imdb_id) para dois usuários terem o mesmo filme
do $$
begin
  if exists (
    select 1 from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'movie'
      and constraint_type = 'PRIMARY KEY'
      and constraint_name = 'movie_pkey'
  ) then
    alter table public.movie drop constraint movie_pkey;
  end if;
exception when others then
  raise notice 'movie PK drop: %', sqlerrm;
end $$;

do $$
begin
  if not exists (select 1 from public.movie where user_id is null) then
    alter table public.movie alter column user_id set not null;
  end if;
exception when others then
  raise notice 'movie user_id not null: %', sqlerrm;
end $$;

do $$
begin
  alter table public.movie add primary key (user_id, imdb_id);
exception when others then
  raise notice 'movie PK add: %', sqlerrm;
end $$;

-- ── Finance + life + car (owner tables) ─────────────────────────────────────

select public._ft_ensure_user_id('transaction');
select public._ft_ensure_user_id('recurring_transaction');
select public._ft_ensure_user_id('monthly_budget');
select public._ft_ensure_user_id('personal_goal');
select public._ft_ensure_user_id('habit');
select public._ft_ensure_user_id('place_visit'); -- NÃO é "place"
select public._ft_ensure_user_id('trip');
select public._ft_ensure_user_id('vehicle');

-- ── Views: security_invoker para respeitar RLS das tabelas base ─────────────

do $$
begin
  execute 'alter view public.vw_monthly_budget_summary set (security_invoker = true)';
exception when others then
  raise notice 'vw_monthly_budget_summary: %', sqlerrm;
end $$;

do $$
begin
  execute 'alter view public.vw_value_by_nature_year_month set (security_invoker = true)';
exception when others then
  raise notice 'vw_value_by_nature_year_month: %', sqlerrm;
end $$;

do $$
begin
  execute 'alter view public.vw_recurring_transaction_with_nature set (security_invoker = true)';
exception when others then
  raise notice 'vw_recurring_transaction_with_nature: %', sqlerrm;
end $$;

-- ── RLS policies (owner = auth.uid()) ───────────────────────────────────────

create or replace function public.is_owner(uid uuid)
returns boolean
language sql
stable
as $$
  select uid is not null and uid = auth.uid();
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'movie',
    'transaction',
    'recurring_transaction',
    'monthly_budget',
    'personal_goal',
    'habit',
    'place_visit',
    'trip',
    'vehicle'
  ]
  loop
    if to_regclass('public.' || t) is null then
      raise notice 'RLS pulado — tabela ausente: %', t;
      continue;
    end if;

    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_select_own', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert_own', t);
    execute format('drop policy if exists %I on public.%I', t || '_update_own', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete_own', t);

    execute format(
      'create policy %I on public.%I for select to authenticated using (user_id = auth.uid())',
      t || '_select_own', t
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (user_id = auth.uid())',
      t || '_insert_own', t
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())',
      t || '_update_own', t
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using (user_id = auth.uid())',
      t || '_delete_own', t
    );
  end loop;
end $$;

-- Filhos de trip / vehicle / habit: acesso via pai
do $$
declare
  child text;
begin
  foreach child in array array[
    'trip_checklist_item',
    'trip_expense',
    'trip_itinerary_day',
    'trip_itinerary_activity',
    'trip_milestone',
    'vehicle_maintenance',
    'vehicle_fuel_log',
    'vehicle_document',
    'habit_log'
  ]
  loop
    if to_regclass('public.' || child) is null then
      continue;
    end if;
    execute format('alter table public.%I enable row level security', child);
  end loop;
end $$;

-- trip children
do $$ begin
  if to_regclass('public.trip_checklist_item') is not null then
    drop policy if exists trip_checklist_item_all_own on public.trip_checklist_item;
    create policy trip_checklist_item_all_own on public.trip_checklist_item
      for all to authenticated
      using (exists (select 1 from public.trip t where t.id = trip_id and t.user_id = auth.uid()))
      with check (exists (select 1 from public.trip t where t.id = trip_id and t.user_id = auth.uid()));
  end if;
end $$;

do $$ begin
  if to_regclass('public.trip_expense') is not null then
    drop policy if exists trip_expense_all_own on public.trip_expense;
    create policy trip_expense_all_own on public.trip_expense
      for all to authenticated
      using (exists (select 1 from public.trip t where t.id = trip_id and t.user_id = auth.uid()))
      with check (exists (select 1 from public.trip t where t.id = trip_id and t.user_id = auth.uid()));
  end if;
end $$;

do $$ begin
  if to_regclass('public.trip_itinerary_day') is not null then
    drop policy if exists trip_itinerary_day_all_own on public.trip_itinerary_day;
    create policy trip_itinerary_day_all_own on public.trip_itinerary_day
      for all to authenticated
      using (exists (select 1 from public.trip t where t.id = trip_id and t.user_id = auth.uid()))
      with check (exists (select 1 from public.trip t where t.id = trip_id and t.user_id = auth.uid()));
  end if;
end $$;

do $$ begin
  if to_regclass('public.trip_itinerary_activity') is not null then
    drop policy if exists trip_itinerary_activity_all_own on public.trip_itinerary_activity;
    create policy trip_itinerary_activity_all_own on public.trip_itinerary_activity
      for all to authenticated
      using (
        exists (
          select 1
          from public.trip_itinerary_day d
          join public.trip t on t.id = d.trip_id
          where d.id = day_id and t.user_id = auth.uid()
        )
      )
      with check (
        exists (
          select 1
          from public.trip_itinerary_day d
          join public.trip t on t.id = d.trip_id
          where d.id = day_id and t.user_id = auth.uid()
        )
      );
  end if;
end $$;

do $$ begin
  if to_regclass('public.trip_milestone') is not null then
    drop policy if exists trip_milestone_all_own on public.trip_milestone;
    create policy trip_milestone_all_own on public.trip_milestone
      for all to authenticated
      using (exists (select 1 from public.trip t where t.id = trip_id and t.user_id = auth.uid()))
      with check (exists (select 1 from public.trip t where t.id = trip_id and t.user_id = auth.uid()));
  end if;
end $$;

-- vehicle children
do $$ begin
  if to_regclass('public.vehicle_maintenance') is not null then
    drop policy if exists vehicle_maintenance_all_own on public.vehicle_maintenance;
    create policy vehicle_maintenance_all_own on public.vehicle_maintenance
      for all to authenticated
      using (exists (select 1 from public.vehicle v where v.id = vehicle_id and v.user_id = auth.uid()))
      with check (exists (select 1 from public.vehicle v where v.id = vehicle_id and v.user_id = auth.uid()));
  end if;
end $$;

do $$ begin
  if to_regclass('public.vehicle_fuel_log') is not null then
    drop policy if exists vehicle_fuel_log_all_own on public.vehicle_fuel_log;
    create policy vehicle_fuel_log_all_own on public.vehicle_fuel_log
      for all to authenticated
      using (exists (select 1 from public.vehicle v where v.id = vehicle_id and v.user_id = auth.uid()))
      with check (exists (select 1 from public.vehicle v where v.id = vehicle_id and v.user_id = auth.uid()));
  end if;
end $$;

do $$ begin
  if to_regclass('public.vehicle_document') is not null then
    drop policy if exists vehicle_document_all_own on public.vehicle_document;
    create policy vehicle_document_all_own on public.vehicle_document
      for all to authenticated
      using (exists (select 1 from public.vehicle v where v.id = vehicle_id and v.user_id = auth.uid()))
      with check (exists (select 1 from public.vehicle v where v.id = vehicle_id and v.user_id = auth.uid()));
  end if;
end $$;

-- habit_log
do $$ begin
  if to_regclass('public.habit_log') is not null then
    drop policy if exists habit_log_all_own on public.habit_log;
    create policy habit_log_all_own on public.habit_log
      for all to authenticated
      using (exists (select 1 from public.habit h where h.id = habit_id and h.user_id = auth.uid()))
      with check (exists (select 1 from public.habit h where h.id = habit_id and h.user_id = auth.uid()));
  end if;
end $$;

-- Catálogo compartilhado (nature/type/class): autenticado lê/escreve.
do $$
declare
  t text;
begin
  foreach t in array array['nature', 'type', 'class']
  loop
    if to_regclass('public.' || t) is null then
      continue;
    end if;
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_auth_all', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (true) with check (true)',
      t || '_auth_all', t
    );
  end loop;
end $$;

-- ── Wipe / delete account RPCs ───────────────────────────────────────────────

create or replace function public.wipe_own_data()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  t text;
begin
  if uid is null then
    raise exception 'Não autenticado';
  end if;

  foreach t in array array[
    'transaction',
    'recurring_transaction',
    'monthly_budget',
    'movie',
    'personal_goal',
    'habit',
    'place_visit',
    'trip',
    'vehicle'
  ]
  loop
    if to_regclass('public.' || t) is null then
      continue;
    end if;
    execute format('delete from public.%I where user_id = $1', t) using uid;
  end loop;
end;
$$;

create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Não autenticado';
  end if;

  perform public.wipe_own_data();
  delete from auth.users where id = uid;
end;
$$;

revoke all on function public.wipe_own_data() from public;
revoke all on function public.delete_own_account() from public;
grant execute on function public.wipe_own_data() to authenticated;
grant execute on function public.delete_own_account() to authenticated;

-- Limpa helper interno (opcional manter)
drop function if exists public._ft_ensure_user_id(text);

-- =============================================================================
-- Checklist pós-migração
-- 1. Login com usuário A e B; confirme que B não vê dados de A.
-- 2. Dashboard/orçamento: se views falharem, recriá-las com security_invoker.
-- 3. Conta → Excluir: testa wipe + remoção do auth.users.
-- =============================================================================
