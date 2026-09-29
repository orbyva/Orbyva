-- Feature 085: remove `task.external_url` e `task.external_provider`.
--
-- A 085 trocou o link externo único da tarefa por N links com comentário, em
-- `task_external_link` (`20260823100000_task_external_links.sql`), que copiou o dado antigo. As
-- duas colunas ficaram vivas como rede de segurança até a cópia ser conferida no banco real.
--
-- Conferência que autorizou o drop (2026-09-20, `supabase db query --linked`, só `select`):
--   select t.id, t.external_url from public.task t
--    where t.external_url is not null and btrim(t.external_url) <> ''
--      and not exists (select 1 from public.task_external_link l
--                       where l.task_id = t.id and l.url = t.external_url);   -- 0 linhas
-- Ou seja: **toda** `external_url` legada tem linha correspondente na tabela nova.
--
-- O `count` bruto não bate (4 tarefas com `external_url` contra 7 `task_id` distintos em
-- `task_external_link`) e isso é dado novo, não perda: agrupando por origem são 4 links legados
-- copiados pela migration e 3 criados depois pela UI da própria 085. O invariante que prova a
-- migração é a consulta de órfãos acima, não a igualdade de contagens.
--
-- O app não lê nem escreve estas colunas desde a 085: `src/types/tasks.ts:150` só as cita num
-- comentário explicando a ausência, e os testes de formulário afirmam que elas **não** entram no
-- payload de `createTask`/`updateTask`. Nenhuma view, índice ou constraint depende delas
-- (conferido em pg_depend e pg_index).
--
-- Uma instrução por coluna, como a tarefa pediu — para que um erro em qualquer uma delas apareça
-- sozinho no log, e não escondido num `alter` composto.
alter table public.task drop column if exists external_url;

alter table public.task drop column if exists external_provider;
