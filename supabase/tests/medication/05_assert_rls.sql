\set ON_ERROR_STOP on

-- Medicação é dado de saúde: o isolamento por `user_id = auth.uid()` precisa valer de verdade,
-- então aqui o teste roda como `authenticated` com a GUC do `auth.uid()` setada — não como
-- superusuário, que ignora RLS. Roda por último porque termina apagando um usuário de
-- `auth.users`; qualquer assertiva sobre as linhas do backfill precisa vir antes.
set role authenticated;

-- ---- dono: enxerga só os próprios tratamentos (2 dos 3 que o backfill criou) ------------------
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);

do $$
declare n int;
begin
  select count(*) into n from public.medication;
  if n <> 2 then
    raise exception 'FALHOU: o dono deveria ver 2 tratamentos (Losartana, Amoxicilina), viu %', n;
  end if;

  -- Criar um tratamento novo com múltiplos horários — o caso que a 049 não conseguia representar.
  insert into public.medication
    (id, user_id, name, dose_amount, dose_unit, instructions, times, interval_days, started_on)
  values
    ('ffff0000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
     'Ibuprofeno', 1, 'comprimido', 'em jejum',
     array['08:00'::time, '20:00'::time], 1, '2026-08-17');

  select count(*) into n from public.medication;
  if n <> 3 then raise exception 'FALHOU: o dono deveria ver 3 tratamentos depois de criar um, viu %', n; end if;
end $$;

-- ---- outro usuário: não enxerga, não altera, não apaga, não forja ----------------------------
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);

do $$
declare n int;
begin
  select count(*) into n from public.medication;
  if n <> 1 then
    raise exception 'FALHOU: o intruso deveria ver só o próprio tratamento (Metformina), viu % — dado de saúde vazando', n;
  end if;

  update public.medication set name = 'invadido'
   where id = 'ffff0000-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALHOU: update alcançou o tratamento alheio'; end if;

  delete from public.medication where id = 'ffff0000-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALHOU: delete alcançou o tratamento alheio'; end if;

  begin
    insert into public.medication (user_id, name, times, started_on) values
      ('11111111-1111-1111-1111-111111111111', 'Forjado', array['08:00'::time], '2026-08-17');
    raise exception 'FALHOU: insert com user_id de outro usuário deveria ser bloqueado pela RLS';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;

-- ---- controle negativo da RLS ---------------------------------------------------------------
-- Sem isto, os números acima passariam também se as linhas simplesmente não existissem. Como
-- superusuário (que ignora RLS) todas têm que aparecer — é o que prova que o recorte veio da policy.
do $$
declare n int;
begin
  select count(*) into n from public.medication;
  if n <> 4 then
    raise exception 'CONTROLE NEGATIVO FALHOU: sem RLS deveriam existir 4 tratamentos, existem % — o teste de vazamento estava medindo tabela vazia', n;
  end if;
end $$;

-- ---- wipe_own_data leva tratamento e dose do dono, e só as dele -----------------------------
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);

do $$
declare n int;
begin
  perform public.wipe_own_data();

  select count(*) into n from public.medication
   where user_id = '11111111-1111-1111-1111-111111111111'::uuid;
  if n <> 0 then
    raise exception 'FALHOU: wipe_own_data deixou % tratamento(s) do dono para trás', n;
  end if;

  select count(*) into n from public.task
   where user_id = '11111111-1111-1111-1111-111111111111'::uuid;
  if n <> 0 then
    raise exception 'FALHOU: wipe_own_data deixou % dose(s)/tarefa(s) do dono para trás', n;
  end if;

  select count(*) into n from public.medication
   where user_id = '22222222-2222-2222-2222-222222222222'::uuid;
  if n <> 1 then
    raise exception 'FALHOU: wipe_own_data apagou tratamento de outro usuário (sobrou %)', n;
  end if;
end $$;

-- ---- apagar a conta leva os tratamentos junto (on delete cascade) ---------------------------
do $$
declare n int;
begin
  delete from auth.users where id = '22222222-2222-2222-2222-222222222222';
  select count(*) into n from public.medication
   where user_id = '22222222-2222-2222-2222-222222222222'::uuid;
  if n <> 0 then
    raise exception 'FALHOU: apagar o usuário deixou % tratamento(s) órfão(s)', n;
  end if;

  raise notice 'OK: RLS por user_id, wipe_own_data e cascade de conta conferidos em medication';
end $$;
