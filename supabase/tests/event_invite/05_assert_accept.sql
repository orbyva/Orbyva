\set ON_ERROR_STOP on

set role authenticated;

-- ── o convidado não enxerga nada do anfitrião antes de aceitar ─────────────────────────────────
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
select set_config('request.jwt.claims', '{"email":"guest@orbyva.app"}', false);

do $$
declare n int;
begin
  -- A conta do convidado tem 400 dias e nenhum profile: pela regra escrita em `has_app_access`, ele
  -- estaria fora do trial. Ainda assim a função devolve TRUE, e o motivo está medido no bloco
  -- "gate Pro" no fim deste arquivo. Assertar o valor real (e não o esperado) é de propósito: se
  -- alguém consertar o gate, este teste acusa e manda reler aquele bloco.
  if not public.has_app_access() then
    raise exception 'FALHOU: has_app_access mudou de comportamento — reler o bloco do gate Pro abaixo';
  end if;

  select count(*) into n from public.project_event;
  if n <> 0 then raise exception 'FALHOU: o convidado enxerga % evento(s) do anfitrião', n; end if;

  -- O motivo real de `accept_event_invite` ser `security definer`: sob a RLS normal o convidado não
  -- consegue nem ler o evento que vai copiar.
  select count(*) into n from public.project_event
  where id = 'bbbbbbbb-0000-0000-0000-000000000001';
  if n <> 0 then raise exception 'FALHOU: o convidado consegue ler o project_event do anfitrião'; end if;
end $$;

-- ── aceitar: cria a cópia na agenda do convidado ───────────────────────────────────────────────
do $$
declare
  v_first uuid;
  v_again uuid;
  n int;
  v_row public.project_event%rowtype;
begin
  v_first := public.accept_event_invite('tok-guest-ok');
  if v_first is null then raise exception 'FALHOU: aceitar não devolveu o evento criado'; end if;

  select count(*) into n from public.project_event;
  if n <> 1 then
    raise exception 'FALHOU: o convidado deveria ver exatamente 1 evento depois de aceitar, viu %', n;
  end if;

  select * into v_row from public.project_event where id = v_first;
  if v_row.user_id <> '22222222-2222-2222-2222-222222222222'::uuid then
    raise exception 'FALHOU: o evento copiado não é do convidado';
  end if;
  if v_row.project_id is not null then
    raise exception 'FALHOU: o evento do convidado deveria ter project_id nulo';
  end if;
  if v_row.title <> 'Reunião de kickoff' then
    raise exception 'FALHOU: título não copiado (veio %)', v_row.title;
  end if;
  if v_row.starts_at <> '2026-09-01 13:00:00+00'::timestamptz
     or v_row.ends_at <> '2026-09-01 14:00:00+00'::timestamptz then
    raise exception 'FALHOU: horário não copiado (% .. %)', v_row.starts_at, v_row.ends_at;
  end if;

  -- Aceitar duas vezes é no-op: mesmo evento, sem cópia extra.
  v_again := public.accept_event_invite('tok-guest-ok');
  if v_again <> v_first then
    raise exception 'FALHOU: aceitar de novo devolveu outro evento (% vs %)', v_again, v_first;
  end if;
  select count(*) into n from public.project_event;
  if n <> 1 then raise exception 'FALHOU: aceitar duas vezes criou % eventos', n; end if;

  -- E a pré-visualização passa a se reconhecer.
  if not (public.get_event_invite_by_token('tok-guest-ok') -> 'accepted_by_me')::boolean then
    raise exception 'FALHOU: accepted_by_me deveria ser verdadeiro para quem aceitou';
  end if;
end $$;

