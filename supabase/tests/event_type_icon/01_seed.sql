-- Dois usuários e um ícone de biblioteca de cada um. A tabela em teste nasce **vazia** (sem linha,
-- o tipo desenha o ícone padrão), então o seed aqui é só o entorno: quem é dono do quê, para as
-- assertivas de RLS e de wipe terem dois lados.
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@x.com'),
  ('22222222-2222-2222-2222-222222222222', 'b@x.com');

insert into public.icon_asset (id, user_id, name, url) values
  ('eeeeeeee-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   'Microfone', 'https://cdn.example/storage/task-icons/11111111/library/mic.svg'),
  ('eeeeeeee-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222',
   'Teatro', 'https://cdn.example/storage/task-icons/22222222/library/teatro.svg');
