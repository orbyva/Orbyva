-- Tarefas gravadas **antes** da migration da 086 — o cenário que a cópia de dados tem de acertar.
--
-- O que está aqui de propósito:
--   * duas tarefas do usuário A apontando para a **mesma** URL (o caso que existe hoje: reusar um
--     ícone significava reenviar o mesmo arquivo, mas nada impede duas tarefas com a mesma URL) —
--     tem de virar **uma** linha na biblioteca;
--   * uma tarefa de A com outra URL, cujo nome de arquivo é legível — prova que o nome sai do
--     arquivo quando ele diz alguma coisa;
--   * uma tarefa de A só com preset (`icon_key`, `icon_url` nulo) — não pode gerar linha;
--   * uma tarefa de A com `icon_url = ''` (lixo que a coluna aceita) — não pode gerar linha;
--   * uma tarefa do usuário B com URL própria e query string — escopo por `user_id` e o
--     `?width=64` que não pode entrar no nome.
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@x.com'),
  ('22222222-2222-2222-2222-222222222222', 'b@x.com');

insert into public.project (id, user_id, name) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Casa');

insert into public.task
  (id, user_id, project_id, title, status, icon_key, icon_url)
values
  -- caminho antigo `{userId}/{taskId}.{ext}`: o "nome do arquivo" é um uuid e não diz nada
  ('cccccccc-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   'aaaaaaaa-0000-0000-0000-000000000001', 'Assinar contrato', 'todo', null,
   'https://x.supabase.co/storage/v1/object/public/task-icons/11111111-1111-1111-1111-111111111111/cccccccc-0000-0000-0000-000000000001.png'),
  -- a **mesma** URL, em outra tarefa: uma linha só na biblioteca
  ('cccccccc-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
   'aaaaaaaa-0000-0000-0000-000000000001', 'Ler o contrato', 'todo', null,
   'https://x.supabase.co/storage/v1/object/public/task-icons/11111111-1111-1111-1111-111111111111/cccccccc-0000-0000-0000-000000000001.png'),
  -- nome de arquivo legível: vira o nome da linha
  ('cccccccc-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111',
   'aaaaaaaa-0000-0000-0000-000000000001', 'Revisar orçamento', 'todo', null,
   'https://x.supabase.co/storage/v1/object/public/task-icons/11111111-1111-1111-1111-111111111111/logo-empresa.webp'),
  -- só preset: não é ícone da biblioteca
  ('cccccccc-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111',
   'aaaaaaaa-0000-0000-0000-000000000001', 'Arquivar notas', 'todo', 'star', null),
  -- string vazia: não é URL, e a cópia não pode inventar uma linha para ela
  ('cccccccc-0000-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111',
   'aaaaaaaa-0000-0000-0000-000000000001', 'Comprar pilhas', 'todo', null, '   '),
  -- tarefa do outro usuário, com ícone próprio e query string na URL
  ('dddddddd-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222',
   null, 'Tarefa do vizinho', 'todo', null,
   'https://x.supabase.co/storage/v1/object/public/task-icons/22222222-2222-2222-2222-222222222222/icone-do-vizinho.svg?width=64');

-- Um objeto no bucket para cada arquivo antigo, no caminho da feature 035 — é o que permite
-- afirmar, no 03, que excluir a linha da biblioteca **não** apaga o arquivo.
insert into storage.objects (bucket_id, name, owner) values
  ('task-icons',
   '11111111-1111-1111-1111-111111111111/cccccccc-0000-0000-0000-000000000001.png',
   '11111111-1111-1111-1111-111111111111'),
  ('task-icons',
   '11111111-1111-1111-1111-111111111111/logo-empresa.webp',
   '11111111-1111-1111-1111-111111111111');
