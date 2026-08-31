-- Consultas médicas no calendário geral (feature 061) — espelha `is_medication` (feature 049,
-- 20260816120000_task_medication.sql): uma consulta é uma tarefa comum marcada com esta flag, o que
-- lhe dá de graça a aparição no calendário geral, a recorrência (`recurrence_rule` +
-- `materializeRecurringInstances`) e o `completed_at` marcando a hora real do comparecimento.
--
-- Sem RLS nova: `public.task` já é escopada por `user_id = auth.uid()` (20260803121500) e uma
-- coluna booleana não muda isso. Dado de saúde é sensível — a leitura continua restrita ao dono.

alter table public.task
  add column if not exists is_consultation boolean not null default false;

comment on column public.task.is_consultation is
  'Marca a tarefa (e a série materializada a partir dela) como uma consulta médica — usado pra renderizar o item com ícone de estetoscópio no calendário geral e pra exibir "Compareceu às" (completed_at) no histórico da série.';
