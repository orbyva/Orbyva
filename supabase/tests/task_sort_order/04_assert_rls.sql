\set ON_ERROR_STOP on

-- Reordenar é um `update` em massa de `sort_order` (a escrita em lote de `updateTasksSortOrder`),
-- e o cliente manda os ids da faixa. Se a RLS não valesse para essa coluna, um id chutado
-- reordenaria a lista de outra pessoa — por isso o teste roda de fato como `authenticated`, com a
-- GUC do `auth.uid()` setada, e escreve exatamente como o app escreve.
set role authenticated;

-- ---- dono: renumera a própria faixa "Alta" de 0..n-1 -----------------------------------------
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);

do $$
declare n int;
begin
  -- Ligar para o cliente vai para o topo, Assinar contrato para a segunda posição.
  update public.task set sort_order = 0, updated_at = now()
   where id = 'cccccccc-0000-0000-0000-000000000002';
  update public.task set sort_order = 1, updated_at = now()
   where id = 'cccccccc-0000-0000-0000-000000000001';

  select count(*) into n from public.task where priority = 'high' and sort_order = 1;
  if n <> 1 then
    raise exception 'FALHOU: o dono não conseguiu reordenar a própria faixa (achadas %)', n;
  end if;

  -- A renumeração é local à faixa: nada fora dela foi tocado.
  select count(*) into n from public.task
   where user_id = '11111111-1111-1111-1111-111111111111'::uuid
     and (priority is distinct from 'high') and sort_order <> 0;
  if n <> 0 then
    raise exception 'FALHOU: reordenar a faixa Alta mexeu em % tarefa(s) de outra faixa', n;
  end if;

  -- Valor negativo/alto não é rejeitado por constraint nenhuma (é ordem, não domínio fechado) —
  -- mas a renumeração do app sempre grava 0..n-1, então isto é só documentação do que a coluna é.
  select count(*) into n from public.task
   where user_id = '11111111-1111-1111-1111-111111111111'::uuid and sort_order < 0;
  if n <> 0 then raise exception 'FALHOU: apareceu sort_order negativo do nada'; end if;

  select count(*) into n from public.task
   where user_id <> '11111111-1111-1111-1111-111111111111'::uuid;
  if n <> 0 then raise exception 'FALHOU: RLS vazando % tarefa(s) de outro usuário', n; end if;
end $$;

-- ---- outro usuário: não enxerga nem reordena a tarefa alheia ----------------------------------
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);

do $$
declare n int;
begin
  -- O vizinho conhece o id (é o que o cliente manda no lote) e mesmo assim não alcança a linha.
  update public.task set sort_order = 99
   where id = 'cccccccc-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'FALHOU: um authenticated reordenou tarefa alheia (% linha(s))', n;
  end if;

  -- Lote inteiro de ids alheios: nem uma linha cede.
  update public.task set sort_order = 7
   where id in ('cccccccc-0000-0000-0000-000000000001',
                'cccccccc-0000-0000-0000-000000000002',
                'cccccccc-0000-0000-0000-000000000003');
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'FALHOU: lote de reordenação alcançou % tarefa(s) alheia(s)', n;
  end if;

  -- E também não consegue *inserir* uma linha na conta do outro para se enfiar na faixa dele.
  begin
    insert into public.task (user_id, title, status, priority, sort_order) values
      ('11111111-1111-1111-1111-111111111111', 'Furando a fila', 'todo', 'high', 0);
    raise exception 'FALHOU: insert com user_id de outro usuário deveria ser bloqueado pela RLS';
  exception
    when insufficient_privilege then null;
  end;
end $$;

-- ---- o dono confere que a ordem dele sobreviveu à tentativa alheia ---------------------------
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);

do $$
declare ids uuid[];
begin
  select array_agg(id order by sort_order asc, id asc) into ids
    from public.task where priority = 'high';
  if ids <> array['cccccccc-0000-0000-0000-000000000002'::uuid,
                  'cccccccc-0000-0000-0000-000000000001'::uuid] then
    raise exception 'FALHOU: a ordem manual da faixa Alta não sobreviveu (%)', ids;
  end if;
end $$;

-- ---- wipe_own_data continua levando as tarefas do dono junto ---------------------------------
reset role;

do $$
declare n int;
begin
  perform public.wipe_own_data();
  select count(*) into n from public.task
   where user_id = '11111111-1111-1111-1111-111111111111'::uuid;
  if n <> 0 then
    raise exception 'FALHOU: wipe_own_data deixou % tarefa(s) do dono para trás', n;
  end if;
  select count(*) into n from public.task
   where user_id = '22222222-2222-2222-2222-222222222222'::uuid;
  if n <> 1 then
    raise exception 'FALHOU: wipe_own_data apagou tarefa de outro usuário (sobraram %)', n;
  end if;

  raise notice 'OK: RLS por user_id na reordenação (lote alheio não cede) e wipe_own_data conferidos';
end $$;
