\set ON_ERROR_STOP on

begin;

grant select, insert, update, delete on public.note_folder to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);

do $$
declare n int;
begin
  insert into public.note_folder (id, user_id, name)
  values ('f1111111-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Obra');

  select count(*) into n from public.note_folder;
  if n <> 1 then raise exception 'FALHOU (RLS select): usuário A deveria ver 1 pasta, viu %', n; end if;

  -- insert com user_id alheio é barrado pelo WITH CHECK
  begin
    insert into public.note_folder (user_id, name)
    values ('22222222-2222-2222-2222-222222222222', 'Roubada');
    raise exception 'FALHOU (RLS insert): inserir pasta com user_id alheio foi permitido';
  exception
    when insufficient_privilege then null;
  end;

  update public.note_folder set name = 'hackeada'
   where user_id = '22222222-2222-2222-2222-222222222222';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALHOU (RLS update): atualizou % pasta(s) alheia(s)', n; end if;

  delete from public.note_folder where user_id = '22222222-2222-2222-2222-222222222222';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALHOU (RLS delete): apagou % pasta(s) alheia(s)', n; end if;

  raise notice 'OK: RLS por auth.uid() barra leitura, insert, update e delete alheios';
end $$;

rollback;
