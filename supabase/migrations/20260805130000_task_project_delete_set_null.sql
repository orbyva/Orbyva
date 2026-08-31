-- task.project_id deve virar null ao excluir o projeto (tarefas continuam existindo,
-- conforme a confirmação de exclusão na UI), não cascatear a exclusão das tarefas.

alter table public.task
  drop constraint if exists task_project_id_fkey;

alter table public.task
  add constraint task_project_id_fkey
  foreign key (project_id) references public.project(id) on delete set null;
