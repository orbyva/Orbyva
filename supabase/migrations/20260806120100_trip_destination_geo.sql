-- Destino da viagem com geo (Places Autocomplete + clima).

alter table public.trip
  add column if not exists destination_lat double precision,
  add column if not exists destination_lng double precision,
  add column if not exists destination_place_id text;

comment on column public.trip.destination_lat is
  'Latitude WGS84 do destino (via Routes endLocation ao escolher no autocomplete).';
comment on column public.trip.destination_lng is
  'Longitude WGS84 do destino.';
comment on column public.trip.destination_place_id is
  'Google Place ID do destino (Places Autocomplete New).';
