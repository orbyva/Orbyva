-- Totais por tipo (categoria) no mês — donuts do dashboard sem baixar txs.
-- security_invoker: RLS filtra transaction do usuário.

create or replace function public.get_value_by_type_for_month(
  p_year int,
  p_month int
)
returns table (
  nature_name text,
  type_name text,
  type_color text,
  total_value numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    n.name::text as nature_name,
    ty.name::text as type_name,
    ty.hex_color::text as type_color,
    coalesce(
      sum(
        case
          when n.name = 'Despesa' then abs(t.value)
          else t.value
        end
      ),
      0
    )::numeric as total_value
  from public.transaction t
  join public.class c on c.id = t.class_id
  join public.type ty on ty.id = c.type_id
  join public.nature n on n.id = ty.nature_id
  where extract(year from (t.transaction_at::date)) = p_year
    and extract(month from (t.transaction_at::date)) = p_month
    and (
      n.name <> 'Despesa'
      or coalesce(ty.exclude_from_spend, false) = false
    )
  group by n.name, ty.name, ty.hex_color
  order by n.name, total_value desc;
$$;

revoke all on function public.get_value_by_type_for_month(int, int) from public;
grant execute on function public.get_value_by_type_for_month(int, int) to authenticated;

comment on function public.get_value_by_type_for_month(int, int) is
  'Totais por natureza/tipo no mês civil; despesa com abs e sem exclude_from_spend.';
