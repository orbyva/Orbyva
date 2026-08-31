-- Feature 008: prioridade de tarefa (baixa/média/alta), sem valor = sem prioridade.

alter table public.task
  add column if not exists priority text;

do $$
begin
  alter table public.task
    add constraint task_priority_check
    check (priority in ('low', 'medium', 'high'));
exception
  when duplicate_object then null;
end $$;
