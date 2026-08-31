-- Stubs do ambiente Supabase que não existem num Postgres cru (mesmo formato de
-- supabase/tests/task_consultation/00_stubs.sql).
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

-- Pré-requisito: `public.habit` e `public.habit_log` exatamente como as migrations anteriores as
-- deixaram — baseline (20240101000050) + `user_id` da tenancy (20240101000100) + `kind`/`goal_id`/
-- `goal_increment` da 20260727143000, e SEM `is_health`. A migration em teste (062) só acrescenta
-- uma coluna, então é este schema anterior que prova que o `add column ... not null default false`
-- não exige update nas linhas velhas nem mexe no que já existia.
create table if not exists public.personal_goal (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  status text not null default 'active',
  current_value numeric not null default 0,
  target_value numeric not null default 1,
  created_at timestamptz not null default now()
);

create table if not exists public.habit (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  name            text not null,
  description     text,
  frequency       text not null default 'daily',
  target_per_week integer not null default 1,
  kind            text not null default 'build',
  goal_id         uuid references public.personal_goal(id) on delete set null,
  goal_increment  numeric,
  color           text,
  created_at      timestamptz not null default now(),
  constraint habit_kind_check check (kind in ('build', 'avoid'))
);

create table if not exists public.habit_log (
  id         uuid primary key default gen_random_uuid(),
  habit_id   uuid not null references public.habit (id) on delete cascade,
  date       date not null,
  completed  boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.habit enable row level security;
alter table public.habit_log enable row level security;

drop policy if exists habit_select_own on public.habit;
create policy habit_select_own on public.habit
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists habit_insert_own on public.habit;
create policy habit_insert_own on public.habit
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists habit_update_own on public.habit;
create policy habit_update_own on public.habit
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists habit_delete_own on public.habit;
create policy habit_delete_own on public.habit
  for delete to authenticated
  using (user_id = auth.uid());

-- `habit_log` não tem `user_id`: o escopo vem do dono do hábito (20240101000100).
drop policy if exists habit_log_all_own on public.habit_log;
create policy habit_log_all_own on public.habit_log
  for all to authenticated
  using (exists (select 1 from public.habit h where h.id = habit_id and h.user_id = auth.uid()))
  with check (exists (select 1 from public.habit h where h.id = habit_id and h.user_id = auth.uid()));

grant select, insert, update, delete on public.habit to authenticated;
grant select, insert, update, delete on public.habit_log to authenticated;
grant select, insert, update, delete on public.personal_goal to authenticated;

drop trigger if exists trg_enforce_app_access on public.habit;
create trigger trg_enforce_app_access before insert or update or delete on public.habit
  for each row execute function public.enforce_app_access();

drop trigger if exists trg_enforce_app_access on public.habit_log;
create trigger trg_enforce_app_access before insert or update or delete on public.habit_log
  for each row execute function public.enforce_app_access();

-- Baseline de `wipe_own_data` como a tenancy deixou: apaga `habit` do dono, e `habit_log` vai junto
-- pelo `on delete cascade`.
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
  foreach t in array array['habit', 'personal_goal']
  loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('delete from public.%I where user_id = $1', t) using uid;
  end loop;
end;
$$;
