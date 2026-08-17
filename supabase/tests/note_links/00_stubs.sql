-- Stubs do ambiente Supabase que não existem num Postgres cru (mesmo formato de
-- supabase/tests/notes_core/00_stubs.sql).
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

-- Papéis que as policies referenciam (`to authenticated`).
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

-- Gate Pro: no app real bloqueia escrita sem assinatura ativa. Aqui é um no-op, só para o
-- `create trigger` da migration ter uma função de verdade para apontar.
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

-- Pré-requisitos: `public.project` (feature 006) e `public.note` (feature 055, migration
-- 20260816160000). A `note` é criada aqui pelo mesmo DDL da 055 — este harness valida a 056, e
-- rodar a migration da 055 inteira traria junto a cópia de project.notes, que não é o assunto.
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
drop policy if exists note_all_own on public.note;
create policy note_all_own on public.note
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Baseline de `wipe_own_data` como a 055 deixou (sem note_link — a migration recria incluindo).
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
