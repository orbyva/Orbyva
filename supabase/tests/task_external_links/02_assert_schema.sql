\set ON_ERROR_STOP on

-- Assertivas de schema + cópia de dados da migration 20260823100000_task_external_links.sql
-- (feature 085).
--
-- Este arquivo roda **duas vezes** (depois da primeira aplicação e depois da reaplicação), então
-- ele não pode ter efeito colateral: só lê. É também assim que a idempotência fica provada — as
-- mesmas contagens têm de valer nas duas passadas.
do $$
declare
  n int;
  txt text;
begin
  -- ---- a tabela e as colunas ---------------------------------------------------------------
  if to_regclass('public.task_external_link') is null then
    raise exception 'FALHOU: public.task_external_link não foi criada';
  end if;

  perform 1 from information_schema.columns
   where table_schema='public' and table_name='task_external_link' and column_name='id'
     and data_type='uuid' and is_nullable='NO' and column_default like '%gen_random_uuid%';
  if not found then raise exception 'FALHOU: id deveria ser uuid not null default gen_random_uuid()'; end if;

  perform 1 from information_schema.columns
   where table_schema='public' and table_name='task_external_link' and column_name='user_id'
     and data_type='uuid' and is_nullable='NO';
  if not found then raise exception 'FALHOU: user_id deveria ser uuid not null'; end if;

  perform 1 from information_schema.columns
   where table_schema='public' and table_name='task_external_link' and column_name='task_id'
     and data_type='uuid' and is_nullable='NO';
  if not found then raise exception 'FALHOU: task_id deveria ser uuid not null'; end if;

  perform 1 from information_schema.columns
   where table_schema='public' and table_name='task_external_link' and column_name='url'
     and data_type='text' and is_nullable='NO';
  if not found then raise exception 'FALHOU: url deveria ser text not null'; end if;

  -- O comentário é livre e **opcional**: o pedido é "um campo livre de comentário", não um campo
  -- obrigatório que trave o salvar de quem só quer colar o link.
  perform 1 from information_schema.columns
   where table_schema='public' and table_name='task_external_link' and column_name='comment'
     and data_type='text' and is_nullable='YES';
  if not found then raise exception 'FALHOU: comment deveria ser text nullable'; end if;

  perform 1 from information_schema.columns
   where table_schema='public' and table_name='task_external_link' and column_name='position'
     and data_type='integer' and is_nullable='NO' and column_default like '%0%';
  if not found then raise exception 'FALHOU: position deveria ser integer not null default 0'; end if;

  perform 1 from information_schema.columns
   where table_schema='public' and table_name='task_external_link' and column_name='created_at'
     and is_nullable='NO' and column_default like '%now()%';
  if not found then raise exception 'FALHOU: created_at deveria ser timestamptz not null default now()'; end if;

  -- ---- unique (task_id, url) ---------------------------------------------------------------
  select count(*) into n
    from pg_constraint c
   where c.conrelid = 'public.task_external_link'::regclass
     and c.contype = 'u'
     and (select array_agg(a.attname::text order by a.attname)
            from unnest(c.conkey) k join pg_attribute a
              on a.attrelid = c.conrelid and a.attnum = k) = array['task_id','url'];
  if n <> 1 then
    raise exception 'FALHOU: falta o unique (task_id, url) — achados %', n;
  end if;

  -- ---- índice (user_id, task_id) -----------------------------------------------------------
  perform 1 from pg_indexes
   where schemaname='public' and tablename='task_external_link'
     and indexname='task_external_link_user_task_idx'
     and indexdef like '%(user_id, task_id)%';
  if not found then
    raise exception 'FALHOU: falta o índice task_external_link_user_task_idx (user_id, task_id)';
  end if;

  -- ---- FKs com cascade ---------------------------------------------------------------------
  perform 1 from pg_constraint
   where conrelid='public.task_external_link'::regclass and contype='f'
     and confrelid='public.task'::regclass and confdeltype='c';
  if not found then
    raise exception 'FALHOU: task_id deveria ter FK para task com on delete cascade';
  end if;

  perform 1 from pg_constraint
   where conrelid='public.task_external_link'::regclass and contype='f'
     and confrelid='auth.users'::regclass and confdeltype='c';
  if not found then
    raise exception 'FALHOU: user_id deveria ter FK para auth.users com on delete cascade';
  end if;

  -- ---- documentação do contrato ------------------------------------------------------------
  txt := coalesce(obj_description('public.task_external_link'::regclass, 'pg_class'), '');
  if txt = '' then
    raise exception 'FALHOU: falta comment on table public.task_external_link';
  end if;

  -- ---- RLS e trigger do gate Pro -----------------------------------------------------------
  perform 1 from pg_class where oid='public.task_external_link'::regclass and relrowsecurity;
  if not found then raise exception 'FALHOU: RLS não foi ligada em task_external_link'; end if;

  select count(*) into n from pg_policies
   where schemaname='public' and tablename='task_external_link';
  if n <> 4 then raise exception 'FALHOU: esperadas 4 policies, achadas %', n; end if;

  foreach txt in array array['SELECT','INSERT','UPDATE','DELETE']
  loop
    perform 1 from pg_policies
     where schemaname='public' and tablename='task_external_link' and cmd = txt;
    if not found then raise exception 'FALHOU: falta policy de % em task_external_link', txt; end if;
  end loop;

  perform 1 from pg_trigger t join pg_proc p on p.oid = t.tgfoid
   where t.tgrelid='public.task_external_link'::regclass and t.tgname='trg_enforce_app_access'
     and p.proname='enforce_app_access' and not t.tgisinternal;
  if not found then
    raise exception 'FALHOU: trigger trg_enforce_app_access não foi criado em task_external_link';
  end if;

  -- ---- `wipe_own_data` passou a conhecer a tabela, e **antes** de `task` --------------------
  select pg_get_functiondef(p.oid) into txt
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname='public' and p.proname='wipe_own_data';
  if txt not like '%task_external_link%' then
    raise exception 'FALHOU: wipe_own_data não inclui task_external_link';
  end if;
  if position('''task_external_link''' in txt) > position('''task'',' in txt) then
    raise exception 'FALHOU: task_external_link tem de vir ANTES de task no wipe_own_data (tem FK para ela)';
  end if;

  -- ---- a cópia do dado antigo --------------------------------------------------------------
  -- Exatamente as tarefas que tinham `external_url` não-vazia, uma linha cada, em `position` 0.
  select count(*) into n from public.task_external_link;
  if n <> 3 then
    raise exception 'FALHOU: a cópia deveria ter gerado 3 links (2 de A + 1 de B), achados %', n;
  end if;

  select count(*) into n from public.task_external_link where position <> 0;
  if n <> 0 then
    raise exception 'FALHOU: link copiado deveria nascer em position 0 (% fora)', n;
  end if;

  -- Comentário nasce nulo: o dado antigo não tinha esse campo, e inventar texto seria mentira.
  select count(*) into n from public.task_external_link where comment is not null;
  if n <> 0 then
    raise exception 'FALHOU: % link(s) copiado(s) vieram com comment preenchido', n;
  end if;

  -- Nenhuma tarefa sem link ganhou linha (nem a de `external_url = ''`).
  select count(*) into n from public.task_external_link
   where task_id in ('cccccccc-0000-0000-0000-000000000003',
                     'cccccccc-0000-0000-0000-000000000004');
  if n <> 0 then
    raise exception 'FALHOU: a cópia inventou % link(s) para tarefa sem URL', n;
  end if;

  -- O `user_id` da linha é o dono da tarefa, não um valor solto.
  select count(*) into n from public.task_external_link l
    join public.task t on t.id = l.task_id
   where l.user_id is distinct from t.user_id;
  if n <> 0 then
    raise exception 'FALHOU: % link(s) copiado(s) com user_id diferente do dono da tarefa', n;
  end if;

  -- A URL copiada é byte a byte a da coluna antiga (é isso que a conferência pré-drop compara).
  select count(*) into n
    from public.task t
   where t.external_url is not null and btrim(t.external_url) <> ''
     and not exists (select 1 from public.task_external_link l
                      where l.task_id = t.id and l.url = t.external_url);
  if n <> 0 then
    raise exception 'FALHOU: % tarefa(s) com link antigo ficaram sem a linha correspondente', n;
  end if;

  -- ---- a rede de segurança continua de pé: nada foi dropado de `task` ----------------------
  perform 1 from information_schema.columns
   where table_schema='public' and table_name='task' and column_name='external_url';
  if not found then raise exception 'FALHOU: a migration dropou task.external_url (é rede de segurança)'; end if;
  perform 1 from information_schema.columns
   where table_schema='public' and table_name='task' and column_name='external_provider';
  if not found then raise exception 'FALHOU: a migration dropou task.external_provider'; end if;

  select count(*) into n from public.task where external_url is not null;
  if n <> 4 then
    raise exception 'FALHOU: a migration mexeu em task.external_url (esperadas 4 linhas, achadas %)', n;
  end if;

  select count(*) into n from public.task;
  if n <> 5 then
    raise exception 'FALHOU: a migration mudou a contagem de tarefas (esperadas 5, achadas %)', n;
  end if;

  raise notice 'OK: schema, unique, índice, FKs, RLS, wipe_own_data e a cópia de 3 links conferidos';
end $$;
