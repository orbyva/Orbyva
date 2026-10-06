\set ON_ERROR_STOP on

-- Comportamento da tabela nova, com efeito colateral de verdade — por isso este arquivo roda por
-- último. Cada bloco abre e desfaz a própria transação (menos o último, o do wipe, que é o fim da
-- linha).

-- ---- um tipo, um ícone ---------------------------------------------------------------------------
begin;
do $$
declare uid uuid := '11111111-1111-1111-1111-111111111111';
begin
  insert into public.event_type_icon (user_id, category, icon_key)
    values (uid, 'museum', 'star');

  begin
    insert into public.event_type_icon (user_id, category, icon_url)
      values (uid, 'museum', 'https://cdn.example/x.svg');
    raise exception 'FALHOU (unique): o mesmo tipo entrou duas vezes para o mesmo usuário';
  exception
    when unique_violation then null;
  end;

  -- O mesmo tipo em **outro** usuário é outra preferência, não conflito.
  insert into public.event_type_icon (user_id, category, icon_key)
    values ('22222222-2222-2222-2222-222222222222', 'museum', 'flag');

  -- Dois tipos com o mesmo ícone é permitido: a unicidade é por tipo, não por ícone.
  insert into public.event_type_icon (user_id, category, icon_key)
    values (uid, 'bar', 'star');

  raise notice 'OK: um ícone por tipo e por usuário; o mesmo ícone pode servir a dois tipos';
end $$;
rollback;

-- ---- exatamente uma fonte de ícone ---------------------------------------------------------------
begin;
do $$
declare uid uuid := '11111111-1111-1111-1111-111111111111';
begin
  begin
    insert into public.event_type_icon (user_id, category) values (uid, 'cafe');
    raise exception 'FALHOU (check): linha sem ícone nenhum entrou — tirar a personalização é apagar a linha';
  exception
    when check_violation then null;
  end;

  begin
    insert into public.event_type_icon (user_id, category, icon_key, icon_url)
      values (uid, 'cafe', 'star', 'https://cdn.example/x.svg');
    raise exception 'FALHOU (check): preset e URL ao mesmo tempo entraram';
  exception
    when check_violation then null;
  end;

  begin
    insert into public.event_type_icon (user_id, category, icon_key) values (uid, '   ', 'star');
    raise exception 'FALHOU (check): categoria em branco entrou';
  exception
    when check_violation then null;
  end;

  -- Os dois formatos válidos entram.
  insert into public.event_type_icon (user_id, category, icon_key) values (uid, 'cafe', 'star');
  insert into public.event_type_icon (user_id, category, icon_url)
    values (uid, 'park', 'https://cdn.example/storage/task-icons/11111111/library/mic.svg');

  raise notice 'OK: exatamente uma fonte de ícone, e categoria não pode ser vazia';
end $$;
rollback;

-- ---- trocar o ícone de um tipo é upsert, não acúmulo ----------------------------------------------
begin;
do $$
declare
  uid uuid := '11111111-1111-1111-1111-111111111111';
  n int;
  k text;
  u text;
begin
  insert into public.event_type_icon (user_id, category, icon_key) values (uid, 'other', 'star');
  insert into public.event_type_icon (user_id, category, icon_key, icon_url)
    values (uid, 'other', null, 'https://cdn.example/storage/task-icons/11111111/library/mic.svg')
    on conflict (user_id, category)
    do update set icon_key = excluded.icon_key, icon_url = excluded.icon_url;

  select count(*) into n from public.event_type_icon where user_id = uid and category = 'other';
  if n <> 1 then
    raise exception 'FALHOU: upsert deixou % linhas para o mesmo tipo', n;
  end if;

  select icon_key, icon_url into k, u
    from public.event_type_icon where user_id = uid and category = 'other';
  if k is not null or u is null then
    raise exception 'FALHOU: trocar preset por URL deveria limpar icon_key (key=%, url=%)', k, u;
  end if;

  raise notice 'OK: trocar o ícone de um tipo atualiza a linha e limpa a outra fonte';
