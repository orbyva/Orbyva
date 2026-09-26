\set ON_ERROR_STOP on

-- Seed do estado que a feature 074 encontra num banco que já rodou 064/070/071 e ficou com
-- duplicata. Cada bloco existe para provar uma decisão da migration; nenhuma linha é decorativa.
--
-- `created_at` é sempre explícito: a ordem de desempate ("a mais antiga sobrevive") não pode
-- depender do relógio nem da ordem de insert.

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'dono@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'outro@example.com');

insert into public.medication (id, user_id, name, times, interval_days, started_on, active) values
  ('aaaa0000-0000-0000-0000-0000000000a1'::uuid, '11111111-1111-1111-1111-111111111111',
   'SEMTRI', array['08:00'::time, '20:00'::time], 1, '2026-08-10', true),
  ('aaaa0000-0000-0000-0000-0000000000a2'::uuid, '22222222-2222-2222-2222-222222222222',
   'Losartana', array['08:00'::time], 1, '2026-08-10', true);

-- ---- 1. dose duplicada: uma concluída (mais nova) e uma pendente (mais velha) -----------------
-- O caso que decide a regra de sobrevivência. Se a migration guardasse simplesmente "a mais
-- antiga", ela apagaria o registro de que o remédio **foi tomado** — o histórico de adesão da 064.
insert into public.task
  (id, user_id, medication_id, due_date, due_time, dose_time, title, status, completed_at,
   is_medication, is_quick, icon_key, created_at)
values
  ('d0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   'aaaa0000-0000-0000-0000-0000000000a1'::uuid, '2026-08-18', '08:00', '08:00', 'SEMTRI', 'todo',
   null, true, true, 'pill', '2026-08-18T00:00:00Z'),
  ('d0000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
   'aaaa0000-0000-0000-0000-0000000000a1'::uuid, '2026-08-18', '08:00', '08:00', 'SEMTRI', 'done',
   '2026-08-18T08:05:00Z', true, true, 'pill', '2026-08-18T00:05:00Z');

-- ---- 2. dose duplicada, as duas pendentes: sobrevive a mais antiga ---------------------------
insert into public.task
  (id, user_id, medication_id, due_date, due_time, dose_time, title, status, is_medication,
   is_quick, created_at)
values
  ('d0000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111',
   'aaaa0000-0000-0000-0000-0000000000a1'::uuid, '2026-08-19', '08:00', '08:00', 'SEMTRI', 'todo',
   true, true, '2026-08-19T00:00:00Z'),
  ('d0000000-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111',
   'aaaa0000-0000-0000-0000-0000000000a1'::uuid, '2026-08-19', '08:00', '08:00', 'SEMTRI', 'todo',
   true, true, '2026-08-19T09:00:00Z');

-- ---- 3. o outro horário do mesmo dia não é duplicata -----------------------------------------
-- "1 de manhã e 1 à noite" é o gap que a 064 existe para cobrir: a chave inclui `dose_time`.
insert into public.task
  (id, user_id, medication_id, due_date, due_time, dose_time, title, status, is_medication,
   is_quick, created_at)
values
  ('d0000000-0000-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111',
   'aaaa0000-0000-0000-0000-0000000000a1'::uuid, '2026-08-18', '20:00', '20:00', 'SEMTRI', 'todo',
   true, true, '2026-08-18T00:00:00Z');

-- ---- 4. dose de OUTRO usuário, no mesmo dia e horário ----------------------------------------
-- A chave é por tratamento, não por (dia, horário): o remédio do vizinho não pode sumir.
insert into public.task
  (id, user_id, medication_id, due_date, due_time, dose_time, title, status, is_medication,
   is_quick, created_at)
values
  ('d0000000-0000-0000-0000-000000000006', '22222222-2222-2222-2222-222222222222',
   'aaaa0000-0000-0000-0000-0000000000a2'::uuid, '2026-08-18', '08:00', '08:00', 'Losartana',
   'todo', true, true, '2026-08-18T00:00:00Z');

-- ---- 5. doses com `dose_time` nulo: fora do índice, fora da limpeza --------------------------
-- Um índice único trata NULL como distinto, então estas duas não seriam barradas de qualquer
-- forma. Apagar uma seria destruir dado que a constraint nem exige.
insert into public.task
  (id, user_id, medication_id, due_date, dose_time, title, status, is_medication, created_at)
values
  ('d0000000-0000-0000-0000-000000000007', '11111111-1111-1111-1111-111111111111',
   'aaaa0000-0000-0000-0000-0000000000a1'::uuid, '2026-08-25', null, 'SEMTRI', 'todo', true,
   '2026-08-25T00:00:00Z'),
  ('d0000000-0000-0000-0000-000000000008', '11111111-1111-1111-1111-111111111111',
   'aaaa0000-0000-0000-0000-0000000000a1'::uuid, '2026-08-25', null, 'SEMTRI', 'todo', true,
   '2026-08-25T01:00:00Z');

-- ---- 6. recorrência simples: origem + ocorrência duplicada -----------------------------------
insert into public.task
  (id, user_id, due_date, due_time, title, status, recurrence_rule, created_at)
values
  ('e0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   '2026-08-10', '09:00', 'Trocar lençóis', 'todo',
   '{"frequency":"weekly","interval":1,"time":"09:00"}'::jsonb, '2026-08-10T00:00:00Z');

insert into public.task
  (id, user_id, recurrence_origin_id, due_date, due_time, title, status, completed_at, created_at)
values
  ('e0000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
   'e0000000-0000-0000-0000-000000000001', '2026-08-17', '09:00', 'Trocar lençóis', 'todo', null,
   '2026-08-17T00:00:00Z'),
  ('e0000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111',
   'e0000000-0000-0000-0000-000000000001', '2026-08-17', '09:00', 'Trocar lençóis', 'todo', null,
   '2026-08-17T00:10:00Z'),
  -- Ocorrência de outro dia da mesma série: não é duplicata.
  ('e0000000-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111',
   'e0000000-0000-0000-0000-000000000001', '2026-08-24', '09:00', 'Trocar lençóis', 'todo', null,
   '2026-08-24T00:00:00Z');

-- ---- 7. Recorrência Financeira: duas parcelas no mesmo `due_date` -----------------------------
-- Legítimo (parcela em atraso + parcela do mês) e o motivo de o índice de ocorrência excluir
-- `linked_recurring_id not null`.
insert into public.task
  (id, user_id, due_date, title, status, linked_recurring_id, linked_installment_number, created_at)
values
  ('f0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   null, 'Internet', 'todo', 1001, null, '2026-08-01T00:00:00Z');

insert into public.task
  (id, user_id, recurrence_origin_id, due_date, title, status, linked_recurring_id,
   linked_installment_number, created_at)
values
  ('f0000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
   'f0000000-0000-0000-0000-000000000001', '2026-09-05', 'Internet', 'todo',
   1001, 1, '2026-09-01T00:00:00Z'),
  ('f0000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111',
   'f0000000-0000-0000-0000-000000000001', '2026-09-05', 'Internet', 'todo',
   1001, 2, '2026-09-01T00:01:00Z');

-- ---- 8. tarefas avulsas com o mesmo prazo ----------------------------------------------------
-- Nada nelas é chave: duas tarefas iguais no mesmo dia são só duas tarefas.
insert into public.task (id, user_id, due_date, title, status, created_at) values
  ('a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   '2026-08-18', 'Comprar cimento', 'todo', '2026-08-18T00:00:00Z'),
  ('a0000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
   '2026-08-18', 'Comprar cimento', 'todo', '2026-08-18T00:01:00Z');
