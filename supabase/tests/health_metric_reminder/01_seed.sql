-- As tabelas da 063 são novas, então não há linha anterior a preservar: o seed só cria os dois
-- usuários que provam o escopo da RLS (dono e intruso).
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'dono@x.com'),
  ('22222222-2222-2222-2222-222222222222', 'intruso@x.com');
