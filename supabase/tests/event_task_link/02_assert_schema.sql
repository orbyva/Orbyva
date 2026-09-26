\set ON_ERROR_STOP on

-- Assertivas de schema da migration 20260817120000_event_task_link.sql (feature 066).
-- Roda duas vezes (depois da migration e depois da reaplicação), então tudo que insere aqui apaga
-- as próprias linhas no fim — o estado do seed precisa sobreviver intacto para o 03_assert_rls.
do $$
declare
  n int;
  msg text;
  con text;
begin
  -- ---- project_id passou a ser nullable ------------------------------------------------------
  perform 1 from information_schema.columns
   where table_schema='public' and table_name='project_event' and column_name='project_id'
     and is_nullable='YES';
  if not found then
    raise exception 'FALHOU: project_event.project_id continua NOT NULL';
  end if;

  -- ---- task_id existe, é uuid e é nullable ---------------------------------------------------
  perform 1 from information_schema.columns
   where table_schema='public' and table_name='project_event' and column_name='task_id'
     and data_type='uuid' and is_nullable='YES';
  if not found then
    raise exception 'FALHOU: project_event.task_id deveria existir como uuid nullable';
  end if;

  -- FK com on delete cascade para public.task
  perform 1
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
   where c.conrelid = 'public.project_event'::regclass
     and c.contype = 'f'
     and c.confrelid = 'public.task'::regclass
     and a.attname = 'task_id'
     and c.confdeltype = 'c';
  if not found then
    raise exception 'FALHOU: task_id deveria ter FK para public.task com on delete cascade';
  end if;

  -- ---- linhas legadas seguem intactas --------------------------------------------------------
  select count(*) into n from public.project_event
   where id in ('eeeeeeee-0000-0000-0000-000000000001',
                'eeeeeeee-0000-0000-0000-000000000002',
                'ffffffff-0000-0000-0000-000000000001')
     and project_id is not null and task_id is null;
  if n <> 3 then
    raise exception 'FALHOU: esperados 3 eventos legados com project_id preenchido e task_id nulo, achados %', n;
  end if;

  -- ---- os três estados de vínculo são aceitos ------------------------------------------------
  -- evento de tarefa
  insert into public.project_event (id, user_id, task_id, title, starts_at) values
    ('99999999-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
     'cccccccc-0000-0000-0000-000000000001', 'Reunião sobre a tarefa', '2026-08-20 10:00+00');
  -- evento de projeto (como sempre foi)
  insert into public.project_event (id, user_id, project_id, title, starts_at) values
    ('99999999-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
     'aaaaaaaa-0000-0000-0000-000000000001', 'Reunião de projeto', '2026-08-20 11:00+00');
  -- evento avulso
  insert into public.project_event (id, user_id, title, starts_at) values
    ('99999999-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111',
     'Dentista', '2026-08-20 12:00+00');
  -- ends_at nulo continua aceito (o insert acima já prova) e ends_at > starts_at também
  insert into public.project_event (id, user_id, title, starts_at, ends_at) values
    ('99999999-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111',
     'Dentista (com fim)', '2026-08-20 12:00+00', '2026-08-20 13:00+00');

  select count(*) into n from public.project_event
   where id::text like '99999999-%';
  if n <> 4 then
    raise exception 'FALHOU: esperados 4 eventos novos (tarefa, projeto, avulso, com ends_at), achados %', n;
  end if;

  -- ---- os dois vínculos juntos são barrados pela project_event_single_link --------------------
  begin
    insert into public.project_event (id, user_id, project_id, task_id, title, starts_at) values
      ('99999999-0000-0000-0000-000000000009', '11111111-1111-1111-1111-111111111111',
       'aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001',
       'Evento com dois vínculos', '2026-08-21 10:00+00');
    raise exception 'FALHOU: insert com project_id E task_id deveria violar project_event_single_link';
  exception
    when check_violation then
      get stacked diagnostics con = constraint_name;
      if con is distinct from 'project_event_single_link' then
        raise exception 'FALHOU: esperada violação de project_event_single_link, veio de %', con;
      end if;
  end;

  -- ---- ends_at <= starts_at é barrado pela project_event_ends_after_starts --------------------
  begin
    insert into public.project_event (id, user_id, title, starts_at, ends_at) values
      ('99999999-0000-0000-0000-00000000000a', '11111111-1111-1111-1111-111111111111',
       'Fim antes do início', '2026-08-21 10:00+00', '2026-08-21 09:00+00');
    raise exception 'FALHOU: insert com ends_at < starts_at deveria violar project_event_ends_after_starts';
  exception
    when check_violation then
      get stacked diagnostics con = constraint_name;
      if con is distinct from 'project_event_ends_after_starts' then
        raise exception 'FALHOU: esperada violação de project_event_ends_after_starts, veio de %', con;
      end if;
  end;

  begin
    insert into public.project_event (id, user_id, title, starts_at, ends_at) values
      ('99999999-0000-0000-0000-00000000000b', '11111111-1111-1111-1111-111111111111',
       'Fim igual ao início', '2026-08-21 10:00+00', '2026-08-21 10:00+00');
    raise exception 'FALHOU: insert com ends_at = starts_at deveria violar project_event_ends_after_starts';
  exception
    when check_violation then
      get stacked diagnostics con = constraint_name;
      if con is distinct from 'project_event_ends_after_starts' then
        raise exception 'FALHOU: esperada violação de project_event_ends_after_starts, veio de %', con;
      end if;
  end;

  -- ---- índices novos -------------------------------------------------------------------------
  perform 1 from pg_indexes
   where schemaname='public' and tablename='project_event' and indexname='project_event_task_idx';
  if not found then raise exception 'FALHOU: falta o índice project_event_task_idx'; end if;

  perform 1 from pg_indexes
   where schemaname='public' and tablename='project_event' and indexname='project_event_user_starts_idx';
  if not found then raise exception 'FALHOU: falta o índice project_event_user_starts_idx'; end if;

  -- ---- documentação do contrato --------------------------------------------------------------
  if coalesce(col_description('public.project_event'::regclass,
       (select ordinal_position from information_schema.columns
         where table_schema='public' and table_name='project_event' and column_name='task_id')::int), '') = '' then
    raise exception 'FALHOU: falta comment on column public.project_event.task_id';
  end if;

  msg := coalesce(obj_description('public.project_event'::regclass, 'pg_class'), '');
  if msg = '' or position('histórico' in msg) = 0 then
    raise exception 'FALHOU: o comment da tabela deveria explicar que o nome project_event é histórico (veio: %)', msg;
  end if;

  -- ---- o que já existia continua de pé -------------------------------------------------------
  perform 1 from pg_class where oid='public.project_event'::regclass and relrowsecurity;
  if not found then raise exception 'FALHOU: RLS de public.project_event foi desligada pela migration'; end if;

  select count(*) into n from pg_policies where schemaname='public' and tablename='project_event';
  if n <> 4 then raise exception 'FALHOU: esperadas 4 policies em project_event, achadas %', n; end if;

  perform 1 from pg_trigger t join pg_proc p on p.oid = t.tgfoid
   where t.tgrelid='public.project_event'::regclass and t.tgname='trg_enforce_app_access'
     and p.proname='enforce_app_access' and not t.tgisinternal;
  if not found then
    raise exception 'FALHOU: trigger trg_enforce_app_access sumiu de public.project_event';
  end if;

  perform 1 from pg_indexes
   where schemaname='public' and tablename='project_event' and indexname='project_event_project_idx';
  if not found then raise exception 'FALHOU: a migration derrubou o índice project_event_project_idx (006)'; end if;

  -- ---- limpeza: o 03_assert_rls conta em cima do seed ----------------------------------------
  delete from public.project_event where id::text like '99999999-%';

  raise notice 'OK: project_id nullable, task_id + cascade, três estados de vínculo, checks, índices e comentários conferidos';
end $$;
