\set ON_ERROR_STOP on

-- Assertivas de schema da migration 20260924113000_orb_avatar.sql (feature 151).
--
-- Este arquivo roda **duas vezes** (depois da primeira aplicação e depois da reaplicação), então
-- não pode ter efeito colateral: só lê. É assim que a idempotência fica provada — as mesmas
-- contagens têm de valer nas duas passadas.
do $$
declare
  n int;
  txt text;
  t text;
  def text;
  parts text[];
  esperadas text[] := array[
    -- A lista de `20260823120000_link_icon_rule.sql` (a redefinição mais recente antes desta),
    -- escrita aqui por extenso de propósito: é ela que transforma "o wipe conhece orb_avatar" em
    -- "o wipe ganhou orb_avatar **sem perder** nada". Reescrever a função de memória é o erro que
    -- esta assertiva pega.
    'transaction', 'recurring_transaction', 'monthly_budget', 'movie', 'movie_episode',
    'book_note', 'book', 'album', 'personal_goal', 'habit', 'place_visit', 'trip', 'vehicle',
    'class', 'type', 'task_time_entry', 'task_dependency', 'task_external_link', 'task',
    'icon_asset', 'link_icon_rule', 'project_event', 'note', 'note_folder', 'project', 'tag', 'content_link',
    'shopping_item', 'shopping_category', 'health_metric', 'reminder_preference', 'medication',
    -- e a entrada nova
    'orb_avatar'
  ];
