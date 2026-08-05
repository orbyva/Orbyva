-- =============================================================================
-- Orbyva — Views reconstruídas: vw_monthly_budget_summary,
-- vw_recurring_transaction_with_nature
--
-- Assim como as tabelas núcleo (ver 20240101000050_baseline_core_schema.sql),
-- essas duas views foram criadas à mão no SQL Editor e nunca tiveram o
-- `create view` versionado em nenhuma migration. `20240101000100_tenancy_rls`
-- só faz `alter view ... set (security_invoker = true)` de forma defensiva
-- (não falha se a view não existir) — por isso o `db push` nunca acusou o
-- problema, mas as telas de Orçamento e "parcelas fixas" ficariam
-- quebradas (400 ao consultar a view) num projeto novo.
--
-- Reconstrução:
-- - vw_monthly_budget_summary: campos e regra de status/percentual foram
--   inferidos do consumo real em src/pages/admin/finance/components/
--   BudgetTable.tsx (getStatusFromPercentage) e src/api/finance/budget.ts —
--   não é o SQL original, é uma reconstrução funcionalmente equivalente.
--   Vale testar a tela de Orçamento com atenção antes de confiar 100%.
-- - vw_recurring_transaction_with_nature: reconstruída a partir do uso em
--   src/api/recurring.ts (sumRecurringByNature) — soma de recurring_transaction
--   por nature_id, filtrando status = true.
-- =============================================================================

create or replace view public.vw_monthly_budget_summary
with (security_invoker = true)
as
select
  mb.id,
  mb.type_id,
  ty.name as type_name,
  mb.class_id,
  cl.name as class_name,
  n.name as nature_name,
  mb.budget_month,
  mb.planned_value,
  case when n.name = 'Despesa' then coalesce(sum(t.value), 0) else 0 end as expense_value,
  case when n.name = 'Receita' then coalesce(sum(t.value), 0) else 0 end as income_value,
  case when n.name = 'Despesa' then coalesce(sum(t.value), 0) else 0 end as spent_value,
  mb.planned_value - coalesce(sum(t.value), 0) as remaining_value,
  case
    when mb.planned_value > 0
      then round(coalesce(sum(t.value), 0) / mb.planned_value * 100, 2)
    else 0
  end as percentage_used,
  case
    when n.name = 'Receita' then
      case
        when mb.planned_value > 0
          and coalesce(sum(t.value), 0) / mb.planned_value * 100 >= 100 then 'OK'
        when mb.planned_value > 0
          and coalesce(sum(t.value), 0) / mb.planned_value * 100 >= 70 then 'QUASE'
        else 'ATENCAO'
      end
    else
      case
        when mb.planned_value > 0
          and coalesce(sum(t.value), 0) / mb.planned_value * 100 > 100 then 'ESTOUROU'
        when mb.planned_value > 0
          and coalesce(sum(t.value), 0) / mb.planned_value * 100 >= 90 then 'CRITICO'
        when mb.planned_value > 0
          and coalesce(sum(t.value), 0) / mb.planned_value * 100 >= 70 then 'ATENCAO'
        else 'OK'
      end
  end as status
from public.monthly_budget mb
join public.type ty on ty.id = mb.type_id
left join public.class cl on cl.id = mb.class_id
join public.nature n on n.id = ty.nature_id
left join public.transaction t
  on t.user_id = mb.user_id
  and (
    (mb.class_id is not null and t.class_id = mb.class_id)
    or (
      mb.class_id is null
      and t.class_id in (select c2.id from public.class c2 where c2.type_id = mb.type_id)
    )
  )
  and to_char(t.transaction_at at time zone 'UTC', 'YYYY-MM') = to_char(mb.budget_month, 'YYYY-MM')
group by mb.id, mb.type_id, ty.name, mb.class_id, cl.name, n.name, mb.budget_month, mb.planned_value;

create or replace view public.vw_recurring_transaction_with_nature
with (security_invoker = true)
as
select
  rt.user_id,
  n.id as nature_id,
  n.name as nature_name,
  rt.status,
  sum(rt.value) as sum
from public.recurring_transaction rt
join public.class c on c.id = rt.class_id
join public.type ty on ty.id = c.type_id
join public.nature n on n.id = ty.nature_id
group by rt.user_id, n.id, n.name, rt.status;
