\set ON_ERROR_STOP on

-- FK on delete set null: excluir o projeto preserva a nota, só desfaz o vínculo.
begin;
do $$
declare n int;
begin
  delete from public.project where id = 'aaaaaaaa-0000-0000-0000-000000000001';

  select count(*) into n from public.note
   where content like '%falar com o pedreiro%' and project_id is null;
  if n <> 1 then
    raise exception 'FALHOU (on delete set null): esperada 1 nota órfã preservada, achadas %', n;
  end if;
  raise notice 'OK: excluir projeto preserva a nota e zera project_id';
end $$;
rollback;

-- FK on delete cascade: excluir o usuário leva as notas dele junto.
begin;
do $$
declare n int;
begin
  delete from auth.users where id = '11111111-1111-1111-1111-111111111111';
  select count(*) into n from public.note where user_id = '11111111-1111-1111-1111-111111111111';
  if n <> 0 then raise exception 'FALHOU (on delete cascade): sobraram % notas do usuário apagado', n; end if;
  select count(*) into n from public.note;
  if n <> 1 then raise exception 'FALHOU: cascade levou notas de outro usuário junto (sobraram %)', n; end if;
  raise notice 'OK: apagar o usuário apaga as notas dele, e só as dele';
end $$;
rollback;

-- wipe_own_data: apaga as notas do usuário logado sem esbarrar na FK para project.
begin;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
do $$
declare n int;
begin
  perform public.wipe_own_data();
  select count(*) into n from public.note where user_id = '11111111-1111-1111-1111-111111111111';
  if n <> 0 then raise exception 'FALHOU (wipe): sobraram % notas do usuário', n; end if;
  select count(*) into n from public.note where user_id = '22222222-2222-2222-2222-222222222222';
  if n <> 1 then raise exception 'FALHOU (wipe): a nota do outro usuário sumiu'; end if;
  raise notice 'OK: wipe_own_data apaga as notas do usuário (e nenhuma alheia)';
end $$;
rollback;
