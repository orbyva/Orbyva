-- =============================================================================
-- Orbyva — Trava de billing Stripe (cota por usuário + Customer atômico)
-- Impede spam autenticado em checkout/portal e a corrida que duplica Customer.
-- Idempotente.
-- =============================================================================

-- Um Customer Stripe por perfil (nulo é permitido; valores repetidos não).
create unique index if not exists profiles_stripe_customer_id_uidx
  on public.profiles (stripe_customer_id)
  where stripe_customer_id is not null;

-- Cota horária UTC por usuário e tipo de sessão (checkout | portal).
create table if not exists public.billing_api_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('checkout', 'portal')),
  window_start timestamptz not null,
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, kind, window_start)
);

comment on table public.billing_api_usage is
  'Contador horário de sessões Checkout/Portal; Edge Functions consomem via RPC.';

alter table public.billing_api_usage enable row level security;

-- Mutex curto enquanto o Customer Stripe está sendo criado.
create table if not exists public.billing_customer_claim (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  claim_token text not null,
  claimed_at timestamptz not null default now()
);

comment on table public.billing_customer_claim is
  'Claim atômico para criar stripe_customer_id sem corrida entre Edge Functions.';

alter table public.billing_customer_claim enable row level security;

create or replace function public.billing_try_consume(
  p_user_id uuid,
  p_kind text,
  p_limit integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.billing_api_usage%rowtype;
  new_count integer;
  v_window timestamptz;
begin
  if p_user_id is null then
    return jsonb_build_object('ok', false, 'reason', 'invalid_user');
  end if;
  if p_kind not in ('checkout', 'portal') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_kind');
  end if;
  if p_limit is null or p_limit < 0 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_limit');
  end if;

  v_window := date_trunc('hour', timezone('utc', now())) at time zone 'utc';

  insert into public.billing_api_usage (user_id, kind, window_start, request_count)
  values (p_user_id, p_kind, v_window, 0)
  on conflict (user_id, kind, window_start) do nothing;

  select * into r
  from public.billing_api_usage
  where user_id = p_user_id and kind = p_kind and window_start = v_window
  for update;

  if r.request_count + 1 > p_limit then
    return jsonb_build_object(
      'ok', false,
      'reason', 'limit',
      'used', r.request_count,
      'limit', p_limit,
      'remaining', 0
    );
  end if;

  update public.billing_api_usage
  set request_count = request_count + 1, updated_at = now()
  where user_id = p_user_id and kind = p_kind and window_start = v_window
  returning request_count into new_count;

  return jsonb_build_object(
    'ok', true,
    'used', new_count,
    'limit', p_limit,
    'remaining', greatest(p_limit - new_count, 0)
  );
end;
$$;

create or replace function public.billing_claim_customer(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.profiles%rowtype;
  v_claim public.billing_customer_claim%rowtype;
  v_token text;
begin
  if p_user_id is null then
    return jsonb_build_object('ok', false, 'reason', 'invalid_user');
  end if;

  insert into public.profiles (id, plan)
  values (p_user_id, 'free')
  on conflict (id) do nothing;

  select * into r
  from public.profiles
  where id = p_user_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'profile_missing');
  end if;

  if r.stripe_customer_id is not null and r.stripe_customer_id like 'cus_%' then
    delete from public.billing_customer_claim where user_id = p_user_id;
    return jsonb_build_object(
      'ok', true,
      'action', 'existing',
      'customer_id', r.stripe_customer_id,
      'plan', r.plan,
      'subscription_status', r.subscription_status
    );
  end if;

  select * into v_claim
  from public.billing_customer_claim
  where user_id = p_user_id;

  if found and v_claim.claimed_at > now() - interval '60 seconds' then
    return jsonb_build_object(
      'ok', false,
      'reason', 'inflight',
      'plan', r.plan,
      'subscription_status', r.subscription_status
    );
  end if;

  v_token := gen_random_uuid()::text;

  insert into public.billing_customer_claim (user_id, claim_token, claimed_at)
  values (p_user_id, v_token, now())
  on conflict (user_id) do update
    set claim_token = excluded.claim_token, claimed_at = excluded.claimed_at;

  return jsonb_build_object(
    'ok', true,
    'action', 'create',
    'claim', v_token,
    'customer_id', r.stripe_customer_id,
    'plan', r.plan,
    'subscription_status', r.subscription_status
  );
end;
$$;

create or replace function public.billing_finish_customer(
  p_user_id uuid,
  p_claim text,
  p_customer_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  existing text;
begin
  if p_user_id is null or p_claim is null or p_customer_id is null
     or p_customer_id not like 'cus_%' then
    return jsonb_build_object('ok', false, 'reason', 'invalid_args');
  end if;

  perform 1
  from public.billing_customer_claim
  where user_id = p_user_id and claim_token = p_claim
  for update;

  if not found then
    select stripe_customer_id into existing
    from public.profiles
    where id = p_user_id;
    if existing is not null and existing like 'cus_%' then
      return jsonb_build_object('ok', true, 'customer_id', existing, 'kept_existing', true);
    end if;
    return jsonb_build_object('ok', false, 'reason', 'claim_mismatch');
  end if;

  select stripe_customer_id into existing
  from public.profiles
  where id = p_user_id
  for update;

  if existing is not null and existing like 'cus_%' and existing <> p_customer_id then
    delete from public.billing_customer_claim where user_id = p_user_id;
    return jsonb_build_object('ok', true, 'customer_id', existing, 'kept_existing', true);
  end if;

  update public.profiles
  set stripe_customer_id = p_customer_id, updated_at = now()
  where id = p_user_id;

  delete from public.billing_customer_claim where user_id = p_user_id;

  return jsonb_build_object('ok', true, 'customer_id', p_customer_id);
exception
  when unique_violation then
    delete from public.billing_customer_claim where user_id = p_user_id;
    select stripe_customer_id into existing
    from public.profiles
    where id = p_user_id;
    if existing is not null and existing like 'cus_%' then
      return jsonb_build_object('ok', true, 'customer_id', existing, 'kept_existing', true);
    end if;
    return jsonb_build_object('ok', false, 'reason', 'unique_violation');
end;
$$;

create or replace function public.billing_release_customer_claim(
  p_user_id uuid,
  p_claim text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null or p_claim is null then
    return;
  end if;
  delete from public.billing_customer_claim
  where user_id = p_user_id and claim_token = p_claim;
end;
$$;

revoke all on table public.billing_api_usage from public, anon, authenticated;
revoke all on table public.billing_customer_claim from public, anon, authenticated;

revoke all on function public.billing_try_consume(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.billing_claim_customer(uuid) from public, anon, authenticated;
revoke all on function public.billing_finish_customer(uuid, text, text) from public, anon, authenticated;
revoke all on function public.billing_release_customer_claim(uuid, text) from public, anon, authenticated;

grant execute on function public.billing_try_consume(uuid, text, integer) to service_role;
grant execute on function public.billing_claim_customer(uuid) to service_role;
grant execute on function public.billing_finish_customer(uuid, text, text) to service_role;
grant execute on function public.billing_release_customer_claim(uuid, text) to service_role;
