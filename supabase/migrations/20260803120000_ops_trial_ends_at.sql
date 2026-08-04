-- =============================================================================
-- Orbyva — Ops interno: trial_ends_at + has_app_access
-- Permite estender teste / conceder Pro via service_role (Edge ops-admin).
-- NÃO é feature de produto. Idempotente.
-- =============================================================================

alter table public.profiles
  add column if not exists trial_ends_at timestamptz;

-- Backfill: janela padrão = created_at + 7 dias
update public.profiles
set trial_ends_at = created_at + interval '7 days'
where trial_ends_at is null
  and created_at is not null;

comment on column public.profiles.trial_ends_at is
  'Fim do período de teste. Ops pode estender via service_role; usuários não.';

-- Signup: define trial_ends_at
create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, plan, trial_ends_at)
  values (new.id, 'free', now() + interval '7 days')
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Congela trial_ends_at (e billing) para não-service_role
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
    new.trial_ends_at := coalesce(new.trial_ends_at, now() + interval '7 days');
    return new;
  end if;

  new.plan := old.plan;
  new.stripe_customer_id := old.stripe_customer_id;
  new.stripe_subscription_id := old.stripe_subscription_id;
  new.subscription_status := old.subscription_status;
  new.current_period_end := old.current_period_end;
  new.created_at := old.created_at;
  new.trial_ends_at := old.trial_ends_at;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_protect_profiles_billing on public.profiles;
create trigger trg_protect_profiles_billing
  before insert or update on public.profiles
  for each row execute function public.protect_profiles_billing();

-- Acesso: Pro / Stripe ativo / trial_ends_at (fallback created_at+7d)
create or replace function public.has_app_access()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_plan text;
  v_status text;
  v_created timestamptz;
  v_trial_ends timestamptz;
  v_auth_created timestamptz;
begin
  if coalesce(auth.role(), '') = 'service_role' or public.is_db_admin() then
    return true;
  end if;

  if auth.uid() is null then
    return false;
  end if;

  select p.plan, p.subscription_status, p.created_at, p.trial_ends_at
    into v_plan, v_status, v_created, v_trial_ends
  from public.profiles p
  where p.id = auth.uid();

  if found then
    if v_plan = 'pro' then
      return true;
    end if;
    if v_status in ('active', 'trialing') then
      return true;
    end if;
    if v_trial_ends is not null then
      return v_trial_ends > now();
    end if;
    if v_created is not null and (v_created + interval '7 days') > now() then
      return true;
    end if;
    return false;
  end if;

  select u.created_at into v_auth_created
  from auth.users u
  where u.id = auth.uid();

  if v_auth_created is not null then
    return (v_auth_created + interval '7 days') > now();
  end if;

  return false;
end;
$$;

revoke all on function public.has_app_access() from public;
grant execute on function public.has_app_access() to authenticated;

-- Lookup por e-mail (só service_role — Edge ops-admin)
create or replace function public.ops_lookup_user_by_email(p_email text)
returns table (
  user_id uuid,
  email text,
  auth_created_at timestamptz
)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
  select u.id, u.email::text, u.created_at
  from auth.users u
  where lower(u.email) = lower(trim(p_email))
  limit 1;
end;
$$;

revoke all on function public.ops_lookup_user_by_email(text) from public;

-- Audit log interno (sem políticas = bloqueado para anon/authenticated)
create table if not exists public.ops_audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid,
  actor_email text,
  action text not null,
  target_user_id uuid,
  target_email text,
  detail jsonb,
  created_at timestamptz not null default now()
);

alter table public.ops_audit_log enable row level security;

comment on table public.ops_audit_log is
  'Log de ações do console /ops (service_role). Não é feature de produto.';
