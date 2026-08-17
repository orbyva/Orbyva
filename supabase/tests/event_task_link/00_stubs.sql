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

-- ---------------------------------------------------------------------------------------------
-- Pré-requisitos no estado PRÉ-migration da 066: `public.project` e `public.task` como as features
-- de tarefas as deixaram, e `public.project_event` exatamente como a 006 criou — com
-- `project_id uuid NOT NULL` e sem nenhuma coluna de tarefa. É esse estado que a migration precisa
-- conseguir evoluir sem perder linha legada.
-- ---------------------------------------------------------------------------------------------
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
  title text not null,
  status text not null default 'todo'
    check (status in ('todo', 'doing', 'done')),
  due_date date,
  due_time time,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.project_event (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.project(id) on delete cascade,
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists project_event_project_idx
  on public.project_event (project_id, starts_at);

alter table public.project enable row level security;
alter table public.task enable row level security;
alter table public.project_event enable row level security;

drop policy if exists project_select_own on public.project;
create policy project_select_own on public.project
  for select to authenticated using (user_id = auth.uid());
drop policy if exists project_insert_own on public.project;
create policy project_insert_own on public.project
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists project_update_own on public.project;
create policy project_update_own on public.project
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists project_delete_own on public.project;
create policy project_delete_own on public.project
  for delete to authenticated using (user_id = auth.uid());

drop policy if exists task_select_own on public.task;
create policy task_select_own on public.task
  for select to authenticated using (user_id = auth.uid());
drop policy if exists task_insert_own on public.task;
create policy task_insert_own on public.task
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists task_update_own on public.task;
create policy task_update_own on public.task
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists task_delete_own on public.task;
create policy task_delete_own on public.task
  for delete to authenticated using (user_id = auth.uid());

drop policy if exists project_event_select_own on public.project_event;
create policy project_event_select_own on public.project_event
  for select to authenticated using (user_id = auth.uid());
drop policy if exists project_event_insert_own on public.project_event;
create policy project_event_insert_own on public.project_event
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists project_event_update_own on public.project_event;
create policy project_event_update_own on public.project_event
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists project_event_delete_own on public.project_event;
create policy project_event_delete_own on public.project_event
  for delete to authenticated using (user_id = auth.uid());

grant select, insert, update, delete on public.project to authenticated;
grant select, insert, update, delete on public.task to authenticated;
grant select, insert, update, delete on public.project_event to authenticated;

drop trigger if exists trg_enforce_app_access on public.task;
create trigger trg_enforce_app_access before insert or update or delete on public.task
  for each row execute function public.enforce_app_access();

drop trigger if exists trg_enforce_app_access on public.project_event;
create trigger trg_enforce_app_access before insert or update or delete on public.project_event
  for each row execute function public.enforce_app_access();

-- `wipe_own_data` vigente (20260816230000_medication.sql), reduzido às tabelas que existem aqui —
-- com `task` ANTES de `project_event` e `project` por último, que é a ordem que faz o cascade
-- funcionar. A 066 não altera esta função de propósito: o teste é quem prova que ela continua
-- levando evento de projeto, de tarefa e avulso junto.
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
  foreach t in array array['task', 'project_event', 'project']
  loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('delete from public.%I where user_id = $1', t) using uid;
  end loop;
end;
$$;
