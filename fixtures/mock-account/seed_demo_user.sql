-- =============================================================================
-- Orbyva — seed demo (módulos sem CSV import)
-- Conta: 19f584d5-8649-4770-8569-cce62cf74b7f
--
-- Como usar:
--   1. Supabase → SQL Editor → New query
--   2. Cole este arquivo inteiro → Run
--   3. Recarregue o app logado nessa conta
--
-- Idempotente para ESTE user_id: apaga dados life/car deste user e reinsere.
-- NÃO mexe em transaction / movie (use os CSVs de import).
-- =============================================================================

do $$
declare
  uid constant uuid := '19f584d5-8649-4770-8569-cce62cf74b7f';

  trip_serra constant uuid := 'a1000001-0001-4000-8000-000000000001';
  trip_floripa constant uuid := 'a1000001-0001-4000-8000-000000000002';
  trip_sp constant uuid := 'a1000001-0001-4000-8000-000000000003';

  h_agua constant uuid := 'b1000001-0001-4000-8000-000000000001';
  h_treino constant uuid := 'b1000001-0001-4000-8000-000000000002';
  h_meditar constant uuid := 'b1000001-0001-4000-8000-000000000003';
  h_ler constant uuid := 'b1000001-0001-4000-8000-000000000004';
  h_delivery constant uuid := 'b1000001-0001-4000-8000-000000000005';

  v_civic constant uuid := 'c1000001-0001-4000-8000-000000000001';

  day1 uuid;
  day2 uuid;
  day3 uuid;
  day4 uuid;
