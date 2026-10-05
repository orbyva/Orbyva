-- Stubs do ambiente Supabase que não existem num Postgres cru (mesmo formato de
-- supabase/tests/icon_asset/00_stubs.sql), mais o schema `storage` — que este teste precisa porque
-- a feature 102 cria um bucket **privado** e policies ancoradas na primeira pasta do caminho
-- (`{tripId}/...`), e é justamente isso que tem de ser provado.
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

grant usage on schema public to authenticated, anon;
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

-- ---- schema `storage` ------------------------------------------------------------------------
-- Réplica mínima do que as policies do bucket usam. `storage.foldername` é a mesma da Supabase:
-- parte o caminho por "/" e devolve tudo **menos** o nome do arquivo — é dela que sai o `[1]` que
-- `trip_assets_path_member` lê como `trip_id`.
create schema if not exists storage;
grant usage on schema storage to authenticated, anon;

create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[],
  created_at timestamptz not null default now()
);

create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id) on delete cascade,
  name text not null,
  owner uuid,
  created_at timestamptz not null default now()
);

create or replace function storage.foldername(name text)
returns text[]
language plpgsql
immutable
as $$
declare
  _parts text[];
begin
  select string_to_array(name, '/') into _parts;
  return _parts[1:array_length(_parts, 1) - 1];
end;
$$;

alter table storage.objects enable row level security;
grant select, insert, update, delete on storage.objects to authenticated;
grant select on storage.objects to anon;
grant select on storage.buckets to authenticated, anon;

-- ---- pré-requisitos do app -------------------------------------------------------------------
-- `trip` + roteiro como as migrations anteriores os deixaram, e **sem** `boarding_time`: quem a
-- adiciona é `20260930130000_trip_activity_boarding_time.sql`, aplicada pelo run.sh. É o que faz o
-- controle negativo provar algo.
create table if not exists public.trip (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  destination text not null,
  start_date date,
  end_date date,
  created_at timestamptz not null default now()
);

create table if not exists public.trip_member (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trip(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'editor' check (role in ('owner', 'editor')),
  joined_at timestamptz not null default now(),
  unique (trip_id, user_id)
);

create table if not exists public.trip_itinerary_day (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trip(id) on delete cascade,
  day_number integer not null,
  date date,
  title text,
  notes text
);

create table if not exists public.trip_itinerary_activity (
  id uuid primary key default gen_random_uuid(),
  day_id uuid not null references public.trip_itinerary_day(id) on delete cascade,
  title text not null,
  activity_time text,
  arrival_time text,
  transport_mode text,
  notes text,
  link_url text,
  category text,
  sort_order integer not null default 0,
  created_by_user_id uuid references auth.users(id) on delete set null
);

-- `is_trip_member` como `20240101000900_shared_trips.sql` a define: dono **ou** membro.
create or replace function public.is_trip_member(p_trip_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.trip t
    where t.id = p_trip_id and t.user_id = auth.uid()
  ) or exists (
    select 1 from public.trip_member m
    where m.trip_id = p_trip_id and m.user_id = auth.uid()
  );
$$;

revoke all on function public.is_trip_member(uuid) from public;
grant execute on function public.is_trip_member(uuid) to authenticated;

grant select, insert, update, delete
  on public.trip, public.trip_member, public.trip_itinerary_day, public.trip_itinerary_activity
  to authenticated;
