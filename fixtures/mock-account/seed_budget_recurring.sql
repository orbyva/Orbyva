-- =============================================================================
-- Orbyva — seed Orçamento + Parcelas (demo prints)
-- Conta: 19f584d5-8649-4770-8569-cce62cf74b7f
--
-- Pré-requisito: categorias padrão já criadas (tour / ensureDefaultDimensions)
-- e, de preferência, 01-financas.csv importado (jul/2026).
--
-- Como usar:
--   1. Supabase → SQL Editor → New query
--   2. Cole este arquivo → Run
--   3. App → Finanças → Orçamento (Julho/2026) e Parcelas
--
-- Idempotente para ESTE user_id: apaga orçamentos/parcelas dele e reinsere.
-- =============================================================================

do $$
declare
  uid constant uuid := '19f584d5-8649-4770-8569-cce62cf74b7f';
  bm constant date := date '2026-07-01';

  -- types
  t_salario int;
  t_moradia int;
  t_alim int;
  t_transp int;
  t_lazer int;

  -- classes
  c_aluguel int;
  c_contas int;
  c_internet int;
  c_mercado int;
  c_rest int;
  c_delivery int;
  c_comb int;
  c_uber int;
  c_manut int;
  c_cinema int;
  c_viagem int;
  c_lazer_outros int;
  c_salario int;
