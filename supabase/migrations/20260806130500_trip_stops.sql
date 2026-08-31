-- Paradas multi-cidade da viagem (eurotrip etc.).
-- trip.destination_* permanece como resumo (1ª parada / rótulo agregado).

create table if not exists public.trip_stop (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trip(id) on delete cascade,
  name text not null,
  place_id text,
  lat double precision,
  lng double precision,
  start_date date not null,
  end_date date not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint trip_stop_dates_ok check (end_date >= start_date)
);

create index if not exists trip_stop_trip_idx
  on public.trip_stop (trip_id, sort_order);

comment on table public.trip_stop is
  'Cidades/regiões visitadas na viagem, com intervalo de datas.';
comment on column public.trip_stop.place_id is
  'Google Place ID (país, estado ou cidade).';

-- Backfill: uma parada a partir do destino legado.
insert into public.trip_stop (
  trip_id, name, place_id, lat, lng, start_date, end_date, sort_order
)
select
  t.id,
  coalesce(nullif(trim(t.destination), ''), t.title),
  t.destination_place_id,
  t.destination_lat,
  t.destination_lng,
  t.start_date,
  t.end_date,
  0
from public.trip t
where t.destination is not null
  and trim(t.destination) <> ''
  and not exists (
    select 1 from public.trip_stop s where s.trip_id = t.id
  );

alter table public.trip_stop enable row level security;

drop policy if exists trip_stop_member on public.trip_stop;
create policy trip_stop_member on public.trip_stop
  for all to authenticated
  using (public.is_trip_member(trip_id))
  with check (public.is_trip_member(trip_id));

-- App access gate (se a função existir).
do $$
begin
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'enforce_app_access'
  ) then
    execute 'drop trigger if exists trg_enforce_app_access on public.trip_stop';
    execute $t$
      create trigger trg_enforce_app_access
      before insert or update or delete on public.trip_stop
      for each row execute function public.enforce_app_access()
    $t$;
  end if;
end $$;
