-- Feature 058 (última tarefa do módulo de Notas, herdada da 055): remove a coluna órfã
-- `project.notes`.
--
-- A 055 (`20260816160000_notes_core.sql`) COPIOU o conteúdo de `project.notes` para a tabela
-- `note` (`insert ... select`, título 'Notas do projeto') e a UI parou de ler e escrever a coluna
-- na mesma feature. A coluna ficou viva de propósito, como caminho de volta, até o usuário
-- confirmar em uso real que as notas migradas estão íntegras.
--
-- ATENÇÃO — esta migration é IRREVERSÍVEL e destrutiva. Antes de rodar `supabase db push`,
-- conferir no SQL editor do banco remoto (é o passo que autoriza o drop, registrado na 055):
--   select count(*) from note where title = 'Notas do projeto';
--   select count(*) from project where notes is not null and btrim(notes, E' \t\r\n') <> '';
-- Os dois números têm de bater, e o conteúdo das notas migradas tem de estar visível em /notes.
--
-- Uma única instrução, de propósito: a migration da feature 006
-- (`20260806130000_project_notes_status_events.sql`) criou a coluna `notes` E a tabela
-- `project_event` no mesmo arquivo, então é fácil arrastar junto o que não deve sair. Nada de
-- tocar em `project_event`, nas policies ou no `status`.

alter table public.project
  drop column if exists notes;
