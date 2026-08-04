-- Índices compostos para hot paths (hub, txs, hábitos, orçamento, recorrências)

create index if not exists transaction_user_at_idx
  on public.transaction (user_id, transaction_at desc);

create index if not exists transaction_user_class_idx
  on public.transaction (user_id, class_id);

create index if not exists transaction_user_recurring_idx
  on public.transaction (user_id, recurring_transaction_id)
  where recurring_transaction_id is not null;

create index if not exists habit_log_habit_date_idx
  on public.habit_log (habit_id, date desc);

create index if not exists monthly_budget_user_month_idx
  on public.monthly_budget (user_id, budget_month);

create index if not exists recurring_transaction_user_status_idx
  on public.recurring_transaction (user_id, status);

create index if not exists class_user_type_idx
  on public.class (user_id, type_id);

create index if not exists trip_milestone_trip_due_idx
  on public.trip_milestone (trip_id, due_date);
