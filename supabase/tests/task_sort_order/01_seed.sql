-- Tarefas gravadas **antes** da migration da 082 — uma em cada faixa do painel "Por prioridade"
-- (alta, média, baixa e sem prioridade), mais uma de outro usuário para o escopo da RLS.
-- O ponto do seed é provar que, depois da coluna existir, **todas** ficam em `sort_order = 0`: é
-- esse zero uniforme que faz a ordem visível continuar sendo a do comparador da tela (feature 079)
-- até alguém arrastar algo.
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@x.com'),
  ('22222222-2222-2222-2222-222222222222', 'b@x.com');

insert into public.project (id, user_id, name) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Casa');

insert into public.task
  (id, user_id, project_id, title, status, due_date, priority, estimated_duration, is_quick)
values
  ('cccccccc-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   'aaaaaaaa-0000-0000-0000-000000000001', 'Assinar contrato', 'todo', '2026-08-20', 'high', null, false),
  ('cccccccc-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
   'aaaaaaaa-0000-0000-0000-000000000001', 'Ligar para o cliente', 'todo', '2026-08-21', 'high', 30, false),
  ('cccccccc-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111',
   'aaaaaaaa-0000-0000-0000-000000000001', 'Revisar orçamento', 'todo', null, 'medium', null, false),
  ('cccccccc-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111',
   'aaaaaaaa-0000-0000-0000-000000000001', 'Arquivar notas', 'todo', null, 'low', null, false),
  ('cccccccc-0000-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111',
   'aaaaaaaa-0000-0000-0000-000000000001', 'Ideia solta', 'todo', null, null, null, true),
  -- tarefa de outro usuário, pra provar o escopo da RLS na reordenação
  ('dddddddd-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222',
   null, 'Tarefa do vizinho', 'todo', '2026-08-20', 'high', null, false);
