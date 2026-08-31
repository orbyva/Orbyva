\set ON_ERROR_STOP on

-- RLS na prática: com o papel `authenticated` e um JWT de usuário, só se enxerga/escreve o próprio.
begin;

grant select, insert, update, delete on public.note_link to authenticated;
grant select on public.note to authenticated;

-- Vínculo de cada usuário, criado como dono do banco (sem RLS) para servir de cenário.
insert into public.note_link (user_id, note_id, entity_type, entity_id, label) values
  ('11111111-1111-1111-1111-111111111111', 'cccccccc-0000-0000-0000-000000000001',
   'goal', 'meta-1', 'Reformar a casa'),
  ('22222222-2222-2222-2222-222222222222', 'dddddddd-0000-0000-0000-000000000001',
   'book', 'livro-9', null);

set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);

do $$
declare n int;
begin
  select count(*) into n from public.note_link;
  if n <> 1 then
    raise exception 'FALHOU (RLS select): usuário A deveria ver 1 vínculo próprio, viu %', n;
  end if;

  perform 1 from public.note_link where user_id = '22222222-2222-2222-2222-222222222222';
  if found then raise exception 'FALHOU (RLS select): usuário A enxergou vínculo de outro usuário'; end if;

  -- insert com user_id alheio tem que ser barrado pelo WITH CHECK
  begin
    insert into public.note_link (user_id, note_id, entity_type, entity_id)
    values ('22222222-2222-2222-2222-222222222222', 'dddddddd-0000-0000-0000-000000000001',
            'trip', 'viagem-1');
    raise exception 'FALHOU (RLS insert): inserir vínculo com user_id alheio foi permitido';
  exception
    when insufficient_privilege then null;
  end;

  -- insert próprio funciona
  insert into public.note_link (user_id, note_id, entity_type, entity_id)
  values ('11111111-1111-1111-1111-111111111111', 'cccccccc-0000-0000-0000-000000000002',
          'habit', 'habito-3');
  perform 1 from public.note_link where entity_type = 'habit' and entity_id = 'habito-3';
  if not found then raise exception 'FALHOU: insert do próprio vínculo não gravou'; end if;

  -- update em vínculo alheio não atinge linha nenhuma (invisível pelo USING)
  update public.note_link set label = 'hackeado'
   where user_id = '22222222-2222-2222-2222-222222222222';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALHOU (RLS update): atualizou % vínculo(s) de outro usuário', n; end if;

  -- delete idem
  delete from public.note_link where user_id = '22222222-2222-2222-2222-222222222222';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALHOU (RLS delete): apagou % vínculo(s) de outro usuário', n; end if;

  raise notice 'OK: RLS por auth.uid() barra leitura, insert, update e delete alheios em note_link';
end $$;

rollback;
