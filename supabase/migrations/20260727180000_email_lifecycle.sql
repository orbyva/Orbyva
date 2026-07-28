-- Preferências e marcas de e-mail de lifecycle (Resend).
-- Auth (confirmação / reset / magic link) vai pelo Auth Hook auth-send-email.

alter table public.profiles
  add column if not exists email_unsubscribed_at timestamptz,
  add column if not exists email_digest_enabled boolean not null default true,
  add column if not exists email_alerts_enabled boolean not null default false,
  add column if not exists welcome_email_sent_at timestamptz,
  add column if not exists trial_ending_email_sent_at timestamptz,
  add column if not exists trial_expired_email_sent_at timestamptz,
  add column if not exists onboarding_nudge_sent_at timestamptz,
  add column if not exists payment_failed_email_sent_at timestamptz,
  add column if not exists pro_welcome_email_sent_at timestamptz,
  add column if not exists alerts_digest_sent_at timestamptz;

comment on column public.profiles.email_unsubscribed_at is
  'Opt-out global de e-mails de produto (exceto auth).';
comment on column public.profiles.email_digest_enabled is
  'Recebe digest semanal.';
comment on column public.profiles.email_alerts_enabled is
  'Recebe resumo de alertas (parcelas/orçamento) por e-mail.';

-- Candidatos welcome: conta nova (<2d), ainda sem welcome, com e-mail, não unsubscribed.
create or replace function public.lifecycle_email_candidates(
  p_kind text,
  p_limit int default 50
)
returns table (
  user_id uuid,
  email text,
  created_at timestamptz,
  last_seen_at timestamptz,
  plan text,
  subscription_status text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_kind = 'welcome' then
    return query
    select p.id, u.email::text, u.created_at, p.last_seen_at, p.plan::text, p.subscription_status
    from public.profiles p
    join auth.users u on u.id = p.id
    where u.email is not null
      and u.email_confirmed_at is not null
      and p.email_unsubscribed_at is null
      and p.welcome_email_sent_at is null
      and u.created_at > now() - interval '2 days'
      and u.created_at < now() - interval '10 minutes'
    order by u.created_at asc
    limit greatest(1, least(p_limit, 200));

  elsif p_kind = 'trial_ending' then
    -- Trial = free, sem sub ativa; faltam 1–2 dias (idade conta 5–6 dias se trial=7).
    return query
    select p.id, u.email::text, u.created_at, p.last_seen_at, p.plan::text, p.subscription_status
    from public.profiles p
    join auth.users u on u.id = p.id
    where u.email is not null
      and p.email_unsubscribed_at is null
      and p.trial_ending_email_sent_at is null
      and coalesce(p.plan, 'free') = 'free'
      and coalesce(p.subscription_status, '') not in ('active', 'trialing')
      and u.created_at <= now() - interval '5 days'
      and u.created_at > now() - interval '7 days'
    order by u.created_at asc
    limit greatest(1, least(p_limit, 200));

  elsif p_kind = 'trial_expired' then
    return query
    select p.id, u.email::text, u.created_at, p.last_seen_at, p.plan::text, p.subscription_status
    from public.profiles p
    join auth.users u on u.id = p.id
    where u.email is not null
      and p.email_unsubscribed_at is null
      and p.trial_expired_email_sent_at is null
      and coalesce(p.plan, 'free') = 'free'
      and coalesce(p.subscription_status, '') not in ('active', 'trialing')
      and u.created_at <= now() - interval '7 days'
      and u.created_at > now() - interval '14 days'
    order by u.created_at asc
    limit greatest(1, least(p_limit, 200));

  elsif p_kind = 'onboarding_nudge' then
    -- 2–5 dias de conta, sem nenhuma transaction, sem nudge.
    return query
    select p.id, u.email::text, u.created_at, p.last_seen_at, p.plan::text, p.subscription_status
    from public.profiles p
    join auth.users u on u.id = p.id
    where u.email is not null
      and p.email_unsubscribed_at is null
      and p.onboarding_nudge_sent_at is null
      and u.created_at <= now() - interval '2 days'
      and u.created_at > now() - interval '5 days'
      and not exists (
        select 1 from public.transaction t where t.user_id = p.id limit 1
      )
    order by u.created_at asc
    limit greatest(1, least(p_limit, 200));

  elsif p_kind = 'alerts_digest' then
    return query
    select p.id, u.email::text, u.created_at, p.last_seen_at, p.plan::text, p.subscription_status
    from public.profiles p
    join auth.users u on u.id = p.id
    where u.email is not null
      and p.email_unsubscribed_at is null
      and p.email_alerts_enabled = true
      and p.last_seen_at is not null
      and p.last_seen_at > now() - interval '30 days'
      and (
        p.alerts_digest_sent_at is null
        or p.alerts_digest_sent_at < now() - interval '6 days'
      )
    order by p.last_seen_at desc
    limit greatest(1, least(p_limit, 200));

  else
    raise exception 'lifecycle_email_candidates: kind inválido %', p_kind;
  end if;
end;
$$;

revoke all on function public.lifecycle_email_candidates(text, int) from public;
grant execute on function public.lifecycle_email_candidates(text, int) to service_role;

-- Digest: respeita email_digest_enabled + unsubscribe.
create or replace function public.weekly_digest_candidates(
  p_active_days int default 21,
  p_min_gap_days int default 6,
  p_limit int default 80
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
  select p.id, u.email::text, u.created_at, p.last_seen_at
  from public.profiles p
  join auth.users u on u.id = p.id
  where u.email is not null
    and p.email_unsubscribed_at is null
    and coalesce(p.email_digest_enabled, true) = true
    and p.last_seen_at is not null
    and p.last_seen_at > now() - make_interval(days => greatest(p_active_days, 1))
    and (
      p.weekly_digest_sent_at is null
      or p.weekly_digest_sent_at < now() - make_interval(days => greatest(p_min_gap_days, 1))
    )
  order by p.last_seen_at desc
  limit greatest(1, least(p_limit, 200));
$$;

revoke all on function public.weekly_digest_candidates(int, int, int) from public;
grant execute on function public.weekly_digest_candidates(int, int, int) to service_role;

-- D7: respeita unsubscribe.
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
  select p.id, u.email::text, u.created_at, p.last_seen_at
  from public.profiles p
  join auth.users u on u.id = p.id
  where u.email is not null
    and p.email_unsubscribed_at is null
    and p.retention_email_sent_at is null
    and u.created_at <= now() - make_interval(days => greatest(p_min_age_days, 1))
    and u.created_at > now() - make_interval(days => greatest(p_max_age_days, 1))
    and (
      p.last_seen_at is null
      or p.last_seen_at < now() - make_interval(days => greatest(p_inactive_days, 1))
    )
  order by u.created_at asc
  limit greatest(1, least(p_limit, 200));
$$;

revoke all on function public.retention_d7_email_candidates(int, int, int, int) from public;
grant execute on function public.retention_d7_email_candidates(int, int, int, int) to service_role;
