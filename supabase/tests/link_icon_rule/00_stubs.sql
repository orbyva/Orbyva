-- Stubs do ambiente Supabase que não existem num Postgres cru (mesmo formato de
-- supabase/tests/task_external_links/00_stubs.sql).
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

-- Pré-requisito: `public.icon_asset` como a migration anterior (20260823110000_icon_asset, feature
-- 086) a deixou. Não há FK entre as duas tabelas — `link_icon_rule.icon_url` guarda a URL, não o id
-- —, mas a biblioteca precisa existir aqui por dois motivos: é dela que sai o `icon_url` real de
-- uma regra, e é ela quem prova, no wipe, que a migration **acrescentou** `link_icon_rule` à lista
-- em vez de reescrevê-la perdendo o que já estava lá.
create table if not exists public.icon_asset (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  url text not null,
  created_at timestamptz not null default now(),
  constraint icon_asset_unique_url unique (user_id, url)
);

alter table public.icon_asset enable row level security;

drop policy if exists icon_asset_select_own on public.icon_asset;
create policy icon_asset_select_own on public.icon_asset
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists icon_asset_insert_own on public.icon_asset;
create policy icon_asset_insert_own on public.icon_asset
  for insert to authenticated
  with check (user_id = auth.uid());

grant select, insert, update, delete on public.icon_asset to authenticated;

-- Baseline de `wipe_own_data` como a migration anterior (20260823110000_icon_asset) deixou:
-- **sem** `link_icon_rule` na lista. É o que faz o controle negativo do run.sh e a assertiva do 03
-- terem sentido — se a tabela nova já estivesse aqui, o wipe passaria sem a migration ter feito
-- nada.
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
  foreach t in array array['task_external_link', 'task', 'icon_asset', 'project']
  loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('delete from public.%I where user_id = $1', t) using uid;
  end loop;
end;
$$;
