-- Stubs do ambiente Supabase que não existem num Postgres cru (mesmo formato de
-- supabase/tests/task_sort_order/00_stubs.sql).
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

-- Pré-requisito: `public.project` (feature 006) e `public.task` como as features anteriores a
-- deixaram — em especial com `external_url`/`external_provider` (feature 013), que é o dado que a
-- migration em teste copia, e SEM `public.task_external_link`. A cópia só prova alguma coisa se a
-- origem existir exatamente como em produção.
create table if not exists public.project (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.task (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.project(id) on delete cascade,
  parent_task_id uuid references public.task(id) on delete cascade,
  recurrence_origin_id uuid references public.task(id) on delete cascade,
  title text not null,
  description text,
  status text not null default 'todo'
    check (status in ('todo', 'doing', 'done')),
  tags text[] not null default '{}',
  due_date date,
  due_time time,
  priority text check (priority in ('low', 'medium', 'high')),
  recurrence_rule jsonb,
  completed_at timestamptz,
  estimated_duration integer,
  external_url text,
  external_provider text,
  is_milestone boolean not null default false,
  is_medication boolean not null default false,
  is_consultation boolean not null default false,
  is_quick boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.task enable row level security;

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

grant select, insert, update, delete on public.task to authenticated;

drop trigger if exists trg_enforce_app_access on public.task;
create trigger trg_enforce_app_access before insert or update or delete on public.task
  for each row execute function public.enforce_app_access();

-- Baseline de `wipe_own_data` como a migration anterior (20260820120000_event_invite) deixou:
-- sem `task_external_link` na lista. É o que faz a assertiva do 03 ter sentido — se a tabela nova
-- já estivesse aqui, o wipe passaria sem a migration ter feito nada.
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
  foreach t in array array['task', 'project']
  loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('delete from public.%I where user_id = $1', t) using uid;
  end loop;
end;
$$;
