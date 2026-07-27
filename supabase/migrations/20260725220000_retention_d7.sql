-- =============================================================================
-- Orbyva — Retenção D7 (last_seen + e-mail de retorno)
-- Idempotente.
-- =============================================================================

alter table public.profiles
  add column if not exists last_seen_at timestamptz;

alter table public.profiles
  add column if not exists retention_email_sent_at timestamptz;

comment on column public.profiles.last_seen_at is
  'Último heartbeat do app (RPC touch_last_seen). Base da retenção D7.';
comment on column public.profiles.retention_email_sent_at is
  'Quando o e-mail de retorno D7 foi enviado (idempotência do cron).';

-- Heartbeat: authenticated atualiza só a própria linha; throttle 30 min.
create or replace function public.touch_last_seen()
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  next_seen timestamptz;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  update public.profiles
  set
    last_seen_at = now(),
    updated_at = now()
  where id = uid
    and (
      last_seen_at is null
      or last_seen_at < now() - interval '30 minutes'
    )
  returning last_seen_at into next_seen;

  if next_seen is null then
    select last_seen_at into next_seen
    from public.profiles
    where id = uid;
  end if;

  return next_seen;
end;
$$;

revoke all on function public.touch_last_seen() from public;
grant execute on function public.touch_last_seen() to authenticated;

-- Cohort elegível ao e-mail de retorno (só service_role / cron).
create or replace function public.retention_d7_email_candidates(
  p_min_age_days int default 7,
  p_max_age_days int default 14,
  p_inactive_days int default 5,
  p_limit int default 50
)
returns table (
  user_id uuid,
  email text,
  created_at timestamptz,
  last_seen_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    p.id as user_id,
    u.email::text,
    p.created_at,
    p.last_seen_at
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.retention_email_sent_at is null
    and u.email is not null
    and length(trim(u.email)) > 0
    and p.created_at <= now() - make_interval(days => p_min_age_days)
    and p.created_at >= now() - make_interval(days => p_max_age_days)
    and (
      p.last_seen_at is null
      or p.last_seen_at <= now() - make_interval(days => p_inactive_days)
    )
  order by p.created_at asc
  limit greatest(1, least(p_limit, 200));
$$;

revoke all on function public.retention_d7_email_candidates(int, int, int, int) from public;
-- Sem grant a authenticated — só service_role (bypass) chama no cron.
