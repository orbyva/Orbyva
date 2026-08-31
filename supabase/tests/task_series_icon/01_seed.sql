\set ON_ERROR_STOP on

-- O banco **como ele está antes** do backfill da 073: séries recorrentes cujas ocorrências foram
-- materializadas pelo código antigo (que não copiava o ícone), séries vinculadas à Recorrência
-- Financeira, ocorrências com ícone próprio, doses de medicação e tarefas avulsas.
--
-- Cada linha aqui responde a uma pergunta do roteiro de conferência: "o que **tem** de mudar",
-- "o que **não pode** mudar" e "o que já estava no estado final".

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@x.com'),
  ('22222222-2222-2222-2222-222222222222', 'b@x.com');

insert into public.medication (id, user_id, name, times, interval_days, started_on) values
  ('eeeeeeee-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   'Losartana', array['08:00'::time], 1, '2026-08-17');

-- ---- 1) série com ícone preset: origem com icon_key, ocorrências órfãs de ícone ----------------
insert into public.task
  (id, user_id, title, status, due_date, recurrence_rule, recurrence_origin_id, icon_key, icon_url)
values
  ('aaaaaaaa-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111',
   'Academia', 'todo', '2026-06-10', '{"frequency":"weekly","interval":1}'::jsonb, null,
   'dumbbell', null),
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   'Academia', 'done', '2026-06-17', null, 'aaaaaaaa-0000-0000-0000-000000000000', null, null),
  ('aaaaaaaa-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
   'Academia', 'todo', '2026-06-24', null, 'aaaaaaaa-0000-0000-0000-000000000000', null, null),
  -- ocorrência que o usuário marcou com um ícone próprio: o backfill preenche buraco, não
  -- sobrescreve escolha de usuário.
  ('aaaaaaaa-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111',
   'Academia', 'todo', '2026-07-01', null, 'aaaaaaaa-0000-0000-0000-000000000000', 'star', null);

-- ---- 2) série com imagem enviada (icon_url, feature 035) --------------------------------------
insert into public.task
  (id, user_id, title, status, due_date, recurrence_rule, recurrence_origin_id, icon_key, icon_url)
values
  ('bbbbbbbb-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111',
   'Aula de violão', 'todo', '2026-06-11', '{"frequency":"weekly","interval":1}'::jsonb, null,
   null, 'https://cdn.example.com/violao.png'),
  ('bbbbbbbb-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   'Aula de violão', 'todo', '2026-06-18', null, 'bbbbbbbb-0000-0000-0000-000000000000',
   null, null);

-- ---- 3) série SEM ícone: continua sem ícone, e nenhuma linha é reescrita à toa ----------------
insert into public.task
  (id, user_id, title, status, due_date, recurrence_rule, recurrence_origin_id)
values
  ('cccccccc-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111',
   'Reunião mensal', 'todo', '2026-06-05', '{"frequency":"monthly","interval":1}'::jsonb, null),
  ('cccccccc-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   'Reunião mensal', 'todo', '2026-07-05', null, 'cccccccc-0000-0000-0000-000000000000');

-- ---- 4) série vinculada à Recorrência Financeira (002): mesmo recurrence_origin_id ------------
insert into public.task
  (id, user_id, title, status, due_date, recurrence_origin_id, icon_key,
   linked_recurring_id, linked_installment_number)
values
  ('dddddddd-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111',
   'Internet', 'todo', null, null, 'wifi', 'ffffffff-0000-0000-0000-000000000001', null),
  ('dddddddd-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   'Internet', 'todo', '2026-06-05', 'dddddddd-0000-0000-0000-000000000000', null,
   'ffffffff-0000-0000-0000-000000000001', 1),
  ('dddddddd-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
   'Internet', 'done', '2026-07-05', 'dddddddd-0000-0000-0000-000000000000', null,
   'ffffffff-0000-0000-0000-000000000001', 2);

-- ---- 5) série do OUTRO usuário: também é backfillada, sem nenhum ícone cruzar de dono ---------
insert into public.task
  (id, user_id, title, status, due_date, recurrence_rule, recurrence_origin_id, icon_key)
values
  ('99999999-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222222',
   'Corrida', 'todo', '2026-06-12', '{"frequency":"daily","interval":2}'::jsonb, null, 'heart'),
  ('99999999-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222',
   'Corrida', 'todo', '2026-06-14', null, '99999999-0000-0000-0000-000000000000', null);

-- ---- 6) o que o backfill nunca pode encostar --------------------------------------------------
insert into public.task
  (id, user_id, title, status, due_date, icon_key, is_medication, is_quick, medication_id, dose_time)
values
  -- dose de medicação (064/071): agrupada por medication_id, sem recurrence_origin_id — não é série
  ('77777777-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   'Losartana', 'todo', '2026-08-18', 'pill', true, true,
   'eeeeeeee-0000-0000-0000-000000000001', '08:00'),
  -- tarefa avulsa sem ícone: não tem de onde herdar
  ('77777777-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
   'Comprar pilha', 'todo', '2026-08-18', null, false, false, null, null),
  -- tarefa avulsa com ícone: não pode perder o dela
  ('77777777-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111',
   'Reunião de projeto', 'todo', '2026-08-18', 'flag', false, false, null, null);
