-- Índices para busca (⌘K), car, metas/aportes e listagens por usuário.
-- pg_trgm vive em `extensions` no Supabase — qualificar gin_trgm_ops.

create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;

-- ========== Busca / listagens (user + texto) ==========

create index if not exists movie_user_status_idx
  on public.movie (user_id, status);

create index if not exists movie_title_trgm_idx
  on public.movie using gin (title extensions.gin_trgm_ops);

create index if not exists movie_notes_trgm_idx
  on public.movie using gin (notes extensions.gin_trgm_ops)
  where notes is not null;

create index if not exists book_title_trgm_idx
  on public.book using gin (title extensions.gin_trgm_ops);

create index if not exists book_notes_trgm_idx
  on public.book using gin (notes extensions.gin_trgm_ops)
  where notes is not null;

create index if not exists album_title_trgm_idx
  on public.album using gin (title extensions.gin_trgm_ops);

create index if not exists album_notes_trgm_idx
  on public.album using gin (notes extensions.gin_trgm_ops)
  where notes is not null;

create index if not exists place_visit_user_status_idx
  on public.place_visit (user_id, status);

create index if not exists place_visit_name_trgm_idx
  on public.place_visit using gin (name extensions.gin_trgm_ops);

create index if not exists trip_user_start_idx
  on public.trip (user_id, start_date);

create index if not exists trip_title_trgm_idx
  on public.trip using gin (title extensions.gin_trgm_ops);

create index if not exists trip_destination_trgm_idx
  on public.trip using gin (destination extensions.gin_trgm_ops)
  where destination is not null;

create index if not exists personal_goal_user_status_idx
  on public.personal_goal (user_id, status);

create index if not exists personal_goal_title_trgm_idx
  on public.personal_goal using gin (title extensions.gin_trgm_ops);

create index if not exists habit_user_created_idx
  on public.habit (user_id, created_at);

create index if not exists habit_name_trgm_idx
  on public.habit using gin (name extensions.gin_trgm_ops);

create index if not exists vehicle_plate_trgm_idx
  on public.vehicle using gin (plate extensions.gin_trgm_ops)
  where plate is not null;

-- Transações: descrição (⌘K + soma de aporte de meta)
create index if not exists transaction_description_trgm_idx
  on public.transaction using gin (description extensions.gin_trgm_ops)
  where description is not null;

-- Classe por nome (match aporte Meta / título)
create index if not exists class_user_name_idx
  on public.class (user_id, name);

-- ========== Carro (FK + ordenação) ==========

create index if not exists vehicle_maintenance_vehicle_date_idx
  on public.vehicle_maintenance (vehicle_id, service_date desc);

create index if not exists vehicle_fuel_log_vehicle_km_idx
  on public.vehicle_fuel_log (vehicle_id, km);

create index if not exists vehicle_fuel_log_vehicle_date_idx
  on public.vehicle_fuel_log (vehicle_id, date desc);

create index if not exists vehicle_document_vehicle_idx
  on public.vehicle_document (vehicle_id);

-- ========== Viagem (batch do hub / detalhe) ==========

create index if not exists trip_checklist_item_trip_idx
  on public.trip_checklist_item (trip_id);

create index if not exists trip_expense_trip_idx
  on public.trip_expense (trip_id);
