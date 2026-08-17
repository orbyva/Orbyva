\set ON_ERROR_STOP on

-- RLS na prática: com o papel `authenticated` e um JWT de usuário, só se enxerga/escreve o próprio.
begin;

grant select, insert, update, delete on public.note to authenticated;
grant select on public.project to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);

do $$
declare n int;
begin
  select count(*) into n from public.note;
  if n <> 2 then
    raise exception 'FALHOU (RLS select): usuário A deveria ver 2 notas próprias, viu %', n;
  end if;

  perform 1 from public.note where user_id = '22222222-2222-2222-2222-222222222222';
  if found then raise exception 'FALHOU (RLS select): usuário A enxergou nota de outro usuário'; end if;

  -- insert com user_id de outro tem que ser barrado pelo WITH CHECK
  begin
    insert into public.note (user_id, title, content)
    values ('22222222-2222-2222-2222-222222222222', 'Roubada', 'x');
    raise exception 'FALHOU (RLS insert): inserir nota com user_id alheio foi permitido';
  exception
    when insufficient_privilege then null;
  end;

  -- insert próprio funciona, e o default de content vale
  insert into public.note (user_id, title) values ('11111111-1111-1111-1111-111111111111', 'Minha');
  perform 1 from public.note where title = 'Minha' and content = '';
  if not found then raise exception 'FALHOU: insert próprio ou default de content'; end if;

  -- update em nota alheia não atinge linha nenhuma (invisível pelo USING)
  update public.note set title = 'hackeada' where user_id = '22222222-2222-2222-2222-222222222222';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALHOU (RLS update): atualizou % nota(s) de outro usuário', n; end if;

  -- delete idem
  delete from public.note where user_id = '22222222-2222-2222-2222-222222222222';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALHOU (RLS delete): apagou % nota(s) de outro usuário', n; end if;

  raise notice 'OK: RLS por auth.uid() barra leitura, insert, update e delete alheios';
end $$;

rollback;
