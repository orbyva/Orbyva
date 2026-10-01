-- Seed: duas viagens de donos diferentes, a primeira compartilhada com um terceiro usuário.
--
-- O desenho existe para que o 03 possa separar três coisas que a RLS tem de tratar diferente:
-- dono (Ana), membro convidado (Bia) e estranho (Caio, dono da outra viagem). É por isso que a
-- viagem da Ana tem **um** deslocamento e **uma** visita: o pedido-mãe pede o botão nos dois tipos
-- de linha, e um teste que só exercitasse um deles não diria nada sobre o outro.

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'ana@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'bia@example.com'),
  ('33333333-3333-3333-3333-333333333333', 'caio@example.com')
on conflict (id) do nothing;

-- Viagem da Ana, com a Bia como editora.
insert into public.trip (id, user_id, destination, start_date, end_date) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', '11111111-1111-1111-1111-111111111111',
   'Lisboa', '2026-11-10', '2026-11-20')
on conflict (id) do nothing;

insert into public.trip_member (trip_id, user_id, role) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', '11111111-1111-1111-1111-111111111111', 'owner'),
  ('aaaaaaaa-0000-0000-0000-00000000000a', '22222222-2222-2222-2222-222222222222', 'editor')
on conflict (trip_id, user_id) do nothing;

-- Viagem do Caio — o lado de fora. Nenhum dos dois é membro dela, nem ele da outra.
insert into public.trip (id, user_id, destination, start_date, end_date) values
  ('cccccccc-0000-0000-0000-00000000000c', '33333333-3333-3333-3333-333333333333',
   'Tóquio', '2026-12-01', '2026-12-15')
on conflict (id) do nothing;

insert into public.trip_itinerary_day (id, trip_id, day_number, date) values
  ('dddddddd-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-00000000000a', 1, '2026-11-10'),
  ('dddddddd-0000-0000-0000-00000000000c', 'cccccccc-0000-0000-0000-00000000000c', 1, '2026-12-01')
on conflict (id) do nothing;

-- Deslocamento (o voo do pedido) e visita, na mesma viagem.
insert into public.trip_itinerary_activity
  (id, day_id, title, activity_time, arrival_time, transport_mode, category, sort_order) values
  ('eeeeeeee-0000-0000-0000-0000000000f1', 'dddddddd-0000-0000-0000-00000000000a',
   'GRU → LIS', '22:10', '12:35', 'flight', 'transport', 0),
  ('eeeeeeee-0000-0000-0000-0000000000f2', 'dddddddd-0000-0000-0000-00000000000a',
   'Mosteiro dos Jerónimos', '10:00', null, null, 'museum', 1),
  -- Atividade da viagem do Caio: o alvo do teste de "trip_id de um, activity_id de outro".
  ('eeeeeeee-0000-0000-0000-0000000000f3', 'dddddddd-0000-0000-0000-00000000000c',
   'HND → NRT', '08:00', '09:00', 'train', 'transport', 0)
on conflict (id) do nothing;
