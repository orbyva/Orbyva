\set ON_ERROR_STOP on

-- Comportamento da tabela, da RPC e do bucket, com efeito colateral de verdade — por isso este
-- arquivo roda por último. Cada bloco abre e desfaz a própria transação, então o cenário montado
-- aqui embaixo continua intacto para o bloco seguinte (menos o último, o do wipe, que é o fim da
-- linha).

-- Cenário: A com duas versões, **nenhuma** ativa (o estado em que o app cai na esfera CSS); B com
-- uma versão ativa, para que todo "uma por dono" seja diferente de "uma no banco".
insert into public.orb_avatar (id, user_id, prompt, url, model, is_active) values
  ('aaaa0000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   'uma orb azul de vidro', 'https://x.supabase.co/storage/v1/object/public/orb-avatars/11111111-1111-1111-1111-111111111111/0001.png',
   'gemini-image', false),
  ('aaaa0000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
   'a mesma orb, mais escura', 'https://x.supabase.co/storage/v1/object/public/orb-avatars/11111111-1111-1111-1111-111111111111/0002.png',
   'gemini-image', false),
  ('bbbb0000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222',
   'orb do vizinho', 'https://x.supabase.co/storage/v1/object/public/orb-avatars/22222222-2222-2222-2222-222222222222/0001.png',
   'gemini-image', true);

-- Um objeto no bucket para cada versão — é o que permite afirmar, lá embaixo, que a policy do
-- bucket prende o PNG ao dono.
insert into storage.objects (bucket_id, name, owner) values
  ('orb-avatars', '11111111-1111-1111-1111-111111111111/0001.png', '11111111-1111-1111-1111-111111111111'),
  ('orb-avatars', '11111111-1111-1111-1111-111111111111/0002.png', '11111111-1111-1111-1111-111111111111'),
  ('orb-avatars', '22222222-2222-2222-2222-222222222222/0001.png', '22222222-2222-2222-2222-222222222222');

-- ---- (d) zero ativas é estado válido ---------------------------------------------------------
-- O índice é parcial justamente por isso: sem nenhuma versão ativa o app cai na esfera CSS, que é
-- o estado de todo usuário hoje. Um unique cheio proibiria a segunda linha inativa de A.
do $$
declare n int;
begin
  select count(*) into n from public.orb_avatar
   where user_id = '11111111-1111-1111-1111-111111111111';
  if n <> 2 then raise exception 'FALHOU (cenário): A deveria ter 2 versões, tem %', n; end if;

  select count(*) into n from public.orb_avatar
   where user_id = '11111111-1111-1111-1111-111111111111' and is_active;
  if n <> 0 then
    raise exception 'FALHOU (zero ativas): duas versões inativas do mesmo dono não passaram (% ativas)', n;
  end if;

  -- E uma terceira inativa também entra: o índice parcial não olha para quem está desligado.
  insert into public.orb_avatar (user_id, prompt, url, model) values
    ('11111111-1111-1111-1111-111111111111', 'terceira',
     'https://x.supabase.co/storage/v1/object/public/orb-avatars/11111111-1111-1111-1111-111111111111/0003.png',
     'gemini-image');

  -- …e nasce desligada: uma geração nova não rouba a esfera de quem já escolheu uma versão.
  perform 1 from public.orb_avatar
   where url like '%0003.png' and not is_active;
  if not found then raise exception 'FALHOU: a versão nova nasceu ativa'; end if;

  delete from public.orb_avatar where url like '%0003.png';
  raise notice 'OK (d): zero ativas é estado válido, e versão nova nasce inativa';
end $$;

