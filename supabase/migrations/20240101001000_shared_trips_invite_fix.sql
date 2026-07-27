-- Fix: aceite de convite + RLS endurecido (rode após shared_trips.sql).
-- Preferir security_hardening se ainda não rodou.

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

-- Insert de membro só pelo dono (convidado entra só via RPC)
drop policy if exists trip_member_insert on public.trip_member;
create policy trip_member_insert on public.trip_member
  for insert to authenticated
  with check (public.is_trip_owner(trip_id));

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
