-- Liga gasto do lugar à despesa da viagem (sem duplicar no extrato).

alter table public.trip_expense
  add column if not exists place_visit_id uuid references public.place_visit(id) on delete cascade;

create unique index if not exists trip_expense_place_visit_uidx
  on public.trip_expense (place_visit_id)
  where place_visit_id is not null;

comment on column public.trip_expense.place_visit_id is
  'Quando preenchido, o gasto veio do valor registrado em um lugar visitado.';
