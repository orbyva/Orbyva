-- Feature 006: cor/notas/eventos de projeto + status "planned" para o Kanban de projetos.

alter table public.project
  add column if not exists notes text;

alter table public.project
  drop constraint if exists project_status_check;

alter table public.project
  alter column status set default 'planned';

do $$
begin
  alter table public.project
    add constraint project_status_check
    check (status in ('planned', 'active', 'completed', 'archived'));
exception
  when duplicate_object then null;
end $$;

create table if not exists public.project_event (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.project(id) on delete cascade,
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists project_event_project_idx
  on public.project_event (project_id, starts_at);

comment on table public.project_event is
  'Reuniões e blocos de tempo dedicados a um projeto — reuniões, horários de trabalho.';

alter table public.project_event enable row level security;

drop policy if exists project_event_select_own on public.project_event;
create policy project_event_select_own on public.project_event
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists project_event_insert_own on public.project_event;
create policy project_event_insert_own on public.project_event
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists project_event_update_own on public.project_event;
create policy project_event_update_own on public.project_event
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists project_event_delete_own on public.project_event;
create policy project_event_delete_own on public.project_event
  for delete to authenticated
  using (user_id = auth.uid());

-- Inclui project_event no wipe de conta (mesma lista de 20260803121500_tasks_projects.sql).
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
    'project'
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
    raise notice 'enforce_app_access ausente — skip trigger project_event';
    return;
  end if;

  drop trigger if exists trg_enforce_app_access on public.project_event;
  create trigger trg_enforce_app_access before insert or update or delete on public.project_event
    for each row execute function public.enforce_app_access();
end $$;
