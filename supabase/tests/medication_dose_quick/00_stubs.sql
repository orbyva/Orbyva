-- Stubs do ambiente Supabase que não existem num Postgres cru (mesmo formato de
-- supabase/tests/task_is_quick/00_stubs.sql).
create extension if not exists pgcrypto;

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key,
  email text
);

-- `auth.uid()` do Supabase lê o JWT; aqui lê uma GUC que os testes setam com set_config().
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
end $$;

grant usage on schema public to authenticated;
grant usage on schema auth to authenticated;

-- Gate Pro: no app real bloqueia escrita sem assinatura ativa. Aqui é no-op.
create or replace function public.enforce_app_access()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

-- ---- o schema **exatamente** como as migrations anteriores o deixam ---------------------------
-- A migration em teste (071) é um UPDATE em dado existente, então o estado de partida importa mais
-- aqui do que numa migration de schema: `public.task` já tem `icon_key`/`icon_url` (035),
-- `is_medication` (049), `medication_id`/`dose_time` (064) e `is_quick` (070). Se alguma dessas
-- faltasse no banco remoto, o `supabase db push` desta migration falharia — é por isso que a
-- tarefa "Aguarda o usuário" exige a ordem 064 → 070 → 071.
create table if not exists public.medication (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  dose_amount numeric,
  dose_unit text,
  instructions text,
  times time[] not null,
  interval_days int not null default 1,
  started_on date not null,
  ended_on date,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint medication_times_check check (coalesce(array_length(times, 1), 0) >= 1),
  constraint medication_interval_days_check check (interval_days > 0)
);

create table if not exists public.task (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  parent_task_id uuid references public.task(id) on delete cascade,
  recurrence_origin_id uuid references public.task(id) on delete cascade,
  title text not null,
  description text,
  status text not null default 'todo'
    check (status in ('todo', 'doing', 'done')),
  due_date date,
  due_time time,
  recurrence_rule jsonb,
  completed_at timestamptz,
  estimated_duration integer,
  icon_key text,
  icon_url text,
  is_milestone boolean not null default false,
  is_medication boolean not null default false,
  is_consultation boolean not null default false,
  is_quick boolean not null default false,
  medication_id uuid references public.medication(id) on delete set null,
  dose_time time,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.task enable row level security;
alter table public.medication enable row level security;

drop policy if exists task_select_own on public.task;
create policy task_select_own on public.task
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists task_insert_own on public.task;
create policy task_insert_own on public.task
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists task_update_own on public.task;
create policy task_update_own on public.task
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists task_delete_own on public.task;
create policy task_delete_own on public.task
  for delete to authenticated
  using (user_id = auth.uid());

drop policy if exists medication_select_own on public.medication;
create policy medication_select_own on public.medication
  for select to authenticated
  using (user_id = auth.uid());

grant select, insert, update, delete on public.task to authenticated;
grant select, insert, update, delete on public.medication to authenticated;

drop trigger if exists trg_enforce_app_access on public.task;
create trigger trg_enforce_app_access before insert or update or delete on public.task
  for each row execute function public.enforce_app_access();
