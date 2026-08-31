\set ON_ERROR_STOP on

-- Controle negativo: roda **antes** da migration. Sem ele, as assertivas do 03 poderiam estar
-- passando por causa do schema dos stubs, não por causa da migration em teste — este arquivo prova
-- que `sort_order` realmente não existia e que reordenar era impossível até a 082.
do $$
declare n int;
begin
  select count(*) into n from information_schema.columns
   where table_schema='public' and table_name='task' and column_name='sort_order';
  if n <> 0 then
    raise exception 'FALHOU (controle negativo): task.sort_order já existia antes da migration';
  end if;

  begin
    execute 'update public.task set sort_order = 1 where true';
    raise exception 'FALHOU (controle negativo): reordenar funcionou sem a migration';
  exception
    when undefined_column then null;
  end;

  select count(*) into n from public.task;
  if n <> 6 then
    raise exception 'FALHOU: seed deveria ter 6 tarefas, achadas %', n;
  end if;

  raise notice 'OK (controle negativo): sem a migration não existe task.sort_order nem reordenação';
end $$;
