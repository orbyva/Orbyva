-- Stubs do ambiente Supabase que não existem num Postgres cru.
-- Mesmo formato de supabase/tests/notes_core/00_stubs.sql — este harness roda a migration da 055
-- (que copia `project.notes` para `note`) antes da migration da 058 (que dropa a coluna), para
-- provar o par cópia→drop no mesmo banco.
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

-- Gate Pro: no app real bloqueia escrita sem assinatura ativa. Aqui é um no-op.
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

-- `public.project` como a feature 006 a deixou: com a coluna `notes` e o check de `status`.
create table if not exists public.project (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  status text not null default 'planned',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  alter table public.project
    add constraint project_status_check
    check (status in ('planned', 'active', 'completed', 'archived'));
exception
  when duplicate_object then null;
end $$;

alter table public.project enable row level security;

drop policy if exists project_select_own on public.project;
create policy project_select_own on public.project
  for select to authenticated using (user_id = auth.uid());
drop policy if exists project_all_own on public.project;
create policy project_all_own on public.project
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- `public.project_event`, criada pela MESMA migration da 006 que criou `project.notes`. Está aqui
-- justamente para o harness provar que o drop não a arrasta junto.
create table if not exists public.project_event (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.project(id) on delete cascade,
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.project_event enable row level security;

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

-- Baseline de `wipe_own_data` (a migration da 055 recria a função incluindo 'note').
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
  foreach t in array array['project_event', 'project']
  loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('delete from public.%I where user_id = $1', t) using uid;
  end loop;
end;
$$;
