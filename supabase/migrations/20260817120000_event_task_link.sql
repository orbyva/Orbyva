-- Feature 066: evento de agenda pode ser de projeto, de tarefa ou avulso.
--
-- Até aqui `public.project_event` (feature 006) exigia `project_id`, então evento só existia preso a
-- um projeto. A agenda única (/tasks/agenda) precisa também de "reunião sobre a tarefa X" e de
-- compromisso avulso ("dentista"), daí `project_id` virar nullable e entrar `task_id`.
--
-- O nome da tabela continua `project_event` por decisão consciente (renomear custaria policies,
-- índices, `wipe_own_data` e ~15 arquivos de código/teste sem entregar nada ao usuário).
--
-- `wipe_own_data` NÃO muda: `task` já é apagada antes de `project_event` na lista da função, e o
-- cascade de `task_id` leva os eventos de tarefa junto.

alter table public.project_event
  alter column project_id drop not null;

alter table public.project_event
  add column if not exists task_id uuid references public.task(id) on delete cascade;

-- No máximo um vínculo: evento de projeto, evento de tarefa ou avulso — nunca os dois ao mesmo
-- tempo. O projeto de um evento de tarefa é derivado em memória (resolveEventProjectId), nunca
-- copiado, para não ficar defasado quando a tarefa muda de projeto.
do $$
begin
  alter table public.project_event
    add constraint project_event_single_link
    check (project_id is null or task_id is null);
exception
  when duplicate_object then null;
end $$;

-- `ends_at` existe desde a 006 mas nunca foi preenchido por nenhuma tela, então não há linha legada
-- que viole a constraint — é barato colocá-la antes de a 067 começar a gravar fim de evento.
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
  'Vínculo com projeto. Nulo quando o evento é de tarefa ou avulso (ver project_event_single_link).';

comment on column public.project_event.task_id is
  'Vínculo com tarefa. Os três estados válidos são: project_id preenchido (evento de projeto), '
  'task_id preenchido (evento de tarefa) ou ambos nulos (evento avulso) — a check constraint '
  'project_event_single_link garante que nunca haja os dois juntos.';
