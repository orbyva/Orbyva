-- Comportamento, como `authenticated` de verdade: o `check` do formato, o trigger do invariante, a
-- RLS separando dono/membro/estranho nas duas pontas (tabela e bucket), e o cascade.
--
-- Escreve de verdade e roda por último, como no teste da 086.

set role authenticated;

-- ---- `check` do formato ----------------------------------------------------------------------
do $$
begin
  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);

  -- Link sem URL: a UI não saberia desenhar.
  begin
    insert into public.trip_activity_asset (trip_id, activity_id, kind, position)
    values ('aaaaaaaa-0000-0000-0000-00000000000a', 'eeeeeeee-0000-0000-0000-0000000000f1',
            'link', 0);
    raise exception 'FALHOU: link sem url foi aceito';
  exception when check_violation then null;
  end;

  -- Arquivo sem caminho: o mesmo problema do outro lado.
  begin
    insert into public.trip_activity_asset (trip_id, activity_id, kind, position)
    values ('aaaaaaaa-0000-0000-0000-00000000000a', 'eeeeeeee-0000-0000-0000-0000000000f1',
            'file', 0);
    raise exception 'FALHOU: file sem storage_path foi aceito';
  exception when check_violation then null;
  end;

  -- As duas coisas ao mesmo tempo: o usuário escolheu **um** botão.
  begin
    insert into public.trip_activity_asset
      (trip_id, activity_id, kind, url, storage_path, position)
    values ('aaaaaaaa-0000-0000-0000-00000000000a', 'eeeeeeee-0000-0000-0000-0000000000f1',
            'link', 'https://x.test/a', 'aaaaaaaa-0000-0000-0000-00000000000a/e/a.pdf', 0);
    raise exception 'FALHOU: asset com url E storage_path foi aceito';
  exception when check_violation then null;
  end;

  -- `kind` fora do par.
  begin
    insert into public.trip_activity_asset (trip_id, activity_id, kind, url, position)
    values ('aaaaaaaa-0000-0000-0000-00000000000a', 'eeeeeeee-0000-0000-0000-0000000000f1',
            'pdf', 'https://x.test/a', 0);
    raise exception 'FALHOU: kind inválido foi aceito';
  exception when check_violation then null;
  end;

  raise notice 'OK (comportamento): o check amarra os dois formatos de asset';
end $$;

-- ---- trigger do invariante trip_id/activity_id ------------------------------------------------
do $$
begin
  perform set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);

  -- Caio é dono da viagem dele: a RLS passaria. O trigger é que não deixa ele pendurar um asset da
  -- sua viagem numa atividade de outra.
  begin
    insert into public.trip_activity_asset (trip_id, activity_id, kind, url, position)
    values ('cccccccc-0000-0000-0000-00000000000c', 'eeeeeeee-0000-0000-0000-0000000000f1',
            'link', 'https://x.test/mentira', 0);
    raise exception 'FALHOU: asset com trip_id de uma viagem e activity_id de outra foi aceito';
  exception when check_violation then null;
  end;

  raise notice 'OK (comportamento): o trigger recusa trip_id que não confere com a atividade';
end $$;

-- ---- RLS na tabela: dono grava nos dois tipos de linha, membro vê, estranho não --------------
do $$
declare n int;
begin
  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);

  -- O voo: um arquivo (cartão de embarque) e um link (check-in online).
  insert into public.trip_activity_asset
    (id, trip_id, activity_id, kind, label, storage_path, mime_type, size_bytes, position,
     created_by_user_id)
  values ('ffffffff-0000-0000-0000-0000000000a1',
          'aaaaaaaa-0000-0000-0000-00000000000a', 'eeeeeeee-0000-0000-0000-0000000000f1',
          'file', 'Cartão de embarque',
          'aaaaaaaa-0000-0000-0000-00000000000a/eeeeeeee-0000-0000-0000-0000000000f1/bp.pdf',
          'application/pdf', 102400, 0, '11111111-1111-1111-1111-111111111111');

  insert into public.trip_activity_asset
    (id, trip_id, activity_id, kind, label, url, position, created_by_user_id)
  values ('ffffffff-0000-0000-0000-0000000000a2',
          'aaaaaaaa-0000-0000-0000-00000000000a', 'eeeeeeee-0000-0000-0000-0000000000f1',
          'link', 'Check-in', 'https://tap.test/checkin', 1,
          '11111111-1111-1111-1111-111111111111');

  -- A visita: o pedido-mãe pede o botão nos **dois** tipos de linha.
  insert into public.trip_activity_asset
    (id, trip_id, activity_id, kind, url, position, created_by_user_id)
  values ('ffffffff-0000-0000-0000-0000000000a3',
          'aaaaaaaa-0000-0000-0000-00000000000a', 'eeeeeeee-0000-0000-0000-0000000000f2',
          'link', 'https://jeronimos.test/ingresso', 0,
          '11111111-1111-1111-1111-111111111111');

  select count(*) into n from public.trip_activity_asset;
  if n <> 3 then
    raise exception 'FALHOU: dono deveria ver 3 assets, vê %', n;
  end if;

  -- Membro convidado: mesma viagem, mesmos assets — documento de voo é o que o grupo precisa achar.
  perform set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
  select count(*) into n from public.trip_activity_asset;
  if n <> 3 then
    raise exception 'FALHOU: membro deveria ver 3 assets, vê %', n;
  end if;

  -- E pode anexar (é editor).
  insert into public.trip_activity_asset (trip_id, activity_id, kind, url, position,
                                          created_by_user_id)
  values ('aaaaaaaa-0000-0000-0000-00000000000a', 'eeeeeeee-0000-0000-0000-0000000000f2',
          'link', 'https://bia.test/dica', 1, '22222222-2222-2222-2222-222222222222');

  -- Estranho: nada.
  perform set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
  select count(*) into n from public.trip_activity_asset;
  if n <> 0 then
    raise exception 'FALHOU: estranho deveria ver 0 assets, vê %', n;
  end if;

  -- Nem escrever na viagem alheia (aqui o trip_id confere com a atividade; o que barra é a RLS).
  begin
    insert into public.trip_activity_asset (trip_id, activity_id, kind, url, position)
    values ('aaaaaaaa-0000-0000-0000-00000000000a', 'eeeeeeee-0000-0000-0000-0000000000f1',
            'link', 'https://x.test/invasao', 9);
    raise exception 'FALHOU: estranho gravou asset em viagem alheia';
  exception when insufficient_privilege then null;
  end;

  -- Nem apagar.
  delete from public.trip_activity_asset where id = 'ffffffff-0000-0000-0000-0000000000a1';
  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  if not exists (
    select 1 from public.trip_activity_asset where id = 'ffffffff-0000-0000-0000-0000000000a1'
  ) then
    raise exception 'FALHOU: estranho apagou asset de viagem alheia';
  end if;

  raise notice 'OK (comportamento): RLS da tabela separa dono, membro e estranho nos dois tipos de linha';
