-- Schema: tabela, colunas, `check` do formato, índice, FKs com cascade, RLS ligada com a policy de
-- membro, o trigger do invariante, a coluna `boarding_time` e o bucket **privado** com as quatro
-- policies. Roda duas vezes no run.sh (a segunda prova idempotência).

do $$
declare
  n int;
  v text;
  b boolean;
begin
  -- ---- tabela e colunas ----------------------------------------------------------------------
  if to_regclass('public.trip_activity_asset') is null then
    raise exception 'FALHOU: trip_activity_asset não existe';
  end if;

  for v in select unnest(array[
    'id', 'trip_id', 'activity_id', 'kind', 'label', 'url', 'storage_path',
    'mime_type', 'size_bytes', 'position', 'created_by_user_id', 'created_at'
  ])
  loop
    if not exists (
      select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'trip_activity_asset'
         and column_name = v
    ) then
      raise exception 'FALHOU: coluna % ausente em trip_activity_asset', v;
    end if;
  end loop;

  -- `kind`, `trip_id` e `activity_id` são o que a RLS e o trigger leem: nulo neles seria um buraco.
  for v in select unnest(array['trip_id', 'activity_id', 'kind', 'position'])
  loop
    select is_nullable = 'NO' into b
      from information_schema.columns
     where table_schema = 'public' and table_name = 'trip_activity_asset' and column_name = v;
    if not b then
      raise exception 'FALHOU: % deveria ser NOT NULL', v;
    end if;
  end loop;

  -- ---- `check` do formato --------------------------------------------------------------------
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.trip_activity_asset'::regclass
       and conname = 'trip_activity_asset_shape'
  ) then
    raise exception 'FALHOU: constraint trip_activity_asset_shape ausente';
  end if;

  -- ---- índice do bundle ----------------------------------------------------------------------
  if not exists (
    select 1 from pg_indexes
     where schemaname = 'public' and indexname = 'trip_activity_asset_trip_idx'
  ) then
    raise exception 'FALHOU: índice trip_activity_asset_trip_idx ausente';
  end if;

  -- ---- FKs: as duas com cascade (apagar viagem ou atividade leva os assets) -------------------
  select count(*) into n
    from pg_constraint
   where conrelid = 'public.trip_activity_asset'::regclass
     and contype = 'f'
     and confdeltype = 'c'
     and confrelid in ('public.trip'::regclass, 'public.trip_itinerary_activity'::regclass);
  if n <> 2 then
    raise exception 'FALHOU: esperadas 2 FKs on delete cascade (trip, activity), achadas %', n;
  end if;

  -- `created_by_user_id` é `set null`: membro que sai não leva o documento do grupo.
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.trip_activity_asset'::regclass
       and contype = 'f' and confdeltype = 'n'
       and confrelid = 'auth.users'::regclass
  ) then
    raise exception 'FALHOU: created_by_user_id deveria ser on delete set null';
  end if;

  -- ---- RLS ------------------------------------------------------------------------------------
  select relrowsecurity into b from pg_class where oid = 'public.trip_activity_asset'::regclass;
  if not b then
    raise exception 'FALHOU: RLS desligada em trip_activity_asset';
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'trip_activity_asset'
       and policyname = 'trip_activity_asset_member'
  ) then
    raise exception 'FALHOU: policy trip_activity_asset_member ausente';
  end if;

  -- ---- trigger do invariante ------------------------------------------------------------------
  if not exists (
    select 1 from pg_trigger
     where tgrelid = 'public.trip_activity_asset'::regclass
       and tgname = 'trip_activity_asset_check_trip'
       and not tgisinternal
  ) then
    raise exception 'FALHOU: trigger trip_activity_asset_check_trip ausente';
  end if;

  -- ---- boarding_time (a segunda metade da feature) -------------------------------------------
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'trip_itinerary_activity'
       and column_name = 'boarding_time'
  ) then
    raise exception 'FALHOU: trip_itinerary_activity.boarding_time ausente';
  end if;

  select data_type into v
    from information_schema.columns
   where table_schema = 'public' and table_name = 'trip_itinerary_activity'
     and column_name = 'boarding_time';
  if v <> 'text' then
    raise exception 'FALHOU: boarding_time deveria ser text (como activity_time/arrival_time), é %', v;
  end if;

  -- ---- bucket: existe e é PRIVADO -------------------------------------------------------------
  select public into b from storage.buckets where id = 'trip-assets';
  if b is null then
    raise exception 'FALHOU: bucket trip-assets não existe';
  end if;
  if b then
    raise exception 'FALHOU: bucket trip-assets está PÚBLICO — é a decisão central da feature';
  end if;

  select file_size_limit into n from storage.buckets where id = 'trip-assets';
  if coalesce(n, 0) < 10485760 then
    raise exception 'FALHOU: teto do bucket deveria ser >= 10 MB, é %', n;
  end if;

  -- Allowlist de mime é ausência deliberada: documento importante é o que o usuário tem na mão.
  if (select allowed_mime_types from storage.buckets where id = 'trip-assets') is not null then
    raise exception 'FALHOU: trip-assets não deveria ter allowed_mime_types';
  end if;

  -- ---- policies do bucket --------------------------------------------------------------------
  for v in select unnest(array[
    'trip_assets_select_member', 'trip_assets_insert_member',
    'trip_assets_update_member', 'trip_assets_delete_member'
  ])
  loop
    if not exists (
      select 1 from pg_policies
       where schemaname = 'storage' and tablename = 'objects' and policyname = v
    ) then
      raise exception 'FALHOU: policy % ausente em storage.objects', v;
    end if;
  end loop;

  -- Nenhuma das policies do bucket pode alcançar `anon`/`public`: sem leitura anônima.
  if exists (
    select 1 from pg_policies
     where schemaname = 'storage' and tablename = 'objects'
       and policyname like 'trip_assets_%'
       and ('anon' = any(roles) or 'public' = any(roles) or roles is null)
  ) then
    raise exception 'FALHOU: policy de trip-assets alcança anon/public';
  end if;

  -- ---- helper do caminho ----------------------------------------------------------------------
  if not exists (
    select 1 from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
     where ns.nspname = 'public' and p.proname = 'trip_assets_path_member'
  ) then
    raise exception 'FALHOU: função trip_assets_path_member ausente';
  end if;

  raise notice 'OK (schema): tabela, check, índice, FKs, RLS, trigger, boarding_time e bucket privado';
