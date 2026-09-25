\set ON_ERROR_STOP on

-- Controle positivo do estado PRÉ-migration: roda uma única vez, entre a migration da 050 e a
-- migration em teste. Sem ele o `03_assert_schema.sql` mediria nada — um `is_nullable = 'YES'` só
-- prova alguma coisa se a coluna era `NOT NULL` antes.
do $$
begin
  perform 1 from information_schema.columns
   where table_schema = 'public' and table_name = 'shopping_item'
     and column_name = 'shopping_category_id' and is_nullable = 'NO';
  if not found then
    raise exception 'FALHOU: o estado pré-migration deveria ter shopping_category_id NOT NULL';
  end if;

  begin
    insert into public.shopping_item (id, user_id, title, status) values
      ('99999999-0000-0000-0000-00000000000f', '11111111-1111-1111-1111-111111111111',
       'Pilha AA', 'pending');
    raise exception 'FALHOU: antes da migration, insert sem categoria deveria violar NOT NULL';
  exception
    when not_null_violation then null;
  end;

  raise notice 'OK (pré): shopping_category_id era NOT NULL e recusava item sem categoria';
end $$;
