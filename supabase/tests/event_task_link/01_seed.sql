-- Dois usuários, um projeto e uma tarefa por usuário, e eventos de projeto gravados **antes** da
-- migration da 066 — prova de que a linha legada sobrevive ao `drop not null` + `add column` com
-- `project_id` preenchido e `task_id` nulo, sem update nenhum.
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@x.com'),
  ('22222222-2222-2222-2222-222222222222', 'b@x.com');

insert into public.project (id, user_id, name) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Obra da casa'),
  ('aaaaaaaa-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'Projeto do vizinho');

insert into public.task (id, user_id, project_id, title, status, due_date) values
  ('cccccccc-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   'aaaaaaaa-0000-0000-0000-000000000001', 'Comprar cimento', 'todo', '2026-08-17'),
  ('dddddddd-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222',
   'aaaaaaaa-0000-0000-0000-000000000002', 'Tarefa do vizinho', 'todo', '2026-08-17');

-- Eventos de projeto no formato da 006: sem `ends_at` (nenhuma tela nunca preencheu) e sem qualquer
-- noção de tarefa.
insert into public.project_event (id, user_id, project_id, title, starts_at) values
  ('eeeeeeee-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   'aaaaaaaa-0000-0000-0000-000000000001', 'Reunião de obra', '2026-08-18 14:00+00'),
  ('eeeeeeee-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
   'aaaaaaaa-0000-0000-0000-000000000001', 'Visita do engenheiro', '2026-08-19 09:00+00'),
  ('ffffffff-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222',
   'aaaaaaaa-0000-0000-0000-000000000002', 'Reunião do vizinho', '2026-08-18 16:00+00');
