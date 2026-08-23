\set ON_ERROR_STOP on

-- Roda de fato como `authenticated`, com as GUCs que os stubs mapeiam para auth.uid()/auth.jwt().
set role authenticated;

-- ── anfitrião cria convites ────────────────────────────────────────────────────────────────────
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
select set_config('request.jwt.claims', '{"email":"host@orbyva.app"}', false);

insert into public.event_invite (id, event_id, email, token, created_by, expires_at) values
  ('cccccccc-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001',
   'guest@orbyva.app', 'tok-guest-ok', '11111111-1111-1111-1111-111111111111',
   now() + interval '14 days'),
  -- Convite "só link", sem e-mail (fora do índice parcial, que é `where email is not null`).
  ('cccccccc-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000002',
   null, 'tok-link', '11111111-1111-1111-1111-111111111111', now() + interval '14 days'),
  ('cccccccc-0000-0000-0000-000000000004', 'bbbbbbbb-0000-0000-0000-000000000001',
   'outro@exemplo.com', 'tok-outro-email', '11111111-1111-1111-1111-111111111111',
   now() + interval '14 days');

-- Expirado e revogado nascem já fora de `pending`: o índice parcial só admite UM pendente por
-- (evento, e-mail), e `tok-guest-ok` acima já ocupa esse par. Ter os três convites para o mesmo
-- e-mail e o mesmo evento — um válido, um vencido e um revogado — é o cenário que 05 precisa.
insert into public.event_invite (id, event_id, email, token, created_by, status, expires_at) values
  ('cccccccc-0000-0000-0000-000000000003', 'bbbbbbbb-0000-0000-0000-000000000001',
   'guest@orbyva.app', 'tok-expirado', '11111111-1111-1111-1111-111111111111',
   'expired', now() - interval '1 day'),
  ('cccccccc-0000-0000-0000-000000000005', 'bbbbbbbb-0000-0000-0000-000000000001',
   'guest@orbyva.app', 'tok-revogado', '11111111-1111-1111-1111-111111111111',
   'revoked', now() + interval '14 days');

do $$
declare n int;
begin
  select count(*) into n from public.event_invite;
  if n <> 5 then raise exception 'FALHOU: o anfitrião deveria ver os 5 convites dele, viu %', n; end if;

  -- Segundo convite PENDENTE para o mesmo e-mail no mesmo evento: barrado pelo índice parcial.
  begin
    insert into public.event_invite (event_id, email, token, created_by, expires_at)
    values ('bbbbbbbb-0000-0000-0000-000000000001', 'GUEST@orbyva.app', 'tok-duplicado',
            '11111111-1111-1111-1111-111111111111', now() + interval '14 days');
    raise exception 'FALHOU: convidar o mesmo e-mail duas vezes para o mesmo evento deveria ser barrado';
  exception
    when unique_violation then null;
  end;

  -- Mesmo e-mail em OUTRO evento continua valendo.
  insert into public.event_invite (event_id, email, token, created_by, expires_at)
  values ('bbbbbbbb-0000-0000-0000-000000000002', 'guest@orbyva.app', 'tok-outro-evento',
          '11111111-1111-1111-1111-111111111111', now() + interval '14 days');

  -- Revogado libera reconvite do mesmo e-mail (o índice é `where status = 'pending'`).
  insert into public.event_invite (event_id, email, token, created_by, expires_at)
  values ('bbbbbbbb-0000-0000-0000-000000000001', 'reconvidado@exemplo.com', 'tok-reconvite-1',
          '11111111-1111-1111-1111-111111111111', now() + interval '14 days');
  update public.event_invite set status = 'revoked' where token = 'tok-reconvite-1';
  insert into public.event_invite (event_id, email, token, created_by, expires_at)
  values ('bbbbbbbb-0000-0000-0000-000000000001', 'reconvidado@exemplo.com', 'tok-reconvite-2',
          '11111111-1111-1111-1111-111111111111', now() + interval '14 days');

  -- Status fora da lista é rejeitado.
  begin
    update public.event_invite set status = 'talvez' where token = 'tok-link';
    raise exception 'FALHOU: status inválido deveria ser barrado pelo check';
  exception
    when check_violation then null;
  end;
