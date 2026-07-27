-- Natureza Investimento: ledger de aportes/reservas sem contar como gasto.
insert into public.nature (name)
select 'Investimento'
where not exists (select 1 from public.nature where lower(name) = 'investimento');

-- Reaponta tipos "Poupança" (e similares) para a nova natureza, se existirem sob Despesa.
do $$
declare
  inv_id int;
  desp_id int;
  has_flag boolean;
begin
  select id into inv_id from public.nature where lower(name) = 'investimento' limit 1;
  select id into desp_id from public.nature where lower(name) = 'despesa' limit 1;
  if inv_id is null or desp_id is null then
    return;
  end if;

  update public.type
  set nature_id = inv_id
  where nature_id = desp_id
    and lower(name) in ('poupança', 'poupanca', 'investimento', 'investimentos', 'reserva');

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'type'
      and column_name = 'exclude_from_spend'
  ) into has_flag;

  if has_flag then
    update public.type
    set exclude_from_spend = true
    where nature_id = inv_id
      and lower(name) in ('poupança', 'poupanca', 'investimento', 'investimentos', 'reserva');
  end if;
end $$;
