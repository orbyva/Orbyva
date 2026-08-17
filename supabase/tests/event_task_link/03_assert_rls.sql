\set ON_ERROR_STOP on

-- RLS + cascades da 066. Evento avulso e evento de tarefa entram na mesma tabela que já guardava
-- evento de projeto, então o isolamento por `user_id = auth.uid()` precisa valer igual para os três,
-- e apagar a tarefa precisa levar os eventos dela junto (sem tocar nos eventos de projeto).
--
-- Roda por último no run.sh: termina chamando `wipe_own_data`, que apaga as linhas do seed.
set role authenticated;

-- ---- dono cria evento de tarefa e evento avulso ---------------------------------------------
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);

insert into public.project_event (id, user_id, task_id, title, starts_at) values
  ('a1a1a1a1-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   'cccccccc-0000-0000-0000-000000000001', 'Reunião sobre o cimento', '2026-08-20 10:00+00');

insert into public.project_event (id, user_id, title, starts_at, ends_at) values
  ('a1a1a1a1-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
   'Dentista', '2026-08-20 15:00+00', '2026-08-20 16:00+00');

do $$
declare n int;
begin
  select count(*) into n from public.project_event;
  if n <> 4 then
    raise exception 'FALHOU: o dono deveria ver 4 eventos (2 de projeto, 1 de tarefa, 1 avulso), viu %', n;
  end if;

  select count(*) into n from public.project_event
   where user_id <> '11111111-1111-1111-1111-111111111111'::uuid;
  if n <> 0 then raise exception 'FALHOU: RLS vazando % evento(s) de outro usuário', n; end if;
end $$;

-- ---- outro usuário não enxerga nem alcança os eventos alheios --------------------------------
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);

do $$
declare n int;
begin
  select count(*) into n from public.project_event;
  if n <> 1 then
    raise exception 'FALHOU: o usuário B deveria ver só o próprio evento, viu %', n;
  end if;

  update public.project_event set title = 'invadido'
   where id in ('a1a1a1a1-0000-0000-0000-000000000001', 'a1a1a1a1-0000-0000-0000-000000000002');
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALHOU: update de outro usuário alcançou % evento(s) alheio(s)', n; end if;

  delete from public.project_event
   where id in ('a1a1a1a1-0000-0000-0000-000000000001', 'a1a1a1a1-0000-0000-0000-000000000002');
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALHOU: delete de outro usuário alcançou % evento(s) alheio(s)', n; end if;
end $$;

-- forjar user_id no insert é barrado pelo with check (vale para evento avulso também)
do $$
begin
  begin
    insert into public.project_event (user_id, title, starts_at) values
      ('11111111-1111-1111-1111-111111111111', 'Avulso forjado', '2026-08-22 10:00+00');
    raise exception 'FALHOU: insert com user_id de outro usuário deveria ser bloqueado pela RLS';
  exception
    when insufficient_privilege then null;
  end;
end $$;

-- ---- cascade: apagar a tarefa leva os eventos dela, e só eles --------------------------------
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);

do $$
declare n int;
begin
  delete from public.task where id = 'cccccccc-0000-0000-0000-000000000001';

  select count(*) into n from public.project_event
   where id = 'a1a1a1a1-0000-0000-0000-000000000001';
  if n <> 0 then
    raise exception 'FALHOU: apagar a tarefa deveria ter levado o evento de tarefa junto (cascade)';
  end if;

  select count(*) into n from public.project_event where project_id is not null;
  if n <> 2 then
    raise exception 'FALHOU: o cascade da tarefa mexeu nos eventos de projeto (sobraram %, esperados 2)', n;
  end if;

  select count(*) into n from public.project_event
   where id = 'a1a1a1a1-0000-0000-0000-000000000002';
  if n <> 1 then raise exception 'FALHOU: o cascade da tarefa levou o evento avulso junto'; end if;
end $$;

-- ---- cascade: apagar o projeto continua levando os eventos de projeto ------------------------
insert into public.task (id, user_id, title, status) values
  ('cccccccc-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
   'Tarefa solta', 'todo');

insert into public.project_event (id, user_id, task_id, title, starts_at) values
  ('a1a1a1a1-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111',
   'cccccccc-0000-0000-0000-000000000002', 'Reunião da tarefa solta', '2026-08-23 10:00+00');

do $$
declare n int;
begin
  delete from public.project where id = 'aaaaaaaa-0000-0000-0000-000000000001';

  select count(*) into n from public.project_event where project_id is not null;
  if n <> 0 then
    raise exception 'FALHOU: apagar o projeto deveria ter levado os eventos de projeto (sobraram %)', n;
  end if;

  select count(*) into n from public.project_event;
  if n <> 2 then
    raise exception 'FALHOU: esperados 2 eventos do dono depois do cascade de projeto (tarefa + avulso), achados %', n;
  end if;
end $$;

-- ---- wipe_own_data leva evento de projeto, de tarefa e avulso do dono — e só dele -------------
insert into public.project (id, user_id, name) values
  ('aaaaaaaa-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'Projeto novo');

insert into public.project_event (id, user_id, project_id, title, starts_at) values
  ('a1a1a1a1-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111',
   'aaaaaaaa-0000-0000-0000-000000000003', 'Kickoff', '2026-08-24 10:00+00');

reset role;

do $$
declare n int;
begin
  select count(*) into n from public.project_event
   where user_id = '11111111-1111-1111-1111-111111111111'::uuid;
  if n <> 3 then
    raise exception 'FALHOU: pré-wipe o dono deveria ter 3 eventos (projeto, tarefa, avulso), tem %', n;
  end if;

  perform public.wipe_own_data();

  select count(*) into n from public.project_event
   where user_id = '11111111-1111-1111-1111-111111111111'::uuid;
  if n <> 0 then
    raise exception 'FALHOU: wipe_own_data deixou % evento(s) do dono para trás', n;
  end if;

  select count(*) into n from public.project_event
   where user_id = '22222222-2222-2222-2222-222222222222'::uuid;
  if n <> 1 then
    raise exception 'FALHOU: wipe_own_data mexeu nos eventos de outro usuário (sobraram %, esperado 1)', n;
  end if;

  select count(*) into n from public.task
   where user_id = '22222222-2222-2222-2222-222222222222'::uuid;
  if n <> 1 then
    raise exception 'FALHOU: wipe_own_data apagou tarefa de outro usuário (sobraram %)', n;
  end if;

  raise notice 'OK: RLS por user_id, cascade de tarefa/projeto e wipe_own_data conferidos para os três tipos de evento';
end $$;
