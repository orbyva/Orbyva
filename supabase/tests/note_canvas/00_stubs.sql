-- Stubs do ambiente Supabase que não existem num Postgres cru (mesmo formato de
-- supabase/tests/note_links/00_stubs.sql).
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

-- Pré-requisito: `public.project` (feature 006) e `public.note` como a 055 a deixou. A migration
-- em teste (058) só acrescenta colunas, então a `note` precisa existir exatamente com o schema
-- anterior — é isso que prova que o `add column ... default` não exige update nas linhas velhas.
create table if not exists public.project (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.note (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.project(id) on delete set null,
  title text not null,
  content text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.note enable row level security;
drop policy if exists note_select_own on public.note;
create policy note_select_own on public.note
  for select to authenticated using (user_id = auth.uid());
drop policy if exists note_insert_own on public.note;
create policy note_insert_own on public.note
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists note_update_own on public.note;
create policy note_update_own on public.note
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists note_delete_own on public.note;
create policy note_delete_own on public.note
  for delete to authenticated using (user_id = auth.uid());

grant select, insert, update, delete on public.note to authenticated;

drop trigger if exists trg_enforce_app_access on public.note;
create trigger trg_enforce_app_access before insert or update or delete on public.note
  for each row execute function public.enforce_app_access();

-- Baseline de `wipe_own_data` como a 055/056 deixaram.
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
  foreach t in array array['note', 'project']
  loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('delete from public.%I where user_id = $1', t) using uid;
  end loop;
end;
$$;
