-- Feature 009: horário opcional do prazo da tarefa (avulsa ou instância recorrente).

alter table public.task
  add column if not exists due_time time;
