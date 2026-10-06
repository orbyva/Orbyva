-- =============================================================================
-- Orbyva — Limite de uso da Orb (feature 249)
-- Cota diária (dia corrido em America/Sao_Paulo) + rajada por minuto, por usuário.
-- A Edge Function `orb-agent` consome via RPC antes de chamar o Gemini.
-- Idempotente.
-- =============================================================================

create table if not exists public.orb_api_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('day', 'minute')),
  window_start timestamptz not null,
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, kind, window_start)
);

comment on table public.orb_api_usage is
  'Contador de pedidos à Orb por usuário (janela diária SP e por minuto); só a RPC escreve.';

alter table public.orb_api_usage enable row level security;

-- O dia vem do relógio do servidor, nunca do corpo do pedido: aceitar o `today` do cliente
-- deixaria zerar a cota forjando a data. Pedido recusado não incrementa nenhuma das janelas.
create or replace function public.orb_try_consume(
  p_user_id uuid,
  p_daily_limit integer,
  p_minute_limit integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_local timestamp;
  v_day timestamptz;
  v_next_day timestamptz;
  v_minute timestamptz;
  v_day_count integer;
  v_minute_count integer;
begin
  if p_user_id is null then
    return jsonb_build_object('ok', false, 'reason', 'invalid_user');
  end if;
  if p_daily_limit is null or p_daily_limit < 0
     or p_minute_limit is null or p_minute_limit < 0 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_limit');
  end if;

  v_local := v_now at time zone 'America/Sao_Paulo';
  v_day := date_trunc('day', v_local) at time zone 'America/Sao_Paulo';
  v_next_day := (date_trunc('day', v_local) + interval '1 day') at time zone 'America/Sao_Paulo';
  v_minute := date_trunc('minute', v_now);

  delete from public.orb_api_usage
  where user_id = p_user_id and window_start < v_now - interval '2 days';

  insert into public.orb_api_usage (user_id, kind, window_start, request_count)
  values (p_user_id, 'day', v_day, 0), (p_user_id, 'minute', v_minute, 0)
  on conflict (user_id, kind, window_start) do nothing;

  -- Trava sempre na mesma ordem (dia, depois minuto) para dois pedidos simultâneos não se travarem.
  select request_count into v_day_count
  from public.orb_api_usage
  where user_id = p_user_id and kind = 'day' and window_start = v_day
  for update;

  select request_count into v_minute_count
  from public.orb_api_usage
  where user_id = p_user_id and kind = 'minute' and window_start = v_minute
  for update;

  if v_day_count + 1 > p_daily_limit then
    return jsonb_build_object(
      'ok', false,
      'reason', 'day',
      'used', v_day_count,
      'limit', p_daily_limit,
      'remaining', 0,
      'retry_after_seconds', greatest(1, ceil(extract(epoch from (v_next_day - v_now)))::integer)
    );
  end if;

  if v_minute_count + 1 > p_minute_limit then
    return jsonb_build_object(
      'ok', false,
      'reason', 'minute',
      'used', v_minute_count,
      'limit', p_minute_limit,
      'remaining', greatest(p_daily_limit - v_day_count, 0),
      'retry_after_seconds',
        greatest(1, ceil(extract(epoch from (v_minute + interval '1 minute' - v_now)))::integer)
    );
  end if;

  update public.orb_api_usage
  set request_count = request_count + 1, updated_at = v_now
  where user_id = p_user_id
    and ((kind = 'day' and window_start = v_day) or (kind = 'minute' and window_start = v_minute));

  return jsonb_build_object(
    'ok', true,
    'used', v_day_count + 1,
    'limit', p_daily_limit,
    'remaining', greatest(p_daily_limit - v_day_count - 1, 0)
  );
end;
$$;

revoke all on table public.orb_api_usage from public, anon, authenticated;
revoke all on function public.orb_try_consume(uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.orb_try_consume(uuid, integer, integer) to service_role;
