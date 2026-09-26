\set ON_ERROR_STOP on

-- As 4 policies de `shopping_item` valem igual para o item **sem categoria**. Isso não é óbvio de
-- graça: as policies são `user_id = auth.uid()` e o item sem categoria é a primeira linha da tabela
-- que não tem dono "por tabelamento" (categoria) nenhum — se alguma delas dependesse do join com
-- `shopping_category`, um item nulo vazaria ou ficaria inalcançável.
--
-- Roda por último no run.sh: termina chamando `wipe_own_data`, que apaga as linhas do seed.
set role authenticated;

-- ---- dono cria um item sem categoria e o enxerga (select + insert) ---------------------------
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);

insert into public.shopping_item (id, user_id, title, status) values
  ('a1a1a1a1-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   'Pilha AA', 'pending');

do $$
declare n int;
begin
  select count(*) into n from public.shopping_item;
  if n <> 2 then
    raise exception 'FALHOU: o dono deveria ver 2 itens (1 categorizado + 1 sem categoria), viu %', n;
  end if;

  select count(*) into n from public.shopping_item where shopping_category_id is null;
  if n <> 1 then
    raise exception 'FALHOU: o dono deveria ver o próprio item sem categoria, viu %', n;
  end if;

  -- update do próprio item sem categoria: categorizar depois é o caminho normal de edição.
  update public.shopping_item
     set shopping_category_id = 'aaaaaaaa-0000-0000-0000-000000000001'
   where id = 'a1a1a1a1-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'FALHOU: o dono não conseguiu categorizar o próprio item sem categoria';
  end if;

  -- ...e voltar para "sem categoria" também.
  update public.shopping_item set shopping_category_id = null
   where id = 'a1a1a1a1-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'FALHOU: o dono não conseguiu tirar a categoria do próprio item';
  end if;
end $$;

-- ---- outro usuário não enxerga nem alcança o item sem categoria alheio ------------------------
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);

do $$
declare n int;
begin
  select count(*) into n from public.shopping_item;
  if n <> 1 then
    raise exception 'FALHOU: o usuário B deveria ver só o próprio item, viu %', n;
  end if;

  select count(*) into n from public.shopping_item
   where id = 'a1a1a1a1-0000-0000-0000-000000000001';
  if n <> 0 then
    raise exception 'FALHOU: RLS vazando o item sem categoria do usuário A';
  end if;

  update public.shopping_item set title = 'invadido'
   where id = 'a1a1a1a1-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'FALHOU: update alcançou % item(ns) sem categoria alheio(s)', n;
  end if;

  delete from public.shopping_item where id = 'a1a1a1a1-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'FALHOU: delete alcançou % item(ns) sem categoria alheio(s)', n;
  end if;
end $$;

-- forjar user_id no insert de item sem categoria é barrado pelo with check
do $$
begin
  begin
    insert into public.shopping_item (user_id, title, status) values
      ('11111111-1111-1111-1111-111111111111', 'Item forjado', 'pending');
    raise exception 'FALHOU: insert sem categoria com user_id alheio deveria ser bloqueado pela RLS';
  exception
    when insufficient_privilege then null;
  end;
end $$;

-- ---- o dono apaga o próprio item sem categoria (delete policy) -------------------------------
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);

do $$
declare n int;
begin
  delete from public.shopping_item where id = 'a1a1a1a1-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'FALHOU: o dono não conseguiu apagar o próprio item sem categoria';
  end if;
end $$;

-- ---- wipe_own_data leva o item sem categoria do dono — e só dele -----------------------------
insert into public.shopping_item (id, user_id, title, status) values
  ('a1a1a1a1-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
   'Pilha AAA', 'pending');

reset role;

do $$
declare n int;
begin
  select count(*) into n from public.shopping_item
   where user_id = '11111111-1111-1111-1111-111111111111'::uuid;
  if n <> 2 then
    raise exception 'FALHOU: pré-wipe o dono deveria ter 2 itens (categorizado + sem categoria), tem %', n;
  end if;

  perform public.wipe_own_data();

  select count(*) into n from public.shopping_item
   where user_id = '11111111-1111-1111-1111-111111111111'::uuid;
  if n <> 0 then
    raise exception 'FALHOU: wipe_own_data deixou % item(ns) do dono para trás', n;
  end if;

  select count(*) into n from public.shopping_item
   where user_id = '22222222-2222-2222-2222-222222222222'::uuid;
  if n <> 1 then
    raise exception 'FALHOU: wipe_own_data mexeu nos itens de outro usuário (sobraram %, esperado 1)', n;
  end if;

  raise notice 'OK: as 4 policies e o wipe_own_data valem igual para o item sem categoria';
end $$;
