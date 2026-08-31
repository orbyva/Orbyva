-- Stubs do ambiente Supabase que não existem num Postgres cru
-- (mesmo formato de supabase/tests/task_is_quick/00_stubs.sql).
--
-- Diferença importante deste harness: aqui o gate Pro **não** é um no-op. A feature 076 aposta que
-- `accept_event_invite`, sendo `security definer`, deixa um convidado fora do trial aceitar o
-- convite. Provar isso exige as definições reais de `is_db_admin`/`has_app_access`/
-- `enforce_app_access` (20260723120000_app_access_enforce.sql), copiadas verbatim abaixo.
create extension if not exists pgcrypto;

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key,
  email text,
  created_at timestamptz not null default now()
);

-- `auth.uid()`/`auth.jwt()`/`auth.role()` do Supabase leem o JWT; aqui leem GUCs que os testes
-- setam com set_config().
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

create or replace function auth.jwt()
returns jsonb
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb,
    '{}'::jsonb
  );
$$;

create or replace function auth.role()
returns text
language sql
stable
as $$
  select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'authenticated');
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
grant select on auth.users to authenticated;

-- ── Gate Pro real (copiado de 20260723120000_app_access_enforce.sql) ──────────────────────────
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  plan text,
  subscription_status text,
  created_at timestamptz not null default now()
);

create or replace function public.is_db_admin()
returns boolean
language sql
stable
as $$
  select current_user in ('postgres', 'supabase_admin', 'supabase_auth_admin');
$$;

create or replace function public.has_app_access()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_plan text;
  v_status text;
  v_created timestamptz;
  v_auth_created timestamptz;
begin
  if coalesce(auth.role(), '') = 'service_role' or public.is_db_admin() then
    return true;
  end if;

  if auth.uid() is null then
    return false;
  end if;

  select p.plan, p.subscription_status, p.created_at
    into v_plan, v_status, v_created
  from public.profiles p
  where p.id = auth.uid();

  if found then
    if v_plan = 'pro' then
      return true;
    end if;
    if v_status in ('active', 'trialing') then
      return true;
    end if;
    if v_created is not null and (v_created + interval '7 days') > now() then
      return true;
    end if;
    return false;
  end if;

  select u.created_at into v_auth_created
  from auth.users u
  where u.id = auth.uid();

  if v_auth_created is not null then
    return (v_auth_created + interval '7 days') > now();
  end if;

  return false;
end;
$$;

revoke all on function public.has_app_access() from public;
grant execute on function public.has_app_access() to authenticated;

-- `enforce_app_access` real. No banco de verdade ele é `security definer` e roda com `current_user`
-- = dono da função; aqui é idêntico, então o teste mede o mesmo comportamento que o app tem.
create or replace function public.enforce_app_access()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') = 'service_role' or public.is_db_admin() then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if not public.has_app_access() then
    raise exception 'Acesso expirado. Assine o Pro para continuar.'
      using errcode = '42501';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

-- ── Schema pré-076: `project` e `project_event` como 20260806130000 os deixou ─────────────────
create table if not exists public.project (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  color text,
  created_at timestamptz not null default now()
);

-- `project_id not null` de propósito: é justamente o que a migration 20260820110000 afrouxa.
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

alter table public.project_event enable row level security;

drop policy if exists project_event_select_own on public.project_event;
create policy project_event_select_own on public.project_event
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists project_event_insert_own on public.project_event;
create policy project_event_insert_own on public.project_event
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists project_event_update_own on public.project_event;
create policy project_event_update_own on public.project_event
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists project_event_delete_own on public.project_event;
create policy project_event_delete_own on public.project_event
  for delete to authenticated
  using (user_id = auth.uid());

grant select, insert, update, delete on public.project_event to authenticated;
grant select, insert, update, delete on public.project to authenticated;

drop trigger if exists trg_enforce_app_access on public.project_event;
create trigger trg_enforce_app_access before insert or update or delete on public.project_event
  for each row execute function public.enforce_app_access();

-- Baseline de `wipe_own_data` como 20260816230000_medication.sql a deixou (sem `event_invite`).
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

grant execute on function public.wipe_own_data() to authenticated;
