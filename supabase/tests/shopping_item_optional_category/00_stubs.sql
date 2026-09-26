-- Stubs do ambiente Supabase que não existem num Postgres cru (mesmo formato de
-- supabase/tests/event_task_link/00_stubs.sql).
--
-- Aqui NÃO há stub de `shopping_category`/`shopping_item`: o estado pré-migration é a própria
-- migration da 050 (`20260816130000_shopping_list.sql`), aplicada pelo run.sh logo depois destes
-- stubs. É ela que cria a coluna `shopping_category_id not null` que a migration em teste precisa
-- conseguir afrouxar.
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

-- No projeto real, o `alter default privileges` do Supabase concede as quatro operações em toda
-- tabela nova de `public` para `authenticated` — por isso as migrations do app não trazem `grant`.
-- Num Postgres cru esse default não existe, então o stub o reproduz **antes** da migration: sem
-- isto, o teste de RLS mediria falta de GRANT, não policy.
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;

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