-- ---- (a) duas ativas do mesmo dono violam o índice parcial -----------------------------------
begin;
do $$
declare n int;
begin
  update public.orb_avatar set is_active = true
   where id = 'aaaa0000-0000-0000-0000-000000000001';

  begin
    update public.orb_avatar set is_active = true
     where id = 'aaaa0000-0000-0000-0000-000000000002';
    raise exception 'FALHOU (uma ativa): o dono ficou com duas versões ativas ao mesmo tempo';
  exception
    when unique_violation then null;
  end;

  -- A ativa de B não atrapalha a de A: o índice é por `user_id`, não global.
  select count(*) into n from public.orb_avatar where is_active;
  if n <> 2 then
    raise exception 'FALHOU: esperadas 2 ativas no banco (uma de cada dono), achadas %', n;
  end if;

  raise notice 'OK (a): orb_avatar_one_active_idx barra a segunda ativa do mesmo dono';
end $$;
rollback;

-- ---- (b) a RPC troca a ativa e deixa exatamente uma -------------------------------------------
-- É o ponto da RPC: com o índice parcial, dois updates do cliente na ordem errada (ligar a nova
-- antes de desligar a velha) violam a constraint, e duas chamadas separadas podem parar no meio.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);

do $$
declare n int; ativo uuid;
begin
  -- de zero ativas para uma
  perform public.orb_avatar_set_active('aaaa0000-0000-0000-0000-000000000001');

  select count(*) into n from public.orb_avatar
   where user_id = '11111111-1111-1111-1111-111111111111' and is_active;
  if n <> 1 then raise exception 'FALHOU (b): depois de ativar, A tem % ativas', n; end if;

  select id into ativo from public.orb_avatar
   where user_id = '11111111-1111-1111-1111-111111111111' and is_active;
  if ativo <> 'aaaa0000-0000-0000-0000-000000000001' then
    raise exception 'FALHOU (b): ativou a versão errada (%)', ativo;
  end if;

  -- troca: a velha desliga e a nova liga, na mesma chamada
  perform public.orb_avatar_set_active('aaaa0000-0000-0000-0000-000000000002');

  select count(*) into n from public.orb_avatar
   where user_id = '11111111-1111-1111-1111-111111111111' and is_active;
  if n <> 1 then raise exception 'FALHOU (b): depois da troca, A tem % ativas', n; end if;

  perform 1 from public.orb_avatar
   where id = 'aaaa0000-0000-0000-0000-000000000002' and is_active;
  if not found then raise exception 'FALHOU (b): a versão nova não ficou ativa'; end if;

  perform 1 from public.orb_avatar
   where id = 'aaaa0000-0000-0000-0000-000000000001' and is_active;
  if found then raise exception 'FALHOU (b): a versão velha continuou ativa'; end if;

  -- reativar a que já está ativa é no-op, não erro (clique duplo na galeria)
  perform public.orb_avatar_set_active('aaaa0000-0000-0000-0000-000000000002');
  select count(*) into n from public.orb_avatar
   where user_id = '11111111-1111-1111-1111-111111111111' and is_active;
  if n <> 1 then raise exception 'FALHOU (b): reativar a ativa deixou % ativas', n; end if;

  raise notice 'OK (b): orb_avatar_set_active troca a ativa e deixa exatamente uma';
end $$;

-- Fora do papel `authenticated` para enxergar o banco inteiro: sob RLS, A não veria a linha de B
-- nem se a RPC a tivesse apagado — a assertiva passaria por cegueira, não por acerto.
reset role;
do $$
declare n int;
begin
  perform 1 from public.orb_avatar
   where id = 'bbbb0000-0000-0000-0000-000000000001'
     and user_id = '22222222-2222-2222-2222-222222222222' and is_active;
  if not found then raise exception 'FALHOU (b): a RPC desligou a versão ativa do outro dono'; end if;

  select count(*) into n from public.orb_avatar where is_active;
  if n <> 2 then
    raise exception 'FALHOU (b): esperadas 2 ativas no banco (uma de cada dono), achadas %', n;
  end if;

  raise notice 'OK (b): a troca de A não encostou na ativa de B';
end $$;
rollback;

-- ---- (c) a RPC recusa o id de outro dono, e não muda nada ------------------------------------
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);

