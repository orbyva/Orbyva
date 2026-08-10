-- Escopo do deslocamento: entre dias (pernoite) vs no mesmo dia (ida e volta).
alter table public.trip_itinerary_activity
  add column if not exists transport_scope text;

comment on column public.trip_itinerary_activity.transport_scope is
  'Escopo do deslocamento: inter_day (conector entre dias) | same_day (timeline do dia). Null legado = inter_day.';
