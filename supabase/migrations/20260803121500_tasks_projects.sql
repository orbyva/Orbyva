-- Módulo Tarefas/Projetos — núcleo v1 (independente de Metas/Hábitos, RLS por user_id).

create table if not exists public.project (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  color text,
  goal_id uuid references public.personal_goal(id) on delete set null,
  status text not null default 'active'
    check (status in ('active', 'completed', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists project_user_status_idx
  on public.project (user_id, status);

comment on table public.project is
  'Projetos do usuário — agrupam tarefas; goal_id linka opcionalmente a uma Meta existente.';

alter table public.project enable row level security;

drop policy if exists project_select_own on public.project;
create policy project_select_own on public.project
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists project_insert_own on public.project;
create policy project_insert_own on public.project
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists project_update_own on public.project;
create policy project_update_own on public.project
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists project_delete_own on public.project;
create policy project_delete_own on public.project
  for delete to authenticated
  using (user_id = auth.uid());

create table if not exists public.task (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.project(id) on delete cascade,
  parent_task_id uuid references public.task(id) on delete cascade,
  recurrence_origin_id uuid references public.task(id) on delete cascade,
  title text not null,
  description text,
  status text not null default 'todo'
    check (status in ('todo', 'doing', 'done')),
  tags text[] not null default '{}',
  due_date date,
  recurrence_rule jsonb,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists task_user_status_idx
  on public.task (user_id, status);
create index if not exists task_project_idx
  on public.task (project_id);
create index if not exists task_recurrence_origin_idx
  on public.task (recurrence_origin_id);

comment on table public.task is
  'Tarefas — avulsas (project_id nulo) ou de um projeto; subtarefas via parent_task_id; '
  'recorrência: a tarefa-origem guarda recurrence_rule, instâncias geradas apontam '
  'recurrence_origin_id para ela.';

alter table public.task enable row level security;

drop policy if exists task_select_own on public.task;
create policy task_select_own on public.task
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists task_insert_own on public.task;
create policy task_insert_own on public.task
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists task_update_own on public.task;
create policy task_update_own on public.task
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists task_delete_own on public.task;
create policy task_delete_own on public.task
  for delete to authenticated
  using (user_id = auth.uid());

create table if not exists public.task_dependency (
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid not null references public.task(id) on delete cascade,
  depends_on_task_id uuid not null references public.task(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (task_id, depends_on_task_id),
  check (task_id <> depends_on_task_id)
);

comment on table public.task_dependency is
  'task_id só pode avançar sem aviso quando depends_on_task_id estiver "done" (soft-block na UI).';

alter table public.task_dependency enable row level security;

drop policy if exists task_dependency_select_own on public.task_dependency;
create policy task_dependency_select_own on public.task_dependency
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists task_dependency_insert_own on public.task_dependency;
create policy task_dependency_insert_own on public.task_dependency
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists task_dependency_delete_own on public.task_dependency;
create policy task_dependency_delete_own on public.task_dependency
  for delete to authenticated
  using (user_id = auth.uid());

create table if not exists public.task_time_entry (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid not null references public.task(id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists task_time_entry_task_idx
  on public.task_time_entry (task_id);

-- Garante um único timer rodando por usuário (seção "Live").
create unique index if not exists task_time_entry_one_running_idx
  on public.task_time_entry (user_id)
  where (ended_at is null);

comment on table public.task_time_entry is
  'Timer da seção Live — ended_at nulo = timer em andamento.';

alter table public.task_time_entry enable row level security;

drop policy if exists task_time_entry_select_own on public.task_time_entry;
create policy task_time_entry_select_own on public.task_time_entry
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists task_time_entry_insert_own on public.task_time_entry;
create policy task_time_entry_insert_own on public.task_time_entry
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists task_time_entry_update_own on public.task_time_entry;
create policy task_time_entry_update_own on public.task_time_entry
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists task_time_entry_delete_own on public.task_time_entry;
create policy task_time_entry_delete_own on public.task_time_entry
  for delete to authenticated
  using (user_id = auth.uid());

-- Inclui as novas tabelas no wipe de conta (lista mais recente de wipe_own_data,
-- copiada de 20260728160000_albums.sql + tarefas/projetos).
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
declare
  t text;
begin
  if to_regclass('public.enforce_app_access') is null
     and not exists (
       select 1 from pg_proc where proname = 'enforce_app_access'
     ) then
    raise notice 'enforce_app_access ausente — skip triggers tasks/projects';
    return;
  end if;

  foreach t in array array['project', 'task', 'task_dependency', 'task_time_entry']
  loop
    if to_regclass('public.' || t) is null then
      continue;
    end if;
    execute format('drop trigger if exists trg_enforce_app_access on public.%I', t);
    execute format(
      'create trigger trg_enforce_app_access before insert or update or delete on public.%I for each row execute function public.enforce_app_access()',
      t
    );
  end loop;
end;
$$;