do $$
declare n int; msg text;
begin
  perform public.orb_avatar_set_active('aaaa0000-0000-0000-0000-000000000001');

  begin
    perform public.orb_avatar_set_active('bbbb0000-0000-0000-0000-000000000001');
    raise exception 'FALHOU (c): ativei a versão de outro dono';
  exception
    when others then
      get stacked diagnostics msg = message_text;
      if msg like 'FALHOU%' then raise; end if;
      if msg not like '%não encontrada%' then
        raise exception 'FALHOU (c): erro inesperado ao usar id alheio: %', msg;
      end if;
  end;

  -- a que A já tinha ativa continua ativa (a de B é conferida fora do papel, logo abaixo)
  perform 1 from public.orb_avatar
   where id = 'aaaa0000-0000-0000-0000-000000000001' and is_active;
  if not found then
    raise exception 'FALHOU (c): a chamada recusada desligou a versão ativa de quem chamou';
  end if;

  -- id que não existe em lugar nenhum: mesma recusa, e a ativa de quem chamou continua de pé
  begin
    perform public.orb_avatar_set_active('00000000-0000-0000-0000-0000000000ff');
    raise exception 'FALHOU (c): ativei uma versão inexistente';
  exception
    when others then
      get stacked diagnostics msg = message_text;
      if msg like 'FALHOU%' then raise; end if;
  end;

  perform 1 from public.orb_avatar
   where id = 'aaaa0000-0000-0000-0000-000000000001' and is_active;
  if not found then
    raise exception 'FALHOU (c): id inexistente deixou o dono sem nenhuma versão ativa';
  end if;

  raise notice 'OK (c): a RPC recusa id alheio e id inexistente sem mexer em nada';
end $$;

-- De novo fora do papel: sob RLS a linha de B é invisível para A, e "não mudou" precisa ser visto.
reset role;
do $$
declare n int;
begin
  perform 1 from public.orb_avatar
   where id = 'bbbb0000-0000-0000-0000-000000000001'
     and user_id = '22222222-2222-2222-2222-222222222222' and is_active;
  if not found then raise exception 'FALHOU (c): a versão de B mudou de dono ou de estado'; end if;

  select count(*) into n from public.orb_avatar where is_active;
  if n <> 2 then raise exception 'FALHOU (c): sobraram % ativas no banco, esperadas 2', n; end if;

  raise notice 'OK (c): a recusa não mexeu na galeria de B';
end $$;
rollback;

-- ---- a RPC sem sessão levanta exceção --------------------------------------------------------
begin;
select set_config('request.jwt.claim.sub', '', true);
do $$
declare msg text;
begin
  begin
    perform public.orb_avatar_set_active('aaaa0000-0000-0000-0000-000000000001');
    raise exception 'FALHOU (sem sessão): a RPC rodou com auth.uid() nulo';
  exception
    when others then
      get stacked diagnostics msg = message_text;
      if msg like 'FALHOU%' then raise; end if;
      if msg not like '%autenticado%' then
        raise exception 'FALHOU (sem sessão): erro inesperado "%"', msg;
      end if;
  end;
  raise notice 'OK: sem sessão, orb_avatar_set_active levanta "Não autenticado"';
end $$;
rollback;

-- ---- RLS: só o dono lê e escreve nas próprias versões -----------------------------------------
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);