-- ── convite expirado / revogado / de outro e-mail não passam ───────────────────────────────────
do $$
declare n int;
begin
  begin
    perform public.accept_event_invite('tok-expirado');
    raise exception 'FALHOU: convite expirado foi aceito';
  exception
    when raise_exception then
      if sqlerrm not like '%expirou%' and sqlerrm not like '%não está mais disponível%' then
        raise exception 'FALHOU: erro inesperado no convite expirado: %', sqlerrm;
      end if;
  end;

  begin
    perform public.accept_event_invite('tok-revogado');
    raise exception 'FALHOU: convite revogado foi aceito';
  exception
    when raise_exception then
      if sqlerrm not like '%não está mais disponível%' then
        raise exception 'FALHOU: erro inesperado no convite revogado: %', sqlerrm;
      end if;
  end;

  begin
    perform public.accept_event_invite('tok-outro-email');
    raise exception 'FALHOU: convite de outro e-mail foi aceito';
  exception
    when raise_exception then
      if sqlerrm not like '%para outro e-mail%' then
        raise exception 'FALHOU: erro inesperado no convite de outro e-mail: %', sqlerrm;
      end if;
  end;

  begin
    perform public.accept_event_invite('tok-que-nao-existe');
    raise exception 'FALHOU: token inexistente foi aceito';
  exception
    when raise_exception then
      if sqlerrm not like '%inválido%' then
        raise exception 'FALHOU: erro inesperado no token inexistente: %', sqlerrm;
      end if;
  end;

  select count(*) into n from public.project_event;
  if n <> 1 then
    raise exception 'FALHOU: convites recusados mexeram na agenda do convidado (% eventos)', n;
  end if;
end $$;

-- ── mesmo convidado, mesmo evento, segundo convite: não duplica a agenda dele ──────────────────
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
select set_config('request.jwt.claims', '{"email":"host@orbyva.app"}', false);

-- Agora é permitido (o anterior saiu de `pending` ao ser aceito) — é justamente o caso "convidei de
-- novo sem querer".
insert into public.event_invite (event_id, email, token, created_by, expires_at)
values ('bbbbbbbb-0000-0000-0000-000000000001', 'guest@orbyva.app', 'tok-segundo',
        '11111111-1111-1111-1111-111111111111', now() + interval '14 days');

do $$
declare n int;
begin
  -- O anfitrião vê o aceite do primeiro convite carimbado.
  select count(*) into n from public.event_invite
  where token = 'tok-guest-ok'
    and status = 'accepted'
    and accepted_by = '22222222-2222-2222-2222-222222222222'::uuid
    and accepted_event_id is not null;
  if n <> 1 then raise exception 'FALHOU: o aceite não foi carimbado no convite do anfitrião'; end if;

  -- Aceitar o próprio convite não faz sentido e é barrado.
  begin
    perform public.accept_event_invite('tok-link');
    raise exception 'FALHOU: o anfitrião conseguiu aceitar o próprio convite';
  exception
    when raise_exception then
      if sqlerrm not like '%enviado por você%' then
        raise exception 'FALHOU: erro inesperado no autoconvite: %', sqlerrm;
      end if;
  end;
end $$;

select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
select set_config('request.jwt.claims', '{"email":"guest@orbyva.app"}', false);

do $$
declare
  v_id uuid;
  n int;
  v_other uuid;
begin
  v_id := public.accept_event_invite('tok-segundo');
  select count(*) into n from public.project_event;
  if n <> 1 then
    raise exception 'FALHOU: segundo convite para o mesmo evento duplicou a agenda (% eventos)', n;
  end if;
  select accepted_event_id into v_other from public.event_invite where token = 'tok-guest-ok';
  if v_id <> v_other then
    raise exception 'FALHOU: o segundo convite deveria reaproveitar a mesma cópia do evento';
  end if;

  -- Convite para OUTRO evento do mesmo anfitrião cria, sim, uma segunda linha.
  perform public.accept_event_invite('tok-outro-evento');
  select count(*) into n from public.project_event;
  if n <> 2 then
    raise exception 'FALHOU: convite de outro evento deveria virar um evento novo (% eventos)', n;
  end if;
  -- Evento sem `ends_at` copiado como nulo, não como agora().
  select count(*) into n from public.project_event
  where title = 'Café com o time' and ends_at is null;
  if n <> 1 then raise exception 'FALHOU: evento sem ends_at não foi copiado como nulo'; end if;
end $$;

-- ── convite "só link" vale para quem tiver o token ─────────────────────────────────────────────
select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', false);
select set_config('request.jwt.claims', '{"email":"other@orbyva.app"}', false);

do $$
declare n int;
begin
  perform public.accept_event_invite('tok-link');
  select count(*) into n from public.project_event where project_id is null;
  if n <> 1 then
    raise exception 'FALHOU: convite só-link deveria criar 1 evento para quem aceitou (%)', n;
  end if;
end $$;

