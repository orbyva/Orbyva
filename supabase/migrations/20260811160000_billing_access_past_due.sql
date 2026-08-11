-- =============================================================================
-- Orbyva — Billing access: past_due bloqueia; occurrence enforce; webhook idempotency
-- Idempotente.
-- =============================================================================

-- Acesso: Stripe active/trialing; plan=pro SEM status bloqueado; trial_ends_at.
-- past_due / unpaid / canceled / incomplete* / paused → sem acesso.
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
    if v_status in ('active', 'trialing') then
      return true;
    end if;
    if v_status in (
      'past_due',
      'unpaid',
      'canceled',
      'incomplete',
      'incomplete_expired',
      'paused'
    ) then
      return false;
    end if;
    -- plan=pro sem status bloqueado (cortesia ops / legado)
    if v_plan = 'pro' then
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

-- place_visit_occurrence: mesma trava de escrita do restante do app
do $$
begin
  if to_regclass('public.place_visit_occurrence') is null then
    raise notice 'place_visit_occurrence ausente — skip enforce';
    return;
  end if;
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'enforce_app_access'
  ) then
    raise notice 'enforce_app_access ausente — skip';
    return;
  end if;

  execute 'drop trigger if exists trg_enforce_app_access on public.place_visit_occurrence';
  execute $t$
    create trigger trg_enforce_app_access
      before insert or update or delete on public.place_visit_occurrence
      for each row execute function public.enforce_app_access()
  $t$;
end $$;

-- Idempotência de webhooks Stripe (evita reprocessar o mesmo event id)
create table if not exists public.stripe_webhook_event (
  id text primary key,
  type text not null,
  processed_at timestamptz not null default now()
);

alter table public.stripe_webhook_event enable row level security;
-- Sem policies para authenticated: só service_role (bypass RLS).

comment on table public.stripe_webhook_event is
  'Eventos Stripe já aplicados. Insert-only via service_role no edge stripe-webhook.';
