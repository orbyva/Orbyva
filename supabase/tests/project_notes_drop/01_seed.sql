-- Dado anterior ao módulo de Notas: projetos com `notes` preenchido (o que a 055 copia e a 058
-- dropa), projetos sem nota, e eventos de projeto (que NÃO podem ser tocados pelo drop).
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

insert into public.project_event (id, user_id, project_id, title, starts_at) values
  ('eeeeeeee-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   'aaaaaaaa-0000-0000-0000-000000000001', 'Visita do pedreiro', '2026-08-10 14:00+00'),
  ('eeeeeeee-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222',
   'bbbbbbbb-0000-0000-0000-000000000001', 'Reunião do vizinho', '2026-08-11 09:00+00');

-- Registro do "antes", para comparar com o "depois" — é a conferência que a tarefa mandava fazer
-- à mão no SQL editor depois do `db push`.
create table public.__before as
select
  (select count(*) from public.project
    where notes is not null and btrim(notes, E' \t\r\n') <> '') as with_notes,
  (select count(*) from public.project) as project_count,
  (select count(*) from public.project_event) as event_count,
  (select md5(string_agg(id::text || '|' || name || '|' || status, '#' order by id))
     from public.project) as project_digest;