reset role;

-- ── gate Pro: onde a premissa da feature estava errada, medida em vez de suposta ────────────────
--
-- A 076 assumiu que `security definer` faria a RPC atravessar o `trg_enforce_app_access`. Não faz:
-- o gate olha `has_app_access()`, que olha `auth.uid()` — e o `auth.uid()` continua sendo o do
-- convidado dentro da RPC. O que hoje deixa qualquer um aceitar é outra coisa, e é um achado:
-- `enforce_app_access` e `has_app_access` são `security definer` de dono `postgres`, então o
-- `public.is_db_admin()` que elas consultam vê `current_user = 'postgres'` e devolve TRUE **para
-- todo mundo**. O gate de trial/Pro é inerte no banco inteiro, não só aqui.
--
-- Este bloco congela as duas metades disso: (1) com o gate como está, o convidado fora do trial
-- aceita; (2) com `is_db_admin` consertado, o gate volta a morder — e derruba tanto o INSERT direto
-- quanto a RPC, com 42501. Quem for consertar o gate precisa decidir, ali, se aceitar convite é
-- escrita paga. Ver `## Notas` da feature 076.
insert into public.project_event (id, user_id, project_id, title, starts_at, ends_at) values
  ('bbbbbbbb-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111',
   'aaaaaaaa-0000-0000-0000-000000000001', 'Retrospectiva',
   '2026-09-03 15:00:00+00', '2026-09-03 16:00:00+00');
insert into public.event_invite (event_id, email, token, created_by, expires_at) values
  ('bbbbbbbb-0000-0000-0000-000000000003', 'guest@orbyva.app', 'tok-gate-pro',
   '11111111-1111-1111-1111-111111111111', now() + interval '14 days');

-- (1) Gate como está no repo: passa.
set role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
select set_config('request.jwt.claims', '{"email":"guest@orbyva.app"}', false);

do $$
declare n int;
begin
  perform public.accept_event_invite('tok-gate-pro');
  select count(*) into n from public.project_event;
  if n <> 3 then
    raise exception 'FALHOU: o convidado fora do trial deveria ter 3 eventos agora, tem %', n;
  end if;
end $$;

reset role;

-- (2) Gate consertado (sem `postgres` em is_db_admin): morde os dois caminhos.
-- O seed do cenário vem ANTES do conserto — com o gate mordendo, nem escrever o convite dá.
insert into auth.users (id, email, created_at)
values ('44444444-4444-4444-4444-444444444444', 'semtrial@exemplo.com', now() - interval '400 days')
on conflict (id) do nothing;
insert into public.event_invite (event_id, email, token, created_by, expires_at) values
  ('bbbbbbbb-0000-0000-0000-000000000003', 'semtrial@exemplo.com', 'tok-gate-pro-2',
   '11111111-1111-1111-1111-111111111111', now() + interval '14 days');

create or replace function public.is_db_admin()
returns boolean
language sql
stable
as $$
  select current_user in ('supabase_admin', 'supabase_auth_admin');
$$;

set role authenticated;
select set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', false);
select set_config('request.jwt.claims', '{"email":"semtrial@exemplo.com"}', false);

do $$
begin
  if public.has_app_access() then
    raise exception 'FALHOU: com is_db_admin consertado, has_app_access deveria ser falso';
  end if;

  begin
    insert into public.project_event (user_id, project_id, title, starts_at)
    values ('44444444-4444-4444-4444-444444444444', null, 'Direto', now());
    raise exception 'FALHOU: gate consertado deveria barrar o insert direto';
  exception
    when insufficient_privilege then null;
  end;

  begin
    perform public.accept_event_invite('tok-gate-pro-2');
    raise exception 'FALHOU: security definer passou a atravessar o gate Pro — reler as Notas da 076';
  exception
    when insufficient_privilege then null;
  end;
end $$;

reset role;

-- Restaura o gate como o repo o tem, senão 06_assert_wipe não conseguiria apagar nada.
create or replace function public.is_db_admin()
returns boolean
language sql
stable
as $$
  select current_user in ('postgres', 'supabase_admin', 'supabase_auth_admin');
$$;

do $$
begin
  raise notice 'OK: aceite, idempotência, expiração, revogação, e-mail e acoplamento com o gate Pro conferidos';
end $$;