do $$
declare n int;
begin
  select count(*) into n from public.orb_avatar;
  if n <> 2 then
    raise exception 'FALHOU (RLS select): o dono deveria ver 2 versões próprias, viu %', n;
  end if;

  perform 1 from public.orb_avatar where user_id = '22222222-2222-2222-2222-222222222222';
  if found then raise exception 'FALHOU (RLS select): vazou versão de outro usuário'; end if;

  begin
    insert into public.orb_avatar (user_id, prompt, url, model) values
      ('22222222-2222-2222-2222-222222222222', 'invasão',
       'https://x.supabase.co/storage/v1/object/public/orb-avatars/22222222-2222-2222-2222-222222222222/9999.png',
       'gemini-image');
    raise exception 'FALHOU (RLS insert): gravar versão na galeria alheia foi permitido';
  exception
    when insufficient_privilege then null;
  end;

  insert into public.orb_avatar (user_id, prompt, url, model) values
    ('11111111-1111-1111-1111-111111111111', 'minha',
     'https://x.supabase.co/storage/v1/object/public/orb-avatars/11111111-1111-1111-1111-111111111111/0004.png',
     'gemini-image');
  perform 1 from public.orb_avatar where prompt = 'minha';
  if not found then raise exception 'FALHOU: insert da própria versão não gravou'; end if;

  update public.orb_avatar set is_active = true
   where user_id = '22222222-2222-2222-2222-222222222222';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALHOU (RLS update): mexi em % versão(ões) alheia(s)', n; end if;

  delete from public.orb_avatar where user_id = '22222222-2222-2222-2222-222222222222';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALHOU (RLS delete): apaguei % versão(ões) alheia(s)', n; end if;

  raise notice 'OK: RLS por auth.uid() barra leitura, insert, update e delete alheios';
end $$;
rollback;

-- ---- o bucket prende o PNG ao dono ------------------------------------------------------------
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);

do $$
declare n int;
begin
  insert into storage.objects (bucket_id, name, owner) values
    ('orb-avatars', '11111111-1111-1111-1111-111111111111/0009.png',
     '11111111-1111-1111-1111-111111111111');

  begin
    insert into storage.objects (bucket_id, name, owner) values
      ('orb-avatars', '22222222-2222-2222-2222-222222222222/0009.png',
       '11111111-1111-1111-1111-111111111111');
    raise exception 'FALHOU (storage RLS): gravei um PNG dentro da pasta de outro usuário';
  exception
    when insufficient_privilege then null;
  end;

  -- Apagar arquivo alheio continua fora de alcance — e é preciso que o **próprio** delete funcione,
  -- porque excluir uma versão apaga também o arquivo (ao contrário de icon_asset).
  delete from storage.objects
   where bucket_id = 'orb-avatars' and name like '22222222-2222-2222-2222-222222222222/%';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALHOU (storage RLS): apaguei % arquivo(s) alheio(s)', n; end if;

  delete from storage.objects
   where bucket_id = 'orb-avatars' and name = '11111111-1111-1111-1111-111111111111/0009.png';
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'FALHOU (storage RLS): apagar o próprio arquivo mexeu em % linha(s)', n;
  end if;

  raise notice 'OK: a policy do bucket orb-avatars prende o PNG ao primeiro segmento do caminho';
end $$;
rollback;

-- ---- (e) wipe_own_data leva as versões do dono (e nenhuma alheia) -----------------------------
-- Vem por último: apaga o cenário.
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);

do $$
declare n int;
begin
  perform public.wipe_own_data();

  select count(*) into n from public.orb_avatar
   where user_id = '11111111-1111-1111-1111-111111111111';
  if n <> 0 then raise exception 'FALHOU (wipe): sobraram % versões do dono', n; end if;

  select count(*) into n from public.orb_avatar
   where user_id = '22222222-2222-2222-2222-222222222222';
  if n <> 1 then raise exception 'FALHOU (wipe): a versão do outro usuário sumiu (sobraram %)', n; end if;

  -- E o wipe reescrito continua apagando o que já apagava antes desta migration.
  select count(*) into n from public.note
   where user_id = '11111111-1111-1111-1111-111111111111';
  if n <> 0 then raise exception 'FALHOU (wipe): sobraram % notas do dono', n; end if;

  select count(*) into n from public.note
   where user_id = '22222222-2222-2222-2222-222222222222';
  if n <> 1 then raise exception 'FALHOU (wipe): a nota do outro usuário sumiu'; end if;

  raise notice 'OK (e): wipe_own_data apaga a galeria do dono sem tocar na dos outros';
end $$;