end $$;

-- ── terceiro não enxerga nem alcança convite alheio ────────────────────────────────────────────
select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', false);
select set_config('request.jwt.claims', '{"email":"other@orbyva.app"}', false);

do $$
declare n int;
begin
  select count(*) into n from public.event_invite;
  if n <> 0 then
    raise exception 'FALHOU: RLS vazando % convite(s) de outro usuário', n;
  end if;

  update public.event_invite set status = 'revoked' where token = 'tok-guest-ok';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALHOU: terceiro conseguiu revogar convite alheio'; end if;

  delete from public.event_invite where token = 'tok-guest-ok';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALHOU: terceiro conseguiu apagar convite alheio'; end if;

  -- Convidar para o evento de outra pessoa: barrado pelo with check do insert.
  begin
    insert into public.event_invite (event_id, email, token, created_by, expires_at)
    values ('bbbbbbbb-0000-0000-0000-000000000001', 'vitima@exemplo.com', 'tok-sequestro',
            '33333333-3333-3333-3333-333333333333', now() + interval '14 days');
    raise exception 'FALHOU: dá para convidar gente para o evento de outra pessoa';
  exception
    when insufficient_privilege then null;
  end;

  -- Forjar created_by também é barrado.
  begin
    insert into public.event_invite (event_id, email, token, created_by, expires_at)
    values ('bbbbbbbb-0000-0000-0000-000000000001', 'vitima@exemplo.com', 'tok-forjado',
            '11111111-1111-1111-1111-111111111111', now() + interval '14 days');
    raise exception 'FALHOU: dá para forjar created_by no convite';
  exception
    when insufficient_privilege then null;
  end;
end $$;

-- ── pré-visualização por token: mínimo necessário, nada do anfitrião ───────────────────────────
do $$
declare v jsonb;
begin
  v := public.get_event_invite_by_token('tok-guest-ok');
  if v is null then raise exception 'FALHOU: get_event_invite_by_token não achou o convite'; end if;
  if v ->> 'event_title' <> 'Reunião de kickoff' then
    raise exception 'FALHOU: a pré-visualização deveria trazer o título do evento (veio %)', v ->> 'event_title';
  end if;
  if v ->> 'status' <> 'pending' then
    raise exception 'FALHOU: status errado na pré-visualização (%)', v ->> 'status';
  end if;
  if (v -> 'event_starts_at') is null then
    raise exception 'FALHOU: a pré-visualização precisa do horário do evento';
  end if;
  if (v -> 'accepted_by_me')::boolean then
    raise exception 'FALHOU: accepted_by_me deveria ser falso num convite pendente';
  end if;

  -- Privacidade: nada do anfitrião atravessa.
  if v ? 'created_by' then
    raise exception 'FALHOU: a pré-visualização está vazando created_by do anfitrião';
  end if;
  if v::text like '%host@orbyva.app%' then
    raise exception 'FALHOU: a pré-visualização está vazando o e-mail do anfitrião';
  end if;
  if v::text like '%Lançamento%' then
    raise exception 'FALHOU: a pré-visualização está vazando o projeto do anfitrião';
  end if;
  if v::text like '%Café com o time%' then
    raise exception 'FALHOU: a pré-visualização está vazando outros eventos do anfitrião';
  end if;

  -- Token inexistente devolve null, não erro nem exceção vazando estrutura.
  if public.get_event_invite_by_token('tok-que-nao-existe') is not null then
    raise exception 'FALHOU: token inexistente deveria devolver null';
  end if;
end $$;

reset role;

do $$
begin
  raise notice 'OK: RLS de event_invite, índice de duplicidade e pré-visualização conferidos';
end $$;
