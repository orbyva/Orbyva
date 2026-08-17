\set ON_ERROR_STOP on

-- Dado de saúde é sensível: "bebi água hoje" e "comi fruta hoje" viram linhas de `public.habit` e
-- `public.habit_log`, então o isolamento por `user_id = auth.uid()` precisa valer para elas — e
-- para o log, que não tem `user_id` próprio e depende do dono do hábito. Aqui o teste roda de fato
-- como `authenticated`, com a GUC do `auth.uid()` setada.
set role authenticated;

-- ---- dono: cria o hábito de saúde, faz o check-in do dia, enxerga só o seu -------------------
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);

insert into public.habit (id, user_id, name, frequency, target_per_week, kind, is_health) values
  ('cccccccc-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   'Beber água', 'daily', 7, 'build', true),
  ('cccccccc-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
   'Comer frutas', 'weekly', 3, 'build', true);

insert into public.habit_log (id, habit_id, date, completed) values
  ('dddddddd-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', '2026-08-17', true);

do $$
declare n int;
begin
  select count(*) into n from public.habit where is_health;
  if n <> 2 then raise exception 'FALHOU: o dono deveria ver 2 hábitos de saúde, viu %', n; end if;

  -- Hábito de saúde é hábito comum: continua na listagem geral junto com os outros.
  select count(*) into n from public.habit;
  if n <> 4 then
    raise exception 'FALHOU: o dono deveria ver 4 hábitos (2 antigos + 2 de saúde), viu %', n;
  end if;

  select count(*) into n from public.habit
   where user_id <> '11111111-1111-1111-1111-111111111111'::uuid;
  if n <> 0 then raise exception 'FALHOU: RLS vazando % hábito(s) de outro usuário', n; end if;

  select count(*) into n from public.habit_log
   where habit_id = 'cccccccc-0000-0000-0000-000000000001' and completed;
  if n <> 1 then raise exception 'FALHOU: o check-in do dono sumiu (% linha(s))', n; end if;
end $$;

-- ---- outro usuário: não enxerga o hábito de saúde nem o check-in alheio ----------------------
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);

do $$
declare n int;
begin
  select count(*) into n from public.habit where is_health;
  if n <> 0 then
    raise exception 'FALHOU: hábito de saúde de outro usuário visível — dado sensível vazando (% linha(s))', n;
  end if;

  select count(*) into n from public.habit_log
   where habit_id = 'cccccccc-0000-0000-0000-000000000001';
  if n <> 0 then
    raise exception 'FALHOU: check-in de saúde alheio visível — habit_log vazando (% linha(s))', n;
  end if;

  -- update cego também não pode pegar a linha alheia
  update public.habit set is_health = false where id = 'cccccccc-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALHOU: update de outro usuário alcançou o hábito de saúde alheio'; end if;

  update public.habit_log set completed = false
   where id = 'dddddddd-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALHOU: update de outro usuário alcançou o check-in alheio'; end if;

  delete from public.habit where id = 'cccccccc-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALHOU: delete de outro usuário alcançou o hábito de saúde alheio'; end if;
end $$;

-- ---- forjar user_id na insert é barrado pelo with check --------------------------------------
do $$
begin
  begin
    insert into public.habit (user_id, name, frequency, target_per_week, is_health) values
      ('11111111-1111-1111-1111-111111111111', 'Hábito forjado', 'daily', 7, true);
    raise exception 'FALHOU: insert com user_id de outro usuário deveria ser bloqueado pela RLS';
  exception
    when insufficient_privilege then null;
  end;

  -- check-in forjado no hábito alheio: barrado pelo with check do habit_log (dono do hábito)
  begin
    insert into public.habit_log (habit_id, date, completed) values
      ('cccccccc-0000-0000-0000-000000000001', '2026-08-18', true);
    raise exception 'FALHOU: check-in no hábito de saúde alheio deveria ser bloqueado pela RLS';
  exception
    when insufficient_privilege then null;
  end;
end $$;

reset role;

-- ---- controle negativo da RLS ---------------------------------------------------------------
-- Sem isto, os zeros acima passariam também se as linhas simplesmente não existissem. Como
-- superusuário (que ignora RLS) as mesmas linhas têm que aparecer — é o que prova que o zero visto
-- pelo usuário 2 veio da policy, não de tabela vazia.
do $$
declare n int;
begin
  select count(*) into n from public.habit where is_health;
  if n <> 2 then
    raise exception 'CONTROLE NEGATIVO FALHOU: sem RLS deveriam existir 2 hábitos de saúde, existem % — o teste de vazamento estava medindo tabela vazia', n;
  end if;

  select count(*) into n from public.habit_log
   where habit_id = 'cccccccc-0000-0000-0000-000000000001' and completed;
  if n <> 1 then
    raise exception 'CONTROLE NEGATIVO FALHOU: o check-in que o usuário 2 não podia ver nem existe';
  end if;
end $$;

-- ---- wipe_own_data leva hábitos de saúde e check-ins do dono junto ---------------------------
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);

do $$
declare n int;
begin
  perform public.wipe_own_data();
  select count(*) into n from public.habit
   where user_id = '11111111-1111-1111-1111-111111111111'::uuid;
  if n <> 0 then
    raise exception 'FALHOU: wipe_own_data deixou % hábito(s) do dono para trás', n;
  end if;

  -- `habit_log` não tem user_id: some por cascade do hábito.
  select count(*) into n from public.habit_log
   where habit_id in ('cccccccc-0000-0000-0000-000000000001',
                      'aaaaaaaa-0000-0000-0000-000000000001');
  if n <> 0 then
    raise exception 'FALHOU: wipe_own_data deixou % check-in(s) de saúde para trás', n;
  end if;

  select count(*) into n from public.habit
   where user_id = '22222222-2222-2222-2222-222222222222'::uuid;
  if n <> 1 then
    raise exception 'FALHOU: wipe_own_data apagou hábito de outro usuário (sobraram %)', n;
  end if;

  raise notice 'OK: RLS por user_id (habit e habit_log) e wipe_own_data conferidos para hábitos de saúde';
end $$;
