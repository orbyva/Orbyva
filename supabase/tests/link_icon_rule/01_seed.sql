-- Dois usuários e um ícone da biblioteca de cada um. A tabela em teste nasce **vazia** (as regras
-- semente vêm de um botão na tela, não da migration), então o seed aqui é só o entorno: quem é
-- dono do quê, para as assertivas de RLS e de wipe terem dois lados.
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@x.com'),
  ('22222222-2222-2222-2222-222222222222', 'b@x.com');

insert into public.icon_asset (id, user_id, name, url) values
  ('eeeeeeee-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   'GitHub', 'https://cdn.example/storage/task-icons/11111111/library/gh.svg'),
  ('eeeeeeee-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222',
   'Jira', 'https://cdn.example/storage/task-icons/22222222/library/jira.svg');
