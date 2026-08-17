\set ON_ERROR_STOP on

-- Este arquivo é o roteiro que a tarefa mandava fazer à mão no SQL editor depois do `db push`,
-- virado em assertiva: o `check` do entity_type, o `unique` do trio e o cascade ao apagar a nota.

-- ---- check do entity_type ----------------------------------------------------------------
begin;
do $$
begin
  begin
    insert into public.note_link (user_id, note_id, entity_type, entity_id)
    values ('11111111-1111-1111-1111-111111111111', 'cccccccc-0000-0000-0000-000000000001',
            'receita', 'x');
    raise exception 'FALHOU (check): entity_type fora da lista foi aceito';
  exception
    when check_violation then null;
  end;

  -- e um tipo da lista passa (senão o check estaria barrando tudo)
  insert into public.note_link (user_id, note_id, entity_type, entity_id)
  values ('11111111-1111-1111-1111-111111111111', 'cccccccc-0000-0000-0000-000000000001',
          'vehicle', 'carro-1');
  raise notice 'OK: check do entity_type rejeita tipo desconhecido e aceita os da lista';
end $$;
rollback;

-- ---- unique (note_id, entity_type, entity_id) ---------------------------------------------
begin;
do $$
begin
  insert into public.note_link (user_id, note_id, entity_type, entity_id)
  values ('11111111-1111-1111-1111-111111111111', 'cccccccc-0000-0000-0000-000000000001',
          'goal', 'meta-1');
  begin
    insert into public.note_link (user_id, note_id, entity_type, entity_id, label)
    values ('11111111-1111-1111-1111-111111111111', 'cccccccc-0000-0000-0000-000000000001',
            'goal', 'meta-1', 'de novo');
    raise exception 'FALHOU (unique): o mesmo (note_id, entity_type, entity_id) entrou duas vezes';
  exception
    when unique_violation then null;
  end;

  -- a mesma entidade em OUTRA nota continua permitida (é um vínculo diferente)
  insert into public.note_link (user_id, note_id, entity_type, entity_id)
  values ('11111111-1111-1111-1111-111111111111', 'cccccccc-0000-0000-0000-000000000002',
          'goal', 'meta-1');
  raise notice 'OK: unique barra duplicata na mesma nota e permite a mesma entidade em outra nota';
end $$;
rollback;

-- ---- on delete cascade: apagar a nota leva os vínculos dela ------------------------------
begin;
do $$
declare n int;
begin
  insert into public.note_link (user_id, note_id, entity_type, entity_id) values
    ('11111111-1111-1111-1111-111111111111', 'cccccccc-0000-0000-0000-000000000001', 'goal', 'meta-1'),
    ('11111111-1111-1111-1111-111111111111', 'cccccccc-0000-0000-0000-000000000001', 'trip', 'viagem-2'),
    ('11111111-1111-1111-1111-111111111111', 'cccccccc-0000-0000-0000-000000000002', 'book', 'livro-3');

  delete from public.note where id = 'cccccccc-0000-0000-0000-000000000001';

  select count(*) into n from public.note_link
   where note_id = 'cccccccc-0000-0000-0000-000000000001';
  if n <> 0 then raise exception 'FALHOU (cascade): sobraram % vínculos da nota apagada', n; end if;

  select count(*) into n from public.note_link;
  if n <> 1 then raise exception 'FALHOU (cascade): levou junto vínculo de outra nota (sobrou %)', n; end if;

  raise notice 'OK: apagar a nota apaga os vínculos dela, e só os dela';
end $$;
rollback;

-- ---- link órfão é tolerado de propósito ---------------------------------------------------
begin;
do $$
begin
  -- Não há FK para a entidade: apontar para um id que não existe em lugar nenhum é aceito, e é
  -- assim que tem que ser (decisão da 056 — a UI mostra "referência removida").
  insert into public.note_link (user_id, note_id, entity_type, entity_id)
  values ('11111111-1111-1111-1111-111111111111', 'cccccccc-0000-0000-0000-000000000002',
          'movie', 'filme-que-nao-existe');
  raise notice 'OK: vínculo órfão é aceito (referência polimórfica, sem FK)';
end $$;
rollback;

-- ---- on delete cascade do usuário ---------------------------------------------------------
begin;
do $$
declare n int;
begin
  insert into public.note_link (user_id, note_id, entity_type, entity_id) values
    ('11111111-1111-1111-1111-111111111111', 'cccccccc-0000-0000-0000-000000000001', 'goal', 'meta-1'),
    ('22222222-2222-2222-2222-222222222222', 'dddddddd-0000-0000-0000-000000000001', 'book', 'livro-9');

  delete from auth.users where id = '11111111-1111-1111-1111-111111111111';

  select count(*) into n from public.note_link
   where user_id = '11111111-1111-1111-1111-111111111111';
  if n <> 0 then raise exception 'FALHOU (cascade do usuário): sobraram % vínculos', n; end if;
  select count(*) into n from public.note_link;
  if n <> 1 then raise exception 'FALHOU: cascade levou vínculo de outro usuário junto (sobraram %)', n; end if;

  raise notice 'OK: apagar o usuário apaga os vínculos dele, e só os dele';
end $$;
rollback;

-- ---- wipe_own_data apaga note_link antes de note (senão a FK barraria) --------------------
begin;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
do $$
declare n int;
begin
  insert into public.note_link (user_id, note_id, entity_type, entity_id) values
    ('11111111-1111-1111-1111-111111111111', 'cccccccc-0000-0000-0000-000000000001', 'goal', 'meta-1'),
    ('22222222-2222-2222-2222-222222222222', 'dddddddd-0000-0000-0000-000000000001', 'book', 'livro-9');

  perform public.wipe_own_data();

  select count(*) into n from public.note_link
   where user_id = '11111111-1111-1111-1111-111111111111';
  if n <> 0 then raise exception 'FALHOU (wipe): sobraram % vínculos do usuário', n; end if;
  select count(*) into n from public.note_link
   where user_id = '22222222-2222-2222-2222-222222222222';
  if n <> 1 then raise exception 'FALHOU (wipe): o vínculo do outro usuário sumiu'; end if;

  raise notice 'OK: wipe_own_data apaga os vínculos do usuário (e nenhum alheio)';
end $$;
rollback;
