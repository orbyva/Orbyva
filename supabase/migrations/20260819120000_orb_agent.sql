-- Orb (POC P0 — Entretenimento): threads/mensagens/propostas do chat com IA.
-- Escrita real nos módulos (movie/book/album) continua passando por src/api/*
-- após confirmação do usuário — estas tabelas só guardam o diálogo e as
-- propostas pendentes/decididas (log de auditoria).

create table if not exists public.orb_thread (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.orb_message (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.orb_thread(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'tool')),
  content text not null default '',
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.orb_proposal (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.orb_thread(id) on delete cascade,
  message_id uuid references public.orb_message(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete cascade,
  tool_name text not null,
  payload jsonb not null,
  status text not null default 'pending'
    check (status in ('pending', 'applied', 'dismissed', 'expired')),
  applied_entity_id text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists orb_thread_user_idx
  on public.orb_thread (user_id, updated_at desc);
create index if not exists orb_message_thread_idx
  on public.orb_message (thread_id, created_at);
create index if not exists orb_proposal_thread_idx
  on public.orb_proposal (thread_id, status);

comment on table public.orb_thread is 'Conversas do assistente Orb.';
comment on table public.orb_message is 'Mensagens (usuário/assistente/tool) de uma thread do Orb.';
comment on table public.orb_proposal is
  'Propostas de escrita geradas pelo Orb — pending até o usuário confirmar/descartar; a escrita real acontece via src/api/* no client.';

-- P1: orb_usage (turns/dia, tokens) para cota de custo quando sair da POC.

alter table public.orb_thread enable row level security;
alter table public.orb_message enable row level security;
alter table public.orb_proposal enable row level security;

drop policy if exists orb_thread_select_own on public.orb_thread;
create policy orb_thread_select_own on public.orb_thread
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists orb_thread_insert_own on public.orb_thread;
create policy orb_thread_insert_own on public.orb_thread
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists orb_thread_update_own on public.orb_thread;
create policy orb_thread_update_own on public.orb_thread
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists orb_thread_delete_own on public.orb_thread;
create policy orb_thread_delete_own on public.orb_thread
  for delete to authenticated
  using (user_id = auth.uid());

drop policy if exists orb_message_select_own on public.orb_message;
create policy orb_message_select_own on public.orb_message
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists orb_message_insert_own on public.orb_message;
create policy orb_message_insert_own on public.orb_message
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists orb_message_update_own on public.orb_message;
create policy orb_message_update_own on public.orb_message
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists orb_message_delete_own on public.orb_message;
create policy orb_message_delete_own on public.orb_message
  for delete to authenticated
  using (user_id = auth.uid());

drop policy if exists orb_proposal_select_own on public.orb_proposal;
create policy orb_proposal_select_own on public.orb_proposal
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists orb_proposal_insert_own on public.orb_proposal;
create policy orb_proposal_insert_own on public.orb_proposal
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists orb_proposal_update_own on public.orb_proposal;
create policy orb_proposal_update_own on public.orb_proposal
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists orb_proposal_delete_own on public.orb_proposal;
create policy orb_proposal_delete_own on public.orb_proposal
  for delete to authenticated
  using (user_id = auth.uid());
