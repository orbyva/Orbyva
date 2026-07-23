-- Vincula abastecimento à transação financeira.
-- Rode no SQL Editor do Supabase.

alter table public.vehicle_fuel_log
  add column if not exists transaction_id bigint;

comment on column public.vehicle_fuel_log.transaction_id is
  'ID da transação em Finanças criada junto com o abastecimento';
