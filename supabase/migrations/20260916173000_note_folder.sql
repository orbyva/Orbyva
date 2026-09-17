-- Pastas de notas (feature 099): pasta é o lugar da nota/canvas, com projeto e etiqueta
-- opcionais na própria pasta. `note.folder_id` é o vínculo 1:1 (uma nota mora em no máximo
-- uma pasta); mover a nota só troca essa coluna — `note.project_id` da 055 continua sendo o
-- vínculo primário com projeto.

create table if not exists public.note_folder (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  parent_id uuid references public.note_folder(id) on delete cascade,
  project_id uuid references public.project(id) on delete set null,
  tag_id uuid references public.tag(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint note_folder_parent_not_self check (parent_id is distinct from id)
);

create index if not exists note_folder_user_idx
  on public.note_folder (user_id);
create index if not exists note_folder_parent_idx
  on public.note_folder (parent_id);
create index if not exists note_folder_project_idx
  on public.note_folder (project_id);
create index if not exists note_folder_tag_idx
  on public.note_folder (tag_id);

-- Dois nomes iguais no mesmo pai são recusados; em pais diferentes, não. `coalesce` do
-- parent_id nulo porque unique em Postgres trata NULL como distinto — sem isso, duas pastas
-- raiz com o mesmo nome passariam.
create unique index if not exists note_folder_user_parent_name_unique
  on public.note_folder (
    user_id,
    coalesce(parent_id, '00000000-0000-0000-0000-000000000000'),
    lower(name)
  );

comment on table public.note_folder is
  'Pasta de notas (feature 099): lugar da nota/canvas, com projeto e etiqueta opcionais. '
  'Apagar a pasta não apaga as notas (note.folder_id on delete set null); subpastas sobem um '
  'nível na API antes do delete. parent_id on delete cascade é só rede de segurança do wipe.';

alter table public.note_folder enable row level security;

drop policy if exists note_folder_select_own on public.note_folder;
create policy note_folder_select_own on public.note_folder
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists note_folder_insert_own on public.note_folder;
create policy note_folder_insert_own on public.note_folder
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists note_folder_update_own on public.note_folder;
create policy note_folder_update_own on public.note_folder
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists note_folder_delete_own on public.note_folder;
create policy note_folder_delete_own on public.note_folder
  for delete to authenticated
  using (user_id = auth.uid());

grant select, insert, update, delete on public.note_folder to authenticated;

-- Lugar da nota. Nullable: nota existente (e nota criada fora de pasta) fica na raiz.
alter table public.note
  add column if not exists folder_id uuid references public.note_folder(id) on delete set null;

create index if not exists note_folder_id_idx
  on public.note (folder_id);

comment on column public.note.folder_id is
  'Pasta em que a nota mora (feature 099). Nulo = raiz ("Sem pasta"). Excluir a pasta não '
  'apaga a nota, só desfaz o lugar (on delete set null). Independente de note.project_id.';

-- Inclui `note_folder` no wipe de conta. Cópia do array de
-- `20260823120000_link_icon_rule.sql`, com `note_folder` depois de `note` (a nota aponta para
-- a pasta) e antes de `project`/`tag` (a pasta aponta para os dois).
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

  -- Antes do loop: os convites do dono (feature 076). O `on delete cascade` de `event_id` já
  -- levaria os convites junto com os eventos, mas o delete explícito também cobre convite cujo
  -- evento já sumiu.
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

-- Gate de acesso Pro (mesmo padrão das demais tabelas do app).
do $$
begin
  if to_regclass('public.enforce_app_access') is null
     and not exists (
       select 1 from pg_proc where proname = 'enforce_app_access'
     ) then
    raise notice 'enforce_app_access ausente — skip trigger note_folder';
    return;
  end if;

  drop trigger if exists trg_enforce_app_access on public.note_folder;
  create trigger trg_enforce_app_access before insert or update or delete on public.note_folder
    for each row execute function public.enforce_app_access();
end $$;
