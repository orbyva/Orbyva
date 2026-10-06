-- Stubs do ambiente Supabase que não existem num Postgres cru (mesmo formato de
-- supabase/tests/link_icon_rule/00_stubs.sql).
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

-- Pré-requisito: `public.icon_asset` como a feature 086 a deixou. Não há FK entre as duas tabelas
-- (`event_type_icon.icon_url` guarda a URL, não o id — é o que faz excluir o ícone da biblioteca
-- não apagar o ícone do tipo), mas a biblioteca precisa existir aqui por dois motivos: é dela que
-- sai a `icon_url` real de um tipo, e é ela quem prova, no wipe, que a migration **acrescentou**
-- `event_type_icon` à lista em vez de reescrevê-la perdendo o que já estava lá.
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

-- Baseline de `wipe_own_data` **sem** `event_type_icon` na lista, e com `icon_asset`/`link_icon_rule`
-- já lá. É o que faz o controle negativo do run.sh ter sentido (se a tabela nova já estivesse aqui,
-- o wipe passaria sem a migration ter feito nada) e o que prova que a migration acrescenta em vez
-- de substituir.
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
  foreach t in array array['icon_asset', 'link_icon_rule', 'project']
  loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('delete from public.%I where user_id = $1', t) using uid;
  end loop;
end;
$$;
