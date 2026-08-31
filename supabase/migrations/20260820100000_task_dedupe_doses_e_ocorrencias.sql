-- Feature 074 — unicidade de dose e de ocorrência em `public.task`.
--
-- O que o app sempre assumiu e o banco nunca garantiu. O `comment on column` de
-- `20260816230000_medication.sql` já diz, sobre `task.dose_time`: "junto com due_date é a chave que
-- impede a mesma dose de ser materializada duas vezes". Era só uma convenção de aplicação: a
-- deduplicação vivia em `computeMissingDoses`/`computeMissingOccurrences`, em memória, dentro de uma
-- `fetchTasks` que **lê e escreve**. Duas cargas concorrentes (a `TaskList` monta a `AgendaGrid` na
-- aba "agenda"; o `<StrictMode>` duplica efeitos em dev) leem o mesmo "antes", calculam o mesmo
-- conjunto faltante e inserem as duas — e nada no banco impedia.
--
-- Duas partes, nesta ordem obrigatória:
--   1. apagar as duplicatas que já existam (sem isso o `create unique index` falha);
--   2. criar os dois índices únicos **parciais**.
--
-- ## Escolha de qual linha sobrevive
--
-- Nunca arbitrária: primeiro a linha **concluída** (`completed_at not null`), depois a mais antiga
-- por `created_at`, e `id` como desempate final para o resultado ser determinístico. Apagar a dose
-- concluída e manter a pendente destruiria o histórico de adesão da 064 — a dose tomada é o dado, a
-- pendente é a previsão.
--
-- ## Por que os índices são parciais
--
-- - `(medication_id, due_date, dose_time)`: só onde `medication_id is not null`. Tarefa comum não é
--   dose e não pode ser restringida por essa chave.
-- - `(recurrence_origin_id, due_date)`: só onde `recurrence_origin_id is not null` **e**
--   `linked_recurring_id is null`. As séries vindas da Recorrência Financeira ficam de fora de
--   propósito: a chave delas é `linked_installment_number`, e duas parcelas podem cair legitimamente
--   no mesmo `due_date` (parcela em atraso + parcela do mês, por exemplo).
--
-- Consequência do lado do cliente: `insertMaterializedTasks` (`src/api/tasks/taskRows.ts`) escreve
-- com `upsert(..., { ignoreDuplicates: true })` **sem** `onConflict`. O parâmetro `on_conflict` do
-- PostgREST vira um `ON CONFLICT (colunas)` sem predicado, e o Postgres não infere índice parcial a
-- partir disso; sem o parâmetro sai um `ON CONFLICT DO NOTHING` sem alvo, que cobre qualquer
-- constraint, inclusive parcial. Verificado em `supabase/tests/task_dedupe_doses/run.sh`.
--
-- ## Escopo da limpeza
--
-- Só linhas cobertas pelos índices: `dose_time`/`due_date` nulos ficam de fora porque um índice
-- único trata NULL como distinto e não os barraria de qualquer forma — apagá-los seria destruir
-- dado que a constraint nem exige.
--
-- ATENÇÃO ao aplicar: as linhas apagadas levam junto o que depende delas por FK em cascata
-- (subtarefas via `parent_task_id`, registros de tempo). É esperado — são linhas duplicadas — mas é
-- o motivo de a tarefa "Aguarda o usuário" da feature 074 mandar contar antes e depois.

-- ---- 1. duplicatas de dose --------------------------------------------------------------------
with ranked as (
  select
    id,
    row_number() over (
      partition by medication_id, due_date, dose_time
      order by (completed_at is null), created_at, id
    ) as rn
  from public.task
  where medication_id is not null
    and due_date is not null
    and dose_time is not null
)
delete from public.task t
 using ranked r
 where t.id = r.id
   and r.rn > 1;

-- ---- 2. duplicatas de ocorrência de recorrência simples ---------------------------------------
with ranked as (
  select
    id,
    row_number() over (
      partition by recurrence_origin_id, due_date
      order by (completed_at is null), created_at, id
    ) as rn
  from public.task
  where recurrence_origin_id is not null
    and linked_recurring_id is null
    and due_date is not null
)
delete from public.task t
 using ranked r
 where t.id = r.id
   and r.rn > 1;

-- ---- 3. os índices ----------------------------------------------------------------------------
create unique index if not exists task_medication_dose_unique_idx
  on public.task (medication_id, due_date, dose_time)
  where medication_id is not null
    and due_date is not null
    and dose_time is not null;

create unique index if not exists task_recurrence_occurrence_unique_idx
  on public.task (recurrence_origin_id, due_date)
  where recurrence_origin_id is not null
    and linked_recurring_id is null
    and due_date is not null;

comment on index public.task_medication_dose_unique_idx is
  'Feature 074: uma dose por (tratamento, dia, horário). É a chave que o comment de task.dose_time '
  'já descrevia desde a 064, agora garantida pelo banco em vez de só pela aplicação.';
comment on index public.task_recurrence_occurrence_unique_idx is
  'Feature 074: uma ocorrência por (série, dia) na recorrência simples. Séries vinculadas à '
  'Recorrência Financeira ficam de fora — a chave delas é linked_installment_number, e duas '
  'parcelas podem cair no mesmo due_date.';
