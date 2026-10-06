do $$
declare
  u1 uuid := '11111111-1111-1111-1111-111111111111';
  u2 uuid := '22222222-2222-2222-2222-222222222222';
  u3 uuid := '33333333-3333-3333-3333-333333333333';
  r jsonb;
  n int;
  v_day timestamptz :=
    date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
begin
  -- Cota diária: 3 passam, a 4ª bate em 'day' com retry até a meia-noite de SP.
  for i in 1..3 loop
    r := public.orb_try_consume(u1, 3, 100);
    if r->>'ok' <> 'true' then
      raise exception 'FALHOU: pedido % deveria passar, veio %', i, r;
    end if;
    if (r->>'remaining')::int <> 3 - i then
      raise exception 'FALHOU: remaining do pedido % deveria ser %, veio %', i, 3 - i, r;
    end if;
  end loop;
  r := public.orb_try_consume(u1, 3, 100);
  if r->>'ok' = 'true' or r->>'reason' <> 'day' then
    raise exception 'FALHOU: 4º pedido deveria bater na cota diária, veio %', r;
  end if;
  if (r->>'retry_after_seconds')::int not between 1 and 86400 then
    raise exception 'FALHOU: retry_after da cota diária fora de 1..86400, veio %', r;
  end if;

  -- Recusa não consome: o contador do dia continua em 3.
  select request_count into n from public.orb_api_usage
  where user_id = u1 and kind = 'day' and window_start = v_day;
  if n <> 3 then
    raise exception 'FALHOU: pedido recusado não pode incrementar o dia (contador = %)', n;
  end if;

  -- Cota é por usuário.
  r := public.orb_try_consume(u2, 3, 100);
  if r->>'ok' <> 'true' then
    raise exception 'FALHOU: u2 tem cota própria, veio %', r;
  end if;

  -- Rajada: 2 por minuto passam, a 3ª bate em 'minute' sem gastar a diária.
  r := public.orb_try_consume(u3, 100, 2);
  r := public.orb_try_consume(u3, 100, 2);
  if r->>'ok' <> 'true' then
    raise exception 'FALHOU: 2º pedido do minuto deveria passar, veio %', r;
  end if;
  r := public.orb_try_consume(u3, 100, 2);
  if r->>'ok' = 'true' or r->>'reason' <> 'minute' then
    raise exception 'FALHOU: 3º pedido no mesmo minuto deveria bater na rajada, veio %', r;
  end if;
  if (r->>'retry_after_seconds')::int not between 1 and 60 then
    raise exception 'FALHOU: retry_after da rajada fora de 1..60, veio %', r;
  end if;
  if (r->>'remaining')::int <> 98 then
    raise exception 'FALHOU: rajada recusada não pode gastar a diária, veio %', r;
  end if;

  -- Limpeza: linha de 3 dias atrás do próprio usuário some na próxima chamada; a de outro fica.
  insert into public.orb_api_usage (user_id, kind, window_start, request_count)
  values (u2, 'day', now() - interval '3 days', 50), (u1, 'day', now() - interval '3 days', 50);
  r := public.orb_try_consume(u2, 100, 100);
  select count(*) into n from public.orb_api_usage
  where user_id = u2 and window_start < now() - interval '2 days';
  if n <> 0 then
    raise exception 'FALHOU: linhas antigas de u2 deveriam ter sido apagadas';
  end if;
  select count(*) into n from public.orb_api_usage
  where user_id = u1 and window_start < now() - interval '2 days';
  if n <> 1 then
    raise exception 'FALHOU: limpeza não pode apagar linhas de outro usuário';
  end if;

  -- Entradas inválidas.
  r := public.orb_try_consume(null, 10, 10);
  if r->>'reason' <> 'invalid_user' then
    raise exception 'FALHOU: user nulo, veio %', r;
  end if;
  r := public.orb_try_consume(u1, -1, 10);
  if r->>'reason' <> 'invalid_limit' then
    raise exception 'FALHOU: limite negativo, veio %', r;
  end if;
  r := public.orb_try_consume(u1, 10, null);
  if r->>'reason' <> 'invalid_limit' then
    raise exception 'FALHOU: limite nulo, veio %', r;
  end if;

  raise notice 'OK: comportamento do limite da Orb conferido';
end $$;
