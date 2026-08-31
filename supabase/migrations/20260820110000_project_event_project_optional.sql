-- Feature 076: `project_event.project_id` passa a aceitar nulo.
--
-- Até aqui todo evento de agenda nascia dentro de um projeto (`ProjectFormDialog`), então
-- `project_id` era `not null`. A 076 introduz o convite de evento: quando alguém aceita um convite,
-- a RPC `accept_event_invite` cria uma **cópia** do evento na conta do convidado — e o convidado não
-- tem (nem deve ter) o projeto do anfitrião. Criar um projeto "Convites" na conta dele foi
-- descartado por poluir a lista de projetos sem ele pedir.
--
-- `create table if not exists` (mesmo molde da 006): neste remoto a 006 já estava no histórico
-- **sem** ter criado `public.project_event` (o arquivo local cresceu depois do apply). `db push`
-- em 2026-08-31 falhou com SQLSTATE 42P01. Esta migration não chegou a entrar no histórico remoto.
-- Não reescrever `wipe_own_data` aqui — migrations posteriores (já aplicadas neste push) já
-- incluem `project_event` no array e o loop pula tabela ausente via `to_regclass`.

create table if not exists public.project_event (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.project(id) on delete cascade,
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  created_at timestamptz not null default now()
);

-- Tabela que já existia com NOT NULL (caminho canônico da 006): afrouxa. Já nullable: no-op.
alter table public.project_event
  alter column project_id drop not null;

create index if not exists project_event_project_idx
  on public.project_event (project_id, starts_at);

comment on table public.project_event is
  'Reuniões e blocos de tempo dedicados a um projeto — reuniões, horários de trabalho.';
comment on column public.project_event.project_id is
  'Projeto dono do evento. NULO = evento recebido por convite (feature 076): o convidado tem a '
  'cópia do evento na agenda dele, mas não tem o projeto do anfitrião. A UI usa cor/rótulo neutros '
  'quando é nulo.';

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
