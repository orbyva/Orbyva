-- Tarefas gravadas **antes** da migration da 085 — o cenário que a cópia de dados tem de acertar:
-- duas tarefas do usuário A **com** `external_url`, duas **sem** (uma com `null`, outra com string
-- vazia — lixo que já pode ter sido gravado pelo campo antigo), e uma tarefa do usuário B com link
-- próprio, para o escopo por `user_id` da cópia e da RLS.
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@x.com'),
  ('22222222-2222-2222-2222-222222222222', 'b@x.com');

insert into public.project (id, user_id, name) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Casa');

insert into public.task
  (id, user_id, project_id, title, status, external_url, external_provider)
values
  -- com link: issue do GitHub (o caso que `detectGitHubLink` reconhece)
  ('cccccccc-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   'aaaaaaaa-0000-0000-0000-000000000001', 'Assinar contrato', 'todo',
   'https://github.com/owner/repo/issues/7', 'github'),
  -- com link: URL genérica, provider nulo
  ('cccccccc-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
   'aaaaaaaa-0000-0000-0000-000000000001', 'Ler o contrato', 'todo',
   'https://docs.google.com/document/d/abc', null),
  -- sem link nenhum
  ('cccccccc-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111',
   'aaaaaaaa-0000-0000-0000-000000000001', 'Revisar orçamento', 'todo', null, null),
  -- string vazia: não é link, e a cópia não pode inventar uma linha para ela
  ('cccccccc-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111',
   'aaaaaaaa-0000-0000-0000-000000000001', 'Arquivar notas', 'todo', '', null),
  -- tarefa do outro usuário, com link próprio
  ('dddddddd-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222',
   null, 'Tarefa do vizinho', 'todo', 'https://example.com/ticket/1', null);
