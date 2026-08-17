-- Dados **como a feature 049 os deixou**: medicação é tarefa-origem com `is_medication = true` +
-- `recurrence_rule`, e cada dose é uma ocorrência com `recurrence_origin_id`. É sobre isto que o
-- backfill da 064 roda — o ponto de maior risco da feature é justamente existir dado em produção.
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'dono@x.com'),
  ('22222222-2222-2222-2222-222222222222', 'intruso@x.com');

-- ---- tratamento A: Losartana, diária às 08:00, com duas doses já materializadas ---------------
insert into public.task
  (id, user_id, title, status, due_date, due_time, recurrence_rule, recurrence_origin_id,
   is_medication, completed_at)
values
  ('aaaa0000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   'Losartana', 'todo', '2026-08-10', '08:00',
   '{"frequency":"daily","interval":1,"time":"08:00"}'::jsonb, null, true, null),
  -- dose já tomada: `completed_at` é o "Tomado às HH:mm" do histórico e não pode se perder
  ('aaaa0000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
   'Losartana', 'done', '2026-08-11', '08:00', null,
   'aaaa0000-0000-0000-0000-000000000001', true, '2026-08-11T08:12:00Z'),
  ('aaaa0000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111',
   'Losartana', 'todo', '2026-08-12', '08:00', null,
   'aaaa0000-0000-0000-0000-000000000001', true, null);

-- ---- tratamento B: antibiótico de 2 em 2 dias, com fim programado (`until` na regra) ----------
insert into public.task
  (id, user_id, title, status, due_date, due_time, recurrence_rule, recurrence_origin_id,
   is_medication)
values
  ('bbbb0000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   'Amoxicilina', 'todo', '2026-08-14', '09:30',
   '{"frequency":"daily","interval":2,"time":"09:30","until":"2026-08-20"}'::jsonb, null, true);

-- ---- controle: tarefa recorrente comum, que o backfill NÃO pode encostar -----------------------
insert into public.task
  (id, user_id, title, status, due_date, due_time, recurrence_rule, recurrence_origin_id,
   is_medication)
values
  ('cccc0000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   'Reunião semanal', 'todo', '2026-08-10', '15:00',
   '{"frequency":"weekly","interval":1,"time":"15:00"}'::jsonb, null, false);

-- ---- controle: medicação avulsa (sem recorrência) — fora do escopo do backfill -----------------
insert into public.task
  (id, user_id, title, status, due_date, due_time, recurrence_rule, recurrence_origin_id,
   is_medication)
values
  ('dddd0000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   'Dipirona (dose única)', 'todo', '2026-08-13', '22:00', null, null, true);

-- ---- medicação de OUTRO usuário: o backfill não pode cruzar donos -----------------------------
insert into public.task
  (id, user_id, title, status, due_date, due_time, recurrence_rule, recurrence_origin_id,
   is_medication)
values
  ('eeee0000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222',
   'Metformina', 'todo', '2026-08-15', '07:00',
   '{"frequency":"daily","interval":1,"time":"07:00"}'::jsonb, null, true);
