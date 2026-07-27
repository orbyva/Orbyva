-- Poupança / transferência: tipo sob Despesa que NÃO conta no gasto do mês.
alter table public.type
  add column if not exists exclude_from_spend boolean not null default false;

comment on column public.type.exclude_from_spend is
  'Se true, lançamentos deste tipo não entram em despesa_total / teto (ex.: Poupança).';

-- Ajusta a view de totais se existir (definição típica Orbyva).
-- Se a view no projeto tiver outra forma, rode o CREATE abaixo após conferir.
do $$
begin
  execute $view$
    create or replace view public.vw_value_by_nature_year_month
    with (security_invoker = true)
    as
    select
      extract(year from (t.transaction_at at time zone 'UTC'))::int as year,
      extract(month from (t.transaction_at at time zone 'UTC'))::int as month,
      coalesce(
        sum(t.value) filter (where n.name = 'Receita'),
        0
      )::numeric as receita_total,
      coalesce(
        sum(t.value) filter (
          where n.name = 'Despesa'
            and coalesce(ty.exclude_from_spend, false) = false
        ),
        0
      )::numeric as despesa_total
    from public.transaction t
    join public.class c on c.id = t.class_id
    join public.type ty on ty.id = c.type_id
    join public.nature n on n.id = ty.nature_id
    group by 1, 2
  $view$;
exception
  when others then
    raise notice 'vw_value_by_nature_year_month não recriada (%). Ajuste manual ou use o fallback no app.', sqlerrm;
end $$;
