-- Feature 007: data de início da tarefa, usada para desenhar a barra no Gantt do projeto.

alter table public.task
  add column if not exists start_date date;
