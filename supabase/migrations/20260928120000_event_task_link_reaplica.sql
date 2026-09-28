-- Reaplica o vínculo evento↔tarefa da feature 066, que ficou registrado sem ter sido executado.
--
-- **O que aconteceu.** `20260817120000_event_task_link.sql` consta no histórico do Supabase como
-- aplicada (`supabase migration list --linked` devolve zero pendentes), mas a coluna nunca existiu
-- no banco: em 2026-09-28, `information_schema.columns` para `public.project_event` devolvia apenas
-- `created_at, ends_at, id, project_id, starts_at, title, user_id`. É o descompasso de bookkeeping
-- do CLI que a CLAUDE.md do projeto registra — e, por causa dele, `supabase db push` não tinha mais
-- o que aplicar: para o CLI, o trabalho já estava feito.
--
-- **Por que isso era urgente.** O código das features 066/067 está em produção e escreve a coluna:
-- `EventFormDialog` manda `task_id` no payload e `createProjectEvent` insere o objeto inteiro. Sem a
-- coluna, criar ou editar evento pela Agenda falhava no Postgres.
--
-- **Por que um arquivo novo em vez de reescrever o antigo.** Mexer no `20260817120000` não mudaria
-- nada: o CLI decide o que rodar pelo histórico, não pelo conteúdo. Um timestamp novo é o único
-- caminho que o `db push` enxerga.
--
-- Todo comando aqui é idempotente, de propósito: se parte da 066 tiver sido aplicada em algum
-- ambiente, rodar isto de novo não quebra nada. É cópia fiel do efeito pretendido pela original,
-- sem nenhuma decisão de schema nova.

-- Já era nullable neste remoto (a 076 fez isso para o convite de evento), mas repetir é inofensivo
-- e mantém o arquivo autossuficiente para um banco criado do zero.
alter table public.project_event
  alter column project_id drop not null;

alter table public.project_event
  add column if not exists task_id uuid references public.task(id) on delete cascade;

-- No máximo um vínculo: evento de projeto, evento de tarefa ou avulso — nunca os dois ao mesmo
-- tempo. O projeto de um evento de tarefa é derivado em memória (`resolveEventProjectId`), nunca
-- copiado, para não ficar defasado quando a tarefa muda de projeto.
do $$
begin
  alter table public.project_event
    add constraint project_event_single_link
    check (project_id is null or task_id is null);
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table public.project_event
    add constraint project_event_ends_after_starts
    check (ends_at is null or ends_at > starts_at);
exception
  when duplicate_object then null;
end $$;

create index if not exists project_event_task_idx
  on public.project_event (task_id, starts_at)
  where task_id is not null;

create index if not exists project_event_user_starts_idx
  on public.project_event (user_id, starts_at);

comment on table public.project_event is
  'Eventos da agenda. Nome histórico: nasceu preso a projeto (feature 006) e desde a 066 também '
  'cobre evento de tarefa e evento avulso.';

comment on column public.project_event.project_id is
  'Vínculo com projeto. Nulo quando o evento é de tarefa, avulso, ou recebido por convite (076).';

comment on column public.project_event.task_id is
  'Vínculo com tarefa. Os três estados válidos são: project_id preenchido (evento de projeto), '
  'task_id preenchido (evento de tarefa) ou ambos nulos (evento avulso) — a check constraint '
  'project_event_single_link garante que nunca haja os dois juntos.';
