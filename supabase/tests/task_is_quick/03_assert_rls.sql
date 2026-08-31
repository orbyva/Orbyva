\set ON_ERROR_STOP on

-- A tarefa pontual é uma linha de `public.task` como qualquer outra, então o isolamento por
-- `user_id = auth.uid()` precisa valer para ela igual vale para o resto — inclusive porque a 071 vai
-- marcar dose de medicação como pontual (dado de saúde). Aqui o teste roda de fato como
-- `authenticated`, com a GUC do `auth.uid()` setada.
set role authenticated;

-- ---- dono: cria a pontual (inclusive uma que é medicação *e* pontual, como a 071 fará) --------
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);

insert into public.task (id, user_id, title, status, due_date, due_time, is_quick, is_medication) values
  ('eeeeeeee-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   'Trocar lençol', 'todo', '2026-08-19', '08:00', true, false),
  ('eeeeeeee-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
   'Losartana 08:00', 'todo', '2026-08-19', '08:00', true, true);

do $$
declare n int;
begin
  select count(*) into n from public.task where is_quick;
  if n <> 2 then raise exception 'FALHOU: o dono deveria ver 2 pontuais, viu %', n; end if;

  -- Flags ortogonais: a dose é medicação e pontual ao mesmo tempo (pré-requisito da 071).
  select count(*) into n from public.task where is_quick and is_medication;
  if n <> 1 then
    raise exception 'FALHOU: is_quick e is_medication deveriam coexistir na mesma linha (achadas %)', n;
  end if;

  select count(*) into n from public.task
   where user_id <> '11111111-1111-1111-1111-111111111111'::uuid;
  if n <> 0 then raise exception 'FALHOU: RLS vazando % tarefa(s) de outro usuário', n; end if;

  -- Concluir a bolinha é um update de `status` — o caminho que a agenda usa.
  update public.task set status = 'done', completed_at = now()
   where id = 'eeeeeeee-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FALHOU: o dono não conseguiu concluir a própria pontual'; end if;
end $$;

-- ---- outro usuário: não enxerga nem alcança a pontual alheia ---------------------------------
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);

do $$
declare n int;
begin
  select count(*) into n from public.task where is_quick;
  if n <> 0 then
    raise exception 'FALHOU: tarefa pontual de outro usuário visível (% linha(s))', n;
  end if;

  update public.task set status = 'done' where id = 'eeeeeeee-0000-0000-0000-000000000002';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALHOU: update de outro usuário alcançou a pontual alheia'; end if;

  delete from public.task where id = 'eeeeeeee-0000-0000-0000-000000000002';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALHOU: delete de outro usuário alcançou a pontual alheia'; end if;
end $$;

-- ---- forjar user_id na insert é barrado pelo with check --------------------------------------
do $$
begin
  begin
    insert into public.task (user_id, title, status, is_quick) values
      ('11111111-1111-1111-1111-111111111111', 'Pontual forjada', 'todo', true);
    raise exception 'FALHOU: insert com user_id de outro usuário deveria ser bloqueado pela RLS';
  exception
    when insufficient_privilege then null;
  end;
end $$;

-- ---- wipe_own_data leva as pontuais do dono junto --------------------------------------------
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
reset role;

do $$
declare n int;
begin
  perform public.wipe_own_data();
  select count(*) into n from public.task
   where user_id = '11111111-1111-1111-1111-111111111111'::uuid;
  if n <> 0 then
    raise exception 'FALHOU: wipe_own_data deixou % tarefa(s) pontual(is) do dono para trás', n;
  end if;
  select count(*) into n from public.task
   where user_id = '22222222-2222-2222-2222-222222222222'::uuid;
  if n <> 1 then
    raise exception 'FALHOU: wipe_own_data apagou tarefa de outro usuário (sobraram %)', n;
  end if;

  raise notice 'OK: RLS por user_id, coexistência com is_medication e wipe_own_data conferidos para pontuais';
end $$;
