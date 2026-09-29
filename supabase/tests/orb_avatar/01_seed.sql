-- Dois usuários — A (o dono) e B (o vizinho). Tudo que esta feature afirma sobre escopo precisa de
-- um segundo dono para ter sentido: "uma ativa por usuário" só é diferente de "uma ativa no banco"
-- quando existem dois, e "a RPC recusa o id de outro dono" precisa do outro dono.
--
-- Nenhuma linha de `public.orb_avatar` aqui: a tabela ainda não existe neste ponto (o seed roda
-- **antes** da migration, e é isso que o controle negativo do run.sh confere). As versões são
-- criadas no 03, depois da migration.
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@x.com'),
  ('22222222-2222-2222-2222-222222222222', 'b@x.com');

-- Uma nota para cada um: é o que permite afirmar, no 03, que a `wipe_own_data` reescrita por esta
-- migration continua apagando o que já apagava antes — e só do dono.
insert into public.note (id, user_id, title) values
  ('eeeeeeee-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Nota de A'),
  ('eeeeeeee-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'Nota de B');
