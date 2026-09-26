-- Vínculo Tarefa ↔ Recorrência Financeira: uma tarefa-template (linked_installment_number
-- nulo) gera instâncias a partir das parcelas em aberto de uma Recorrência Financeira;
-- cada instância grava o número da parcela correspondente para sincronizar conclusão/pagamento.
--
-- `linked_recurring_id` segue `recurring_transaction.id` no remoto: bigint (identity).
-- O baseline local (`20240101000050`) declara a PK como uuid via `create table if not exists`,
-- então nunca converteu a tabela que já existia. `db push` em 2026-08-31 falhou com
-- SQLSTATE 42804 (uuid × bigint). Esta migration não chegou a entrar no histórico remoto.

alter table public.task
  add column if not exists linked_recurring_id bigint
    references public.recurring_transaction(id) on delete set null,
  add column if not exists linked_installment_number int;

create index if not exists task_linked_recurring_idx
  on public.task (linked_recurring_id, linked_installment_number);

comment on column public.task.linked_recurring_id is
  'Vincula a tarefa a uma Recorrência Financeira. Na tarefa-template '
  '(linked_installment_number nulo) define a origem; nas instâncias geradas, '
  'copiado do template.';
comment on column public.task.linked_installment_number is
  'Nulo na tarefa-template. Nas instâncias geradas, número da parcela da '
  'Recorrência Financeira vinculada correspondente a essa ocorrência.';
