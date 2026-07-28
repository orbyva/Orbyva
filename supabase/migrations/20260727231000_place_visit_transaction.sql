-- Vincula visita de lugar à transação financeira (opcional).

alter table public.place_visit
  add column if not exists transaction_id bigint;

comment on column public.place_visit.transaction_id is
  'ID da transação em Finanças criada junto com o valor gasto no lugar.';
