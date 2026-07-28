-- Valor gasto opcional na visita (com ou sem viagem).

alter table public.place_visit
  add column if not exists amount numeric(12, 2);

comment on column public.place_visit.amount is
  'Valor gasto no local (opcional). Só faz sentido com status visited.';
