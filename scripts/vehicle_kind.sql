-- Suporte a carro e moto na tabela vehicle.
-- Rode no SQL Editor do Supabase.

alter table public.vehicle
  add column if not exists kind text not null default 'car';

alter table public.vehicle
  drop constraint if exists vehicle_kind_check;

alter table public.vehicle
  add constraint vehicle_kind_check
  check (kind in ('car', 'motorcycle'));

comment on column public.vehicle.kind is 'Tipo do veículo: car | motorcycle';
