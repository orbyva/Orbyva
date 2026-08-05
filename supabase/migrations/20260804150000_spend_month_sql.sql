-- Totais por natureza/mês alinhados ao app (data civil do lançamento + abs na despesa).
-- security_invoker: RLS do usuário autenticado filtra transaction.
-- DROP + CREATE: CREATE OR REPLACE não pode remover colunas da view antiga (42P16).

drop view if exists public.vw_value_by_nature_year_month cascade;

create view public.vw_value_by_nature_year_month
with (security_invoker = true)
as
select
  extract(year from (t.transaction_at::date))::int as year,
  extract(month from (t.transaction_at::date))::int as month,
  coalesce(
    sum(t.value) filter (where n.name = 'Receita'),
    0
  )::numeric as receita_total,
  coalesce(
    sum(abs(t.value)) filter (
      where n.name = 'Despesa'
        and coalesce(ty.exclude_from_spend, false) = false
    ),
    0
  )::numeric as despesa_total
from public.transaction t
join public.class c on c.id = t.class_id
join public.type ty on ty.id = c.type_id
join public.nature n on n.id = ty.nature_id
group by 1, 2;

comment on view public.vw_value_by_nature_year_month is
  'Receita/despesa por ano-mês; despesa ignora exclude_from_spend; mês pela data civil do lançamento.';

grant select on public.vw_value_by_nature_year_month to authenticated;

-- RPC pontual (1 mês) — evita baixar o ledger no client.
create or replace function public.get_value_by_nature_for_month(
  p_year int,
  p_month int
)
returns table (
  year int,
  month int,
  receita_total numeric,
  despesa_total numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    v.year,
    v.month,
    v.receita_total,
    v.despesa_total
  from public.vw_value_by_nature_year_month v
  where v.year = p_year
    and v.month = p_month;
$$;

revoke all on function public.get_value_by_nature_for_month(int, int) from public;
grant execute on function public.get_value_by_nature_for_month(int, int) to authenticated;
