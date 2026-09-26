\set ON_ERROR_STOP on

-- Unique no mesmo pai, permitido em pais diferentes, parent_id = id recusado.
begin;
do $$
begin
  insert into public.note_folder (id, user_id, name)
  values
    ('f1111111-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Casa'),
    ('f1111111-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'Casa');
  raise exception 'FALHOU: duas pastas raiz com o mesmo nome deveriam ser recusadas';
exception
  when unique_violation then null;
end $$;
rollback;

begin;
do $$
begin
  insert into public.note_folder (id, user_id, name) values
    ('f1111111-0000-0000-0000-000000000010', '11111111-1111-1111-1111-111111111111', 'Pai A'),
    ('f1111111-0000-0000-0000-000000000011', '11111111-1111-1111-1111-111111111111', 'Pai B');
  insert into public.note_folder (id, user_id, name, parent_id) values
    ('f1111111-0000-0000-0000-000000000012', '11111111-1111-1111-1111-111111111111',
     'Filha', 'f1111111-0000-0000-0000-000000000010'),
    ('f1111111-0000-0000-0000-000000000013', '11111111-1111-1111-1111-111111111111',
     'Filha', 'f1111111-0000-0000-0000-000000000011');
  raise notice 'OK: mesmo nome em pais diferentes é permitido';
end $$;
rollback;

begin;
do $$
begin
  insert into public.note_folder (id, user_id, name, parent_id)
  values ('f1111111-0000-0000-0000-000000000020', '11111111-1111-1111-1111-111111111111',
          'Loop', 'f1111111-0000-0000-0000-000000000020');
  raise exception 'FALHOU: parent_id = id deveria ser recusado pelo check';
exception
  when check_violation then null;
end $$;
rollback;

-- Nota sobrevive à pasta (folder_id vira null). Pasta sobrevive a projeto e a tag.
begin;
do $$
declare n int;
begin
  insert into public.note_folder (id, user_id, name, project_id, tag_id)
  values ('f1111111-0000-0000-0000-000000000030', '11111111-1111-1111-1111-111111111111',
          'Obra', 'aaaaaaaa-0000-0000-0000-000000000001', 'eeeeeeee-0000-0000-0000-000000000001');

  update public.note
     set folder_id = 'f1111111-0000-0000-0000-000000000030'
   where id = 'cccccccc-0000-0000-0000-000000000001';

  delete from public.note_folder where id = 'f1111111-0000-0000-0000-000000000030';

  select count(*) into n from public.note
   where id = 'cccccccc-0000-0000-0000-000000000001' and folder_id is null;
  if n <> 1 then
    raise exception 'FALHOU (on delete set null): a nota deveria sobreviver com folder_id nulo';
  end if;
  raise notice 'OK: excluir pasta preserva a nota e zera folder_id';
end $$;
rollback;

begin;
do $$
begin
  insert into public.note_folder (id, user_id, name, project_id, tag_id)
  values ('f1111111-0000-0000-0000-000000000040', '11111111-1111-1111-1111-111111111111',
          'Saúde', 'aaaaaaaa-0000-0000-0000-000000000001', 'eeeeeeee-0000-0000-0000-000000000001');

  delete from public.project where id = 'aaaaaaaa-0000-0000-0000-000000000001';
  perform 1 from public.note_folder
   where id = 'f1111111-0000-0000-0000-000000000040' and project_id is null;
  if not found then
    raise exception 'FALHOU: excluir projeto deveria preservar a pasta e zerar project_id';
  end if;

  delete from public.tag where id = 'eeeeeeee-0000-0000-0000-000000000001';
  perform 1 from public.note_folder
   where id = 'f1111111-0000-0000-0000-000000000040' and tag_id is null;
  if not found then
    raise exception 'FALHOU: excluir tag deveria preservar a pasta e zerar tag_id';
  end if;

  raise notice 'OK: pasta sobrevive a projeto e a tag, com os vínculos zerados';
end $$;
rollback;

-- wipe apaga pasta aninhada do usuário sem deixar órfã, e não toca a pasta alheia.
begin;
insert into public.note_folder (id, user_id, name) values
  ('f1111111-0000-0000-0000-000000000050', '11111111-1111-1111-1111-111111111111', 'Pai'),
  ('f2222222-0000-0000-0000-000000000050', '22222222-2222-2222-2222-222222222222', 'Alheia');
insert into public.note_folder (id, user_id, name, parent_id) values
  ('f1111111-0000-0000-0000-000000000051', '11111111-1111-1111-1111-111111111111',
   'Filha', 'f1111111-0000-0000-0000-000000000050');

select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select public.wipe_own_data();

do $$
declare n int;
begin
  select count(*) into n from public.note_folder
   where user_id = '11111111-1111-1111-1111-111111111111';
  if n <> 0 then raise exception 'FALHOU (wipe): sobraram % pasta(s) do usuário', n; end if;

  select count(*) into n from public.note
   where user_id = '11111111-1111-1111-1111-111111111111';
  if n <> 0 then raise exception 'FALHOU (wipe): sobraram % nota(s) do usuário', n; end if;

  select count(*) into n from public.note_folder
   where user_id = '22222222-2222-2222-2222-222222222222';
  if n <> 1 then raise exception 'FALHOU (wipe): a pasta do outro usuário sumiu'; end if;

  raise notice 'OK: wipe_own_data apaga pasta aninhada do usuário e nenhuma alheia';
end $$;
rollback;
