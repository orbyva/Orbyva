insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@x.com'),
  ('22222222-2222-2222-2222-222222222222', 'b@x.com');

insert into public.project (id, user_id, name, notes) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   'Obra da casa', E'# Reforma\n\n- comprar cimento\n- **falar com o pedreiro**'),
  ('aaaaaaaa-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
   'Setup do estúdio', 'tratamento acústico primeiro'),
  ('aaaaaaaa-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111',
   'Sem notas', null),
  ('aaaaaaaa-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111',
   'Notas em branco', '   ' || E'\n\t '),
  ('bbbbbbbb-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222',
   'Projeto do outro usuário', 'segredo do vizinho');

-- Registro do "antes" para comparar com o "depois", que é o que a tarefa de verificação pedia
-- fazer no SQL editor do Supabase.
create table public.__before as
select
  (select count(*) from public.project
    where notes is not null and btrim(notes, E' \t\r\n') <> '') as with_notes,
  (select count(*) from public.project
    where notes is not null and btrim(notes) <> '') as with_notes_space_only_trim,
  (select md5(string_agg(coalesce(notes, '<null>'), '|' order by id))
     from public.project) as notes_digest;
