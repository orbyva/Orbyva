insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@x.com'),
  ('22222222-2222-2222-2222-222222222222', 'b@x.com');

insert into public.project (id, user_id, name) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Obra da casa'),
  ('bbbbbbbb-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'Projeto do vizinho');

insert into public.tag (id, user_id, name, color) values
  ('eeeeeeee-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'saúde', '#22c55e'),
  ('ffffffff-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'alheia', '#ef4444');

insert into public.note (id, user_id, project_id, title, content) values
  ('cccccccc-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   'aaaaaaaa-0000-0000-0000-000000000001', 'Materiais', 'cimento'),
  ('cccccccc-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
   null, 'Ideias', 'solta'),
  ('dddddddd-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222',
   null, 'Nota do vizinho', 'segredo');
