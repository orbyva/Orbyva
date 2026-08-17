-- Tarefas gravadas **antes** da migration da 061 — prova de que tarefa comum e medicação antigas
-- não precisam de update nenhum depois que `is_consultation` passa a existir.
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@x.com'),
  ('22222222-2222-2222-2222-222222222222', 'b@x.com');

insert into public.project (id, user_id, name) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Obra da casa');

insert into public.task (id, user_id, project_id, title, status, due_date, due_time, is_medication) values
  -- tarefa comum de projeto
  ('cccccccc-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   'aaaaaaaa-0000-0000-0000-000000000001', 'Comprar cimento', 'todo', '2026-08-16', null, false),
  -- medicação (feature 049) — tem que continuar medicação depois da migration
  ('cccccccc-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
   null, 'Losartana', 'todo', '2026-08-16', '08:00', true),
  -- tarefa de outro usuário, pra provar o escopo da RLS
  ('dddddddd-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222',
   null, 'Tarefa do vizinho', 'todo', '2026-08-16', null, false);
