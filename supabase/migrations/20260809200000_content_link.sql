-- Feature 019: módulo "Conteúdo" — fila de links pra ler/assistir depois (artigos, vídeos,
-- sites), independente de movie/book/album (fila de links, não catálogo pesquisável) — ver
-- Contexto/Decisões da feature 019.

create table if not exists public.content_link (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  url text not null,
  type text not null default 'website' check (type in ('article', 'video', 'website')),
  status text not null default 'to_consume' check (status in ('to_consume', 'consumed')),
  notes text,
  is_favorite boolean not null default false,
  tag_ids uuid[] not null default '{}',
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists content_link_user_idx on public.content_link (user_id);

comment on table public.content_link is
  'Fila de links pra consumir depois (artigos, vídeos, sites) — módulo "Conteúdo".';

alter table public.content_link enable row level security;

drop policy if exists content_link_select_own on public.content_link;
create policy content_link_select_own on public.content_link
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists content_link_insert_own on public.content_link;
create policy content_link_insert_own on public.content_link
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists content_link_update_own on public.content_link;
create policy content_link_update_own on public.content_link
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists content_link_delete_own on public.content_link;
create policy content_link_delete_own on public.content_link
  for delete to authenticated
  using (user_id = auth.uid());

-- Inclui "content_link" no wipe de conta (mesma lista de 20260807150000_tags_catalog.sql).
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
    'task',
    'project_event',
    'project',
    'tag',
    'content_link'
  ]
  loop
    if to_regclass('public.' || t) is null then
      continue;
    end if;
    execute format('delete from public.%I where user_id = $1', t) using uid;
  end loop;
end;
$$;

-- Gate de acesso Pro (mesmo padrão das demais tabelas do app).
do $$
begin
  if to_regclass('public.enforce_app_access') is null
     and not exists (
       select 1 from pg_proc where proname = 'enforce_app_access'
     ) then
    raise notice 'enforce_app_access ausente — skip trigger content_link';
    return;
  end if;

  drop trigger if exists trg_enforce_app_access on public.content_link;
  create trigger trg_enforce_app_access before insert or update or delete on public.content_link
    for each row execute function public.enforce_app_access();
end $$;
