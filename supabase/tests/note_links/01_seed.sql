insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@x.com'),
  ('22222222-2222-2222-2222-222222222222', 'b@x.com');

insert into public.project (id, user_id, name) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Obra da casa');

insert into public.note (id, user_id, project_id, title, content) values
  ('cccccccc-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   'aaaaaaaa-0000-0000-0000-000000000001', 'Materiais', 'cimento e areia'),
  ('cccccccc-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
   null, 'Ideias', 'ver [[Materiais]]'),
  ('dddddddd-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222',
   null, 'Nota do vizinho', 'segredo');
