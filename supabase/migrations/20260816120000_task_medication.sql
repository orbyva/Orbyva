-- Atalho de controle de medicações (feature 049) — marca uma tarefa/série como medicação
-- pra diferenciar o histórico de doses (dialog "Ocorrências de...") de recorrências comuns.

alter table public.task
  add column if not exists is_medication boolean not null default false;

comment on column public.task.is_medication is
  'Marca a tarefa (e a série materializada a partir dela) como uma medicação — usado pra exibir o histórico de doses tomadas (completed_at) no lugar do horário agendado.';
