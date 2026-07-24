-- Avatar / autor nas atividades do roteiro + avatar no membro.
-- Rode no SQL Editor do Supabase.

alter table public.trip_itinerary_activity
  add column if not exists created_by_user_id uuid references auth.users(id) on delete set null,
  add column if not exists created_by_name text,
  add column if not exists created_by_avatar text;

create index if not exists trip_itinerary_activity_created_by_idx
  on public.trip_itinerary_activity (created_by_user_id);

alter table public.trip_member
  add column if not exists avatar_url text;

-- Atualiza RPC de aceite para gravar avatar do membro (se a função existir)
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
  v_avatar text;
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

  v_name := coalesce(
    nullif(auth.jwt() -> 'user_metadata' ->> 'full_name', ''),
    nullif(auth.jwt() -> 'user_metadata' ->> 'name', ''),
    split_part(coalesce(auth.jwt() ->> 'email', ''), '@', 1),
    'Viajante'
  );
  v_avatar := coalesce(
    nullif(auth.jwt() -> 'user_metadata' ->> 'avatar_url', ''),
    nullif(auth.jwt() -> 'user_metadata' ->> 'picture', '')
  );

  insert into public.trip_member (trip_id, user_id, role, display_name, avatar_url)
  values (v_invite.trip_id, v_uid, 'editor', v_name, v_avatar)
  on conflict (trip_id, user_id) do update
    set display_name = excluded.display_name,
        avatar_url = excluded.avatar_url;

  update public.trip_invite
  set status = 'accepted', accepted_by = v_uid
  where id = v_invite.id;

  return v_invite.trip_id;
end;
$$;
