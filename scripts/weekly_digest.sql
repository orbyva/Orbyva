-- =============================================================================
-- Orbyva — Digest semanal (e-mail: mês + parcelas)
-- Idempotente. Rodar no SQL Editor ou via migration.
-- =============================================================================

alter table public.profiles
  add column if not exists weekly_digest_sent_at timestamptz;

comment on column public.profiles.weekly_digest_sent_at is
  'Último digest semanal enviado (idempotência do cron).';

-- Cohort: usuários ativos (vistos nos últimos 21 dias), digest há ≥6 dias.
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
  select
    p.id as user_id,
    u.email::text,
    p.created_at,
    p.last_seen_at
  from public.profiles p
  join auth.users u on u.id = p.id
  where u.email is not null
    and coalesce(u.email_confirmed_at, u.created_at) is not null
    and (
      p.last_seen_at is not null
      and p.last_seen_at >= now() - make_interval(days => p_active_days)
    )
    and (
      p.weekly_digest_sent_at is null
      or p.weekly_digest_sent_at < now() - make_interval(days => p_min_gap_days)
    )
  order by p.last_seen_at desc nulls last
  limit greatest(1, least(p_limit, 200));
$$;

revoke all on function public.weekly_digest_candidates(int, int, int) from public;
grant execute on function public.weekly_digest_candidates(int, int, int) to service_role;