end $$;
rollback;

-- ---- o ícone do tipo sobrevive à exclusão do ícone da biblioteca ---------------------------------
begin;
do $$
declare
  uid uuid := '11111111-1111-1111-1111-111111111111';
  u text;
begin
  insert into public.event_type_icon (user_id, category, icon_url)
    values (uid, 'attraction', 'https://cdn.example/storage/task-icons/11111111/library/mic.svg');

  delete from public.icon_asset where id = 'eeeeeeee-0000-0000-0000-000000000001';

  select icon_url into u from public.event_type_icon where user_id = uid and category = 'attraction';
  if u is null then
    raise exception 'FALHOU: tirar o ícone da biblioteca apagou o ícone do tipo';
  end if;

  raise notice 'OK: sem FK para icon_asset, o tipo continua desenhando depois de a biblioteca perder a linha';
end $$;
rollback;

-- ---- RLS: ninguém lê nem escreve a preferência alheia ---------------------------------------------
begin;
insert into public.event_type_icon (user_id, category, icon_key) values
  ('11111111-1111-1111-1111-111111111111', 'museum', 'star'),
  ('22222222-2222-2222-2222-222222222222', 'bar', 'flag');

set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);

do $$
declare n int;
begin
  select count(*) into n from public.event_type_icon;
  if n <> 1 then
    raise exception 'FALHOU (RLS): o usuário A enxerga % linhas, deveria enxergar 1', n;
  end if;

  begin
    insert into public.event_type_icon (user_id, category, icon_key)
      values ('22222222-2222-2222-2222-222222222222', 'park', 'star');
    raise exception 'FALHOU (RLS): A gravou preferência no nome de B';
  exception
    when insufficient_privilege then null;
  end;

  update public.event_type_icon set icon_key = 'pin'
   where user_id = '22222222-2222-2222-2222-222222222222';
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'FALHOU (RLS): A alterou a preferência de B';
  end if;

  delete from public.event_type_icon where user_id = '22222222-2222-2222-2222-222222222222';
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'FALHOU (RLS): A apagou a preferência de B';
  end if;

  raise notice 'OK (RLS): cada usuário só enxerga e só escreve a própria personalização';
end $$;
reset role;
rollback;

-- ---- cascade da conta e wipe_own_data ------------------------------------------------------------
-- Último bloco: escreve de verdade e termina apagando o seed.
insert into public.event_type_icon (user_id, category, icon_key) values
  ('11111111-1111-1111-1111-111111111111', 'museum', 'star'),
  ('11111111-1111-1111-1111-111111111111', 'bar', 'flag'),
  ('22222222-2222-2222-2222-222222222222', 'museum', 'pin');

select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select public.wipe_own_data();

do $$
declare meus int; dele int;
begin
  select count(*) into meus from public.event_type_icon
   where user_id = '11111111-1111-1111-1111-111111111111';
  select count(*) into dele from public.event_type_icon
   where user_id = '22222222-2222-2222-2222-222222222222';

  if meus <> 0 then
    raise exception 'FALHOU (wipe): sobraram % personalizações do usuário que pediu o wipe', meus;
  end if;
  if dele <> 1 then
    raise exception 'FALHOU (wipe): o wipe de A levou a personalização de B (restaram %)', dele;
  end if;

  raise notice 'OK (wipe): wipe_own_data apaga só a personalização de quem pediu';
end $$;

-- Apagar a conta leva a preferência junto (FK com cascade).
delete from auth.users where id = '22222222-2222-2222-2222-222222222222';
do $$
declare n int;
begin
  select count(*) into n from public.event_type_icon
   where user_id = '22222222-2222-2222-2222-222222222222';
  if n <> 0 then
    raise exception 'FALHOU (cascade): apagar a conta deixou % personalizações órfãs', n;
  end if;
  raise notice 'OK (cascade): conta apagada não deixa preferência órfã';
end $$;
