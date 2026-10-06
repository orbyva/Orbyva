\set ON_ERROR_STOP on

-- Só leitura de catálogo: roda depois de **cada** aplicação da migration, e a segunda passagem é a
-- prova de idempotência (reaplicar não duplica índice, policy nem constraint, e não perde o que a
-- primeira criou).

-- ---- colunas ---------------------------------------------------------------------------------
do $$
declare
  esperado text[][] := array[
    -- coluna,      tipo,                       not null, default
    ['id',          'uuid',                     'YES',    'gen_random_uuid()'],
    ['user_id',     'uuid',                     'YES',    ''],
    ['category',    'text',                     'YES',    ''],
    ['icon_key',    'text',                     'NO',     ''],
    ['icon_url',    'text',                     'NO',     ''],
    ['created_at',  'timestamp with time zone', 'YES',    'now()']
  ];
  i int;
  col text;
  achou_tipo text;
  achou_nn boolean;
  achou_def text;
  n int;
begin
  if to_regclass('public.event_type_icon') is null then
    raise exception 'FALHOU: public.event_type_icon não existe depois da migration';
  end if;

  for i in 1 .. array_length(esperado, 1) loop
    col := esperado[i][1];
    select data_type, is_nullable = 'NO', coalesce(column_default, '')
      into achou_tipo, achou_nn, achou_def
      from information_schema.columns
     where table_schema = 'public' and table_name = 'event_type_icon' and column_name = col;

    if achou_tipo is null then
      raise exception 'FALHOU: coluna % não existe', col;
    end if;
    if achou_tipo <> esperado[i][2] then
      raise exception 'FALHOU: coluna % deveria ser % e é %', col, esperado[i][2], achou_tipo;
    end if;
    if achou_nn <> (esperado[i][3] = 'YES') then
      raise exception 'FALHOU: not null de % deveria ser %', col, esperado[i][3];
    end if;
    if esperado[i][4] <> '' and position(esperado[i][4] in achou_def) = 0 then
      raise exception 'FALHOU: default de % deveria conter "%" e é "%"', col, esperado[i][4], achou_def;
    end if;
  end loop;

  -- Nenhuma coluna a mais: a forma da tabela é contrato com `EventTypeIconRow` (src/types/travel.ts).
  select count(*) into n from information_schema.columns
   where table_schema = 'public' and table_name = 'event_type_icon';
  if n <> array_length(esperado, 1) then
    raise exception 'FALHOU: event_type_icon tem % colunas, esperadas %', n, array_length(esperado, 1);
  end if;

  raise notice 'OK: colunas de event_type_icon';
end $$;

-- ---- unique, checks, índice e FK ---------------------------------------------------------------
do $$
declare n int;
begin
  select count(*) into n from pg_constraint
   where conrelid = 'public.event_type_icon'::regclass
     and conname = 'event_type_icon_unique_category' and contype = 'u';
  if n <> 1 then
    raise exception 'FALHOU: unique (user_id, category) ausente ou duplicada (%)', n;
  end if;

  select count(*) into n from pg_constraint
   where conrelid = 'public.event_type_icon'::regclass
     and conname = 'event_type_icon_one_source' and contype = 'c';
  if n <> 1 then
    raise exception 'FALHOU: check de fonte única do ícone ausente ou duplicado (%)', n;
  end if;

  select count(*) into n from pg_constraint
   where conrelid = 'public.event_type_icon'::regclass
     and conname = 'event_type_icon_category_check' and contype = 'c';
  if n <> 1 then
    raise exception 'FALHOU: check de categoria ausente ou duplicado (%)', n;
  end if;

  -- FK para auth.users com cascade: conta apagada não deixa preferência órfã.
  select count(*) into n from pg_constraint
   where conrelid = 'public.event_type_icon'::regclass
     and contype = 'f' and confdeltype = 'c';
  if n <> 1 then
    raise exception 'FALHOU: esperada 1 FK com on delete cascade, achadas %', n;
  end if;

  -- **Nenhuma** FK para icon_asset: a URL é guardada, não o id — é o que faz excluir o ícone da
  -- biblioteca não apagar o ícone do tipo.
  select count(*) into n from pg_constraint
   where conrelid = 'public.event_type_icon'::regclass
     and contype = 'f' and confrelid = 'public.icon_asset'::regclass;
  if n <> 0 then
    raise exception 'FALHOU: event_type_icon não pode ter FK para icon_asset';
  end if;

  select count(*) into n from pg_indexes
   where schemaname = 'public' and tablename = 'event_type_icon'
     and indexname = 'event_type_icon_user_idx';
  if n <> 1 then
    raise exception 'FALHOU: índice event_type_icon_user_idx ausente ou duplicado (%)', n;
  end if;

  raise notice 'OK: unique, checks, FK e índice';
end $$;

-- ---- RLS e grants ------------------------------------------------------------------------------
do $$
declare n int; falta text;
begin
  if not exists (
    select 1 from pg_class where oid = 'public.event_type_icon'::regclass and relrowsecurity
  ) then
    raise exception 'FALHOU: RLS desligada em event_type_icon';
  end if;

  foreach falta in array array['select', 'insert', 'update', 'delete'] loop
    select count(*) into n from pg_policies
     where schemaname = 'public' and tablename = 'event_type_icon'
       and policyname = 'event_type_icon_' || falta || '_own';
    if n <> 1 then
      raise exception 'FALHOU: policy de % ausente ou duplicada (%)', falta, n;
    end if;
  end loop;

  foreach falta in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE'] loop
    if not has_table_privilege('authenticated', 'public.event_type_icon', falta) then
      raise exception 'FALHOU: authenticated sem % em event_type_icon', falta;
    end if;
  end loop;

  raise notice 'OK: RLS ligada, 4 policies e grants';
end $$;

-- ---- wipe_own_data acrescentou, não reescreveu --------------------------------------------------
do $$
declare txt text;
begin
  select pg_get_functiondef(p.oid) into txt
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.proname = 'wipe_own_data';

  if txt not like '%event_type_icon%' then
    raise exception 'FALHOU: wipe_own_data não conhece event_type_icon';
  end if;
  -- As que já estavam lá continuam: a função é reescrita inteira por toda migration que acrescenta
  -- tabela, e perder uma entrada aqui é vazamento silencioso no wipe de conta.
  if txt not like '%icon_asset%' or txt not like '%link_icon_rule%' or txt not like '%trip%' then
    raise exception 'FALHOU: wipe_own_data perdeu entradas antigas ao acrescentar a nova';
  end if;

  raise notice 'OK: wipe_own_data acrescentou event_type_icon sem perder o que já havia';
end $$;

-- ---- trigger do gate Pro -------------------------------------------------------------------------
do $$
declare n int;
begin
  select count(*) into n from pg_trigger
   where tgrelid = 'public.event_type_icon'::regclass
     and tgname = 'trg_enforce_app_access' and not tgisinternal;
  if n <> 1 then
    raise exception 'FALHOU: trigger de acesso ausente ou duplicado (%)', n;
  end if;
  raise notice 'OK: trg_enforce_app_access';
end $$;