begin
  if not exists (select 1 from auth.users where id = uid) then
    raise exception 'Usuário % não existe em auth.users', uid;
  end if;

  -- ── Limpeza ───────────────────────────────────────────────────────────────
  delete from public.habit_log
  where habit_id in (select id from public.habit where user_id = uid);

  delete from public.habit where user_id = uid;
  delete from public.personal_goal where user_id = uid;

  if to_regclass('public.trip_place_opinion') is not null then
    delete from public.trip_place_opinion
    where place_visit_id in (
      select id from public.place_visit where user_id = uid
    );
  end if;

  delete from public.place_visit where user_id = uid;

  delete from public.vehicle_fuel_log
  where vehicle_id in (select id from public.vehicle where user_id = uid);
  delete from public.vehicle_maintenance
  where vehicle_id in (select id from public.vehicle where user_id = uid);
  delete from public.vehicle_document
  where vehicle_id in (select id from public.vehicle where user_id = uid);
  delete from public.vehicle where user_id = uid;

  if to_regclass('public.trip_itinerary_activity') is not null then
    delete from public.trip_itinerary_activity
    where day_id in (
      select d.id from public.trip_itinerary_day d
      join public.trip t on t.id = d.trip_id
      where t.user_id = uid
    );
  end if;

  if to_regclass('public.trip_itinerary_day') is not null then
    delete from public.trip_itinerary_day
    where trip_id in (select id from public.trip where user_id = uid);
  end if;

  if to_regclass('public.trip_expense_split') is not null then
    delete from public.trip_expense_split
    where expense_id in (
      select e.id from public.trip_expense e
      join public.trip t on t.id = e.trip_id
      where t.user_id = uid
    );
  end if;

  if to_regclass('public.trip_expense') is not null then
    delete from public.trip_expense
    where trip_id in (select id from public.trip where user_id = uid);
  end if;

  if to_regclass('public.trip_checklist_item') is not null then
    delete from public.trip_checklist_item
    where trip_id in (select id from public.trip where user_id = uid);
  end if;

  if to_regclass('public.trip_milestone') is not null then
    delete from public.trip_milestone
    where trip_id in (select id from public.trip where user_id = uid);
  end if;

  if to_regclass('public.trip_invite') is not null then
    delete from public.trip_invite
    where trip_id in (select id from public.trip where user_id = uid);
  end if;

  if to_regclass('public.trip_member') is not null then
    delete from public.trip_member
    where trip_id in (select id from public.trip where user_id = uid);
  end if;

  delete from public.trip where user_id = uid;

  -- ── Metas ────────────────────────────────────────────────────────────────
  insert into public.personal_goal (
    user_id, title, description, category,
    target_value, current_value, unit, deadline, status
  ) values
    (uid, 'Reserva de emergência', '6 meses de custo fixo', 'financial',
     30000, 12500, 'R$', '2026-12-31', 'active'),
    (uid, 'Correr 5 km', 'Completar 5 km sem parar', 'fitness',
     5, 3.2, 'km', '2026-09-30', 'active'),
    (uid, 'Ler 12 livros', 'Um livro por mês', 'learning',
     12, 7, 'livros', '2026-12-31', 'active'),
    (uid, 'Viagem Serra Gaúcha', 'Passeio de 4 dias', 'financial',
     4500, 2100, 'R$', '2026-08-15', 'active'),
    (uid, 'Perder 4 kg', 'Meta leve de verão', 'health',
     4, 1.5, 'kg', '2026-10-31', 'active'),
    (uid, 'Curso de inglês B2', 'Certificação Cambridge', 'learning',
     1, 0.4, 'nível', '2027-03-01', 'active');

  -- ── Hábitos ──────────────────────────────────────────────────────────────
  insert into public.habit (
    id, user_id, name, description, frequency, target_per_week, color
  ) values
    (h_agua, uid, 'Beber água', '2 L por dia', 'daily', 7, '#0ea5e9'),
    (h_treino, uid, 'Treinar', 'Musculação ou corrida', 'weekly', 4, '#16a34a'),
    (h_meditar, uid, 'Meditar', '10 minutos', 'daily', 7, '#8b5cf6'),
    (h_ler, uid, 'Ler', 'Pelo menos 20 páginas', 'daily', 7, '#ea580c'),
    (h_delivery, uid, 'Sem delivery', 'Cozinhar em casa', 'weekly', 5, '#db2777');

  insert into public.habit_log (habit_id, date, completed) values
    (h_agua, '2026-07-19', true),
    (h_agua, '2026-07-20', true),
    (h_agua, '2026-07-21', true),
    (h_agua, '2026-07-22', true),
    (h_agua, '2026-07-23', true),
    (h_agua, '2026-07-24', true),
    (h_agua, '2026-07-25', true),
    (h_treino, '2026-07-20', true),
    (h_treino, '2026-07-22', true),
    (h_treino, '2026-07-24', true),
    (h_meditar, '2026-07-21', true),
    (h_meditar, '2026-07-22', true),
    (h_meditar, '2026-07-23', true),
    (h_meditar, '2026-07-25', true),
    (h_ler, '2026-07-19', true),
    (h_ler, '2026-07-20', true),
    (h_ler, '2026-07-23', true),
    (h_ler, '2026-07-24', true),
    (h_delivery, '2026-07-21', true),
    (h_delivery, '2026-07-22', true),
    (h_delivery, '2026-07-23', true),
    (h_delivery, '2026-07-24', true);

  -- ── Viagens ──────────────────────────────────────────────────────────────
  insert into public.trip (
    id, user_id, title, destination, start_date, end_date,
    budget, spent, status, notes
  ) values
    (trip_serra, uid, 'Serra Gaúcha 2026', 'Gramado / Canela',
     '2026-07-12', '2026-07-15', 4500, 3120, 'completed',
     '4 dias com amigos'),
    (trip_floripa, uid, 'Floripa verão', 'Florianópolis',
     '2026-12-20', '2026-12-27', 6000, null, 'planning',
     'Casas na praia'),
    (trip_sp, uid, 'SP trabalho + lazer', 'São Paulo',
     '2026-08-08', '2026-08-10', 1800, 420, 'upcoming',
     'Cliente + jantar');

  begin
    insert into public.trip_member (trip_id, user_id, role)
    values
      (trip_serra, uid, 'owner'),
      (trip_floripa, uid, 'owner'),
      (trip_sp, uid, 'owner');
  exception when others then
    raise notice 'trip_member pulado: %', sqlerrm;
  end;

  insert into public.trip_checklist_item (trip_id, title, category, done, sort_order)
  values
    (trip_serra, 'Reservar pousada', 'lodging', true, 1),
    (trip_serra, 'Documentos no carro', 'documents', true, 2),
    (trip_serra, 'Mala de frio', 'packing', true, 3),
    (trip_serra, 'Gasolina cheia', 'transport', true, 4),
    (trip_floripa, 'Escolher casa Airbnb', 'lodging', false, 1),
    (trip_floripa, 'Passagens', 'transport', false, 2),
    (trip_sp, 'Hotel perto do cliente', 'lodging', true, 1),
    (trip_sp, 'Reunião confirmada', 'other', true, 2);

  insert into public.trip_expense (
    trip_id, description, amount, category, expense_date
  ) values
    (trip_serra, 'Pousada 3 noites', 890, 'lodging', '2026-07-12'),
    (trip_serra, 'Combustível ida/volta', 420, 'transport', '2026-07-12'),
    (trip_serra, 'Fondue Di Paolo', 280, 'food', '2026-07-13'),
    (trip_serra, 'Vinícola Miolo', 180, 'activity', '2026-07-15'),
    (trip_serra, 'Compras Gramado', 350, 'shopping', '2026-07-14'),
    (trip_sp, 'Uber aeroporto', 90, 'transport', '2026-08-08'),
    (trip_sp, 'Jantar cliente', 330, 'food', '2026-08-09');

  insert into public.trip_itinerary_day (trip_id, day_number, date, title)
  values
    (trip_serra, 1, '2026-07-12', 'Chegada Gramado'),
    (trip_serra, 2, '2026-07-13', 'Gramado centro'),
    (trip_serra, 3, '2026-07-14', 'Canela + Lago Negro'),
    (trip_serra, 4, '2026-07-15', 'Vale dos Vinhedos');

  select id into day1 from public.trip_itinerary_day
    where trip_id = trip_serra and day_number = 1 limit 1;
  select id into day2 from public.trip_itinerary_day
    where trip_id = trip_serra and day_number = 2 limit 1;
  select id into day3 from public.trip_itinerary_day
    where trip_id = trip_serra and day_number = 3 limit 1;
  select id into day4 from public.trip_itinerary_day
    where trip_id = trip_serra and day_number = 4 limit 1;

  insert into public.trip_itinerary_activity (day_id, title, activity_time, sort_order)
  values
    (day1, 'Check-in pousada', '15:00', 1),
    (day1, 'Rua Coberta', '17:30', 2),
    (day2, 'Fondue Di Paolo', '20:00', 1),
    (day2, 'Mini Mundo', '10:00', 2),
    (day3, 'Lago Negro', '09:00', 1),
    (day3, 'Catedral de Pedra', '14:00', 2),
    (day4, 'Vinícola Miolo', '10:30', 1),
    (day4, 'Volta a POA', '16:00', 2);

  -- ── Lugares ──────────────────────────────────────────────────────────────
  insert into public.place_visit (
    user_id, trip_id, name, type, rating, notes, visited_date, address, would_recommend
  ) values
    (uid, null, 'Café Girondino', 'cafe', 4.5, 'Cappuccino excelente',
     '2026-06-02', 'Centro Histórico — Porto Alegre', true),
    (uid, null, 'Barbacoa', 'restaurant', 4.0, 'Churrasco clássico',
     '2026-06-10', 'Moinhos de Vento — POA', true),
    (uid, null, 'Parque Farroupilha', 'park', 5.0, 'Corrida de domingo',
     '2026-06-15', 'Porto Alegre', true),
    (uid, null, 'MARGS', 'museum', 4.0, 'Exposição temporária boa',
     '2026-06-22', 'Centro — POA', true),
    (uid, trip_serra, 'Hotel Fasano', 'hotel', 4.5, 'Base antes da serra',
     '2026-07-12', 'Centro — POA', true),
    (uid, trip_serra, 'Cantina Di Paolo', 'restaurant', 4.5, 'Fondue imperdível',
     '2026-07-13', 'Gramado', true),
    (uid, trip_serra, 'Lago Negro', 'attraction', 5.0, 'Manhã com névoa',
     '2026-07-14', 'Gramado', true),
    (uid, trip_serra, 'Casa di Pietro', 'cafe', 3.5, 'Fila longa demais',
     '2026-07-14', 'Canela', false),
    (uid, trip_serra, 'Vinícola Miolo', 'attraction', 4.0, 'Tour + degustação',
     '2026-07-15', 'Bento Gonçalves', true);

  -- ── Veículo ──────────────────────────────────────────────────────────────
  insert into public.vehicle (
    id, user_id, kind, brand, model, year, plate, current_km, fuel_type, notes
  ) values (
    v_civic, uid, 'car', 'Honda', 'Civic', 2020, 'ABC1D23', 68450, 'flex',
    'Demo seed — Civic 2020'
  );

  insert into public.vehicle_maintenance (
    vehicle_id, type, service_date, km_at_service, cost, notes
  ) values
    (v_civic, 'oil', '2026-06-18', 67200, 420, 'Óleo sintético 5W30'),
    (v_civic, 'tires', '2026-03-10', 64100, 1680, '4 pneus novos'),
    (v_civic, 'brakes', '2025-11-22', 59800, 890, 'Pastilhas dianteiras'),
    (v_civic, 'general_service', '2025-09-05', 56200, 650, 'Revisão 60 mil');

  insert into public.vehicle_fuel_log (
    vehicle_id, date, liters, total_cost, km, station, notes
  ) values
    (v_civic, '2026-07-14', 42.5, 290.00, 68450, 'Shell Ipiranga', 'Tanque cheio'),
    (v_civic, '2026-07-01', 40.1, 265.00, 67820, 'Ipiranga Moinhos', null),
    (v_civic, '2026-06-15', 41.8, 280.00, 67200, 'Shell Assis Brasil', null),
    (v_civic, '2026-06-01', 39.2, 255.00, 66540, 'Petrobras', 'Etanol blend'),
    (v_civic, '2026-05-20', 43.0, 288.00, 65890, 'Shell Ipiranga', null);

  insert into public.vehicle_document (
    vehicle_id, type, due_date, cost, paid, paid_date, notes
  ) values
    (v_civic, 'ipva', '2026-03-31', 1850, true, '2026-02-10', 'IPVA 2026'),
    (v_civic, 'insurance', '2026-11-15', 3200, true, '2025-11-10', 'Seguro anual'),
    (v_civic, 'licensing', '2026-09-30', 180, false, null, 'Licenciamento');

  raise notice 'Seed demo OK para user %', uid;
end $$;
