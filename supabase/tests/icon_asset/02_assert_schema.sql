\set ON_ERROR_STOP on

-- Assertivas de schema + cópia de dados da migration 20260823110000_icon_asset.sql (feature 086).
--
-- Este arquivo roda **duas vezes** (depois da primeira aplicação e depois da reaplicação), então
-- não pode ter efeito colateral: só lê. É assim que a idempotência fica provada — as mesmas
-- contagens têm de valer nas duas passadas, e a segunda é a que mostra que reaplicar não duplica
-- nenhuma linha da biblioteca.
do $$
declare
  n int;
  txt text;
  parts text[];
begin
  -- ---- a tabela e as colunas ---------------------------------------------------------------
  if to_regclass('public.icon_asset') is null then
    raise exception 'FALHOU: public.icon_asset não foi criada';
  end if;

  perform 1 from information_schema.columns
   where table_schema='public' and table_name='icon_asset' and column_name='id'
     and data_type='uuid' and is_nullable='NO' and column_default like '%gen_random_uuid%';
  if not found then raise exception 'FALHOU: id deveria ser uuid not null default gen_random_uuid()'; end if;

  perform 1 from information_schema.columns
   where table_schema='public' and table_name='icon_asset' and column_name='user_id'
     and data_type='uuid' and is_nullable='NO';
  if not found then raise exception 'FALHOU: user_id deveria ser uuid not null'; end if;

  perform 1 from information_schema.columns
   where table_schema='public' and table_name='icon_asset' and column_name='name'
     and data_type='text' and is_nullable='NO';
  if not found then raise exception 'FALHOU: name deveria ser text not null'; end if;

  perform 1 from information_schema.columns
   where table_schema='public' and table_name='icon_asset' and column_name='url'
     and data_type='text' and is_nullable='NO';
  if not found then raise exception 'FALHOU: url deveria ser text not null'; end if;

  perform 1 from information_schema.columns
   where table_schema='public' and table_name='icon_asset' and column_name='created_at'
     and is_nullable='NO' and column_default like '%now()%';
  if not found then raise exception 'FALHOU: created_at deveria ser timestamptz not null default now()'; end if;

  -- Nenhuma coluna guarda markup: o SVG colado vira **arquivo** e a tabela só conhece a URL. Se um
  -- dia alguém acrescentar uma coluna de texto com o SVG, o consumo inline volta a ser tentador —
  -- e é exatamente o que a decisão de segurança da feature proíbe.
  select count(*) into n from information_schema.columns
   where table_schema='public' and table_name='icon_asset'
     and column_name in ('svg', 'markup', 'content', 'body', 'data');
  if n <> 0 then
    raise exception 'FALHOU: icon_asset ganhou % coluna(s) de markup — a tabela guarda URL, nunca SVG', n;
  end if;

  -- ---- unique (user_id, url) ---------------------------------------------------------------
  -- É ele que torna a cópia de dados idempotente sem `not exists`, e é ele que impede o mesmo
  -- arquivo de aparecer duas vezes na lista.
  select count(*) into n
    from pg_constraint c
   where c.conrelid = 'public.icon_asset'::regclass
     and c.contype = 'u'
     and (select array_agg(a.attname::text order by a.attname)
            from unnest(c.conkey) k join pg_attribute a
              on a.attrelid = c.conrelid and a.attnum = k) = array['url','user_id'];
  if n <> 1 then
    raise exception 'FALHOU: falta o unique (user_id, url) — achados %', n;
  end if;

  -- ---- índice (user_id, created_at desc) ---------------------------------------------------
  perform 1 from pg_indexes
   where schemaname='public' and tablename='icon_asset'
     and indexname='icon_asset_user_created_idx'
     and indexdef like '%(user_id, created_at DESC)%';
  if not found then
    raise exception 'FALHOU: falta o índice icon_asset_user_created_idx (user_id, created_at desc)';
  end if;

  -- ---- FK para auth.users com cascade ------------------------------------------------------
  perform 1 from pg_constraint
   where conrelid='public.icon_asset'::regclass and contype='f'
     and confrelid='auth.users'::regclass and confdeltype='c';
  if not found then
    raise exception 'FALHOU: user_id deveria ter FK para auth.users com on delete cascade';
  end if;

  -- Não existe FK para `task`: a ligação é pela URL. É o que permite excluir o ícone da biblioteca
  -- sem quebrar as tarefas que já o usam (e vice-versa).
  perform 1 from pg_constraint
   where conrelid='public.icon_asset'::regclass and contype='f'
     and confrelid='public.task'::regclass;
  if found then
    raise exception 'FALHOU: icon_asset não deveria ter FK para task (a ligação é pela URL)';
  end if;

  -- ---- documentação do contrato ------------------------------------------------------------
  txt := coalesce(obj_description('public.icon_asset'::regclass, 'pg_class'), '');
  if txt = '' then
    raise exception 'FALHOU: falta comment on table public.icon_asset';
  end if;

  -- ---- RLS e trigger do gate Pro -----------------------------------------------------------
  perform 1 from pg_class where oid='public.icon_asset'::regclass and relrowsecurity;
  if not found then raise exception 'FALHOU: RLS não foi ligada em icon_asset'; end if;

  select count(*) into n from pg_policies
   where schemaname='public' and tablename='icon_asset';
  if n <> 4 then raise exception 'FALHOU: esperadas 4 policies, achadas %', n; end if;

  foreach txt in array array['SELECT','INSERT','UPDATE','DELETE']
  loop
    perform 1 from pg_policies
     where schemaname='public' and tablename='icon_asset' and cmd = txt;
    if not found then raise exception 'FALHOU: falta policy de % em icon_asset', txt; end if;
  end loop;

  perform 1 from pg_trigger t join pg_proc p on p.oid = t.tgfoid
   where t.tgrelid='public.icon_asset'::regclass and t.tgname='trg_enforce_app_access'
     and p.proname='enforce_app_access' and not t.tgisinternal;
  if not found then
    raise exception 'FALHOU: trigger trg_enforce_app_access não foi criado em icon_asset';
  end if;

  -- ---- `wipe_own_data` passou a conhecer a tabela ------------------------------------------
  select pg_get_functiondef(p.oid) into txt
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname='public' and p.proname='wipe_own_data';
  if txt not like '%icon_asset%' then
    raise exception 'FALHOU: wipe_own_data não inclui icon_asset';
  end if;
  -- E não perdeu o que já apagava: o baseline dos stubs tinha task e project.
  if txt not like '%''task''%' or txt not like '%''project''%' then
    raise exception 'FALHOU: wipe_own_data perdeu task ou project ao ser reescrita';
  end if;

  -- ---- o bucket `task-icons` aceita SVG e cabe um ícone ------------------------------------
  perform 1 from storage.buckets
   where id = 'task-icons' and public
     and allowed_mime_types @> array['image/svg+xml']
     and coalesce(file_size_limit, 0) >= 1048576;
  if not found then
    raise exception 'FALHOU: bucket task-icons deveria ser público, aceitar image/svg+xml e ter teto >= 1 MB';
  end if;

  -- Os mimes que já existiam continuam lá — o ajuste é união, não substituição.
  perform 1 from storage.buckets
   where id = 'task-icons'
     and allowed_mime_types @> array['image/png', 'image/jpeg', 'image/webp'];
  if not found then
    raise exception 'FALHOU: o ajuste do bucket derrubou os mimes de imagem que já eram aceitos';
  end if;

  -- ---- a subpasta `library/` não afrouxa as policies do bucket -----------------------------
  -- Esta é a afirmação central da mudança de caminho: as policies da 035 são ancoradas em
  -- `(storage.foldername(name))[1] = auth.uid()::text`, e `{uid}/library/{uuid}.svg` continua
  -- devolvendo o dono no `[1]`. Se `foldername` devolvesse outra coisa, o dono do arquivo passaria
  -- a ser "library" e a policy liberaria escrita na pasta de qualquer um.
  parts := storage.foldername(
    '11111111-1111-1111-1111-111111111111/library/7f0a1b2c-3d4e-5f60-8a9b-0c1d2e3f4a5b.svg'
  );
  if parts[1] <> '11111111-1111-1111-1111-111111111111' then
    raise exception 'FALHOU: foldername()[1] do caminho library/ deu "%", esperado o uuid do dono', parts[1];
  end if;
  if array_length(parts, 1) <> 2 or parts[2] <> 'library' then
    raise exception 'FALHOU: foldername() do caminho novo deveria ser {uid, library}, veio %', parts;
  end if;

  -- E as 4 policies do bucket continuam existindo, as 3 de escrita ainda ancoradas no dono.
  select count(*) into n from pg_policies
   where schemaname='storage' and tablename='objects'
     and policyname in ('task_icons_public_read', 'task_icons_insert_own',
                        'task_icons_update_own', 'task_icons_delete_own');
  if n <> 4 then
    raise exception 'FALHOU: esperadas as 4 policies do bucket task-icons, achadas %', n;
  end if;

  select count(*) into n from pg_policies
   where schemaname='storage' and tablename='objects'
     and policyname in ('task_icons_insert_own', 'task_icons_update_own', 'task_icons_delete_own')
     and coalesce(qual, '') || coalesce(with_check, '') like '%foldername%'
     and coalesce(qual, '') || coalesce(with_check, '') like '%uid()%';
  if n <> 3 then
    raise exception 'FALHOU: % de 3 policies de escrita do bucket ainda ancoradas no dono', n;
  end if;

  -- ---- a cópia do dado antigo --------------------------------------------------------------
  -- 3 linhas: A tinha duas tarefas na **mesma** URL (uma linha) mais uma segunda URL; B tinha uma.
  select count(*) into n from public.icon_asset;
  if n <> 3 then
    raise exception 'FALHOU: a cópia deveria ter gerado 3 ícones (2 de A + 1 de B), achados %', n;
  end if;

  -- A URL repetida virou uma linha só.
  select count(*) into n from public.icon_asset
   where url = 'https://x.supabase.co/storage/v1/object/public/task-icons/11111111-1111-1111-1111-111111111111/cccccccc-0000-0000-0000-000000000001.png';
  if n <> 1 then
    raise exception 'FALHOU: a URL usada por duas tarefas virou % linha(s) na biblioteca', n;
  end if;

  -- Tarefa só com preset e tarefa com `icon_url` em branco não geram linha.
  select count(*) into n from public.icon_asset where btrim(url) = '';
  if n <> 0 then
    raise exception 'FALHOU: a cópia criou % linha(s) para icon_url em branco', n;
  end if;

  select count(*) into n from public.icon_asset
   where user_id = '11111111-1111-1111-1111-111111111111';
  if n <> 2 then
    raise exception 'FALHOU: A deveria ter 2 ícones (a tarefa de preset não conta), achados %', n;
  end if;

  -- Cada linha pertence a quem tinha a tarefa — o escopo por usuário não foi perdido no distinct.
  select count(*) into n
    from public.icon_asset ia
   where not exists (
     select 1 from public.task t
      where t.user_id = ia.user_id and t.icon_url = ia.url
   );
  if n <> 0 then
    raise exception 'FALHOU: % ícone(s) copiado(s) com user_id que não é dono de nenhuma tarefa com aquela URL', n;
  end if;

  -- Nenhuma URL antiga ficou de fora.
  select count(*) into n
    from public.task t
   where t.icon_url is not null and btrim(t.icon_url) <> ''
     and not exists (select 1 from public.icon_asset ia
                      where ia.user_id = t.user_id and ia.url = t.icon_url);
  if n <> 0 then
    raise exception 'FALHOU: % tarefa(s) com ícone antigo ficaram fora da biblioteca', n;
  end if;

  -- ---- o nome derivado do arquivo ----------------------------------------------------------
  -- Nome legível vem do arquivo…
  perform 1 from public.icon_asset where name = 'logo-empresa';
  if not found then
    raise exception 'FALHOU: o ícone de logo-empresa.webp deveria se chamar "logo-empresa"';
  end if;

  -- …a query string não entra no nome…
  perform 1 from public.icon_asset
   where user_id = '22222222-2222-2222-2222-222222222222' and name = 'icone-do-vizinho';
  if not found then
    raise exception 'FALHOU: o "?width=64" vazou para o nome do ícone do vizinho';
  end if;

  -- …e o caminho antigo `{userId}/{taskId}.ext`, cujo "nome de arquivo" é um uuid, cai no rótulo
  -- genérico em vez de mostrar o uuid na lista.
  perform 1 from public.icon_asset
   where user_id = '11111111-1111-1111-1111-111111111111' and name = 'Ícone 1';
  if not found then
    raise exception 'FALHOU: o ícone cujo arquivo é um uuid deveria virar "Ícone 1"';
  end if;

  select count(*) into n from public.icon_asset
   where name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  if n <> 0 then
    raise exception 'FALHOU: % ícone(s) ficaram com um uuid cru como nome', n;
  end if;

  select count(*) into n from public.icon_asset where btrim(name) = '';
  if n <> 0 then
    raise exception 'FALHOU: % ícone(s) ficaram sem nome', n;
  end if;

  -- ---- nada em `task` foi tocado -----------------------------------------------------------
  -- Os ícones antigos continuam funcionando sem nada a fazer: a coluna é URL absoluta e a
  -- migration não a reescreve.
  select count(*) into n from public.task where icon_url is not null;
  if n <> 5 then
    raise exception 'FALHOU: a migration mexeu em task.icon_url (esperadas 5 linhas, achadas %)', n;
  end if;

  select count(*) into n from public.task;
  if n <> 6 then
    raise exception 'FALHOU: a migration mudou a contagem de tarefas (esperadas 6, achadas %)', n;
  end if;

  perform 1 from public.task
   where id = 'cccccccc-0000-0000-0000-000000000004' and icon_key = 'star' and icon_url is null;
  if not found then
    raise exception 'FALHOU: a migration mexeu na tarefa que só tinha preset';
  end if;

  -- ---- os arquivos no bucket seguem intactos -----------------------------------------------
  select count(*) into n from storage.objects where bucket_id = 'task-icons';
  if n <> 2 then
    raise exception 'FALHOU: a migration mexeu nos objetos do bucket (esperados 2, achados %)', n;
  end if;

  raise notice 'OK: schema, unique, índice, FK, RLS, bucket com library/, wipe_own_data e a cópia de 3 ícones conferidos';
end $$;
