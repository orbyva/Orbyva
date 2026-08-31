-- Feature 076: convite de evento de agenda.
--
-- Espelha `public.trip_invite` (20240101000900_shared_trips.sql), que já é o molde de convite deste
-- repo: token opaco, e-mail opcional, expiração, revogação. A diferença de desenho é deliberada e
-- está registrada na feature: aceitar um convite de evento **não** dá acesso ao evento do
-- anfitrião — cria uma cópia própria na agenda do convidado. Por isso não há tabela de membros nem
-- helper `is_event_member`, e as policies de `project_event` continuam `user_id = auth.uid()`.
--
-- Privacidade: esta tabela é lida **só pelo anfitrião** (`created_by = auth.uid()`). O convidado
-- nunca faz `select` aqui; ele enxerga o convite pela RPC `get_event_invite_by_token`
-- (20260820130000), que devolve apenas o necessário para decidir.

create table if not exists public.event_invite (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.project_event(id) on delete cascade,
  -- Nulo = convite "só link" (quem tiver o token aceita). Com e-mail, a RPC de aceite exige que o
  -- e-mail do JWT bata.
  email text,
  token text not null unique,
  created_by uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'revoked', 'expired')),
  expires_at timestamptz not null,
  accepted_by uuid references auth.users(id) on delete set null,
  -- O evento criado do lado do convidado. É o que permite, no futuro, propagar cancelamento.
  -- `on delete set null`: se o convidado apagar a cópia dele, o convite do anfitrião continua de pé.
  accepted_event_id uuid references public.project_event(id) on delete set null,
  email_sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists event_invite_event_idx on public.event_invite (event_id);
create index if not exists event_invite_created_by_idx on public.event_invite (created_by);
create index if not exists event_invite_accepted_by_idx on public.event_invite (accepted_by);

-- Convidar o mesmo e-mail duas vezes para o mesmo evento não cria um segundo convite: o índice
-- barra, e `createEventInvite` (src/api/tasks/eventInvites.ts) trata a violação como "reenviar o
-- convite que já existe". Sem isso, dois tokens válidos para a mesma pessoa gerariam duas cópias do
-- evento na agenda dela.
create unique index if not exists event_invite_pending_email_idx
  on public.event_invite (event_id, lower(email))
  where status = 'pending' and email is not null;

comment on table public.event_invite is
  'Convites por token para um evento de agenda (feature 076). Aceitar cria uma cópia do evento na '
  'conta do convidado — não há acesso compartilhado à linha do anfitrião.';
comment on column public.event_invite.accepted_event_id is
  'project_event criado na conta do convidado ao aceitar (project_id nulo).';

alter table public.event_invite enable row level security;

-- Só o anfitrião lê os próprios convites. O convidado usa `get_event_invite_by_token`.
drop policy if exists event_invite_select_own on public.event_invite;
create policy event_invite_select_own on public.event_invite
  for select to authenticated
  using (created_by = auth.uid());

-- Convidar exige ser dono do evento — não dá para gerar convite para evento alheio.
drop policy if exists event_invite_insert_own on public.event_invite;
create policy event_invite_insert_own on public.event_invite
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and exists (
      select 1 from public.project_event e
      where e.id = event_id and e.user_id = auth.uid()
    )
  );

-- Update pelo anfitrião = revogar / limpar `email_sent_at` para reenviar. O aceite não passa por
-- aqui: quem marca `accepted` é a RPC `accept_event_invite` (security definer).
drop policy if exists event_invite_update_own on public.event_invite;
create policy event_invite_update_own on public.event_invite
  for update to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

drop policy if exists event_invite_delete_own on public.event_invite;
create policy event_invite_delete_own on public.event_invite
  for delete to authenticated
  using (created_by = auth.uid());

grant select, insert, update, delete on public.event_invite to authenticated;

-- Inclui `event_invite` no wipe de conta. A lista do array só serve para tabelas com `user_id`;
-- aqui a coluna de dono é `created_by`, então vai num delete explícito. (Lista mais recente copiada
-- de 20260816230000_medication.sql; `reminder_preference` volta para a lista — a 20260816220000
-- tinha incluído e a de medicação, escrita em paralelo, deixou cair.)
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

  -- Antes do loop: os convites do dono. O `on delete cascade` de `event_id` já levaria os convites
  -- junto com os eventos, mas o delete explícito também cobre convite cujo evento já sumiu.
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
    'task',
    'project_event',
    'note',
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
    raise notice 'enforce_app_access ausente — skip trigger event_invite';
    return;
  end if;

  drop trigger if exists trg_enforce_app_access on public.event_invite;
  create trigger trg_enforce_app_access before insert or update or delete on public.event_invite
    for each row execute function public.enforce_app_access();
end $$;
