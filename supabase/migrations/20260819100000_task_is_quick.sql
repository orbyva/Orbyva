-- Tarefa pontual (feature 070) — espelha `is_medication` (049, 20260816120000_task_medication.sql) e
-- `is_consultation` (061, 20260816190000_task_consultation.sql): mais uma flag ortogonal na mesma
-- linha de `public.task`, não um enum. Uma dose de medicação é medicação *e* pontual ao mesmo tempo
-- (feature 071 depende disso), então as flags precisam coexistir.
--
-- "Pontual" é a tarefa que não tem duração: trocar lençol, trocar escova, tomar remédio. A agenda
-- desenha essas como uma bolinha marcável no horário, em vez de um bloco com altura sintética de 30
-- minutos. O default `false` é o que garante que nenhuma tarefa existente muda de comportamento.
--
-- Sem RLS nova: `public.task` já é escopada por `user_id = auth.uid()` (20260803121500) e uma coluna
-- booleana não muda isso. Sem tabela nova, então `wipe_own_data` também fica como está.

alter table public.task
  add column if not exists is_quick boolean not null default false;

comment on column public.task.is_quick is
  'Tarefa pontual: instante sem duração, desenhada como bolinha marcável na agenda (mês/semana/dia) em vez de bloco no canvas de horas. Mutuamente exclusiva com estimated_duration na UI.';
