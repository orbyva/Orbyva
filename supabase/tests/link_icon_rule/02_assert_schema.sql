\set ON_ERROR_STOP on

-- Só leitura de catálogo: roda depois de **cada** aplicação da migration, e a segunda passagem é a
-- prova de idempotência (reaplicar não duplica índice, policy nem constraint, e não perde o que a
-- primeira criou).

-- ---- colunas ---------------------------------------------------------------------------------
do $$
declare
  esperado text[][] := array[
    -- coluna,          tipo,                         not null, default
    ['id',              'uuid',                       'YES',    'gen_random_uuid()'],
    ['user_id',         'uuid',                       'YES',    ''],
    ['name',            'text',                       'YES',    ''],
    ['pattern',         'text',                       'YES',    ''],
    ['label_template',  'text',                       'NO',     ''],
    ['icon_key',        'text',                       'NO',     ''],
    ['icon_url',        'text',                       'NO',     ''],
    ['position',        'integer',                    'YES',    '0'],
    ['enabled',         'boolean',                    'YES',    'true'],
    ['created_at',      'timestamp with time zone',   'YES',    'now()']
  ];
  i int;
  col text;
  achou_tipo text;
  achou_nn boolean;
  achou_def text;
  n int;
begin
  if to_regclass('public.link_icon_rule') is null then
    raise exception 'FALHOU: public.link_icon_rule não existe depois da migration';
  end if;

  for i in 1 .. array_length(esperado, 1) loop
    col := esperado[i][1];
    select data_type, is_nullable = 'NO', coalesce(column_default, '')
      into achou_tipo, achou_nn, achou_def
      from information_schema.columns
     where table_schema = 'public' and table_name = 'link_icon_rule' and column_name = col;

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

  -- Nenhuma coluna a mais: a forma da tabela é contrato com `LinkIconRule` (src/types/tasks.ts).
  select count(*) into n from information_schema.columns
   where table_schema = 'public' and table_name = 'link_icon_rule';
  if n <> array_length(esperado, 1) then
    raise exception 'FALHOU: link_icon_rule tem % colunas, esperadas %', n, array_length(esperado, 1);
  end if;

  raise notice 'OK: colunas, tipos, not null e defaults conforme';
end $$;

-- ---- chaves, constraint de pattern e índice ---------------------------------------------------
do $$
declare
  def text;
  n int;
begin
  -- PK
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.link_icon_rule'::regclass and contype = 'p'
  ) then
    raise exception 'FALHOU: link_icon_rule sem primary key';
  end if;

  -- FK para auth.users, com cascade (apagar a conta leva as regras).
  select pg_get_constraintdef(oid) into def
    from pg_constraint
   where conrelid = 'public.link_icon_rule'::regclass
     and contype = 'f'
     and conkey = array[(select attnum from pg_attribute
                          where attrelid = 'public.link_icon_rule'::regclass
                            and attname = 'user_id')];
  if def is null then
    raise exception 'FALHOU: sem FK de user_id';
  end if;
  if def not like '%auth.users%' or def not like '%ON DELETE CASCADE%' then
    raise exception 'FALHOU: FK de user_id deveria ser auth.users ON DELETE CASCADE, é: %', def;
  end if;

  -- A defesa contra ReDoS que não depende do cliente: pattern não-vazia e no máximo 200 caracteres.
  select pg_get_constraintdef(oid) into def
    from pg_constraint
   where conrelid = 'public.link_icon_rule'::regclass
     and conname = 'link_icon_rule_pattern_check';
  if def is null then
    raise exception 'FALHOU: constraint link_icon_rule_pattern_check ausente';
  end if;
  if def not like '%200%' then
    raise exception 'FALHOU: o teto de 200 caracteres não está na constraint: %', def;
  end if;

  -- Índice `(user_id, position)`: a ordem de avaliação, dentro do escopo que a RLS exige.
  select count(*) into n
    from pg_indexes
   where schemaname = 'public'
     and tablename = 'link_icon_rule'
     and indexname = 'link_icon_rule_user_position_idx';
  if n <> 1 then
    raise exception 'FALHOU: link_icon_rule_user_position_idx deveria existir 1 vez, achado %', n;
  end if;
  select indexdef into def from pg_indexes
   where schemaname = 'public' and indexname = 'link_icon_rule_user_position_idx';
  if def not like '%(user_id, "position")%' and def not like '%(user_id, position)%' then
    raise exception 'FALHOU: o índice deveria ser (user_id, position), é: %', def;
  end if;

  raise notice 'OK: PK, FK cascade, constraint de pattern e índice (user_id, position)';
