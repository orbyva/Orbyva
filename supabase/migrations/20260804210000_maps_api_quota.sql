-- Contador de uso das APIs de mapa (evitar estourar freemium).
-- Geoapify: período diário (YYYY-MM-DD UTC).
-- Google Routes Essentials / Pro: período mensal (YYYY-MM UTC).
-- Providers finais: geoapify | google_routes_essentials | google_routes_pro
-- (migration 20260804220000 promove 'google_routes' legado → essentials)

create table if not exists public.maps_api_usage (
  provider text not null check (
    provider in (
      'geoapify',
      'google_routes',
      'google_routes_essentials',
      'google_routes_pro'
    )
  ),
  period_key text not null,
  request_count integer not null default 0 check (request_count >= 0),
  blocked_until timestamptz,
  updated_at timestamptz not null default now(),
  primary key (provider, period_key)
);

comment on table public.maps_api_usage is
  'Uso agregado das APIs externas de mapa; Edge Function places-catalog consome via RPC.';

alter table public.maps_api_usage enable row level security;

-- Sem policies de SELECT/INSERT para anon/authenticated — só service_role / security definer.

create or replace function public.maps_api_try_consume(
  p_provider text,
  p_period_key text,
  p_amount integer,
  p_limit integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.maps_api_usage%rowtype;
  new_count integer;
begin
  if p_provider not in ('geoapify', 'google_routes') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_provider');
  end if;
  if p_amount is null or p_amount < 1 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_amount');
  end if;
  if p_limit is null or p_limit < 0 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_limit');
  end if;

  insert into public.maps_api_usage (provider, period_key, request_count)
  values (p_provider, p_period_key, 0)
  on conflict (provider, period_key) do nothing;

  select * into r
  from public.maps_api_usage
  where provider = p_provider and period_key = p_period_key
  for update;

  if r.blocked_until is not null and r.blocked_until > now() then
    return jsonb_build_object(
      'ok', false,
      'reason', 'blocked',
      'used', r.request_count,
      'limit', p_limit,
      'blocked_until', r.blocked_until
    );
  end if;

  if r.request_count + p_amount > p_limit then
    return jsonb_build_object(
      'ok', false,
      'reason', 'limit',
      'used', r.request_count,
      'limit', p_limit
    );
  end if;

  update public.maps_api_usage
  set
    request_count = request_count + p_amount,
    updated_at = now(),
    -- limpa bloqueio expirado
    blocked_until = case
      when blocked_until is not null and blocked_until <= now() then null
      else blocked_until
    end
  where provider = p_provider and period_key = p_period_key
  returning request_count into new_count;

  return jsonb_build_object(
    'ok', true,
    'used', new_count,
    'limit', p_limit,
    'remaining', greatest(p_limit - new_count, 0)
  );
end;
$$;

create or replace function public.maps_api_block_until(
  p_provider text,
  p_period_key text,
  p_until timestamptz
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.maps_api_usage (provider, period_key, request_count, blocked_until)
  values (p_provider, p_period_key, 0, p_until)
  on conflict (provider, period_key) do update
  set
    blocked_until = greatest(
      coalesce(public.maps_api_usage.blocked_until, p_until),
      p_until
    ),
    updated_at = now();
end;
$$;

revoke all on function public.maps_api_try_consume(text, text, integer, integer) from public;
revoke all on function public.maps_api_block_until(text, text, timestamptz) from public;
grant execute on function public.maps_api_try_consume(text, text, integer, integer) to service_role;
grant execute on function public.maps_api_block_until(text, text, timestamptz) to service_role;
