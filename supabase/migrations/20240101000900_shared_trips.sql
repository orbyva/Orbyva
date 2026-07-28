-- Shared trips: members, invites, place opinions, expense splits.
-- Rode no SQL Editor do Supabase (após tenancy_rls.sql).

-- ── Members ──────────────────────────────────────────────────────────

create table if not exists public.trip_member (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trip(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'editor')),
  display_name text,
  joined_at timestamptz not null default now(),
  unique (trip_id, user_id)
);

create index if not exists trip_member_user_idx on public.trip_member (user_id);
create index if not exists trip_member_trip_idx on public.trip_member (trip_id);

-- ── Invites ──────────────────────────────────────────────────────────

create table if not exists public.trip_invite (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trip(id) on delete cascade,
  token text not null unique,
  email text,
  created_by uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'revoked', 'expired')),
  expires_at timestamptz not null,
  accepted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists trip_invite_token_idx on public.trip_invite (token);
create index if not exists trip_invite_trip_idx on public.trip_invite (trip_id);

-- ── Place opinions (per member on a trip place) ──────────────────────

create table if not exists public.trip_place_opinion (
  id uuid primary key default gen_random_uuid(),
  place_visit_id uuid not null references public.place_visit(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  rating numeric(3,1),
  notes text,
  would_recommend boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (place_visit_id, user_id)
);

create index if not exists trip_place_opinion_place_idx
  on public.trip_place_opinion (place_visit_id);

-- ── Expense visibility + splits ──────────────────────────────────────

alter table public.trip_expense
  add column if not exists visibility text not null default 'personal'
    check (visibility in ('personal', 'shared')),
  add column if not exists created_by_user_id uuid references auth.users(id) on delete set null,
  add column if not exists paid_by_user_id uuid references auth.users(id) on delete set null;

create table if not exists public.trip_expense_split (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.trip_expense(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  amount numeric(12,2) not null check (amount >= 0),
  transaction_id bigint,
  created_at timestamptz not null default now(),
  unique (expense_id, user_id)
);

create index if not exists trip_expense_split_expense_idx
  on public.trip_expense_split (expense_id);
create index if not exists trip_expense_split_user_idx
  on public.trip_expense_split (user_id);

-- Backfill owners as members
insert into public.trip_member (trip_id, user_id, role)
select id, user_id, 'owner'
from public.trip
where user_id is not null
on conflict (trip_id, user_id) do nothing;

-- Backfill created_by on expenses
update public.trip_expense e
set created_by_user_id = t.user_id
from public.trip t
where e.trip_id = t.id
  and e.created_by_user_id is null;

-- ── Helper: membership check (security definer for RLS) ──────────────

create or replace function public.is_trip_member(p_trip_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.trip t
    where t.id = p_trip_id and t.user_id = auth.uid()
  ) or exists (
    select 1 from public.trip_member m
    where m.trip_id = p_trip_id and m.user_id = auth.uid()
  );
$$;

create or replace function public.is_trip_owner(p_trip_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.trip t
    where t.id = p_trip_id and t.user_id = auth.uid()
  ) or exists (
    select 1 from public.trip_member m
    where m.trip_id = p_trip_id
      and m.user_id = auth.uid()
      and m.role = 'owner'
  );
$$;

revoke all on function public.is_trip_member(uuid) from public;
grant execute on function public.is_trip_member(uuid) to authenticated;
revoke all on function public.is_trip_owner(uuid) from public;
grant execute on function public.is_trip_owner(uuid) to authenticated;

-- ── RLS ──────────────────────────────────────────────────────────────

alter table public.trip_member enable row level security;
alter table public.trip_invite enable row level security;
alter table public.trip_place_opinion enable row level security;
alter table public.trip_expense_split enable row level security;

drop policy if exists trip_member_select on public.trip_member;
create policy trip_member_select on public.trip_member
  for select to authenticated
  using (public.is_trip_member(trip_id));

drop policy if exists trip_member_insert on public.trip_member;
create policy trip_member_insert on public.trip_member
  for insert to authenticated
  with check (public.is_trip_owner(trip_id));

drop policy if exists trip_member_delete on public.trip_member;
create policy trip_member_delete on public.trip_member
  for delete to authenticated
  using (
    public.is_trip_owner(trip_id)
    or user_id = auth.uid()
  );

drop policy if exists trip_invite_select on public.trip_invite;
create policy trip_invite_select on public.trip_invite
  for select to authenticated
  using (
    public.is_trip_owner(trip_id)
    or public.is_trip_member(trip_id)
  );

drop policy if exists trip_invite_insert on public.trip_invite;
create policy trip_invite_insert on public.trip_invite
  for insert to authenticated
  with check (public.is_trip_owner(trip_id) and created_by = auth.uid());

drop policy if exists trip_invite_update on public.trip_invite;
create policy trip_invite_update on public.trip_invite
  for update to authenticated
  using (public.is_trip_owner(trip_id))
  with check (public.is_trip_owner(trip_id));

drop policy if exists trip_place_opinion_all on public.trip_place_opinion;
drop policy if exists trip_place_opinion_select on public.trip_place_opinion;
create policy trip_place_opinion_select on public.trip_place_opinion
  for select to authenticated
  using (
    exists (
      select 1 from public.place_visit pv
      where pv.id = place_visit_id
        and (
          pv.user_id = auth.uid()
          or (pv.trip_id is not null and public.is_trip_member(pv.trip_id))
        )
    )
  );

drop policy if exists trip_place_opinion_insert on public.trip_place_opinion;
create policy trip_place_opinion_insert on public.trip_place_opinion
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.place_visit pv
      where pv.id = place_visit_id
        and pv.trip_id is not null
        and public.is_trip_member(pv.trip_id)
    )
  );

