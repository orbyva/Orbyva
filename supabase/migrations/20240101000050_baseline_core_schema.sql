-- =============================================================================
-- Orbyva — Baseline: schema núcleo reconstruído
--
-- Estas tabelas foram criadas originalmente à mão no SQL Editor do Supabase,
-- antes de existir controle de versão de migrations — por isso nunca
-- apareceram como `create table` em nenhum arquivo deste diretório.
-- `20240101000100_tenancy_rls.sql` (e várias migrations posteriores) sempre
-- assumiram que elas já existiam, então em um projeto novo/vazio o
-- `supabase db push` quebrava em "relation ... does not exist".
--
-- Este arquivo reconstrói apenas as colunas "núcleo" (nunca tocadas por
-- nenhum `alter table` existente) de cada tabela. Colunas que já são
-- adicionadas por migrations posteriores (ex.: movie.notes, vehicle.kind,
-- habit.goal_id, type.exclude_from_spend) foram deixadas de fora de
-- propósito — elas continuam sendo criadas pelas migrations originais,
-- na ordem cronológica de sempre. RLS/policies também continuam sendo
-- responsabilidade das migrations já existentes (20240101000100 em diante).
--
-- Reconstrução feita a partir de: ALTERs/comentários espalhados nas
-- migrations existentes, tipos em src/types/**, e uso real das colunas em
-- src/api/**. Onde não havia evidência direta (ex.: precisão de alguns
-- numeric, ou se uma coluna é NOT NULL), optamos pelo formato mais
-- permissivo para não travar o app — ajuste depois se notar divergência
-- com o schema original.
-- =============================================================================

-- ── Catálogo compartilhado: nature / type / class ────────────────────────────
-- (nature fica global; type/class viram por-usuário em 20240101000200)

create table if not exists public.nature (
  id   bigint generated always as identity primary key,
  name text not null
);

create table if not exists public.type (
  id          bigint generated always as identity primary key,
  name        text not null,
  nature_id   bigint not null references public.nature (id),
  hex_color   text,
  lucide_icon text,
  "order"     integer
);

create table if not exists public.class (
  id      bigint generated always as identity primary key,
  name    text not null,
  type_id bigint not null references public.type (id)
);

-- ── Cinema/Séries ─────────────────────────────────────────────────────────

create table if not exists public.movie (
  imdb_id        text primary key,
  title          text not null,
  year           integer,
  poster         text,
  genre          text[] not null default '{}',
  director       text,
  actors         text[] not null default '{}',
  plot           text,
  type           text not null default 'movie',
  rating         numeric(3, 1),
  score_imdb     numeric(3, 1),
  watched_dates  date[] not null default '{}',
  status         text not null default 'to_watch',
  created_at     timestamptz not null default now()
);

-- ── Finanças: recurring_transaction / transaction / monthly_budget ──────────

create table if not exists public.recurring_transaction (
  id                 uuid primary key default gen_random_uuid(),
  class_id           bigint not null references public.class (id),
  value              numeric not null,
  description        text not null,
  frequency          text not null default 'Mensal',
  validity           date,
  due_day            integer,
  installment_count  integer,
  payment_start_date date,
  status             boolean not null default true,
  paid_parcels       integer[] not null default '{}',
  created_at         timestamptz not null default now()
);

create table if not exists public.transaction (
  id                       bigint generated always as identity primary key,
  class_id                 bigint not null references public.class (id),
  value                    numeric not null,
  description              text not null,
  transaction_at           timestamptz not null,
  recurring_transaction_id uuid references public.recurring_transaction (id),
  installment_number       integer,
  created_at               timestamptz not null default now()
);

create table if not exists public.monthly_budget (
  id            bigint generated always as identity primary key,
  type_id       bigint not null references public.type (id),
  class_id      bigint references public.class (id),
  budget_month  date not null,
  planned_value numeric not null,
  created_at    timestamptz not null default now()
);

-- ── Metas / Hábitos ───────────────────────────────────────────────────────

create table if not exists public.personal_goal (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  description   text,
  category      text not null,
  target_value  numeric not null,
  current_value numeric not null default 0,
  unit          text,
  deadline      date,
  status        text not null default 'active',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.habit (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  description     text,
  frequency       text not null default 'daily',
  target_per_week integer not null default 1,
  color           text,
  created_at      timestamptz not null default now()
);

create table if not exists public.habit_log (
  id         uuid primary key default gen_random_uuid(),
  habit_id   uuid not null references public.habit (id) on delete cascade,
  date       date not null,
  completed  boolean not null default false,
  created_at timestamptz not null default now()
);

-- ── Viagens / Lugares ─────────────────────────────────────────────────────

create table if not exists public.trip (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  destination  text,
  start_date   date,
  end_date     date,
  budget       numeric(12, 2),
  spent        numeric(12, 2),
  notes        text,
  status       text not null default 'planning',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.place_visit (
  id               uuid primary key default gen_random_uuid(),
  trip_id          uuid references public.trip (id) on delete set null,
  name             text not null,
  type             text not null,
  rating           numeric(3, 1),
  notes            text,
  visited_date     date not null,
  address          text,
  would_recommend  boolean not null default true,
  created_at       timestamptz not null default now()
);

create table if not exists public.trip_checklist_item (
  id         uuid primary key default gen_random_uuid(),
  trip_id    uuid not null references public.trip (id) on delete cascade,
  title      text not null,
  category   text not null,
  done       boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.trip_expense (
  id             uuid primary key default gen_random_uuid(),
  trip_id        uuid not null references public.trip (id) on delete cascade,
  description    text not null,
  amount         numeric(12, 2) not null,
  category       text not null,
  expense_date   date not null,
  transaction_id bigint,
  created_at     timestamptz not null default now()
);

create table if not exists public.trip_itinerary_day (
  id         uuid primary key default gen_random_uuid(),
  trip_id    uuid not null references public.trip (id) on delete cascade,
  day_number integer not null,
  date       date,
  title      text,
  notes      text
);

create table if not exists public.trip_itinerary_activity (
  id             uuid primary key default gen_random_uuid(),
  day_id         uuid not null references public.trip_itinerary_day (id) on delete cascade,
  title          text not null,
  activity_time  text,
  notes          text,
  place_visit_id uuid references public.place_visit (id) on delete set null,
  sort_order     integer not null default 0,
  created_at     timestamptz not null default now()
);

create table if not exists public.trip_milestone (
  id         uuid primary key default gen_random_uuid(),
  trip_id    uuid not null references public.trip (id) on delete cascade,
  title      text not null,
  type       text not null,
  due_date   date not null,
  done       boolean not null default false,
  notes      text,
  created_at timestamptz not null default now()
);

-- ── Veículos ──────────────────────────────────────────────────────────────

create table if not exists public.vehicle (
  id             uuid primary key default gen_random_uuid(),
  brand          text not null,
  model          text not null,
  year           integer,
  plate          text,
  color          text,
  current_km     integer not null default 0,
  fuel_type      text,
  purchase_date  date,
  purchase_value numeric(12, 2),
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table if not exists public.vehicle_maintenance (
  id             uuid primary key default gen_random_uuid(),
  vehicle_id     uuid not null references public.vehicle (id) on delete cascade,
  type           text not null,
  custom_type    text,
  service_date   date not null,
  km_at_service  integer not null,
  cost           numeric(12, 2),
  shop           text,
  next_km        integer,
  next_date      date,
  notes          text,
  transaction_id bigint,
  created_at     timestamptz not null default now()
);

create table if not exists public.vehicle_fuel_log (
  id         uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicle (id) on delete cascade,
  date       date not null,
  liters     numeric(8, 3) not null,
  total_cost numeric(12, 2) not null,
  km         integer not null,
  station    text,
  notes      text,
  created_at timestamptz not null default now()
);

create table if not exists public.vehicle_document (
  id          uuid primary key default gen_random_uuid(),
  vehicle_id  uuid not null references public.vehicle (id) on delete cascade,
  type        text not null,
  custom_type text,
  due_date    date not null,
  cost        numeric(12, 2),
  paid        boolean not null default false,
  paid_date   date,
  notes       text,
  created_at  timestamptz not null default now()
);
