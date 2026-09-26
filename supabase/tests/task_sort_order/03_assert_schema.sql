\set ON_ERROR_STOP on

-- Assertivas de schema da migration 20260820140000_task_sort_order.sql (feature 082).
-- Cobre o roteiro que a feature manda conferir depois do `db push`: a coluna nasce
-- `integer not null default 0`, todas as tarefas antigas herdam `0` (ninguém muda de lugar no
-- painel "Por prioridade"), a contagem de tarefas não muda, as colunas das features anteriores
-- ficam intactas e nada de RLS/trigger é derrubado no caminho.
--
-- Este arquivo roda duas vezes (antes e depois da reaplicação da migration), então ele **não pode**
-- ter efeito colateral: só lê.
do $$
declare
  n int;
  flag text;
begin
  -- ---- coluna nova ------------------------------------------------------------------------
  perform 1 from information_schema.columns
   where table_schema='public' and table_name='task' and column_name='sort_order'
     and data_type='integer' and is_nullable='NO' and column_default like '%0%';
  if not found then
    raise exception 'FALHOU: task.sort_order deveria ser integer not null default 0';
  end if;

  -- ---- tarefas antigas herdaram 0, sem update nenhum ---------------------------------------
  select count(*) into n from public.task where sort_order is distinct from 0;
  if n <> 0 then
    raise exception 'FALHOU: % tarefa(s) pré-existente(s) não ficaram com sort_order = 0', n;
  end if;

  select count(*) into n from public.task;
  if n <> 6 then
    raise exception 'FALHOU: a migration mudou a contagem de tarefas (esperadas 6, achadas %)', n;
  end if;

  -- ---- o zero uniforme é o que preserva a ordem da feature 079 ------------------------------
  -- Sem `order by` manual, a faixa "Alta" inteira empata em 0 e o desempate fica com o comparador
  -- da tela — que é exatamente o contrato negociado com a 079.
  select count(distinct sort_order) into n from public.task where priority = 'high';
  if n <> 1 then
    raise exception 'FALHOU: a faixa Alta deveria empatar em um único sort_order, achados %', n;
  end if;

  -- ---- as colunas das features anteriores continuam exatamente como estavam -----------------
  foreach flag in array array['is_milestone', 'is_medication', 'is_consultation', 'is_quick']
  loop
    perform 1 from information_schema.columns
     where table_schema='public' and table_name='task' and column_name=flag
       and data_type='boolean' and is_nullable='NO' and column_default like '%false%';
    if not found then
      raise exception 'FALHOU: a migration mexeu em task.%', flag;
    end if;
  end loop;

  perform 1 from information_schema.columns
   where table_schema='public' and table_name='task' and column_name='priority'
     and is_nullable='YES';
  if not found then
    raise exception 'FALHOU: a migration mexeu em task.priority (a coluna que define a faixa)';
  end if;

  perform 1 from information_schema.columns
   where table_schema='public' and table_name='task' and column_name='estimated_duration'
     and is_nullable='YES';
  if not found then
    raise exception 'FALHOU: a migration mexeu em task.estimated_duration (feature 032)';
  end if;

  -- Prioridade continua opcional: a faixa "sem prioridade" precisa existir.
  select count(*) into n from public.task where priority is null;
  if n <> 1 then
    raise exception 'FALHOU: a tarefa sem prioridade do seed sumiu (achadas %)', n;
  end if;

  -- ---- comentário de coluna (documentação do contrato) --------------------------------------
  if coalesce(col_description('public.task'::regclass,
       (select ordinal_position from information_schema.columns
         where table_schema='public' and table_name='task' and column_name='sort_order')::int), '') = '' then
    raise exception 'FALHOU: falta comment on column public.task.sort_order';
  end if;

  -- ---- o que já existia continua de pé ------------------------------------------------------
  perform 1 from pg_class where oid='public.task'::regclass and relrowsecurity;
  if not found then raise exception 'FALHOU: RLS de public.task foi desligada pela migration'; end if;

  select count(*) into n from pg_policies where schemaname='public' and tablename='task';
  if n <> 4 then raise exception 'FALHOU: esperadas 4 policies em task, achadas %', n; end if;

  perform 1 from pg_trigger t join pg_proc p on p.oid = t.tgfoid
   where t.tgrelid='public.task'::regclass and t.tgname='trg_enforce_app_access'
     and p.proname='enforce_app_access' and not t.tgisinternal;
  if not found then
    raise exception 'FALHOU: trigger trg_enforce_app_access sumiu de public.task';
  end if;

  raise notice 'OK: sort_order integer not null default 0, tarefas antigas em 0, colunas anteriores, RLS e trigger conferidos';
end $$;