end $$;

-- ---- RLS no bucket: o caminho é que decide ----------------------------------------------------
do $$
declare n int;
begin
  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);

  insert into storage.objects (bucket_id, name)
  values ('trip-assets',
          'aaaaaaaa-0000-0000-0000-00000000000a/eeeeeeee-0000-0000-0000-0000000000f1/bp.pdf');

  -- Membro lê o arquivo do grupo.
  perform set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
  select count(*) into n from storage.objects where bucket_id = 'trip-assets';
  if n <> 1 then
    raise exception 'FALHOU: membro deveria ver 1 objeto, vê %', n;
  end if;

  -- Estranho não vê nada.
  perform set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
  select count(*) into n from storage.objects where bucket_id = 'trip-assets';
  if n <> 0 then
    raise exception 'FALHOU: estranho deveria ver 0 objetos, vê %', n;
  end if;

  -- Nem sobe arquivo na pasta de viagem alheia.
  begin
    insert into storage.objects (bucket_id, name)
    values ('trip-assets', 'aaaaaaaa-0000-0000-0000-00000000000a/x/invasao.pdf');
    raise exception 'FALHOU: estranho subiu arquivo na pasta de viagem alheia';
  exception when insufficient_privilege then null;
  end;

  -- Nem na raiz do bucket (caminho sem pasta não pertence a viagem nenhuma).
  begin
    insert into storage.objects (bucket_id, name) values ('trip-assets', 'solto.pdf');
    raise exception 'FALHOU: arquivo na raiz do bucket foi aceito';
  exception when insufficient_privilege then null;
  end;

  -- Anônimo também não lê — o bucket é privado, não "privado para quem está logado".
  set role anon;
  perform set_config('request.jwt.claim.sub', '', true);
  select count(*) into n from storage.objects where bucket_id = 'trip-assets';
  if n <> 0 then
    raise exception 'FALHOU: anônimo deveria ver 0 objetos, vê %', n;
  end if;
  set role authenticated;

  raise notice 'OK (comportamento): policies do bucket derivam a viagem da primeira pasta do caminho';
end $$;

-- ---- cascade ---------------------------------------------------------------------------------
do $$
declare n int;
begin
  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);

  -- Apagar a atividade leva os assets dela (e só os dela).
  delete from public.trip_itinerary_activity where id = 'eeeeeeee-0000-0000-0000-0000000000f1';
  select count(*) into n from public.trip_activity_asset
   where activity_id = 'eeeeeeee-0000-0000-0000-0000000000f1';
  if n <> 0 then
    raise exception 'FALHOU: assets da atividade apagada sobraram (%)', n;
  end if;
  select count(*) into n from public.trip_activity_asset;
  if n <> 2 then
    raise exception 'FALHOU: os 2 assets da visita deveriam continuar, achados %', n;
  end if;

  -- Apagar a viagem leva o resto.
  reset role;
  delete from public.trip where id = 'aaaaaaaa-0000-0000-0000-00000000000a';
  set role authenticated;
  select count(*) into n from public.trip_activity_asset;
  if n <> 0 then
    raise exception 'FALHOU: assets sobreviveram ao delete da viagem (%)', n;
  end if;

  raise notice 'OK (comportamento): cascade de atividade e de viagem';
end $$;

reset role;
