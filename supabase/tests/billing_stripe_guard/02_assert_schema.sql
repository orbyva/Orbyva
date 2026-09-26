do $$
declare
  n int;
  rls_on boolean;
begin
  if to_regclass('public.billing_api_usage') is null then
    raise exception 'FALHOU: billing_api_usage não existe';
  end if;
  if to_regclass('public.billing_customer_claim') is null then
    raise exception 'FALHOU: billing_customer_claim não existe';
  end if;

  select count(*) into n
  from pg_indexes
  where schemaname = 'public'
    and indexname = 'profiles_stripe_customer_id_uidx';
  if n <> 1 then
    raise exception 'FALHOU: índice único de stripe_customer_id ausente';
  end if;

  if to_regprocedure('public.billing_try_consume(uuid, text, integer)') is null then
    raise exception 'FALHOU: billing_try_consume ausente';
  end if;
  if to_regprocedure('public.billing_claim_customer(uuid)') is null then
    raise exception 'FALHOU: billing_claim_customer ausente';
  end if;
  if to_regprocedure('public.billing_finish_customer(uuid, text, text)') is null then
    raise exception 'FALHOU: billing_finish_customer ausente';
  end if;
  if to_regprocedure('public.billing_release_customer_claim(uuid, text)') is null then
    raise exception 'FALHOU: billing_release_customer_claim ausente';
  end if;

  select c.relrowsecurity into rls_on
  from pg_class c
  join pg_namespace ns on ns.oid = c.relnamespace
  where ns.nspname = 'public' and c.relname = 'billing_api_usage';
  if rls_on is not true then
    raise exception 'FALHOU: RLS desligada em billing_api_usage';
  end if;

  raise notice 'OK: schema da trava Stripe conferido';
end $$;
