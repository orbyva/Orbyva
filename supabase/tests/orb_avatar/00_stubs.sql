-- Stubs do ambiente Supabase que não existem num Postgres cru (mesmo formato de
-- supabase/tests/icon_asset/00_stubs.sql), mais o schema `storage` — que este teste precisa porque
-- a feature 151 cria um bucket **novo** (`orb-avatars`) com teto e mime próprios, e as policies
-- dele são a fronteira que prende o PNG ao dono.
--
-- Nada aqui pode criar o que a migration deveria criar: `public.orb_avatar`, os índices, a RPC, o
-- bucket e a entrada de `orb_avatar` no wipe ficam de fora de propósito. É o controle negativo do
-- run.sh que confere isso antes de a migration rodar.
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

-- Gate Pro: no app real bloqueia escrita sem assinatura ativa. Aqui é no-op — o que este teste
-- afirma é que o trigger foi **ligado** na tabela nova, não o que ele decide.
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
-- Réplica mínima e fiel do que as policies do bucket usam. `storage.foldername` é a mesma da
-- Supabase: parte o caminho por "/" e devolve tudo **menos** o nome do arquivo — é dela que sai o
-- `[1] = auth.uid()::text` das policies, e é ela que decide se `{uid}/{uuid}.png` pertence ao dono.
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

-- ---- baseline de `wipe_own_data` -------------------------------------------------------------
-- **Sem** `orb_avatar`, e com a lista que a migration anterior (20260823120000_link_icon_rule.sql)
-- deixou. É o que faz a assertiva do 02 ter sentido nas duas direções: se `orb_avatar` já
-- estivesse aqui, o wipe passaria sem a migration ter feito nada; e se a migration reescrevesse a
-- lista de memória, a ausência de qualquer nome antigo apareceria na comparação.
--
-- As tabelas em si não existem neste Postgres — o `to_regclass` do loop pula o que não existe, que
-- é exatamente o comportamento do wipe real quando uma tabela ainda não foi criada.
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

  if to_regclass('public.event_invite') is not null then
    delete from public.event_invite where created_by = uid;
  end if;

  foreach t in array array[
    'transaction',
    'recurring_transaction',
    'monthly_budget',
    'movie',
    'movie_episode',
    'book_note',
    'book',
    'album',
    'personal_goal',
    'habit',
    'place_visit',
    'trip',
    'vehicle',
    'class',
    'type',
    'task_time_entry',
    'task_dependency',
    'task_external_link',
    'task',
    'icon_asset',
    'link_icon_rule',
    'project_event',
    'note',
    'note_folder',
    'project',
    'tag',
    'content_link',
    'shopping_item',
    'shopping_category',
    'health_metric',
    'reminder_preference',
    'medication'
  ]
  loop
    if to_regclass('public.' || t) is null then
      continue;
    end if;
    execute format('delete from public.%I where user_id = $1', t) using uid;
  end loop;
end;
$$;

-- Uma tabela qualquer do wipe que existe de verdade aqui, só para o 03 poder afirmar que o wipe
-- continua apagando o que já apagava depois de ser reescrito pela migration.
create table if not exists public.note (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  created_at timestamptz not null default now()
);
