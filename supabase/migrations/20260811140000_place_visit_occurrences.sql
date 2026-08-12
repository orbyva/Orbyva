-- Múltiplas visitas ao mesmo lugar (place_visit = local; occurrence = cada ida).

create table if not exists public.place_visit_occurrence (
  id uuid primary key default gen_random_uuid(),
  place_visit_id uuid not null references public.place_visit (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  visited_date date not null,
  rating numeric(3, 1),
  notes text,
  amount numeric(12, 2),
  would_recommend boolean not null default true,
  transaction_id bigint,
  created_at timestamptz not null default now()
);

create index if not exists place_visit_occurrence_place_idx
  on public.place_visit_occurrence (place_visit_id, visited_date desc);

create index if not exists place_visit_occurrence_user_idx
  on public.place_visit_occurrence (user_id, visited_date desc);

alter table public.place_visit_occurrence enable row level security;

create policy place_visit_occurrence_select_own
  on public.place_visit_occurrence for select
  using (user_id = auth.uid());

create policy place_visit_occurrence_insert_own
  on public.place_visit_occurrence for insert
  with check (user_id = auth.uid());

create policy place_visit_occurrence_update_own
  on public.place_visit_occurrence for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy place_visit_occurrence_delete_own
  on public.place_visit_occurrence for delete
  using (user_id = auth.uid());

-- Backfill: uma occurrence por place_visit já visitado.
insert into public.place_visit_occurrence (
  place_visit_id,
  user_id,
  visited_date,
  rating,
  notes,
  amount,
  would_recommend,
  transaction_id,
  created_at
)
select
  pv.id,
  pv.user_id,
  pv.visited_date,
  pv.rating,
  pv.notes,
  pv.amount,
  coalesce(pv.would_recommend, true),
  pv.transaction_id,
  coalesce(pv.created_at, now())
from public.place_visit pv
where pv.user_id is not null
  and pv.visited_date is not null
  and coalesce(pv.status, 'visited') = 'visited'
  and not exists (
    select 1
    from public.place_visit_occurrence o
    where o.place_visit_id = pv.id
  );
