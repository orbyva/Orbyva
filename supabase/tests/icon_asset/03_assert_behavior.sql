\set ON_ERROR_STOP on

-- Comportamento da tabela nova e do bucket, com efeito colateral de verdade — por isso este arquivo
-- roda por último. Cada bloco abre e desfaz a própria transação, então a cópia validada no 02
-- continua intacta para o bloco seguinte (menos o último, o do wipe, que é o fim da linha).

-- ---- unique (user_id, url): o mesmo arquivo duas vezes na minha lista é engano ----------------
begin;
do $$
begin
  begin
    insert into public.icon_asset (user_id, name, url) values
      ('11111111-1111-1111-1111-111111111111', 'Outro nome',
       'https://x.supabase.co/storage/v1/object/public/task-icons/11111111-1111-1111-1111-111111111111/logo-empresa.webp');
    raise exception 'FALHOU (unique): o mesmo arquivo entrou duas vezes na biblioteca do dono';
  exception
    when unique_violation then null;
  end;

  -- A mesma URL na biblioteca de **outro** usuário é permitida: a lista é por usuário, e o unique
  -- é (user_id, url), não url global.
  insert into public.icon_asset (user_id, name, url) values
    ('22222222-2222-2222-2222-222222222222', 'Copiei do amigo',
     'https://x.supabase.co/storage/v1/object/public/task-icons/11111111-1111-1111-1111-111111111111/logo-empresa.webp');

  -- E o caminho novo, o que o app passa a escrever, entra normalmente.
  insert into public.icon_asset (user_id, name, url) values
    ('11111111-1111-1111-1111-111111111111', 'Colado do site',
     'https://x.supabase.co/storage/v1/object/public/task-icons/11111111-1111-1111-1111-111111111111/library/7f0a1b2c-3d4e-5f60-8a9b-0c1d2e3f4a5b.svg');

  if (select count(*) from public.icon_asset
       where user_id = '11111111-1111-1111-1111-111111111111') <> 3 then
    raise exception 'FALHOU: A deveria ter 3 ícones depois do upload novo';
  end if;

  raise notice 'OK: unique barra o mesmo arquivo na mesma biblioteca, permite em outra, e aceita library/';
end $$;
rollback;

-- ---- renomear é só rótulo: não mexe na URL nem em quem usa -----------------------------------
begin;
do $$
declare n int; u text;
begin
  update public.icon_asset
     set name = 'Logo da empresa'
   where user_id = '11111111-1111-1111-1111-111111111111' and name = 'logo-empresa';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FALHOU (rename): atualizou % linha(s), esperada 1', n; end if;

  select url into u from public.icon_asset where name = 'Logo da empresa';
  if u <> 'https://x.supabase.co/storage/v1/object/public/task-icons/11111111-1111-1111-1111-111111111111/logo-empresa.webp' then
    raise exception 'FALHOU (rename): a URL mudou junto com o nome';
  end if;

  select count(*) into n from public.task
   where icon_url = 'https://x.supabase.co/storage/v1/object/public/task-icons/11111111-1111-1111-1111-111111111111/logo-empresa.webp';
  if n <> 1 then raise exception 'FALHOU (rename): a tarefa que usa o ícone foi afetada'; end if;

  raise notice 'OK: renomear troca só o rótulo da lista';
end $$;
rollback;

-- ---- excluir da biblioteca NÃO apaga o arquivo nem quebra as tarefas -------------------------
-- Decisão registrada na feature: a linha some da lista, o arquivo permanece no bucket e as tarefas
-- que apontam para aquela URL continuam mostrando o ícone. Só é verdade se não houver FK nem
-- trigger levando o delete adiante — é o que este bloco prova.
begin;
do $$
declare n int;
begin
  delete from public.icon_asset
   where url = 'https://x.supabase.co/storage/v1/object/public/task-icons/11111111-1111-1111-1111-111111111111/cccccccc-0000-0000-0000-000000000001.png';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FALHOU (delete): apagou % linha(s), esperada 1', n; end if;

  select count(*) into n from storage.objects
   where bucket_id = 'task-icons'
     and name = '11111111-1111-1111-1111-111111111111/cccccccc-0000-0000-0000-000000000001.png';
  if n <> 1 then
    raise exception 'FALHOU: excluir da biblioteca apagou o arquivo no bucket (sobraram %)', n;
  end if;

  select count(*) into n from public.task
   where icon_url = 'https://x.supabase.co/storage/v1/object/public/task-icons/11111111-1111-1111-1111-111111111111/cccccccc-0000-0000-0000-000000000001.png';
  if n <> 2 then
    raise exception 'FALHOU: excluir da biblioteca mexeu no icon_url das tarefas (sobraram %)', n;
  end if;

  raise notice 'OK: excluir tira da lista sem apagar o arquivo nem alterar as tarefas que o usam';
