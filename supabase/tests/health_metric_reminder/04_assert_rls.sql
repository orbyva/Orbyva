\set ON_ERROR_STOP on

-- Peso e medidas corporais são dado sensível: o isolamento por `user_id = auth.uid()` precisa valer
-- de verdade, então aqui o teste roda como `authenticated` com a GUC do `auth.uid()` setada — não
-- como superusuário, que ignora RLS.
set role authenticated;

-- ---- dono: grava as próprias medições e enxerga só elas -------------------------------------
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);

insert into public.health_metric (id, user_id, metric_type, value, recorded_date, notes) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   'weight', 78.4, '2026-08-10', 'em jejum'),
  ('aaaaaaaa-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
   'weight', 77.9, '2026-08-17', null),
  ('aaaaaaaa-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111',
   'height', 176, '2026-01-05', null);

do $$
declare n int; v numeric;
begin
  select count(*) into n from public.health_metric;
  if n <> 3 then raise exception 'FALHOU: o dono deveria ver 3 medições, viu %', n; end if;

  -- A série histórica é o ponto da tabela: a leitura mais recente por tipo tem de sair da ordem
  -- do índice, não da ordem de inserção.
  select value into v from public.health_metric
   where metric_type = 'weight' order by recorded_date desc limit 1;
  if v <> 77.9 then raise exception 'FALHOU: peso mais recente deveria ser 77.9, veio %', v; end if;
end $$;

-- ---- outro usuário: não enxerga, não altera, não apaga --------------------------------------
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);

do $$
declare n int;
begin
  select count(*) into n from public.health_metric;
  if n <> 0 then
    raise exception 'FALHOU: medição de outro usuário visível — dado de saúde vazando (% linha(s))', n;
  end if;

  update public.health_metric set value = 0
   where id = 'aaaaaaaa-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALHOU: update alcançou a medição alheia'; end if;

  delete from public.health_metric where id = 'aaaaaaaa-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALHOU: delete alcançou a medição alheia'; end if;

  -- forjar user_id na insert é barrado pelo with check
  begin
    insert into public.health_metric (user_id, metric_type, value, recorded_date) values
      ('11111111-1111-1111-1111-111111111111', 'weight', 60, '2026-08-17');
    raise exception 'FALHOU: insert com user_id de outro usuário deveria ser bloqueado pela RLS';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;

-- ---- controle negativo da RLS ---------------------------------------------------------------
-- Sem isto, os zeros acima passariam também se as linhas simplesmente não existissem. Como
-- superusuário (que ignora RLS) elas têm que aparecer — é o que prova que o zero veio da policy.
do $$
declare n int;
begin
  select count(*) into n from public.health_metric;
  if n <> 3 then
    raise exception 'CONTROLE NEGATIVO FALHOU: sem RLS deveriam existir 3 medições, existem % — o teste de vazamento estava medindo tabela vazia', n;
  end if;
end $$;

-- ---- wipe_own_data leva as medições do dono, e só as dele -----------------------------------
set role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
insert into public.health_metric (user_id, metric_type, value, recorded_date) values
  ('22222222-2222-2222-2222-222222222222', 'weight', 90, '2026-08-17');
reset role;

select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);

do $$
declare n int;
begin
  perform public.wipe_own_data();

  select count(*) into n from public.health_metric
   where user_id = '11111111-1111-1111-1111-111111111111'::uuid;
  if n <> 0 then
    raise exception 'FALHOU: wipe_own_data deixou % medição(ões) do dono para trás', n;
  end if;

  select count(*) into n from public.health_metric
   where user_id = '22222222-2222-2222-2222-222222222222'::uuid;
  if n <> 1 then
    raise exception 'FALHOU: wipe_own_data apagou medição de outro usuário (sobraram %)', n;
  end if;
end $$;

-- ---- apagar a conta leva as medições junto (on delete cascade) ------------------------------
do $$
declare n int;
begin
  delete from auth.users where id = '22222222-2222-2222-2222-222222222222';
  select count(*) into n from public.health_metric
   where user_id = '22222222-2222-2222-2222-222222222222'::uuid;
  if n <> 0 then
    raise exception 'FALHOU: apagar o usuário deixou % medição(ões) órfã(s)', n;
  end if;

  raise notice 'OK: RLS por user_id, wipe_own_data e cascade de conta conferidos em health_metric';
end $$;
