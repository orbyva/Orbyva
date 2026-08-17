\set ON_ERROR_STOP on

-- Dado de saúde é sensível: a consulta médica é uma linha de `public.task`, então o isolamento por
-- `user_id = auth.uid()` precisa valer para ela igual vale para o resto. Aqui o teste roda de fato
-- como `authenticated`, com a GUC do `auth.uid()` setada, e checa o que cada dono enxerga/escreve.
set role authenticated;

-- ---- dono: cria a consulta, enxerga a sua e só a sua ---------------------------------------
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);

insert into public.task (id, user_id, title, status, due_date, due_time, is_consultation) values
  ('eeeeeeee-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   'Cardiologista — Dr. Silva', 'todo', '2026-09-10', '14:30', true);

do $$
declare n int;
begin
  select count(*) into n from public.task where is_consultation;
  if n <> 1 then raise exception 'FALHOU: o dono deveria ver 1 consulta, viu %', n; end if;

  select count(*) into n from public.task
   where user_id <> '11111111-1111-1111-1111-111111111111'::uuid;
  if n <> 0 then raise exception 'FALHOU: RLS vazando % tarefa(s) de outro usuário', n; end if;
end $$;

-- ---- outro usuário: não enxerga a consulta alheia -------------------------------------------
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);

do $$
declare n int;
begin
  select count(*) into n from public.task where is_consultation;
  if n <> 0 then
    raise exception 'FALHOU: consulta médica de outro usuário visível — dado de saúde vazando (% linha(s))', n;
  end if;

  -- update cego também não pode pegar a linha alheia
  update public.task set title = 'invadida' where id = 'eeeeeeee-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALHOU: update de outro usuário alcançou a consulta alheia'; end if;

  delete from public.task where id = 'eeeeeeee-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALHOU: delete de outro usuário alcançou a consulta alheia'; end if;
end $$;

-- ---- forjar user_id na insert é barrado pelo with check --------------------------------------
do $$
begin
  begin
    insert into public.task (user_id, title, status, is_consultation) values
      ('11111111-1111-1111-1111-111111111111', 'Consulta forjada', 'todo', true);
    raise exception 'FALHOU: insert com user_id de outro usuário deveria ser bloqueado pela RLS';
  exception
    when insufficient_privilege then null;
  end;
end $$;

-- ---- wipe_own_data leva as consultas do dono junto -------------------------------------------
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
reset role;

do $$
declare n int;
begin
  perform public.wipe_own_data();
  select count(*) into n from public.task
   where user_id = '11111111-1111-1111-1111-111111111111'::uuid;
  if n <> 0 then
    raise exception 'FALHOU: wipe_own_data deixou % tarefa(s)/consulta(s) do dono para trás', n;
  end if;
  select count(*) into n from public.task
   where user_id = '22222222-2222-2222-2222-222222222222'::uuid;
  if n <> 1 then
    raise exception 'FALHOU: wipe_own_data apagou tarefa de outro usuário (sobraram %)', n;
  end if;

  raise notice 'OK: RLS por user_id e wipe_own_data conferidos para consultas';
end $$;
