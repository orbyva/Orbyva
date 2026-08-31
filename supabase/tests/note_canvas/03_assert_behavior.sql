\set ON_ERROR_STOP on

-- Comportamento na prática, com o papel `authenticated` e um JWT de usuário: o que o roteiro
-- manual da feature 058 mandava fazer no SQL editor depois do `db push`, mais o que só um banco
-- de verdade responde (o `check` rejeitando kind inválido, o jsonb indo e voltando, a RLS
-- continuando a valer para a nota-canvas).
begin;

set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);

do $$
declare
  n int;
  data jsonb;
begin
  -- ---- as notas migradas estão visíveis e são markdown -------------------------------------
  select count(*) into n from public.note where kind = 'markdown';
  if n <> 2 then
    raise exception 'FALHOU: usuário A deveria ver suas 2 notas antigas como markdown, viu %', n;
  end if;

  -- ---- kind inválido é rejeitado pelo check ------------------------------------------------
  begin
    update public.note set kind = 'outro'
     where id = 'cccccccc-0000-0000-0000-000000000001';
    raise exception 'FALHOU: update para kind = ''outro'' deveria ser rejeitado pelo check';
  exception
    when check_violation then null;
  end;

  begin
    insert into public.note (user_id, title, kind)
    values ('11111111-1111-1111-1111-111111111111', 'Inválida', 'excalidraw');
    raise exception 'FALHOU: insert com kind = ''excalidraw'' deveria ser rejeitado pelo check';
  exception
    when check_violation then null;
  end;

  -- ---- criar um canvas: kind válido + JSON nativo do Excalidraw em jsonb -------------------
  insert into public.note (id, user_id, title, kind, canvas_data)
  values ('cccccccc-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111',
          'Arquitetura', 'canvas',
          '{"elements":[{"id":"r1","type":"rectangle"},{"id":"a1","type":"arrow"}],
            "appState":{"viewBackgroundColor":"#ffffff"}}'::jsonb);

  select canvas_data into data from public.note
   where id = 'cccccccc-0000-0000-0000-000000000003';
  if jsonb_array_length(data->'elements') <> 2 then
    raise exception 'FALHOU: canvas_data não devolveu os 2 elementos gravados';
  end if;
  if data->'appState'->>'viewBackgroundColor' <> '#ffffff' then
    raise exception 'FALHOU: appState não sobreviveu ao round-trip em jsonb';
  end if;

  -- `content` continua not null default '': um canvas não escreve markdown nenhum.
  perform 1 from public.note
   where id = 'cccccccc-0000-0000-0000-000000000003' and content = '';
  if not found then
    raise exception 'FALHOU: canvas deveria nascer com content vazio, não nulo';
  end if;

  -- ---- a RLS da 055 continua valendo para a nota-canvas ------------------------------------
  perform 1 from public.note where user_id = '22222222-2222-2222-2222-222222222222';
  if found then
    raise exception 'FALHOU (RLS): usuário A enxergou nota de outro usuário depois da migration';
  end if;

  update public.note set kind = 'canvas'
   where user_id = '22222222-2222-2222-2222-222222222222';
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'FALHOU (RLS update): converteu % nota(s) de outro usuário em canvas', n;
  end if;

  raise notice 'OK: default markdown nas notas antigas, check rejeitando kind inválido, jsonb round-trip e RLS';
end $$;

rollback;

-- ---- wipe de conta leva o canvas junto (fora da transação acima, para poder apagar mesmo) ----
begin;
insert into public.note (user_id, title, kind, canvas_data)
values ('11111111-1111-1111-1111-111111111111', 'Canvas a apagar', 'canvas', '{"elements":[]}'::jsonb);

select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select public.wipe_own_data();

do $$
declare n int;
begin
  select count(*) into n from public.note
   where user_id = '11111111-1111-1111-1111-111111111111';
  if n <> 0 then
    raise exception 'FALHOU: wipe_own_data deixou % nota(s) do usuário, incluindo canvas', n;
  end if;
  select count(*) into n from public.note
   where user_id = '22222222-2222-2222-2222-222222222222';
  if n <> 1 then
    raise exception 'FALHOU: wipe_own_data apagou nota de outro usuário';
  end if;
  raise notice 'OK: wipe_own_data apaga a nota-canvas junto com as demais';
end $$;
rollback;
