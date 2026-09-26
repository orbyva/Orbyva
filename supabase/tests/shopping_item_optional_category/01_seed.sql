-- Dois usuários, uma categoria e um item **categorizado** por usuário, gravados ANTES da migration
-- em teste. É a prova de que a linha legada sobrevive ao `drop not null` sem update nenhum: o item
-- de sempre continua apontando para a categoria dele.
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@x.com'),
  ('22222222-2222-2222-2222-222222222222', 'b@x.com');

insert into public.shopping_category (id, user_id, name) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Mercado'),
  ('bbbbbbbb-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'Mercado do vizinho');

insert into public.shopping_item (id, user_id, shopping_category_id, title, status) values
  ('cccccccc-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   'aaaaaaaa-0000-0000-0000-000000000001', 'Arroz', 'pending'),
  ('dddddddd-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222',
   'bbbbbbbb-0000-0000-0000-000000000001', 'Item do vizinho', 'pending');
