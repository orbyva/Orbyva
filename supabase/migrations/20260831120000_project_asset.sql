-- project_asset: base de links/arquivos do projeto (compartilhados entre tarefas)
-- Espelha o modelo de note/note_link: escopo de projeto + vínculo N:N com tarefa

create table public.project_asset (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users on delete cascade,
    project_id uuid not null references public.project on delete cascade,
    kind text not null default 'link' check (kind in ('link','file')),
    title text not null,
    url text not null,
    comment text,
    position integer not null default 0,
    created_at timestamptz not null default now()
);

comment on table public.project_asset is 'Itens da base do projeto (links e arquivos), anexáveis a múltiplas tarefas. kind="link" é esta feature; kind="file" será preenchido pela 107.';
comment on column public.project_asset.kind is 'Tipo do item: "link" (esta feature) ou "file" (feature 107).';
comment on column public.project_asset.title is 'Título exibido; quando vazio, cai para o host da URL.';
comment on column public.project_asset.url is 'Obrigatório para kind="link"; nulo para kind="file" (107).';
comment on column public.project_asset.position is 'Ordem dentro da base do projeto (menor primeiro).';

-- Índice para listar assets do projeto do usuário ordenados
create index project_asset_user_project_idx on public.project_asset (user_id, project_id, position);

-- Mesmo link duas vezes no mesmo projeto é engano; parcial porque kind="file" tem url=null
create unique index project_asset_unique_link_url on public.project_asset (project_id, url) where kind = 'link';

-- Vínculo N:N asset <-> task (precedente: note_link)
create table public.project_asset_task (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users on delete cascade,
    asset_id uuid not null references public.project_asset on delete cascade,
    task_id uuid not null references public.task on delete cascade,
    created_at timestamptz not null default now(),
    unique (asset_id, task_id)
);

comment on table public.project_asset_task is 'Vínculo entre item da base do projeto e tarefa. Excluir asset cascata (remove vínculos); excluir task só remove o vínculo.';

create index project_asset_task_user_task_idx on public.project_asset_task (user_id, task_id);
create index project_asset_task_user_asset_idx on public.project_asset_task (user_id, asset_id);

-- RLS nas duas tabelas
alter table public.project_asset enable row level security;
alter table public.project_asset_task enable row level security;

create policy "project_asset_select_own" on public.project_asset
    for select to authenticated using (user_id = auth.uid());

create policy "project_asset_insert_own" on public.project_asset
    for insert to authenticated with check (user_id = auth.uid());

create policy "project_asset_update_own" on public.project_asset
    for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "project_asset_delete_own" on public.project_asset
    for delete to authenticated using (user_id = auth.uid());

create policy "project_asset_task_select_own" on public.project_asset_task
    for select to authenticated using (user_id = auth.uid());

create policy "project_asset_task_insert_own" on public.project_asset_task
    for insert to authenticated with check (user_id = auth.uid());

create policy "project_asset_task_update_own" on public.project_asset_task
    for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "project_asset_task_delete_own" on public.project_asset_task
    for delete to authenticated using (user_id = auth.uid());

grant select, insert, update, delete on public.project_asset to authenticated;
grant select, insert, update, delete on public.project_asset_task to authenticated;

-- enforce_app_access nas duas tabelas
do $$ begin
    if not exists (
        select 1 from pg_trigger where tgname = 'trg_enforce_app_access_project_asset'
    ) then
        create trigger trg_enforce_app_access_project_asset
        before insert or update or delete on public.project_asset
        for each row execute function public.enforce_app_access();
    end if;
end $$;

do $$ begin
    if not exists (
        select 1 from pg_trigger where tgname = 'trg_enforce_app_access_project_asset_task'
    ) then
        create trigger trg_enforce_app_access_project_asset_task
        before insert or update or delete on public.project_asset_task
        for each row execute function public.enforce_app_access();
    end if;
end $$;

-- wipe_own_data: adicionar project_asset_task e project_asset ANTES de task e project
-- Baseado na lista da 20260823110000_icon_asset.sql
create or replace function public.wipe_own_data() returns void
language plpgsql security definer set search_path = public
as $$
declare
    t text;
begin
    -- Ordem: filhos antes dos pais (FKs)
    for t in
        select unnest(array[
            'reminder_preference',
            'medication_dose',
            'task_external_link',
            'task_is_quick',
            'project_asset_task',   -- novo: vínculos asset->task
            'project_asset',        -- novo: assets do projeto
            'note_link',
            'note',
            'task',
            'project_event',
            'project',
            'recurring_transaction',
            'financial_account',
            'icon_asset',
            'trip_member',
            'trip_invite',
            'trip',
            'event_invite',
            'goal_milestone',
            'goal',
            'habit',
            'medication'
        ])
    loop
        execute format('delete from public.%I where user_id = auth.uid()', t);
    end loop;
end $$;