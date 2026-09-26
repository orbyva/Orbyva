\set ON_ERROR_STOP on

-- Três contas, escritas ANTES da migration — o convite tem de funcionar sobre dados que já existiam.
--   host  = anfitrião, Pro, dono do projeto e do evento
--   guest = convidado, SEM acesso ao app (conta velha, sem profile → trial vencido)
--   other = terceiro, Pro, que não deveria enxergar nada disso
insert into auth.users (id, email, created_at) values
  ('11111111-1111-1111-1111-111111111111', 'host@orbyva.app', now()),
  ('22222222-2222-2222-2222-222222222222', 'guest@orbyva.app', now() - interval '400 days'),
  ('33333333-3333-3333-3333-333333333333', 'other@orbyva.app', now())
on conflict (id) do nothing;

insert into public.profiles (id, plan, subscription_status, created_at) values
  ('11111111-1111-1111-1111-111111111111', 'pro', 'active', now()),
  ('33333333-3333-3333-3333-333333333333', 'pro', 'active', now())
on conflict (id) do nothing;

insert into public.project (id, user_id, name, color) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   'Lançamento', '#8b5cf6')
on conflict (id) do nothing;

insert into public.project_event (id, user_id, project_id, title, starts_at, ends_at) values
  ('bbbbbbbb-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   'aaaaaaaa-0000-0000-0000-000000000001',
   'Reunião de kickoff', '2026-09-01 13:00:00+00', '2026-09-01 14:00:00+00'),
  -- Evento sem `ends_at`: o `.ics` e a cópia do convidado precisam aguentar.
  ('bbbbbbbb-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
   'aaaaaaaa-0000-0000-0000-000000000001',
   'Café com o time', '2026-09-02 12:00:00+00', null)
on conflict (id) do nothing;
