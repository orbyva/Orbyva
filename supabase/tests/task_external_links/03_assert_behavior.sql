\set ON_ERROR_STOP on

-- Comportamento da tabela nova, com efeito colateral de verdade — por isso este arquivo roda por
-- último. Cada bloco abre e desfaz a própria transação, então a cópia validada no 02 continua
-- intacta para o bloco seguinte (menos o último, o do wipe, que é o fim da linha).

-- ---- unique (task_id, url): o mesmo link duas vezes na mesma tarefa é engano ----------------
begin;
do $$
begin
  begin
    insert into public.task_external_link (user_id, task_id, url) values
      ('11111111-1111-1111-1111-111111111111', 'cccccccc-0000-0000-0000-000000000001',
       'https://github.com/owner/repo/issues/7');
    raise exception 'FALHOU (unique): o mesmo link entrou duas vezes na mesma tarefa';
  exception
    when unique_violation then null;
  end;

  -- A **mesma** URL em outra tarefa continua permitida: é outro link, de outro assunto.
  insert into public.task_external_link (user_id, task_id, url) values
    ('11111111-1111-1111-1111-111111111111', 'cccccccc-0000-0000-0000-000000000003',
     'https://github.com/owner/repo/issues/7');

  -- E a mesma tarefa aceita URLs diferentes — o pedido-mãe ("n links por tarefa").
  insert into public.task_external_link (user_id, task_id, url, comment, position) values
    ('11111111-1111-1111-1111-111111111111', 'cccccccc-0000-0000-0000-000000000001',
     'https://docs.google.com/document/d/xyz', 'Contrato revisado pelo jurídico', 1),
    ('11111111-1111-1111-1111-111111111111', 'cccccccc-0000-0000-0000-000000000001',
     'https://www.figma.com/file/abc', null, 2);

  perform 1 from public.task_external_link
   where task_id = 'cccccccc-0000-0000-0000-000000000001'
     and comment = 'Contrato revisado pelo jurídico';
  if not found then raise exception 'FALHOU: o comentário livre não foi gravado'; end if;

  if (select count(*) from public.task_external_link
       where task_id = 'cccccccc-0000-0000-0000-000000000001') <> 3 then
    raise exception 'FALHOU: a tarefa deveria ter 3 links depois dos inserts';
  end if;

  -- A ordem é a de `position`, e é ela que decide quais 3 links viram chip no card.
  if (select array_agg(url order by position asc) from public.task_external_link
       where task_id = 'cccccccc-0000-0000-0000-000000000001')
     <> array['https://github.com/owner/repo/issues/7',
              'https://docs.google.com/document/d/xyz',
              'https://www.figma.com/file/abc'] then
    raise exception 'FALHOU: a ordem por position não bate com a de inserção';
  end if;

  raise notice 'OK: unique barra link repetido na mesma tarefa, permite em outra, e n links convivem';
end $$;
rollback;

-- ---- on delete cascade: apagar a tarefa leva os links dela ----------------------------------
begin;
do $$
declare n int;
begin
  insert into public.task_external_link (user_id, task_id, url) values
    ('11111111-1111-1111-1111-111111111111', 'cccccccc-0000-0000-0000-000000000001',
     'https://exemplo.com/anexo');

  delete from public.task where id = 'cccccccc-0000-0000-0000-000000000001';

  select count(*) into n from public.task_external_link
   where task_id = 'cccccccc-0000-0000-0000-000000000001';
  if n <> 0 then raise exception 'FALHOU (cascade): sobraram % links da tarefa apagada', n; end if;

  select count(*) into n from public.task_external_link;
  if n <> 2 then raise exception 'FALHOU (cascade): levou junto link de outra tarefa (sobraram %)', n; end if;

  raise notice 'OK: apagar a tarefa apaga os links dela, e só os dela';
end $$;
rollback;

-- ---- RLS: só o dono lê e escreve -------------------------------------------------------------
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);

do $$
declare n int;
begin
  -- O dono enxerga só os próprios (2 dos 3 copiados; o terceiro é do vizinho).
  select count(*) into n from public.task_external_link;
  if n <> 2 then
    raise exception 'FALHOU (RLS select): o dono deveria ver 2 links próprios, viu %', n;
  end if;

  perform 1 from public.task_external_link
   where user_id = '22222222-2222-2222-2222-222222222222';
  if found then raise exception 'FALHOU (RLS select): vazou link de outro usuário'; end if;

  -- Insert com user_id alheio é barrado pelo WITH CHECK.
  begin
    insert into public.task_external_link (user_id, task_id, url) values
      ('22222222-2222-2222-2222-222222222222', 'dddddddd-0000-0000-0000-000000000001',
       'https://exemplo.com/invasao');
    raise exception 'FALHOU (RLS insert): inserir link com user_id alheio foi permitido';
  exception
    when insufficient_privilege then null;
  end;

  -- Insert próprio funciona (senão a policy estaria barrando tudo).
  insert into public.task_external_link (user_id, task_id, url, comment) values
    ('11111111-1111-1111-1111-111111111111', 'cccccccc-0000-0000-0000-000000000003',
     'https://exemplo.com/proprio', 'anotação minha');
  perform 1 from public.task_external_link where url = 'https://exemplo.com/proprio';
  if not found then raise exception 'FALHOU: insert do próprio link não gravou'; end if;

  -- Update e delete em link alheio não alcançam linha nenhuma (invisíveis pelo USING) — nem
  -- conhecendo o task_id, que é o que o cliente manda no lote de `fetchExternalLinksForTasks`.
  update public.task_external_link set comment = 'hackeado'
   where task_id = 'dddddddd-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALHOU (RLS update): atualizou % link(s) alheio(s)', n; end if;

  delete from public.task_external_link
   where task_id = 'dddddddd-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALHOU (RLS delete): apagou % link(s) alheio(s)', n; end if;

  raise notice 'OK: RLS por auth.uid() barra leitura, insert, update e delete alheios';
end $$;
rollback;

-- ---- wipe_own_data leva os links do dono (e nenhum alheio) -----------------------------------
-- Vem por último: apaga o seed.
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);

do $$
declare n int;
begin
  perform public.wipe_own_data();

  select count(*) into n from public.task_external_link
   where user_id = '11111111-1111-1111-1111-111111111111';
  if n <> 0 then raise exception 'FALHOU (wipe): sobraram % links do dono', n; end if;

  select count(*) into n from public.task_external_link
   where user_id = '22222222-2222-2222-2222-222222222222';
  if n <> 1 then raise exception 'FALHOU (wipe): o link do outro usuário sumiu (sobraram %)', n; end if;

  select count(*) into n from public.task
   where user_id = '11111111-1111-1111-1111-111111111111';
  if n <> 0 then raise exception 'FALHOU (wipe): sobraram % tarefas do dono', n; end if;

  raise notice 'OK: wipe_own_data apaga os links do usuário antes das tarefas, sem tocar nos alheios';
end $$;