drop policy if exists trip_place_opinion_update on public.trip_place_opinion;
create policy trip_place_opinion_update on public.trip_place_opinion
  for update to authenticated
  using (user_id = auth.uid());

drop policy if exists trip_place_opinion_delete on public.trip_place_opinion;
create policy trip_place_opinion_delete on public.trip_place_opinion
  for delete to authenticated
  using (user_id = auth.uid());

drop policy if exists trip_expense_split_select on public.trip_expense_split;
create policy trip_expense_split_select on public.trip_expense_split
  for select to authenticated
  using (
    exists (
      select 1 from public.trip_expense e
      where e.id = expense_id and public.is_trip_member(e.trip_id)
    )
  );

drop policy if exists trip_expense_split_write on public.trip_expense_split;
drop policy if exists trip_expense_split_insert on public.trip_expense_split;
create policy trip_expense_split_insert on public.trip_expense_split
  for insert to authenticated
  with check (
    exists (
      select 1 from public.trip_expense e
      where e.id = expense_id and public.is_trip_member(e.trip_id)
    )
  );

drop policy if exists trip_expense_split_update on public.trip_expense_split;
create policy trip_expense_split_update on public.trip_expense_split
  for update to authenticated
  using (
    exists (
      select 1 from public.trip_expense e
      where e.id = expense_id and public.is_trip_member(e.trip_id)
    )
  );

drop policy if exists trip_expense_split_delete on public.trip_expense_split;
create policy trip_expense_split_delete on public.trip_expense_split
  for delete to authenticated
  using (
    exists (
      select 1 from public.trip_expense e
      where e.id = expense_id and public.is_trip_member(e.trip_id)
    )
  );

-- Widen trip SELECT for members (keep existing owner policies; add member read)
drop policy if exists trip_select_member on public.trip;
create policy trip_select_member on public.trip
  for select to authenticated
  using (public.is_trip_member(id));

-- Child tables: member read/write (additive policies — keep owner ones)
drop policy if exists trip_checklist_member on public.trip_checklist_item;
create policy trip_checklist_member on public.trip_checklist_item
  for all to authenticated
  using (public.is_trip_member(trip_id))
  with check (public.is_trip_member(trip_id));

drop policy if exists trip_itinerary_day_member on public.trip_itinerary_day;
create policy trip_itinerary_day_member on public.trip_itinerary_day
  for all to authenticated
  using (public.is_trip_member(trip_id))
  with check (public.is_trip_member(trip_id));

drop policy if exists trip_itinerary_activity_member on public.trip_itinerary_activity;
create policy trip_itinerary_activity_member on public.trip_itinerary_activity
  for all to authenticated
  using (
    exists (
      select 1 from public.trip_itinerary_day d
      where d.id = day_id and public.is_trip_member(d.trip_id)
    )
  )
  with check (
    exists (
      select 1 from public.trip_itinerary_day d
      where d.id = day_id and public.is_trip_member(d.trip_id)
    )
  );

drop policy if exists trip_milestone_member on public.trip_milestone;
create policy trip_milestone_member on public.trip_milestone
  for all to authenticated
  using (public.is_trip_member(trip_id))
  with check (public.is_trip_member(trip_id));

drop policy if exists trip_expense_member on public.trip_expense;
create policy trip_expense_member on public.trip_expense
  for all to authenticated
  using (
    public.is_trip_member(trip_id)
    and (
      visibility = 'shared'
      or created_by_user_id = auth.uid()
    )
  )
  with check (
    public.is_trip_member(trip_id)
    and created_by_user_id = auth.uid()
  );

-- Places linked to a trip: members can read
drop policy if exists place_visit_trip_member on public.place_visit;
create policy place_visit_trip_member on public.place_visit
  for select to authenticated
  using (trip_id is not null and public.is_trip_member(trip_id));

drop policy if exists place_visit_trip_member_insert on public.place_visit;
create policy place_visit_trip_member_insert on public.place_visit
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and (
      trip_id is null
      or public.is_trip_member(trip_id)
    )
  );

comment on table public.trip_member is 'Membros de uma viagem compartilhada';
comment on table public.trip_invite is 'Convites por token para entrar na viagem';
comment on table public.trip_place_opinion is 'Nota/opinião de cada membro sobre um lugar da viagem';
comment on table public.trip_expense_split is 'Fatias de uma despesa conjunta';
