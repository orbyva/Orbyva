\set ON_ERROR_STOP on

-- Por último: `wipe_own_data` apaga linhas do seed, então qualquer assertiva sobre o estado anterior
-- precisa vir antes deste arquivo.
do $$
declare n int;
begin
  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);

  select count(*) into n from public.event_invite;
  if n = 0 then raise exception 'FALHOU: o seed deveria ter convites antes do wipe'; end if;

  perform public.wipe_own_data();

  select count(*) into n from public.event_invite
  where created_by = '11111111-1111-1111-1111-111111111111'::uuid;
  if n <> 0 then
    raise exception 'FALHOU: wipe_own_data deixou % convite(s) do anfitrião para trás', n;
  end if;

  select count(*) into n from public.project_event
  where user_id = '11111111-1111-1111-1111-111111111111'::uuid;
  if n <> 0 then
    raise exception 'FALHOU: wipe_own_data deixou % evento(s) do anfitrião para trás', n;
  end if;

  -- O convidado não perde a cópia dele porque o anfitrião apagou a conta: a agenda dele é dele.
  select count(*) into n from public.project_event
  where user_id = '22222222-2222-2222-2222-222222222222'::uuid;
  if n <> 3 then
    raise exception 'FALHOU: o wipe do anfitrião levou os eventos do convidado junto (sobraram %)', n;
  end if;

  raise notice 'OK: wipe_own_data leva convites e eventos do dono, e só os dele';
end $$;
