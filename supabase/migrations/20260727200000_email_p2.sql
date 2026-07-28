-- P2 e-mails: D14/D30, winback cancel, lembrete hábitos, convite viagem, waitlist nurture.

-- ── Profiles ─────────────────────────────────────────────────────────────────

alter table public.profiles
  add column if not exists retention_d14_email_sent_at timestamptz,
  add column if not exists retention_d30_email_sent_at timestamptz,
  add column if not exists cancel_winback_email_sent_at timestamptz,
  add column if not exists email_habit_reminder_enabled boolean not null default false,
  add column if not exists habit_reminder_sent_at timestamptz;

comment on column public.profiles.retention_d14_email_sent_at is
  'E-mail de retorno ~D14 (inativo).';
comment on column public.profiles.retention_d30_email_sent_at is
  'E-mail de retorno ~D30 (inativo).';
comment on column public.profiles.cancel_winback_email_sent_at is
  'Winback após cancelamento Stripe.';
comment on column public.profiles.email_habit_reminder_enabled is
  'Opt-in: lembrete diário de hábitos por e-mail.';
comment on column public.profiles.habit_reminder_sent_at is
  'Último lembrete de hábitos enviado.';

-- ── Trip invite ──────────────────────────────────────────────────────────────

alter table public.trip_invite
  add column if not exists email_sent_at timestamptz;

-- ── Waitlist ─────────────────────────────────────────────────────────────────

alter table public.waitlist
  add column if not exists welcome_sent_at timestamptz,
  add column if not exists nurture_d3_sent_at timestamptz,
  add column if not exists nurture_d7_sent_at timestamptz;

-- ── Retention D14 / D30 ──────────────────────────────────────────────────────

create or replace function public.retention_d14_email_candidates(
  p_min_age_days int default 14,
  p_max_age_days int default 21,
  p_inactive_days int default 7,
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
    and p.retention_d14_email_sent_at is null
    and u.created_at <= now() - make_interval(days => greatest(p_min_age_days, 1))
    and u.created_at > now() - make_interval(days => greatest(p_max_age_days, 1))
    and (
      p.last_seen_at is null
      or p.last_seen_at < now() - make_interval(days => greatest(p_inactive_days, 1))
    )
  order by u.created_at asc
  limit greatest(1, least(p_limit, 200));
$$;

revoke all on function public.retention_d14_email_candidates(int, int, int, int) from public;
grant execute on function public.retention_d14_email_candidates(int, int, int, int) to service_role;

create or replace function public.retention_d30_email_candidates(
  p_min_age_days int default 28,
  p_max_age_days int default 40,
  p_inactive_days int default 14,
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
    and p.retention_d30_email_sent_at is null
    and u.created_at <= now() - make_interval(days => greatest(p_min_age_days, 1))
    and u.created_at > now() - make_interval(days => greatest(p_max_age_days, 1))
    and (
      p.last_seen_at is null
      or p.last_seen_at < now() - make_interval(days => greatest(p_inactive_days, 1))
    )
  order by u.created_at asc
  limit greatest(1, least(p_limit, 200));
$$;

revoke all on function public.retention_d30_email_candidates(int, int, int, int) from public;
grant execute on function public.retention_d30_email_candidates(int, int, int, int) to service_role;

-- ── Habit reminder (opt-in, diário) ──────────────────────────────────────────

create or replace function public.habit_reminder_candidates(
  p_today date,
  p_limit int default 80
)
returns table (
  user_id uuid,
  email text,
  habit_count int
)
language sql
security definer
set search_path = public
as $$
  select
    p.id,
    u.email::text,
    count(h.id)::int as habit_count
  from public.profiles p
  join auth.users u on u.id = p.id
  join public.habit h on h.user_id = p.id
  where u.email is not null
    and p.email_unsubscribed_at is null
    and p.email_habit_reminder_enabled = true
    and (
      p.habit_reminder_sent_at is null
      or (p.habit_reminder_sent_at at time zone 'utc')::date < p_today
    )
    and exists (
      select 1
      from public.habit h2
      where h2.user_id = p.id
        and coalesce(h2.frequency, 'daily') = 'daily'
        and not exists (
          select 1
          from public.habit_log hl
          where hl.habit_id = h2.id
            and hl.date = p_today
            and hl.completed = true
        )
    )
  group by p.id, u.email
  order by p.last_seen_at desc nulls last
  limit greatest(1, least(p_limit, 200));
$$;

revoke all on function public.habit_reminder_candidates(date, int) from public;
grant execute on function public.habit_reminder_candidates(date, int) to service_role;

-- ── Waitlist nurture ─────────────────────────────────────────────────────────

create or replace function public.waitlist_email_candidates(
  p_kind text,
  p_limit int default 50
)
returns table (
  id uuid,
  email text,
  created_at timestamptz,
  source text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_kind = 'welcome' then
    return query
    select w.id, w.email::text, w.created_at, w.source::text
    from public.waitlist w
    where w.welcome_sent_at is null
      and w.created_at < now() - interval '5 minutes'
      and w.created_at > now() - interval '3 days'
    order by w.created_at asc
    limit greatest(1, least(p_limit, 200));

  elsif p_kind = 'nurture_d3' then
    return query
    select w.id, w.email::text, w.created_at, w.source::text
    from public.waitlist w
    where w.nurture_d3_sent_at is null
      and w.welcome_sent_at is not null
      and w.created_at <= now() - interval '3 days'
      and w.created_at > now() - interval '6 days'
    order by w.created_at asc
    limit greatest(1, least(p_limit, 200));

  elsif p_kind = 'nurture_d7' then
    return query
    select w.id, w.email::text, w.created_at, w.source::text
    from public.waitlist w
    where w.nurture_d7_sent_at is null
      and w.welcome_sent_at is not null
      and w.created_at <= now() - interval '7 days'
      and w.created_at > now() - interval '14 days'
    order by w.created_at asc
    limit greatest(1, least(p_limit, 200));

  else
    raise exception 'waitlist_email_candidates: kind inválido %', p_kind;
  end if;
end;
$$;

revoke all on function public.waitlist_email_candidates(text, int) from public;
grant execute on function public.waitlist_email_candidates(text, int) to service_role;
