-- Feature 076: RPCs de pré-visualização e aceite de convite de evento.
--
-- Ambas `security definer` por motivos diferentes e igualmente obrigatórios:
--
-- 1. `get_event_invite_by_token` — o convidado não é dono de nada e a policy de select de
--    `event_invite` é `created_by = auth.uid()`. Sem uma função definer ele não conseguiria nem ver
--    para qual evento foi convidado. É o mesmo desenho de `get_trip_invite_by_token`
--    (20240101001200_security_hardening.sql): nenhuma policy permissiva, só uma função que devolve o
--    mínimo, e só para quem tem o token.
-- 2. `accept_event_invite` — o trigger `trg_enforce_app_access` derruba `insert` de quem está fora
--    do trial/Pro (`20260723120000_app_access_enforce.sql`, errcode 42501). Um convidado com trial
--    vencido precisa conseguir aceitar: o convite é do anfitrião, não uma escrita "dele". Além
--    disso, ler o `project_event` do anfitrião para copiar título/horário é impossível sob a RLS
--    normal.
--
-- Privacidade: a pré-visualização devolve **só** título e horário do evento, mais o estado do
-- próprio convite. Nada do anfitrião (e-mail, nome, projeto, outros eventos) atravessa.

create or replace function public.get_event_invite_by_token(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_invite public.event_invite%rowtype;
  v_event public.project_event%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Não autenticado';
  end if;

  select * into v_invite
  from public.event_invite
  where token = p_token;

  if not found then
    return null;
  end if;

  select * into v_event
  from public.project_event
  where id = v_invite.event_id;

  return jsonb_build_object(
    'id', v_invite.id,
    'event_id', v_invite.event_id,
    'token', v_invite.token,
    'email', v_invite.email,
    'status', v_invite.status,
    'expires_at', v_invite.expires_at,
    'accepted_by', v_invite.accepted_by,
    'accepted_event_id', v_invite.accepted_event_id,
    'created_at', v_invite.created_at,
    -- Só o que o convidado precisa para decidir. `created_by` NÃO vai: é id de outra conta e não
    -- ajuda em nada na tela.
    'event_title', v_event.title,
    'event_starts_at', v_event.starts_at,
    'event_ends_at', v_event.ends_at,
    -- `true` quando quem está lendo é o próprio convidado já aceito — a tela mostra "você já
    -- aceitou" em vez de "convite já usado".
    'accepted_by_me', (v_invite.accepted_by is not null and v_invite.accepted_by = auth.uid())
  );
end;
$$;

revoke all on function public.get_event_invite_by_token(text) from public;
grant execute on function public.get_event_invite_by_token(text) to authenticated;

create or replace function public.accept_event_invite(p_token text)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_invite public.event_invite%rowtype;
  v_event public.project_event%rowtype;
  v_uid uuid := auth.uid();
  v_email text;
  v_existing uuid;
  v_new_event_id uuid;
begin
  if v_uid is null then
    raise exception 'Não autenticado';
  end if;

  select * into v_invite
  from public.event_invite
  where token = p_token
  for update;

  if not found then
    raise exception 'Convite inválido';
  end if;

  -- Aceitar duas vezes é no-op: devolve o mesmo evento, não cria um segundo.
  if v_invite.status = 'accepted' then
    if v_invite.accepted_by = v_uid and v_invite.accepted_event_id is not null then
      return v_invite.accepted_event_id;
    end if;
    raise exception 'Este convite já foi aceito';
  end if;

  if v_invite.status <> 'pending' then
    raise exception 'Este convite não está mais disponível';
  end if;

  if v_invite.expires_at < now() then
    update public.event_invite
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

  if v_invite.created_by = v_uid then
    raise exception 'Este convite foi enviado por você';
  end if;

  select * into v_event
  from public.project_event
  where id = v_invite.event_id;

  if not found then
    raise exception 'O evento deste convite não existe mais';
  end if;

  -- Mesma pessoa, mesmo evento, dois convites (link + e-mail, por exemplo): reaproveita a cópia que
  -- ela já tem em vez de duplicar o evento na agenda dela.
  select accepted_event_id into v_existing
  from public.event_invite
  where event_id = v_invite.event_id
    and accepted_by = v_uid
    and status = 'accepted'
    and accepted_event_id is not null
  limit 1;

  if v_existing is not null then
    v_new_event_id := v_existing;
  else
    -- `project_id` nulo: o convidado não tem o projeto do anfitrião (20260820110000).
    insert into public.project_event (user_id, project_id, title, starts_at, ends_at)
    values (v_uid, null, v_event.title, v_event.starts_at, v_event.ends_at)
    returning id into v_new_event_id;
  end if;

  update public.event_invite
  set status = 'accepted',
      accepted_by = v_uid,
      accepted_event_id = v_new_event_id
  where id = v_invite.id;

  return v_new_event_id;
end;
$$;

revoke all on function public.accept_event_invite(text) from public;
grant execute on function public.accept_event_invite(text) to authenticated;
