do $$
declare
  rls_on boolean;
begin
  if to_regclass('public.orb_api_usage') is null then
    raise exception 'FALHOU: orb_api_usage não existe';
  end if;
  if to_regprocedure('public.orb_try_consume(uuid, integer, integer)') is null then
    raise exception 'FALHOU: orb_try_consume ausente';
  end if;

  select c.relrowsecurity into rls_on
  from pg_class c
  join pg_namespace ns on ns.oid = c.relnamespace
  where ns.nspname = 'public' and c.relname = 'orb_api_usage';
  if rls_on is not true then
    raise exception 'FALHOU: RLS desligada em orb_api_usage';
  end if;

  if has_function_privilege('authenticated', 'public.orb_try_consume(uuid, integer, integer)', 'execute') then
    raise exception 'FALHOU: authenticated não pode executar orb_try_consume (zeraria a própria cota)';
  end if;
  if has_function_privilege('anon', 'public.orb_try_consume(uuid, integer, integer)', 'execute') then
    raise exception 'FALHOU: anon não pode executar orb_try_consume';
  end if;
  if not has_function_privilege('service_role', 'public.orb_try_consume(uuid, integer, integer)', 'execute') then
    raise exception 'FALHOU: service_role precisa executar orb_try_consume';
  end if;
  if has_table_privilege('authenticated', 'public.orb_api_usage', 'select')
     or has_table_privilege('authenticated', 'public.orb_api_usage', 'update')
     or has_table_privilege('authenticated', 'public.orb_api_usage', 'delete') then
    raise exception 'FALHOU: authenticated não pode tocar em orb_api_usage';
  end if;

  raise notice 'OK: schema do limite da Orb conferido';
end $$;