begin
  -- ---- a tabela e as colunas ---------------------------------------------------------------
  if to_regclass('public.orb_avatar') is null then
    raise exception 'FALHOU: public.orb_avatar não foi criada';
  end if;

  perform 1 from information_schema.columns
   where table_schema='public' and table_name='orb_avatar' and column_name='id'
     and data_type='uuid' and is_nullable='NO' and column_default like '%gen_random_uuid%';
  if not found then raise exception 'FALHOU: id deveria ser uuid not null default gen_random_uuid()'; end if;

  perform 1 from information_schema.columns
   where table_schema='public' and table_name='orb_avatar' and column_name='user_id'
     and data_type='uuid' and is_nullable='NO';
  if not found then raise exception 'FALHOU: user_id deveria ser uuid not null'; end if;

  foreach t in array array['prompt', 'url', 'model']
  loop
    perform 1 from information_schema.columns
     where table_schema='public' and table_name='orb_avatar' and column_name=t
       and data_type='text' and is_nullable='NO';
    if not found then raise exception 'FALHOU: % deveria ser text not null', t; end if;
  end loop;

  -- `is_active` nasce false: uma geração nova não rouba a esfera de quem já escolheu uma versão.
  perform 1 from information_schema.columns
   where table_schema='public' and table_name='orb_avatar' and column_name='is_active'
     and data_type='boolean' and is_nullable='NO' and column_default like '%false%';
  if not found then
    raise exception 'FALHOU: is_active deveria ser boolean not null default false';
  end if;

  perform 1 from information_schema.columns
   where table_schema='public' and table_name='orb_avatar' and column_name='created_at'
     and data_type='timestamp with time zone' and is_nullable='NO' and column_default like '%now()%';
  if not found then
    raise exception 'FALHOU: created_at deveria ser timestamptz not null default now()';
  end if;

  -- Nenhuma coluna guarda a imagem: o PNG é arquivo no bucket, e a tabela só conhece a URL. Um
  -- bytea/base64 aqui carregaria megabytes em toda listagem da galeria.
  select count(*) into n from information_schema.columns
   where table_schema='public' and table_name='orb_avatar'
     and (column_name in ('image', 'png', 'data', 'content', 'blob', 'bytes')
          or data_type = 'bytea');
  if n <> 0 then
    raise exception 'FALHOU: orb_avatar ganhou % coluna(s) de imagem — a tabela guarda URL, nunca bytes', n;
  end if;

  -- ---- unique (user_id, url) ---------------------------------------------------------------
  select count(*) into n
    from pg_constraint c
   where c.conrelid = 'public.orb_avatar'::regclass
     and c.contype = 'u'
     and (select array_agg(a.attname::text order by a.attname)
            from unnest(c.conkey) k join pg_attribute a
              on a.attrelid = c.conrelid and a.attnum = k) = array['url','user_id'];
  if n <> 1 then
    raise exception 'FALHOU: falta o unique (user_id, url) — achados %', n;
  end if;

  -- ---- índice da galeria (user_id, created_at desc) ----------------------------------------
  perform 1 from pg_indexes
   where schemaname='public' and tablename='orb_avatar'
     and indexname='orb_avatar_user_created_idx'
     and indexdef like '%(user_id, created_at DESC)%';
  if not found then
    raise exception 'FALHOU: falta o índice orb_avatar_user_created_idx (user_id, created_at desc)';
  end if;

  -- ---- índice único PARCIAL: no máximo uma ativa por dono ----------------------------------
  -- É este índice — não a aplicação, não a RPC — que garante a regra. Parcial porque zero ativas é
  -- estado válido: um unique cheio proibiria a segunda linha inativa do mesmo dono.
  select pg_get_indexdef(i.indexrelid) into def
    from pg_index i join pg_class c on c.oid = i.indexrelid
   where c.relname = 'orb_avatar_one_active_idx'
     and i.indrelid = 'public.orb_avatar'::regclass;
  if def is null then
    raise exception 'FALHOU: falta o índice orb_avatar_one_active_idx';
  end if;

  perform 1 from pg_index i join pg_class c on c.oid = i.indexrelid
   where c.relname = 'orb_avatar_one_active_idx'
     and i.indrelid = 'public.orb_avatar'::regclass
     and i.indisunique
     and i.indpred is not null;
  if not found then
    raise exception 'FALHOU: orb_avatar_one_active_idx deveria ser UNIQUE e PARCIAL, é "%"', def;
  end if;

  select pg_get_expr(i.indpred, i.indrelid) into txt
    from pg_index i join pg_class c on c.oid = i.indexrelid
   where c.relname = 'orb_avatar_one_active_idx';
  if coalesce(txt, '') not like '%is_active%' then
    raise exception 'FALHOU: o predicado de orb_avatar_one_active_idx não olha is_active, é "%"', txt;
  end if;

  if def not like '%(user_id)%' then
    raise exception 'FALHOU: orb_avatar_one_active_idx deveria ser por user_id, é "%"', def;
  end if;

  -- ---- FK para auth.users com cascade ------------------------------------------------------
  perform 1 from pg_constraint
   where conrelid='public.orb_avatar'::regclass and contype='f'
     and confrelid='auth.users'::regclass and confdeltype='c';
  if not found then
    raise exception 'FALHOU: user_id deveria ter FK para auth.users com on delete cascade';
  end if;

  -- ---- documentação do contrato ------------------------------------------------------------
  txt := coalesce(obj_description('public.orb_avatar'::regclass, 'pg_class'), '');
  if txt = '' then
    raise exception 'FALHOU: falta comment on table public.orb_avatar';
  end if;

  foreach t in array array['prompt', 'url', 'model', 'is_active']
  loop
    perform 1 from pg_description d
      join pg_attribute a on a.attrelid = d.objoid and a.attnum = d.objsubid
     where d.objoid = 'public.orb_avatar'::regclass and a.attname = t
       and coalesce(d.description, '') <> '';
    if not found then raise exception 'FALHOU: falta comment on column orb_avatar.%', t; end if;
  end loop;

  -- ---- RLS e trigger do gate Pro -----------------------------------------------------------
  perform 1 from pg_class where oid='public.orb_avatar'::regclass and relrowsecurity;
  if not found then raise exception 'FALHOU: RLS não foi ligada em orb_avatar'; end if;

  select count(*) into n from pg_policies
   where schemaname='public' and tablename='orb_avatar';
  if n <> 4 then raise exception 'FALHOU: esperadas 4 policies, achadas %', n; end if;

  foreach t in array array['SELECT','INSERT','UPDATE','DELETE']
  loop
    perform 1 from pg_policies
     where schemaname='public' and tablename='orb_avatar' and cmd = t
       and coalesce(qual, '') || coalesce(with_check, '') like '%uid()%';
    if not found then
      raise exception 'FALHOU: falta policy de % em orb_avatar ancorada em auth.uid()', t;
    end if;
  end loop;

  perform 1 from pg_trigger tg join pg_proc p on p.oid = tg.tgfoid
   where tg.tgrelid='public.orb_avatar'::regclass and tg.tgname='trg_enforce_app_access'
     and p.proname='enforce_app_access' and not tg.tgisinternal;
  if not found then
    raise exception 'FALHOU: trigger trg_enforce_app_access não foi criado em orb_avatar';
  end if;

  -- ---- a RPC de trocar a ativa -------------------------------------------------------------
  perform 1 from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname='public' and p.proname='orb_avatar_set_active'
     and p.pronargs = 1 and p.proargtypes[0] = 'uuid'::regtype
     and p.prorettype = 'void'::regtype;
  if not found then
    raise exception 'FALHOU: falta public.orb_avatar_set_active(uuid) returns void';
  end if;

  -- `security definer` é o ponto da RPC: ela é a única escrita suportada de `is_active`, com o
  -- escopo do dono conferido dentro dela.
  perform 1 from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname='public' and p.proname='orb_avatar_set_active' and p.prosecdef;
  if not found then
    raise exception 'FALHOU: orb_avatar_set_active deveria ser security definer';
  end if;

  -- Sem `set search_path`, uma `security definer` roda com o search_path de quem chama — o buraco
  -- clássico de escalonamento.
  perform 1 from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname='public' and p.proname='orb_avatar_set_active'
     and array_to_string(coalesce(p.proconfig, array[]::text[]), ',') like '%search_path%';
  if not found then
    raise exception 'FALHOU: orb_avatar_set_active security definer sem set search_path';
  end if;

  select p.oid::regprocedure::text into txt
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname='public' and p.proname='orb_avatar_set_active';
  if not has_function_privilege('authenticated', txt, 'EXECUTE') then
    raise exception 'FALHOU: authenticated não pode executar %', txt;
  end if;

  if coalesce(obj_description(txt::regprocedure::oid, 'pg_proc'), '') = '' then
    raise exception 'FALHOU: falta comment on function orb_avatar_set_active';
  end if;

  -- ---- grants da tabela --------------------------------------------------------------------
  foreach t in array array['SELECT','INSERT','UPDATE','DELETE']
  loop
    if not has_table_privilege('authenticated', 'public.orb_avatar', t) then
      raise exception 'FALHOU: falta grant de % em orb_avatar para authenticated', t;
    end if;
  end loop;

  -- ---- `wipe_own_data` ganhou orb_avatar e não perdeu nada ---------------------------------
  select pg_get_functiondef(p.oid) into def
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname='public' and p.proname='wipe_own_data';

  foreach t in array esperadas
  loop
    if def not like ('%''' || t || '''%') then
      raise exception 'FALHOU: wipe_own_data não lista % (lista reescrita de memória?)', t;
    end if;
  end loop;

  -- O delete explícito dos convites (feature 076) também não pode ter sumido na reescrita.
  if def not like '%event_invite%' then
    raise exception 'FALHOU: wipe_own_data perdeu o delete de event_invite';
  end if;

  -- ---- o bucket `orb-avatars` --------------------------------------------------------------
  -- Bucket próprio porque `task-icons` tem teto de 1 MB (20260814010000_task_icon.sql) e um PNG de
  -- 1024² estoura isso com folga.
  perform 1 from storage.buckets
   where id = 'orb-avatars' and name = 'orb-avatars' and public
     and file_size_limit = 5242880
     and allowed_mime_types = array['image/png'];
  if not found then
    select coalesce(
             (select format('public=%s limit=%s mimes=%s', b.public, b.file_size_limit, b.allowed_mime_types)
                from storage.buckets b where b.id = 'orb-avatars'),
             'bucket ausente')
      into txt;
    raise exception 'FALHOU: bucket orb-avatars deveria ser público, teto 5242880 e só image/png — veio %', txt;
  end if;

  -- Reaplicar não pode duplicar nem multiplicar bucket.
  select count(*) into n from storage.buckets where id = 'orb-avatars';
  if n <> 1 then raise exception 'FALHOU: % bucket(s) orb-avatars', n; end if;

  -- ---- as policies do bucket prendem o arquivo ao dono -------------------------------------
  select count(*) into n from pg_policies
   where schemaname='storage' and tablename='objects'
     and policyname in ('orb_avatars_public_read', 'orb_avatars_insert_own',
                        'orb_avatars_update_own', 'orb_avatars_delete_own');
  if n <> 4 then
    raise exception 'FALHOU: esperadas as 4 policies do bucket orb-avatars, achadas %', n;
  end if;

  select count(*) into n from pg_policies
   where schemaname='storage' and tablename='objects'
     and policyname in ('orb_avatars_insert_own', 'orb_avatars_update_own', 'orb_avatars_delete_own')
     and coalesce(qual, '') || coalesce(with_check, '') like '%foldername%'
     and coalesce(qual, '') || coalesce(with_check, '') like '%uid()%';
  if n <> 3 then
    raise exception 'FALHOU: % de 3 policies de escrita do bucket ancoradas no dono', n;
  end if;

  -- O caminho `{uid}/{uuid}.png` devolve o dono no `[1]` — se não devolvesse, a policy liberaria
  -- escrita na pasta de qualquer um.
  parts := storage.foldername(
    '11111111-1111-1111-1111-111111111111/7f0a1b2c-3d4e-5f60-8a9b-0c1d2e3f4a5b.png'
  );
  if array_length(parts, 1) <> 1
     or parts[1] <> '11111111-1111-1111-1111-111111111111' then
    raise exception 'FALHOU: foldername() do caminho do PNG deveria ser {uid}, veio %', parts;
  end if;

  -- ---- a migration não inventa dado --------------------------------------------------------
  -- Não há cópia de dado nesta feature (a Orb nunca teve imagem): a tabela nasce vazia, e continua
  -- vazia depois da reaplicação.
  select count(*) into n from public.orb_avatar;
  if n <> 0 then
    raise exception 'FALHOU: a migration criou % linha(s) em orb_avatar', n;
  end if;

  raise notice 'OK: tabela, índices (inclusive o parcial), FK, RLS, RPC security definer, bucket 5 MB/png e wipe_own_data conferidos';
end $$;
