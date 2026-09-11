do $$
declare
  u1 uuid := '11111111-1111-1111-1111-111111111111';
  u2 uuid := '22222222-2222-2222-2222-222222222222';
  r jsonb;
  claim text;
  n int;
begin
  -- Cota: 5ª checkout passa, 6ª barra. Portal é bucket separado.
  for i in 1..5 loop
    r := public.billing_try_consume(u1, 'checkout', 5);
    if r->>'ok' <> 'true' then
      raise exception 'FALHOU: checkout % deveria passar, veio %', i, r;
    end if;
  end loop;
  r := public.billing_try_consume(u1, 'checkout', 5);
  if r->>'ok' = 'true' or r->>'reason' <> 'limit' then
    raise exception 'FALHOU: 6º checkout deveria bater no limite, veio %', r;
  end if;

  r := public.billing_try_consume(u1, 'portal', 8);
  if r->>'ok' <> 'true' then
    raise exception 'FALHOU: portal não deveria compartilhar cota do checkout, veio %', r;
  end if;

  r := public.billing_try_consume(u2, 'checkout', 5);
  if r->>'ok' <> 'true' then
    raise exception 'FALHOU: cota é por usuário, u2 deveria passar, veio %', r;
  end if;

  r := public.billing_try_consume(null, 'checkout', 5);
  if r->>'ok' = 'true' then
    raise exception 'FALHOU: user nulo deveria falhar';
  end if;
  r := public.billing_try_consume(u1, 'other', 5);
  if r->>'reason' <> 'invalid_kind' then
    raise exception 'FALHOU: kind inválido, veio %', r;
  end if;

  -- Claim: primeiro cria, segundo em voo, finish grava Customer, terceiro reusa.
  r := public.billing_claim_customer(u1);
  if r->>'ok' <> 'true' or r->>'action' <> 'create' then
    raise exception 'FALHOU: primeiro claim deveria criar, veio %', r;
  end if;
  claim := r->>'claim';

  r := public.billing_claim_customer(u1);
  if r->>'ok' = 'true' or r->>'reason' <> 'inflight' then
    raise exception 'FALHOU: segundo claim deveria ser inflight, veio %', r;
  end if;

  r := public.billing_finish_customer(u1, claim, 'cus_test_a');
  if r->>'ok' <> 'true' or r->>'customer_id' <> 'cus_test_a' then
    raise exception 'FALHOU: finish deveria gravar Customer, veio %', r;
  end if;

  r := public.billing_claim_customer(u1);
  if r->>'ok' <> 'true' or r->>'action' <> 'existing' or r->>'customer_id' <> 'cus_test_a' then
    raise exception 'FALHOU: claim seguinte deveria reusar Customer, veio %', r;
  end if;

  select count(*) into n from public.billing_customer_claim where user_id = u1;
  if n <> 0 then
    raise exception 'FALHOU: claim deveria ter sido limpo após finish';
  end if;

  -- Unique: dois perfis não compartilham o mesmo Customer.
  begin
    update public.profiles
    set stripe_customer_id = 'cus_test_a'
    where id = u2;
    raise exception 'FALHOU: unique de stripe_customer_id não barrou duplicata';
  exception
    when unique_violation then null;
  end;

  -- Claim vencido pode ser retomado.
  insert into public.billing_customer_claim (user_id, claim_token, claimed_at)
  values (u2, 'old-token', now() - interval '2 minutes');
  r := public.billing_claim_customer(u2);
  if r->>'ok' <> 'true' or r->>'action' <> 'create' then
    raise exception 'FALHOU: claim vencido deveria ser retomado, veio %', r;
  end if;
  perform public.billing_release_customer_claim(u2, r->>'claim');

  -- finish com claim errado falha se ainda não há Customer.
  r := public.billing_finish_customer(u2, 'token-falso', 'cus_test_b');
  if r->>'ok' = 'true' then
    raise exception 'FALHOU: finish com claim errado deveria falhar, veio %', r;
  end if;

  raise notice 'OK: comportamento da trava Stripe conferido';
end $$;
