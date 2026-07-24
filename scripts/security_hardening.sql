-- =============================================================================
-- Orbyva — Security hardening (rode DEPOIS dos scripts base)
-- Corrige: bypass Pro em profiles, leak de convites, join sem token,
-- escalação editor→owner, despesas pessoais legadas.
-- Idempotente — pode reexecutar no SQL Editor.
-- =============================================================================

-- ── 1) profiles: billing só via service_role (webhook Stripe) ─────────

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

drop policy if exists "profiles_update_own" on public.profiles;

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

-- ── 2) Convites: sem listar pending global; preview por token ─────────

drop policy if exists trip_invite_select on public.trip_invite;
create policy trip_invite_select on public.trip_invite
  for select to authenticated
  using (
    public.is_trip_owner(trip_id)
    or public.is_trip_member(trip_id)
  );

drop policy if exists trip_invite_update on public.trip_invite;
create policy trip_invite_update on public.trip_invite
  for update to authenticated
  using (public.is_trip_owner(trip_id))
  with check (public.is_trip_owner(trip_id));

create or replace function public.get_trip_invite_by_token(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.trip_invite%rowtype;
  v_title text;
begin
  if auth.uid() is null then
    raise exception 'Não autenticado';
  end if;

  select * into v_invite
  from public.trip_invite
  where token = p_token;

  if not found then
    return null;
  end if;

  select title into v_title from public.trip where id = v_invite.trip_id;

  return jsonb_build_object(
    'id', v_invite.id,
    'trip_id', v_invite.trip_id,
    'token', v_invite.token,
    'email', v_invite.email,
    'status', v_invite.status,
    'expires_at', v_invite.expires_at,
    'created_by', v_invite.created_by,
    'accepted_by', v_invite.accepted_by,
    'created_at', v_invite.created_at,
    'trip_title', v_title
  );
end;
$$;

revoke all on function public.get_trip_invite_by_token(text) from public;
grant execute on function public.get_trip_invite_by_token(text) to authenticated;

create or replace function public.accept_trip_invite(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.trip_invite%rowtype;
  v_uid uuid := auth.uid();
  v_name text;
  v_email text;
begin
  if v_uid is null then
    raise exception 'Não autenticado';
  end if;

  select * into v_invite
  from public.trip_invite
  where token = p_token
  for update;

  if not found then
    raise exception 'Convite inválido';
  end if;

  if v_invite.status <> 'pending' then
    raise exception 'Este convite não está mais disponível';
  end if;

  if v_invite.expires_at < now() then
    update public.trip_invite
    set status = 'expired'
    where id = v_invite.id;
    raise exception 'Este convite expirou';
  end if;

  v_email := lower(coalesce(auth.jwt() ->> 'email', ''));
  if v_invite.email is not null
     and length(trim(v_invite.email)) > 0
     and lower(trim(v_invite.email)) <> v_email then
    raise exception 'Este convite é para outro e-mail';
  end if;

  v_name := coalesce(
    nullif(auth.jwt() -> 'user_metadata' ->> 'full_name', ''),
    nullif(auth.jwt() -> 'user_metadata' ->> 'name', ''),
    split_part(coalesce(auth.jwt() ->> 'email', ''), '@', 1),
    'Viajante'
  );

  insert into public.trip_member (trip_id, user_id, role, display_name)
  values (v_invite.trip_id, v_uid, 'editor', v_name)
  on conflict (trip_id, user_id) do update
    set display_name = excluded.display_name;

  update public.trip_invite
  set status = 'accepted', accepted_by = v_uid
  where id = v_invite.id;

  return v_invite.trip_id;
end;
$$;

revoke all on function public.accept_trip_invite(text) from public;
grant execute on function public.accept_trip_invite(text) to authenticated;

-- ── 3) trip_member: insert só owner; bloqueia auto-promote ────────────

drop policy if exists trip_member_insert on public.trip_member;
create policy trip_member_insert on public.trip_member
  for insert to authenticated
  with check (public.is_trip_owner(trip_id));

create or replace function public.protect_trip_member_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') = 'service_role' then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and new.role is distinct from old.role
     and not exists (
       select 1 from public.trip t
       where t.id = new.trip_id and t.user_id = auth.uid()
     ) then
    raise exception 'Somente o dono da viagem pode alterar a função do membro';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_protect_trip_member_role on public.trip_member;
create trigger trg_protect_trip_member_role
  before update on public.trip_member
  for each row execute function public.protect_trip_member_role();

drop policy if exists trip_member_update on public.trip_member;
create policy trip_member_update on public.trip_member
  for update to authenticated
  using (
    public.is_trip_owner(trip_id)
    or user_id = auth.uid()
  )
  with check (
    public.is_trip_owner(trip_id)
    or user_id = auth.uid()
  );

-- ── 4) Despesas pessoais: sem buraco created_by null ─────────────────

update public.trip_expense e
set created_by_user_id = t.user_id
from public.trip t
where e.trip_id = t.id
  and e.created_by_user_id is null;

drop policy if exists trip_expense_member on public.trip_expense;
create policy trip_expense_member on public.trip_expense
  for all to authenticated
  using (
    public.is_trip_member(trip_id)
    and (
      visibility = 'shared'
      or created_by_user_id = auth.uid()
    )
  )
  with check (
    public.is_trip_member(trip_id)
    and created_by_user_id = auth.uid()
  );
