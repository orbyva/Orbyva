-- Roda DEPOIS da migration da 055 (que copia `project.notes` para `note`) e ANTES da migration da
-- 058 (que dropa a coluna). Guarda o que precisa sobreviver ao drop — é o "antes" da conferência
-- que a tarefa mandava fazer no SQL editor.
create table if not exists public.__after_copy as
select
  (select count(*) from public.note where title = 'Notas do projeto') as copied_notes,
  (select md5(string_agg(coalesce(project_id::text, '<null>') || '|' || user_id::text || '|' || content,
                         '#' order by id))
     from public.note) as note_digest;
