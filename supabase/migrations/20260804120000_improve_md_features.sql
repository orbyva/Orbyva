-- paid_at: quando a recorrência/parcela foi efetivamente paga (competência fica em transaction_at)
alter table public.transaction
  add column if not exists paid_at date;

comment on column public.transaction.paid_at is
  'Data em que o pagamento da recorrência foi registrado (pode diferir do vencimento em transaction_at).';

-- Campos extras do roteiro de viagem
alter table public.trip_itinerary_activity
  add column if not exists link_url text,
  add column if not exists is_reserved boolean not null default false,
  add column if not exists category text not null default 'activity';

comment on column public.trip_itinerary_activity.link_url is
  'Link de reserva / voo / hospedagem / atividade.';
comment on column public.trip_itinerary_activity.is_reserved is
  'Se a reserva já foi confirmada.';
comment on column public.trip_itinerary_activity.category is
  'flight | hotel | transport | activity | other';

-- Referral de amigos (não confundir com trip_invite)
alter table public.profiles
  add column if not exists referral_code text,
  add column if not exists referred_by uuid references public.profiles(id);

create unique index if not exists profiles_referral_code_uidx
  on public.profiles (referral_code)
  where referral_code is not null;

-- RPCs (profiles não tem UPDATE policy para authenticated)
create or replace function public.ensure_my_referral_code()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_code text;
  v_try text;
  i int;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select referral_code into v_code from public.profiles where id = v_uid;
  if v_code is not null then
    return v_code;
  end if;

  for i in 1..8 loop
    v_try := upper(substr(md5(random()::text || clock_timestamp()::text || v_uid::text), 1, 8));
    begin
      update public.profiles
        set referral_code = v_try, updated_at = now()
      where id = v_uid and referral_code is null;
      select referral_code into v_code from public.profiles where id = v_uid;
      if v_code is not null then
        return v_code;
      end if;
    exception when unique_violation then
      -- retry
    end;
  end loop;

  raise exception 'could not allocate referral code';
end;
$$;

create or replace function public.apply_referral_code(p_code text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_ref uuid;
  v_existing uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  if p_code is null or length(trim(p_code)) < 4 then
    return;
  end if;

  select referred_by into v_existing from public.profiles where id = v_uid;
  if v_existing is not null then
    return;
  end if;

  select id into v_ref
  from public.profiles
  where referral_code = upper(trim(p_code))
  limit 1;

  if v_ref is null or v_ref = v_uid then
    return;
  end if;

  update public.profiles
    set referred_by = v_ref, updated_at = now()
  where id = v_uid and referred_by is null;
end;
$$;

create or replace function public.count_my_referrals()
returns integer
language sql
security definer
set search_path = public
stable
as $$
  select count(*)::integer
  from public.profiles
  where referred_by = auth.uid();
$$;

grant execute on function public.ensure_my_referral_code() to authenticated;
grant execute on function public.apply_referral_code(text) to authenticated;
grant execute on function public.count_my_referrals() to authenticated;
