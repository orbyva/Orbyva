-- Feature 006: status `planned` no Kanban de projetos.
--
-- A `20260806130000` já está no histórico deste remoto sem ter rodado o `drop`/`add` da check
-- (o arquivo local cresceu depois do apply — mesmo padrão de `project.notes` / `project_event`).
-- A tabela ficou com o CHECK da 001: `status in ('active', 'completed', 'archived')`.
-- O form manda `status: 'planned'` → PostgREST 400, SQLSTATE 23514.
-- Timestamp novo: esta migration ainda não está no histórico.

alter table public.project
  drop constraint if exists project_status_check;

alter table public.project
  alter column status set default 'planned';

do $$
begin
  alter table public.project
    add constraint project_status_check
    check (status in ('planned', 'active', 'completed', 'archived'));
exception
  when duplicate_object then null;
end $$;
