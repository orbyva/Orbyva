\set ON_ERROR_STOP on

-- Assertivas da migration 20260818140000_shopping_item_optional_category.sql (feature 050,
-- reabertura). Roda duas vezes (depois da migration e depois da reaplicação), então tudo que
-- insere aqui apaga as próprias linhas no fim — o estado do seed precisa sobreviver intacto para o
-- 04_assert_rls.
do $$
declare
  n int;
  msg text;
begin
  -- ---- a coluna virou nullable ---------------------------------------------------------------
  perform 1 from information_schema.columns
   where table_schema = 'public' and table_name = 'shopping_item'
     and column_name = 'shopping_category_id' and is_nullable = 'YES';
  if not found then
    raise exception 'FALHOU: shopping_item.shopping_category_id continua NOT NULL';
  end if;

  -- ---- item sem categoria é aceito -----------------------------------------------------------
  insert into public.shopping_item (id, user_id, title, status) values
    ('99999999-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
     'Pilha AA', 'pending');

  select count(*) into n from public.shopping_item
   where id = '99999999-0000-0000-0000-000000000001' and shopping_category_id is null;
  if n <> 1 then
    raise exception 'FALHOU: item sem categoria deveria ter sido gravado com shopping_category_id nulo';
  end if;

  -- ---- a linha legada sobreviveu ao alter ----------------------------------------------------
  select count(*) into n from public.shopping_item
   where id = 'cccccccc-0000-0000-0000-000000000001'
     and shopping_category_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  if n <> 1 then
    raise exception 'FALHOU: o item categorizado do seed não sobreviveu ao drop not null';
  end if;

  -- ---- o FK continua existindo, e continua com on delete cascade -----------------------------
  perform 1
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
   where c.conrelid = 'public.shopping_item'::regclass
     and c.contype = 'f'
     and c.confrelid = 'public.shopping_category'::regclass
     and a.attname = 'shopping_category_id'
     and c.confdeltype = 'c';
  if not found then
    raise exception 'FALHOU: shopping_category_id deveria seguir com FK para shopping_category com on delete cascade';
  end if;

  -- ---- categoria inexistente continua barrada (nulo não virou "vale tudo") -------------------
  begin
    insert into public.shopping_item (id, user_id, shopping_category_id, title, status) values
      ('99999999-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
       '00000000-0000-0000-0000-0000000000ff', 'Item órfão', 'pending');
    raise exception 'FALHOU: insert apontando para categoria inexistente deveria violar o FK';
  exception
    when foreign_key_violation then null;
  end;

  -- ---- o cascade continua apagando os itens da categoria excluída ----------------------------
  insert into public.shopping_category (id, user_id, name) values
    ('99999999-1111-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Descartável');
  insert into public.shopping_item (id, user_id, shopping_category_id, title, status) values
    ('99999999-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111',
     '99999999-1111-0000-0000-000000000001', 'Item da descartável', 'pending');

  delete from public.shopping_category where id = '99999999-1111-0000-0000-000000000001';

  select count(*) into n from public.shopping_item
   where id = '99999999-0000-0000-0000-000000000003';
  if n <> 0 then
    raise exception 'FALHOU: on delete cascade não apagou o item da categoria excluída';
  end if;

  -- ...e o item SEM categoria não é levado junto por cascade nenhum.
  select count(*) into n from public.shopping_item
   where id = '99999999-0000-0000-0000-000000000001';
  if n <> 1 then
    raise exception 'FALHOU: o cascade da categoria levou o item sem categoria junto';
  end if;

  -- ---- o resto do contrato da 050 continua de pé ---------------------------------------------
  select count(*) into n from public.shopping_item
   where status = 'pending' and id = '99999999-0000-0000-0000-000000000001';
  if n <> 1 then
    raise exception 'FALHOU: o default de status deixou de valer para o item sem categoria';
  end if;

  begin
    insert into public.shopping_item (id, user_id, title, status) values
      ('99999999-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111',
       'Desisti', 'crossed');
    raise exception 'FALHOU: o check de status deveria recusar ''crossed'' também sem categoria';
  exception
    when check_violation then null;
  end;

  perform 1 from pg_class
   where oid = 'public.shopping_item'::regclass and relrowsecurity;
  if not found then
    raise exception 'FALHOU: RLS de public.shopping_item foi desligada pela migration';
  end if;

  select count(*) into n from pg_policies
   where schemaname = 'public' and tablename = 'shopping_item';
  if n <> 4 then
    raise exception 'FALHOU: esperadas 4 policies em shopping_item, achadas %', n;
  end if;

  select count(*) into n from pg_policies
   where schemaname = 'public' and tablename = 'shopping_category';
  if n <> 4 then
    raise exception 'FALHOU: esperadas 4 policies em shopping_category, achadas %', n;
  end if;

  perform 1 from pg_trigger t
    join pg_proc p on p.oid = t.tgfoid
   where t.tgrelid = 'public.shopping_item'::regclass
     and t.tgname = 'trg_enforce_app_access'
     and p.proname = 'enforce_app_access'
     and not t.tgisinternal;
  if not found then
    raise exception 'FALHOU: trigger trg_enforce_app_access sumiu de public.shopping_item';
  end if;

  perform 1 from pg_indexes
   where schemaname = 'public' and tablename = 'shopping_item'
     and indexname = 'shopping_item_category_idx';
  if not found then
    raise exception 'FALHOU: a migration derrubou o índice shopping_item_category_idx (050)';
  end if;

  perform 1 from pg_indexes
   where schemaname = 'public' and tablename = 'shopping_item'
     and indexname = 'shopping_item_user_status_idx';
  if not found then
    raise exception 'FALHOU: a migration derrubou o índice shopping_item_user_status_idx (050)';
  end if;

  -- ---- o contrato está documentado na própria coluna -----------------------------------------
  msg := coalesce(
    col_description(
      'public.shopping_item'::regclass,
      (select ordinal_position from information_schema.columns
        where table_schema = 'public' and table_name = 'shopping_item'
          and column_name = 'shopping_category_id')::int
    ), '');
  if msg = '' or position('sem categoria' in msg) = 0 then
    raise exception 'FALHOU: falta o comment on column explicando que nulo é "sem categoria" (veio: %)', msg;
  end if;

  -- ---- limpeza: o 04_assert_rls conta em cima do seed ----------------------------------------
  delete from public.shopping_item where id::text like '99999999-%';

  raise notice 'OK: shopping_category_id nullable, item sem categoria aceito, FK/cascade/check/RLS/índices e comment conferidos';
end $$;