end $$;

-- Caminho torto devolve `false`, não erro de cast — é a razão de a função existir. Fora do bloco
-- acima porque precisa rodar como `authenticated` (a função é `security definer`, mas `is_trip_member`
-- lê `auth.uid()`).
do $$
begin
  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);

  if public.trip_assets_path_member('nao-e-uuid/arquivo.pdf') then
    raise exception 'FALHOU: caminho torto deveria devolver false';
  end if;
  if public.trip_assets_path_member('arquivo-na-raiz.pdf') then
    raise exception 'FALHOU: arquivo na raiz (sem pasta) deveria devolver false';
  end if;
  if not public.trip_assets_path_member(
    'aaaaaaaa-0000-0000-0000-00000000000a/eeeeeeee-0000-0000-0000-0000000000f1/x.pdf'
  ) then
    raise exception 'FALHOU: dono da viagem deveria passar pelo caminho do próprio bucket';
  end if;
  if public.trip_assets_path_member(
    'cccccccc-0000-0000-0000-00000000000c/eeeeeeee-0000-0000-0000-0000000000f3/x.pdf'
  ) then
    raise exception 'FALHOU: estranho passou pelo caminho de viagem alheia';
  end if;

  perform set_config('request.jwt.claim.sub', '', true);
  raise notice 'OK (schema): trip_assets_path_member separa dono, estranho e caminho torto';
end $$;
