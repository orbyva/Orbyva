\set ON_ERROR_STOP on

-- Só leitura: roda depois da 1ª e da 2ª aplicação das migrations, e tem de dar o mesmo resultado.
do $$
declare
  v text;
  n int;
begin
  -- ── 20260820110000: project_id opcional ───────────────────────────────────────────────────
  select is_nullable into v
  from information_schema.columns
  where table_schema = 'public' and table_name = 'project_event' and column_name = 'project_id';
  if v <> 'YES' then
    raise exception 'FALHOU: project_event.project_id deveria aceitar nulo (is_nullable = %)', v;
  end if;

  select col_description('public.project_event'::regclass, ordinal_position) into v
  from information_schema.columns
  where table_schema = 'public' and table_name = 'project_event' and column_name = 'project_id';
  if v is null or v not like '%convite%' then
    raise exception 'FALHOU: falta o comment explicando o project_id nulo (veio %)', coalesce(v, '<null>');
  end if;

  -- A FK e o cascade continuam de pé — `drop not null` não pode ter levado a integridade junto.
  select count(*) into n
  from information_schema.table_constraints tc
  join information_schema.key_column_usage k
    on k.constraint_name = tc.constraint_name and k.constraint_schema = tc.constraint_schema
  where tc.table_schema = 'public' and tc.table_name = 'project_event'
    and tc.constraint_type = 'FOREIGN KEY' and k.column_name = 'project_id';
  if n <> 1 then
    raise exception 'FALHOU: a FK project_event.project_id -> project sumiu (achadas %)', n;
  end if;

  -- ── 20260820120000: tabela event_invite ───────────────────────────────────────────────────
  if to_regclass('public.event_invite') is null then
    raise exception 'FALHOU: tabela public.event_invite não existe';
  end if;

  select count(*) into n
  from information_schema.columns
  where table_schema = 'public' and table_name = 'event_invite'
    and column_name in ('id', 'event_id', 'email', 'token', 'created_by', 'status',
                        'expires_at', 'accepted_by', 'accepted_event_id', 'email_sent_at',
                        'created_at');
  if n <> 11 then
    raise exception 'FALHOU: event_invite deveria ter as 11 colunas decididas, tem %', n;
  end if;

  select count(*) into n
  from information_schema.columns
  where table_schema = 'public' and table_name = 'event_invite'
    and column_name in ('event_id', 'token', 'created_by', 'status', 'expires_at', 'created_at')
    and is_nullable = 'NO';
  if n <> 6 then
    raise exception 'FALHOU: colunas obrigatórias de event_invite estão nulas demais (% de 6)', n;
  end if;

  select count(*) into n
  from information_schema.columns
  where table_schema = 'public' and table_name = 'event_invite'
    and column_name in ('email', 'accepted_by', 'accepted_event_id', 'email_sent_at')
    and is_nullable = 'YES';
  if n <> 4 then
    raise exception 'FALHOU: email/accepted_by/accepted_event_id/email_sent_at precisam ser nuláveis (% de 4)', n;
  end if;

  if not (select relrowsecurity from pg_class where oid = 'public.event_invite'::regclass) then
    raise exception 'FALHOU: RLS desligada em event_invite';
  end if;

  select count(*) into n from pg_policies
  where schemaname = 'public' and tablename = 'event_invite'
    and policyname in ('event_invite_select_own', 'event_invite_insert_own',
                       'event_invite_update_own', 'event_invite_delete_own');
  if n <> 4 then
    raise exception 'FALHOU: event_invite deveria ter as 4 policies, tem %', n;
  end if;

  -- Reaplicar a migration não pode duplicar policy (o `drop policy if exists` cobre isso).
  select count(*) into n from pg_policies
  where schemaname = 'public' and tablename = 'event_invite';
  if n <> 4 then
    raise exception 'FALHOU: event_invite ficou com % policies (reaplicação duplicou?)', n;
  end if;

  select count(*) into n from pg_indexes
  where schemaname = 'public' and tablename = 'event_invite'
    and indexname in ('event_invite_event_idx', 'event_invite_created_by_idx',
                      'event_invite_accepted_by_idx', 'event_invite_pending_email_idx');
  if n <> 4 then
    raise exception 'FALHOU: faltam índices em event_invite (achados % de 4)', n;
  end if;

  -- `token` unique é o que impede colisão de convite.
  select count(*) into n
  from pg_constraint
  where conrelid = 'public.event_invite'::regclass and contype = 'u';
  if n < 1 then
    raise exception 'FALHOU: event_invite.token precisa ser unique';
  end if;

  select count(*) into n
  from pg_trigger
  where tgrelid = 'public.event_invite'::regclass and tgname = 'trg_enforce_app_access';
  if n <> 1 then
    raise exception 'FALHOU: trg_enforce_app_access ausente/duplicado em event_invite (%)', n;
  end if;

  -- ── 20260820130000: as duas RPCs ──────────────────────────────────────────────────────────
  select count(*) into n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public'
    and p.proname in ('get_event_invite_by_token', 'accept_event_invite')
    and p.prosecdef;
  if n <> 2 then
    raise exception 'FALHOU: as duas RPCs precisam existir e ser security definer (achadas %)', n;
  end if;

  select p.provolatile into v from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public' and p.proname = 'get_event_invite_by_token';
  if v <> 's' then
    raise exception 'FALHOU: get_event_invite_by_token deveria ser stable (volatilidade %)', v;
  end if;

  select p.provolatile into v from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public' and p.proname = 'accept_event_invite';
  if v <> 'v' then
    raise exception 'FALHOU: accept_event_invite deveria ser volatile (volatilidade %)', v;
  end if;

  -- `search_path` fixo: sem isso, security definer é um vetor de sequestro de schema.
  select count(*) into n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public'
    and p.proname in ('get_event_invite_by_token', 'accept_event_invite')
    and array_to_string(coalesce(p.proconfig, '{}'), ',') like '%search_path=public%';
  if n <> 2 then
    raise exception 'FALHOU: as RPCs precisam de `set search_path = public` (achadas %)', n;
  end if;

  if not has_function_privilege('authenticated', 'public.accept_event_invite(text)', 'execute') then
    raise exception 'FALHOU: authenticated não pode executar accept_event_invite';
  end if;
  if not has_function_privilege('authenticated', 'public.get_event_invite_by_token(text)', 'execute') then
    raise exception 'FALHOU: authenticated não pode executar get_event_invite_by_token';
  end if;
  if has_function_privilege('public', 'public.accept_event_invite(text)', 'execute') then
    raise exception 'FALHOU: accept_event_invite continua exposta a PUBLIC';
  end if;

  -- ── wipe_own_data conhece event_invite ────────────────────────────────────────────────────
  select pg_get_functiondef(p.oid) into v from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public' and p.proname = 'wipe_own_data';
  if v not like '%event_invite%' then
    raise exception 'FALHOU: wipe_own_data não apaga event_invite';
  end if;
  if v not like '%reminder_preference%' then
    raise exception 'FALHOU: wipe_own_data perdeu reminder_preference';
  end if;

  raise notice 'OK: schema das 3 migrations conferido';
end $$;
