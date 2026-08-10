-- Endpoints geográficos do deslocamento (origem / destino: país, estado ou cidade).
alter table public.trip_itinerary_activity
  add column if not exists origin_label text,
  add column if not exists origin_lat double precision,
  add column if not exists origin_lng double precision,
  add column if not exists origin_place_id text,
  add column if not exists destination_label text,
  add column if not exists destination_lat double precision,
  add column if not exists destination_lng double precision,
  add column if not exists destination_place_id text;

comment on column public.trip_itinerary_activity.origin_label is
  'Rótulo da origem do deslocamento (país/estado/cidade).';
comment on column public.trip_itinerary_activity.destination_label is
  'Rótulo do destino do deslocamento (país/estado/cidade).';