end $$;

-- ---- comentários (a documentação que sobrevive ao repo) ---------------------------------------
do $$
declare txt text;
begin
  select obj_description('public.link_icon_rule'::regclass, 'pg_class') into txt;
  if coalesce(txt, '') = '' then
    raise exception 'FALHOU: link_icon_rule sem comment on table';
  end if;
  if txt not ilike '%primeira%' then
    raise exception 'FALHOU: o comment deveria registrar a precedência (primeira que casa vence)';
  end if;

  if coalesce(col_description('public.link_icon_rule'::regclass,
       (select attnum from pg_attribute
         where attrelid = 'public.link_icon_rule'::regclass and attname = 'pattern')), '') = '' then
    raise exception 'FALHOU: coluna pattern sem comment';
  end if;

  raise notice 'OK: comentários de tabela e de coluna presentes';
end $$;

-- ---- RLS: ligada, 4 policies, todas ancoradas em auth.uid() -----------------------------------
do $$
declare
  n int;
  cmds text[];
begin
  if not exists (
    select 1 from pg_class
     where oid = 'public.link_icon_rule'::regclass and relrowsecurity
  ) then
    raise exception 'FALHOU: RLS não está habilitada em link_icon_rule';
  end if;

  select count(*), array_agg(cmd order by cmd) into n, cmds
    from pg_policies
   where schemaname = 'public' and tablename = 'link_icon_rule';
  if n <> 4 then
    raise exception 'FALHOU: esperadas 4 policies (reaplicar não pode duplicar), achadas %', n;
  end if;
  if cmds <> array['DELETE', 'INSERT', 'SELECT', 'UPDATE'] then
    raise exception 'FALHOU: as 4 operações não estão cobertas: %', cmds;
  end if;

  select count(*) into n from pg_policies
   where schemaname = 'public' and tablename = 'link_icon_rule'
     and coalesce(qual, '') || coalesce(with_check, '') like '%auth.uid()%';
  if n <> 4 then
    raise exception 'FALHOU: % de 4 policies ancoradas em auth.uid()', n;
  end if;

  -- Grants: sem eles a RLS não chega a ser consultada — o role nem alcança a tabela.
  if not (
    has_table_privilege('authenticated', 'public.link_icon_rule', 'select')
    and has_table_privilege('authenticated', 'public.link_icon_rule', 'insert')
    and has_table_privilege('authenticated', 'public.link_icon_rule', 'update')
    and has_table_privilege('authenticated', 'public.link_icon_rule', 'delete')
  ) then
    raise exception 'FALHOU: role authenticated sem os 4 grants em link_icon_rule';
  end if;

  raise notice 'OK: RLS ligada, 4 policies por auth.uid() e os 4 grants';
end $$;

-- ---- wipe_own_data e trigger do gate Pro ------------------------------------------------------
do $$
declare
  txt text;
  n int;
begin
  select pg_get_functiondef(p.oid) into txt
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.proname = 'wipe_own_data';
  if txt is null then
    raise exception 'FALHOU: wipe_own_data não existe';
  end if;
  if txt not like '%link_icon_rule%' then
    raise exception 'FALHOU: wipe_own_data não apaga link_icon_rule';
  end if;
  -- A migration **acrescenta** à lista; reescrevê-la perdendo o que já estava lá seria um vazamento
  -- silencioso no wipe de conta.
  if txt not like '%icon_asset%' or txt not like '%task_external_link%' then
    raise exception 'FALHOU: wipe_own_data perdeu tabelas que já estavam na lista';
  end if;

  select count(*) into n from pg_trigger
   where tgrelid = 'public.link_icon_rule'::regclass
     and tgname = 'trg_enforce_app_access'
     and not tgisinternal;
  if n <> 1 then
    raise exception 'FALHOU: trg_enforce_app_access deveria existir 1 vez, achado %', n;
  end if;

  raise notice 'OK: wipe_own_data cobre link_icon_rule (sem perder as antigas) e o gate Pro está no lugar';
end $$;
