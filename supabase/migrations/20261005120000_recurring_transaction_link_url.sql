-- Feature 206: uma URL livre por recorrência (ex.: onde se faz o pagamento).
-- Convenção do projeto para "um link na linha": `trip_itinerary_activity.link_url`
-- (20260804120000_improve_md_features.sql).
alter table public.recurring_transaction
  add column if not exists link_url text;

comment on column public.recurring_transaction.link_url is
  'URL livre da recorrência (ex.: onde se faz o pagamento). Opcional, uma por linha.';
