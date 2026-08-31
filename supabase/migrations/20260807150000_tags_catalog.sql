-- Feature 010: sistema de tags com pagina de gestao + cores estilo GitHub labels.
-- Substitui "task.tags" (texto livre, sem cor) por um catalogo real (tabela "tag"), compartilhado
-- entre tarefas e projetos. NAO derruba "task.tags" nesta migration (fica sem uso, so como rede de
-- seguranca) — ver Notas da feature 010 antes de aplicar / decidir se e quando dropar de vez.

create table if not exists public.tag (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  color text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists tag_user_name_unique
  on public.tag (user_id, lower(name));

comment on table public.tag is
  'Catálogo de tags do usuário (nome + cor), compartilhado entre tarefas e projetos.';

alter table public.tag enable row level security;

drop policy if exists tag_select_own on public.tag;
create policy tag_select_own on public.tag
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists tag_insert_own on public.tag;
create policy tag_insert_own on public.tag
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists tag_update_own on public.tag;
create policy tag_update_own on public.tag
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists tag_delete_own on public.tag;
create policy tag_delete_own on public.tag
  for delete to authenticated
  using (user_id = auth.uid());

-- Vínculo por array de id — Postgres não tem FK em array; integridade fica por conta da
-- aplicação (mesmo princípio informal que "task.tags text[]" já tinha).
alter table public.task
  add column if not exists tag_ids uuid[] not null default '{}';

alter table public.project
  add column if not exists tag_ids uuid[] not null default '{}';

-- Migração de dados: cada valor distinto (case-insensitive, ignorando espaços) hoje em
-- "task.tags", por usuário, vira uma linha em "tag" com uma cor da paleta curada (cíclica, não
-- aleatória de verdade — é só o backfill inicial; o picker do app sorteia de verdade dali em
-- diante). "task.tag_ids" passa a apontar pras tags correspondentes.
do $$
declare
  palette text[] := array[
    '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#22c55e', '#10b981',
    '#14b8a6', '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7',
    '#d946ef', '#ec4899', '#f43f5e', '#78716c', '#64748b', '#71717a'
  ];
  rec record;
  seed int := 0;
begin
  for rec in
    select distinct t.user_id as user_id, lower(trim(tagname)) as tag_name
    from public.task t, unnest(t.tags) as tagname
    where trim(tagname) <> ''
  loop
    insert into public.tag (user_id, name, color)
    values (rec.user_id, rec.tag_name, palette[1 + (seed % array_length(palette, 1))])
    on conflict (user_id, lower(name)) do nothing;
    seed := seed + 1;
  end loop;

  update public.task t
  set tag_ids = coalesce((
    select array_agg(distinct tg.id)
    from unnest(t.tags) as tagname
    join public.tag tg
      on tg.user_id = t.user_id and lower(tg.name) = lower(trim(tagname))
    where trim(tagname) <> ''
  ), '{}')
  where array_length(t.tags, 1) > 0;
end $$;

-- Inclui "tag" no wipe de conta (mesma lista de 20260806130000_project_notes_status_events.sql).
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
    'tag'
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
    raise notice 'enforce_app_access ausente — skip trigger tag';
    return;
  end if;

  drop trigger if exists trg_enforce_app_access on public.tag;
  create trigger trg_enforce_app_access before insert or update or delete on public.tag
    for each row execute function public.enforce_app_access();
end $$;
