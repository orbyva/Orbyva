-- Estado "antes": o schema que as features 006/013/055/085 deixaram, reduzido ao que os dois drops
-- tocam ou poderiam tocar por engano.
create schema if not exists auth;
create table auth.users (id uuid primary key);
insert into auth.users (id) values ('11111111-1111-1111-1111-111111111111');

create table public.project (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  status text not null default 'active',
  notes text                                  -- feature 006, alvo do drop da 058
);

-- Criada pela MESMA migration da 006 que criou `project.notes`. Está aqui de propósito: é o objeto
-- que um drop descuidado arrastaria junto.
create table public.project_event (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.project(id) on delete cascade,
  kind text not null,
  created_at timestamptz not null default now()
);

create table public.task (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  external_url text,                          -- feature 013, alvo do drop da 085
  external_provider text                      -- feature 013, alvo do drop da 085
);

create table public.task_external_link (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid not null references public.task(id) on delete cascade,
  url text not null,
  comment text
);

alter table public.project enable row level security;
create policy project_select_own on public.project for select to public using (true);

insert into public.project (id, user_id, name, status, notes) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Casa', 'active', ''),
  ('aaaaaaaa-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'Sacada', 'planned', null);

insert into public.project_event (project_id, kind) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'created'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'created');

insert into public.task (id, user_id, title, external_url, external_provider) values
  ('bbbbbbbb-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'PR', 'https://github.com/o/r/pull/1', 'github'),
  ('bbbbbbbb-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'Sem link', null, null);

insert into public.task_external_link (task_id, user_id, url, comment) values
  ('bbbbbbbb-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'https://github.com/o/r/pull/1', null),
  ('bbbbbbbb-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'https://temu.com/x', 'comprar');