begin
  if not exists (select 1 from auth.users where id = uid) then
    raise exception 'Usuário % não existe em auth.users', uid;
  end if;

  -- ── Resolver categorias do user ───────────────────────────────────────────
  select id into t_salario from public.type
  where user_id = uid and lower(name) = 'salário' limit 1;
  select id into t_moradia from public.type
  where user_id = uid and lower(name) = 'moradia' limit 1;
  select id into t_alim from public.type
  where user_id = uid and lower(name) = 'alimentação' limit 1;
  select id into t_transp from public.type
  where user_id = uid and lower(name) = 'transporte' limit 1;
  select id into t_lazer from public.type
  where user_id = uid and lower(name) = 'lazer' limit 1;

  if t_moradia is null or t_alim is null or t_transp is null or t_lazer is null then
    raise exception
      'Categorias padrão não encontradas. Faça login na conta demo e conclua o tour (criar categorias/subcategorias) antes.';
  end if;

  select id into c_aluguel from public.class
  where user_id = uid and type_id = t_moradia and lower(name) = 'aluguel' limit 1;
  select id into c_contas from public.class
  where user_id = uid and type_id = t_moradia and lower(name) = 'contas' limit 1;
  select id into c_internet from public.class
  where user_id = uid and type_id = t_moradia and lower(name) = 'internet' limit 1;

  select id into c_mercado from public.class
  where user_id = uid and type_id = t_alim and lower(name) = 'mercado' limit 1;
  select id into c_rest from public.class
  where user_id = uid and type_id = t_alim and lower(name) = 'restaurante' limit 1;
  select id into c_delivery from public.class
  where user_id = uid and type_id = t_alim and lower(name) = 'delivery' limit 1;

  select id into c_comb from public.class
  where user_id = uid and type_id = t_transp and lower(name) = 'combustível' limit 1;
  select id into c_uber from public.class
  where user_id = uid and type_id = t_transp and lower(name) = 'app / uber' limit 1;
  select id into c_manut from public.class
  where user_id = uid and type_id = t_transp and lower(name) = 'manutenção' limit 1;

  select id into c_cinema from public.class
  where user_id = uid and type_id = t_lazer and lower(name) = 'cinema' limit 1;
  select id into c_viagem from public.class
  where user_id = uid and type_id = t_lazer and lower(name) = 'viagem' limit 1;
  select id into c_lazer_outros from public.class
  where user_id = uid and type_id = t_lazer and lower(name) = 'outros' limit 1;

  if t_salario is not null then
    select id into c_salario from public.class
    where user_id = uid and type_id = t_salario and lower(name) = 'salário' limit 1;
  end if;

  if c_aluguel is null or c_mercado is null then
    raise exception
      'Classes padrão incompletas (Aluguel/Mercado). Rode o tour de categorias na conta demo.';
  end if;

  -- ── Limpeza ───────────────────────────────────────────────────────────────
  delete from public.monthly_budget where user_id = uid;
  delete from public.recurring_transaction where user_id = uid;

  -- ── Orçamento julho/2026 ──────────────────────────────────────────────────
  -- Pais (tipo, class_id null) + filhos (classe). Valores alinhados ao CSV demo.

  -- Moradia 2.520
  insert into public.monthly_budget (user_id, type_id, class_id, budget_month, planned_value)
  values
    (uid, t_moradia, null, bm, 2520.00),
    (uid, t_moradia, c_aluguel, bm, 2200.00),
    (uid, t_moradia, c_contas, bm, 200.00),
    (uid, t_moradia, c_internet, bm, 120.00);

  -- Alimentação 1.800
  insert into public.monthly_budget (user_id, type_id, class_id, budget_month, planned_value)
  values
    (uid, t_alim, null, bm, 1800.00),
    (uid, t_alim, c_mercado, bm, 1200.00),
    (uid, t_alim, c_rest, bm, 400.00),
    (uid, t_alim, c_delivery, bm, 200.00);

  -- Transporte 800
  insert into public.monthly_budget (user_id, type_id, class_id, budget_month, planned_value)
  values
    (uid, t_transp, null, bm, 800.00),
    (uid, t_transp, c_comb, bm, 500.00),
    (uid, t_transp, c_uber, bm, 150.00),
    (uid, t_transp, c_manut, bm, 150.00);

  -- Lazer 1.200 (viagem + cinema)
  insert into public.monthly_budget (user_id, type_id, class_id, budget_month, planned_value)
  values
    (uid, t_lazer, null, bm, 1200.00),
    (uid, t_lazer, c_cinema, bm, 150.00),
    (uid, t_lazer, c_viagem, bm, 900.00),
    (uid, t_lazer, c_lazer_outros, bm, 150.00);

  -- Meta de receita (pai Salário), se existir
  if t_salario is not null then
    insert into public.monthly_budget (user_id, type_id, class_id, budget_month, planned_value)
    values (uid, t_salario, null, bm, 9100.00);
    if c_salario is not null then
      insert into public.monthly_budget (user_id, type_id, class_id, budget_month, planned_value)
      values (uid, t_salario, c_salario, bm, 8200.00);
    end if;
  end if;

  -- ── Parcelas / recorrentes ────────────────────────────────────────────────
  -- Mix: mensais “fixas” (muitas parcelas) + parcelamentos finitos com progresso.

  -- Aluguel (fixa mensal — 12 meses a partir de jan/2026; jul já “pago” via CSV)
  insert into public.recurring_transaction (
    user_id, class_id, value, description, frequency,
    validity, due_day, installment_count, payment_start_date, status, paid_parcels
  ) values (
    uid, c_aluguel, 2200.00, 'Aluguel apartamento', 'Mensal',
    null, 5, 12, '2026-01-05', true,
    '[1, 2, 3, 4, 5, 6, 7]'::json
  );

  -- Internet fibra
  insert into public.recurring_transaction (
    user_id, class_id, value, description, frequency,
    validity, due_day, installment_count, payment_start_date, status, paid_parcels
  ) values (
    uid, c_internet, 119.90, 'Internet fibra 500 Mega', 'Mensal',
    null, 8, 12, '2026-01-08', true,
    '[1, 2, 3, 4, 5, 6, 7]'::json
  );

  -- Notebook (12x) — algumas pagas, próxima em agosto
  insert into public.recurring_transaction (
    user_id, class_id, value, description, frequency,
    validity, due_day, installment_count, payment_start_date, status, paid_parcels
  ) values (
    uid, coalesce(c_lazer_outros, c_cinema), 349.90, 'Notebook — 12x sem juros', 'Mensal',
    null, 10, 12, '2026-03-10', true,
    '[1, 2, 3, 4, 5]'::json
  );

  -- Sofá (6x) — em andamento
  insert into public.recurring_transaction (
    user_id, class_id, value, description, frequency,
    validity, due_day, installment_count, payment_start_date, status, paid_parcels
  ) values (
    uid, coalesce(c_contas, c_aluguel), 299.00, 'Sofá Living — 6x', 'Mensal',
    null, 15, 6, '2026-05-15', true,
    '[1, 2, 3]'::json
  );

  -- Curso online (10x) — parcela julho ainda aberta (boa p/ alerta)
  insert into public.recurring_transaction (
    user_id, class_id, value, description, frequency,
    validity, due_day, installment_count, payment_start_date, status, paid_parcels
  ) values (
    uid, coalesce(c_lazer_outros, c_cinema), 189.00, 'Curso de produto — 10x', 'Mensal',
    null, 20, 10, '2026-04-20', true,
    '[1, 2, 3]'::json
  );

  -- Streaming (12x a partir de jul — “próxima” / comprometido)
  insert into public.recurring_transaction (
    user_id, class_id, value, description, frequency,
    validity, due_day, installment_count, payment_start_date, status, paid_parcels
  ) values (
    uid, coalesce(c_lazer_outros, c_cinema), 55.90, 'Streaming família', 'Mensal',
    null, 28, 12, '2026-07-28', true,
    '[]'::json
  );

  raise notice 'Seed orçamento+parcelas OK para user % (mês %)', uid, bm;
end $$;