end $$;
rollback;

-- ---- RLS: só o dono lê e escreve na própria biblioteca ---------------------------------------
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);

do $$
declare n int;
begin
  select count(*) into n from public.icon_asset;
  if n <> 2 then
    raise exception 'FALHOU (RLS select): o dono deveria ver 2 ícones próprios, viu %', n;
  end if;

  perform 1 from public.icon_asset where user_id = '22222222-2222-2222-2222-222222222222';
  if found then raise exception 'FALHOU (RLS select): vazou ícone de outro usuário'; end if;

  begin
    insert into public.icon_asset (user_id, name, url) values
      ('22222222-2222-2222-2222-222222222222', 'Invasão',
       'https://x.supabase.co/storage/v1/object/public/task-icons/22222222-2222-2222-2222-222222222222/library/aa.svg');
    raise exception 'FALHOU (RLS insert): gravar ícone na biblioteca alheia foi permitido';
  exception
    when insufficient_privilege then null;
  end;

  insert into public.icon_asset (user_id, name, url) values
    ('11111111-1111-1111-1111-111111111111', 'Meu SVG colado',
     'https://x.supabase.co/storage/v1/object/public/task-icons/11111111-1111-1111-1111-111111111111/library/bb.svg');
  perform 1 from public.icon_asset where name = 'Meu SVG colado';
  if not found then raise exception 'FALHOU: insert do próprio ícone não gravou'; end if;

  update public.icon_asset set name = 'renomeado por fora'
   where user_id = '22222222-2222-2222-2222-222222222222';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALHOU (RLS update): renomeou % ícone(s) alheio(s)', n; end if;

  delete from public.icon_asset where user_id = '22222222-2222-2222-2222-222222222222';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALHOU (RLS delete): apagou % ícone(s) alheio(s)', n; end if;

  raise notice 'OK: RLS por auth.uid() barra leitura, insert, update e delete alheios';
end $$;
rollback;

-- ---- o bucket com a subpasta `library/`: o dono continua sendo o dono -------------------------
-- O caminho passou de `{uid}/{taskId}.ext` para `{uid}/library/{uuid}.ext`. As policies da 035 não
-- foram reescritas — este bloco é a prova de que não precisavam ser: `foldername(name)[1]` continua
-- sendo o uuid do dono, então gravar na pasta de outro segue barrado com uma subpasta a mais.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);

do $$
declare n int;
begin
  insert into storage.objects (bucket_id, name, owner) values
    ('task-icons',
     '11111111-1111-1111-1111-111111111111/library/7f0a1b2c-3d4e-5f60-8a9b-0c1d2e3f4a5b.svg',
     '11111111-1111-1111-1111-111111111111');

  begin
    insert into storage.objects (bucket_id, name, owner) values
      ('task-icons',
       '22222222-2222-2222-2222-222222222222/library/deadbeef-0000-0000-0000-000000000000.svg',
       '11111111-1111-1111-1111-111111111111');
    raise exception 'FALHOU (storage RLS): gravei um SVG dentro da pasta library/ de outro usuário';
  exception
    when insufficient_privilege then null;
  end;

  -- Apagar arquivo alheio (inclusive no caminho antigo) continua fora de alcance.
  delete from storage.objects
   where bucket_id = 'task-icons'
     and name like '22222222-2222-2222-2222-222222222222/%';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALHOU (storage RLS): apaguei % arquivo(s) alheio(s)', n; end if;

  raise notice 'OK: com library/ no caminho, a policy do bucket segue prendendo o arquivo ao dono';
end $$;
rollback;

-- ---- wipe_own_data leva os ícones do dono (e nenhum alheio) ----------------------------------
-- Vem por último: apaga o seed.
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);

do $$
declare n int;
begin
  perform public.wipe_own_data();

  select count(*) into n from public.icon_asset
   where user_id = '11111111-1111-1111-1111-111111111111';
  if n <> 0 then raise exception 'FALHOU (wipe): sobraram % ícones do dono', n; end if;

  select count(*) into n from public.icon_asset
   where user_id = '22222222-2222-2222-2222-222222222222';
  if n <> 1 then raise exception 'FALHOU (wipe): o ícone do outro usuário sumiu (sobraram %)', n; end if;

  select count(*) into n from public.task
   where user_id = '11111111-1111-1111-1111-111111111111';
  if n <> 0 then raise exception 'FALHOU (wipe): sobraram % tarefas do dono', n; end if;

  raise notice 'OK: wipe_own_data apaga a biblioteca do usuário sem tocar na dos outros';
end $$;
