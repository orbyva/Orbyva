-- Hábitos gravados **antes** da migration da 062 — prova de que hábito comum e anti-hábito antigos
-- não precisam de update nenhum depois que `is_health` passa a existir, e que o check-in que já
-- existia continua de pé.
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@x.com'),
  ('22222222-2222-2222-2222-222222222222', 'b@x.com');

insert into public.personal_goal (id, user_id, title, target_value) values
  ('99999999-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Ler 12 livros', 12);

insert into public.habit (id, user_id, name, frequency, target_per_week, kind, goal_id, goal_increment) values
  -- hábito comum, vinculado a uma meta (feature de hábitos + 20260727143000)
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   'Ler 20 páginas', 'daily', 7, 'build', '99999999-0000-0000-0000-000000000001', 1),
  -- anti-hábito
  ('aaaaaaaa-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
   'Sem delivery', 'weekly', 5, 'avoid', null, null),
  -- hábito de outro usuário, pra provar o escopo da RLS
  ('bbbbbbbb-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222',
   'Correr', 'weekly', 3, 'build', null, null);

insert into public.habit_log (habit_id, date, completed) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '2026-08-15', true),
  ('aaaaaaaa-0000-0000-0000-000000000001', '2026-08-16', true),
  ('bbbbbbbb-0000-0000-0000-000000000001', '2026-08-16', true);
