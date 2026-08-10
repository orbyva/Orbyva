-- Horário de chegada em deslocamentos do roteiro (saída = activity_time).
alter table public.trip_itinerary_activity
  add column if not exists arrival_time text;

comment on column public.trip_itinerary_activity.arrival_time is
  'Horário de chegada do deslocamento (ex.: 14:30). Saída fica em activity_time.';
