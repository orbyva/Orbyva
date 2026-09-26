-- Backfill da feature 071: as doses de medicação já materializadas viram tarefas **pontuais** com o
-- ícone de comprimido.
--
-- A partir da 071, `materializeMedicationDoses` (`src/api/health/medications.ts`) grava
-- `is_quick = true` e `icon_key = 'pill'` em toda dose nova. Sem este backfill, quem já tem
-- tratamento cadastrado veria, no mesmo calendário, as doses antigas como bloco de 30 minutos
-- sintéticos e as novas como bolinha marcável — a mesma coisa desenhada de duas formas.
--
-- Pré-requisitos (aplicar **depois** destas, nesta ordem):
--   - 20260814010000_task_icon.sql          (035) — `task.icon_key`
--   - 20260816230000_medication.sql         (064) — `task.medication_id`
--   - 20260816233000_medication_backfill.sql(064) — converte as medicações da 049
--   - 20260819100000_task_is_quick.sql      (070) — `task.is_quick`
--
-- Escopo: **só** linhas com `medication_id not null`. Uma dose é sempre uma dose; nenhuma outra
-- tarefa muda de forma na agenda por causa desta migration. `is_medication` de propósito não é o
-- filtro: ela é flag de renderização e as medicações da 049 ainda não migradas não têm dose, ao
-- passo que `medication_id` é a fonte da verdade decidida pela 064.
--
-- `coalesce(icon_key, 'pill')` em vez de `icon_key = 'pill'`: se o usuário escolheu um ícone à mão
-- para uma dose (o `TaskIconPicker` permite, e a 071 não trava isso), a escolha dele sobrevive.
--
-- Idempotente por construção — reaplicar não muda nada:
--   - `is_quick = true` é absorvente;
--   - `coalesce(icon_key, 'pill')` é um ponto fixo depois da primeira passagem.
-- O `where` extra evita reescrever linhas que já estão no estado final (nada de UPDATE inútil, e
-- `updated_at` das doses já convertidas não é mexido de novo numa segunda aplicação).
--
-- Sem RLS nova, sem tabela nova: só um update em coluna existente de `public.task`, que já é
-- escopada por `user_id = auth.uid()` desde 20260803121500.

update public.task
set
  is_quick = true,
  icon_key = coalesce(icon_key, 'pill')
where medication_id is not null
  and (is_quick is distinct from true or icon_key is null);
