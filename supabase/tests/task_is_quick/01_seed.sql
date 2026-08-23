-- Tarefas gravadas **antes** da migration da 070 — prova de que tarefa comum, tarefa com duração,
-- medicação e consulta antigas não precisam de update nenhum depois que `is_quick` passa a existir
-- (e, principalmente, que nenhuma delas vira bolinha na agenda sozinha).
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@x.com'),
  ('22222222-2222-2222-2222-222222222222', 'b@x.com');

insert into public.project (id, user_id, name) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Casa');

insert into public.task
  (id, user_id, project_id, title, status, due_date, due_time, estimated_duration, is_medication, is_consultation)
values
  -- tarefa comum sem duração: continua tarefa comum, NÃO vira pontual por omissão de duração
  ('cccccccc-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   'aaaaaaaa-0000-0000-0000-000000000001', 'Comprar cimento', 'todo', '2026-08-19', null, null, false, false),
  -- tarefa com duração real (bloco no canvas de horas)
  ('cccccccc-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
   null, 'Reunião de projeto', 'todo', '2026-08-19', '09:00', 60, false, false),
  -- medicação (049) — a 071 vai marcar as doses como pontuais, mas a migration da 070 não pode
  ('cccccccc-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111',
   null, 'Losartana', 'todo', '2026-08-19', '08:00', null, true, false),
  -- consulta médica (061)
  ('cccccccc-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111',
   null, 'Cardiologista — Dr. Silva', 'todo', '2026-09-10', '14:30', null, false, true),
  -- tarefa de outro usuário, pra provar o escopo da RLS
  ('dddddddd-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222',
   null, 'Tarefa do vizinho', 'todo', '2026-08-19', null, null, false, false);
