-- =============================================================================
-- Orbyva — Enforce de acesso (trial 7d / Pro) nas escritas
-- Bloqueia INSERT/UPDATE/DELETE quando o usuário não tem acesso.
-- SELECT continua liberado (export / conta / leitura).
-- Idempotente.
-- =============================================================================

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
  v_auth_created timestamptz;
begin
  if auth.uid() is null then
    return false;
  end if;

  -- Bypass interno (webhooks / jobs)
  if coalesce(auth.role(), '') = 'service_role' then
    return true;
  end if;

  select p.plan, p.subscription_status, p.created_at
    into v_plan, v_status, v_created
  from public.profiles p
  where p.id = auth.uid();

  if found then
    if v_plan = 'pro' then
      return true;
    end if;
    if v_status in ('active', 'trialing') then
      return true;
    end if;
    if v_created is not null and (v_created + interval '7 days') > now() then
      return true;
    end if;
    return false;
  end if;

  -- Sem profile ainda: usa auth.users.created_at (janela de signup)
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

create or replace function public.enforce_app_access()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') = 'service_role' then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if not public.has_app_access() then
    raise exception 'Acesso expirado. Assine o Pro para continuar.'
      using errcode = '42501';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

-- Tabelas dono (user_id) + dimensões de finanças
do $$
declare
  t text;
  tables text[] := array[
    'movie',
    'transaction',
    'recurring_transaction',
    'monthly_budget',
    'personal_goal',
    'habit',
    'place_visit',
    'trip',
    'vehicle',
    'type',
    'class',
    'habit_log',
    'trip_checklist_item',
    'trip_expense',
    'trip_itinerary_day',
    'trip_itinerary_activity',
    'trip_milestone',
    'vehicle_maintenance',
    'vehicle_fuel_log',
    'vehicle_document',
    'trip_member',
    'trip_invite',
    'trip_expense_split',
    'movie_episode'
  ];
begin
  foreach t in array tables
  loop
    if to_regclass('public.' || t) is null then
      raise notice 'enforce_app_access: tabela ausente %', t;
      continue;
    end if;

    execute format('drop trigger if exists trg_enforce_app_access on public.%I', t);
    execute format(
      'create trigger trg_enforce_app_access
         before insert or update or delete on public.%I
         for each row execute function public.enforce_app_access()',
      t
    );
  end loop;
end $$;
