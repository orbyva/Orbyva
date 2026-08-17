-- Marco no Gantt (feature 037) — tarefa sem duração, um ponto na linha do tempo (due_date) em
-- vez de uma barra normal.

alter table public.task
  add column if not exists is_milestone boolean not null default false;

comment on column public.task.is_milestone is
  'Marca a tarefa como um marco no Gantt: sem duração, exibida como um ponto na data de prazo (due_date) em vez de uma barra.';
