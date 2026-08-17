\set ON_ERROR_STOP on

-- "A que horas você quer ser lembrado de tomar o remédio" é dado de saúde tanto quanto o peso:
-- a RLS de `reminder_preference` é testada rodando de fato como `authenticated`, com a GUC do
-- `auth.uid()` setada — não como superusuário, que ignora RLS.
set role authenticated;

-- ---- dono: configura os próprios lembretes ---------------------------------------------------
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);

insert into public.reminder_preference (id, user_id, entity_type, frequency, time_of_day, enabled) values
  ('bbbbbbbb-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   'water', 'daily', '09:00', true),
  ('bbbbbbbb-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
   'nutrition', 'daily', '12:00', false);

do $$
declare n int;
begin
  select count(*) into n from public.reminder_preference;
  if n <> 2 then raise exception 'FALHOU: o dono deveria ver 2 preferências, viu %', n; end if;

  -- Marcar como notificado é um update do próprio dono — é o que o dashboard faz depois do toast.
  update public.reminder_preference
     set last_notified_at = '2026-08-17T09:00:00Z'
   where entity_type = 'water';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FALHOU: o dono não conseguiu gravar last_notified_at'; end if;
end $$;

-- ---- outro usuário: não lê, não altera, não apaga, não forja --------------------------------
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);

do $$
declare n int;
begin
  select count(*) into n from public.reminder_preference;
  if n <> 0 then
    raise exception 'FALHOU: preferência de lembrete alheia visível (% linha(s))', n;
  end if;

  update public.reminder_preference set enabled = false
   where id = 'bbbbbbbb-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALHOU: update alcançou a preferência alheia'; end if;

  -- Desligar o lembrete de remédio de outra pessoa seria o pior caso deste módulo.
  delete from public.reminder_preference where id = 'bbbbbbbb-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALHOU: delete alcançou a preferência alheia'; end if;

  begin
    insert into public.reminder_preference (user_id, entity_type) values
      ('11111111-1111-1111-1111-111111111111', 'medication');
    raise exception 'FALHOU: insert com user_id de outro usuário deveria ser bloqueado pela RLS';
  exception when insufficient_privilege then null;
  end;

  -- O unique é por (user_id, entity_type): o intruso pode ter a **sua** preferência de água.
  insert into public.reminder_preference (user_id, entity_type, time_of_day) values
    ('22222222-2222-2222-2222-222222222222', 'water', '07:00');
  select count(*) into n from public.reminder_preference;
  if n <> 1 then raise exception 'FALHOU: o intruso deveria ver só a própria preferência, viu %', n; end if;
end $$;

reset role;

-- ---- controle negativo da RLS ----------------------------------------------------------------
-- Prova que os zeros acima vieram da policy, e não de tabela vazia.
do $$
declare n int;
begin
  select count(*) into n from public.reminder_preference;
  if n <> 3 then
    raise exception 'CONTROLE NEGATIVO FALHOU: sem RLS deveriam existir 3 preferências, existem % — o teste de vazamento estava medindo tabela vazia', n;
  end if;

  select count(*) into n from public.reminder_preference
   where id = 'bbbbbbbb-0000-0000-0000-000000000001'
     and enabled and last_notified_at is not null;
  if n <> 1 then
    raise exception 'CONTROLE NEGATIVO FALHOU: a preferência que o intruso não pôde desligar não está mais ligada';
  end if;
end $$;

-- ---- wipe_own_data leva as preferências do dono, e só as dele --------------------------------
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);

do $$
declare n int;
begin
  perform public.wipe_own_data();

  select count(*) into n from public.reminder_preference
   where user_id = '11111111-1111-1111-1111-111111111111'::uuid;
  if n <> 0 then
    raise exception 'FALHOU: wipe_own_data deixou % preferência(s) do dono para trás', n;
  end if;

  select count(*) into n from public.reminder_preference
   where user_id = '22222222-2222-2222-2222-222222222222'::uuid;
  if n <> 1 then
    raise exception 'FALHOU: wipe_own_data apagou preferência de outro usuário (sobraram %)', n;
  end if;

  raise notice 'OK: RLS por user_id e wipe_own_data conferidos em reminder_preference';
end $$;
