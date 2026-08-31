\set ON_ERROR_STOP on

-- O banco **como ele está antes** do backfill da 071: doses já materializadas pela 064 (bloco de
-- 30 min sintéticos na agenda), tarefas pontuais que não são dose, tarefas comuns, uma medicação
-- da 049 nunca migrada (sem `medication_id`) e a dose de outro usuário.
--
-- Cada linha aqui existe para responder a uma pergunta do roteiro de conferência da migration:
-- "o que **tem** de mudar", "o que **não pode** mudar" e "o que já estava no estado final".

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@x.com'),
  ('22222222-2222-2222-2222-222222222222', 'b@x.com');

insert into public.medication (id, user_id, name, times, interval_days, started_on) values
  ('eeeeeeee-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   'Losartana', array['08:00'::time, '20:00'::time], 1, '2026-08-17'),
  ('eeeeeeee-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222',
   'Metformina', array['12:00'::time], 1, '2026-08-17');

insert into public.task
  (id, user_id, title, status, due_date, due_time, dose_time, estimated_duration,
   icon_key, icon_url, is_medication, is_quick, medication_id)
values
  -- 1) dose "crua" da 064: bloco na agenda, sem ícone. É o caso que o backfill existe para resolver.
  ('cccccccc-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   'Losartana', 'todo', '2026-08-18', '08:00', '08:00', null, null, null, true, false,
   'eeeeeeee-0000-0000-0000-000000000001'),
  ('cccccccc-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
   'Losartana', 'done', '2026-08-18', '20:00', '20:00', null, null, null, true, false,
   'eeeeeeee-0000-0000-0000-000000000001'),
  -- 2) dose com ícone escolhido à mão pelo usuário: o `coalesce` tem de preservar a escolha.
  ('cccccccc-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111',
   'Losartana', 'todo', '2026-08-19', '08:00', '08:00', null, 'star', null, true, false,
   'eeeeeeee-0000-0000-0000-000000000001'),
  -- 3) dose com ícone **enviado** (icon_url, 035): `icon_key` continua nulo na UI, e o backfill
  --    grava 'pill' nela — inofensivo, porque `TaskIconBadge` dá prioridade a `icon_url`.
  ('cccccccc-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111',
   'Losartana', 'todo', '2026-08-19', '20:00', '20:00', null, null,
   'https://cdn.example.com/remedio.png', true, false, 'eeeeeeee-0000-0000-0000-000000000001'),
  -- 4) dose já no estado final (materializada pelo código da 071): não pode ser tocada de novo.
  ('cccccccc-0000-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111',
   'Losartana', 'todo', '2026-08-20', '08:00', '08:00', null, 'pill', null, true, true,
   'eeeeeeee-0000-0000-0000-000000000001'),
  -- 5) dose de OUTRO usuário: a migration roda como owner, então ela também é convertida. O que se
  --    exige é que o critério seja `medication_id`, não o usuário — nenhum dado cruza de dono.
  ('dddddddd-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222',
   'Metformina', 'todo', '2026-08-18', '12:00', '12:00', null, null, null, true, false,
   'eeeeeeee-0000-0000-0000-000000000002'),
  -- 6) medicação da 049 nunca migrada: `is_medication` sim, `medication_id` não. Não é dose de
  --    tratamento nenhum, então não pode virar pontual — é o caso que separa a flag de renderização
  --    da fonte da verdade.
  ('cccccccc-0000-0000-0000-000000000006', '11111111-1111-1111-1111-111111111111',
   'Dipirona (049)', 'todo', '2026-08-18', '10:00', null, null, null, null, true, false, null),
  -- 7) tarefa pontual que NÃO é dose (070): já era pontual e continua pontual, sem ganhar 'pill'.
  ('cccccccc-0000-0000-0000-000000000007', '11111111-1111-1111-1111-111111111111',
   'Trocar escova', 'todo', '2026-08-18', '07:00', null, null, null, null, false, true, null),
  -- 8) tarefa comum com duração: bloco no canvas de horas, imune ao backfill.
  ('cccccccc-0000-0000-0000-000000000008', '11111111-1111-1111-1111-111111111111',
   'Reunião de projeto', 'todo', '2026-08-18', '09:00', null, 60, 'flag', null, false, false, null);
