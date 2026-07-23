-- =============================================================================
-- FinTrack — Billing / profiles / waitlist (W0–W4)
-- Rode no SQL Editor do Supabase DEPOIS de tenancy_rls.sql.
-- Idempotente.
-- =============================================================================

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  plan text not null default 'free' check (plan in ('free', 'pro')),
  stripe_customer_id text,
  stripe_subscription_id text,
  subscription_status text,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles for insert
  with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
-- Sem UPDATE para authenticated: billing só via service_role + trigger.

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles for insert
  with check (
    auth.uid() = id
    and plan = 'free'
    and stripe_customer_id is null
    and stripe_subscription_id is null
    and subscription_status is null
    and current_period_end is null
  );

create or replace function public.protect_profiles_billing()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') = 'service_role' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.plan := 'free';
    new.stripe_customer_id := null;
    new.stripe_subscription_id := null;
    new.subscription_status := null;
    new.current_period_end := null;
    return new;
  end if;
  new.plan := old.plan;
  new.stripe_customer_id := old.stripe_customer_id;
  new.stripe_subscription_id := old.stripe_subscription_id;
  new.subscription_status := old.subscription_status;
  new.current_period_end := old.current_period_end;
  new.created_at := old.created_at;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_protect_profiles_billing on public.profiles;
create trigger trg_protect_profiles_billing
  before insert or update on public.profiles
  for each row execute function public.protect_profiles_billing();

-- Auto-create profile on signup
create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, plan)
  values (new.id, 'free')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
  after insert on auth.users
  for each row execute function public.handle_new_user_profile();

-- Waitlist (landing)
create table if not exists public.waitlist (
  id bigint generated always as identity primary key,
  email text not null,
  source text,
  created_at timestamptz not null default now(),
  unique (email)
);

alter table public.waitlist enable row level security;

drop policy if exists "waitlist_insert_anon" on public.waitlist;
create policy "waitlist_insert_anon"
  on public.waitlist for insert
  to anon, authenticated
  with check (true);

-- Service role (Edge Functions) bypassa RLS via service key.
