-- Geo em lugares (Geoapify) + checklist de visitas no roteiro + origem do dia.

alter table public.place_visit
  add column if not exists lat double precision,
  add column if not exists lng double precision,
  add column if not exists google_place_id text,
  add column if not exists geoapify_place_id text;

comment on column public.place_visit.lat is
  'Latitude WGS84 (busca / rota).';
comment on column public.place_visit.lng is
  'Longitude WGS84 (busca / rota).';
comment on column public.place_visit.geoapify_place_id is
  'Place ID Geoapify.';
comment on column public.place_visit.google_place_id is
  'Legado; preferir geoapify_place_id.';

create index if not exists place_visit_geoapify_place_id_idx
  on public.place_visit (geoapify_place_id)
  where geoapify_place_id is not null;

create index if not exists place_visit_google_place_id_idx
  on public.place_visit (google_place_id)
  where google_place_id is not null;

-- Origem inicial opcional da viagem (fallback quando não há GPS).
alter table public.trip
  add column if not exists origin_lat double precision,
  add column if not exists origin_lng double precision,
  add column if not exists origin_label text;

comment on column public.trip.origin_lat is
  'Latitude da origem inicial do roteiro (opcional).';
comment on column public.trip.origin_lng is
  'Longitude da origem inicial do roteiro (opcional).';
comment on column public.trip.origin_label is
  'Rótulo da origem inicial (ex.: hotel).';

-- Checklist por visita (atividade do roteiro).
alter table public.trip_itinerary_activity
  add column if not exists visit_status text not null default 'pending',
  add column if not exists completed_at timestamptz,
  add column if not exists skipped_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'trip_itinerary_activity_visit_status_check'
  ) then
    alter table public.trip_itinerary_activity
      add constraint trip_itinerary_activity_visit_status_check
      check (visit_status in ('pending', 'completed', 'skipped'));
  end if;
end $$;

comment on column public.trip_itinerary_activity.visit_status is
  'Checklist da visita: pending | completed | skipped (nunca auto por horário).';
comment on column public.trip_itinerary_activity.completed_at is
  'Quando o usuário marcou a visita como concluída.';
comment on column public.trip_itinerary_activity.skipped_at is
  'Quando o usuário marcou a visita como pulada.';
