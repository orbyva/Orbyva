-- Modo do deslocamento entre dias (voo / terra / outro).
alter table public.trip_itinerary_activity
  add column if not exists transport_mode text;

comment on column public.trip_itinerary_activity.transport_mode is
  'Modo do deslocamento: flight | train | bus | car | other (quando category = transport).';
