-- Backfill da feature 073: o ícone passa a ser propriedade da **série** recorrente, então as
-- ocorrências já materializadas herdam o ícone da origem.
--
-- Até a 073, `materializeRecurringInstances`/`materializeLinkedInstances` (`src/api/tasks/tasks.ts`)
-- copiavam só um subconjunto dos campos da origem e deixavam `icon_key`/`icon_url` de fora: a
-- ocorrência real nascia **sem** ícone, enquanto a ocorrência virtual do mesmo dia na Agenda (spread
-- da origem, nunca persistida) aparecia **com** ele. A partir da 073 o código copia o ícone na
-- materialização e `propagateIconToSeries` espalha qualquer edição para a série inteira — mas nada
-- disso alcança as linhas criadas antes desta migration. Sem este backfill, a linha do tempo do
-- `SeriesOccurrencesDialog` e a visão "Concluídas" ficariam com a mesma série metade com ícone,
-- metade sem.
--
-- Pré-requisito (aplicar **depois** desta):
--   - 20260814010000_task_icon.sql (035) — `task.icon_key` / `task.icon_url`
--
-- Escopo: **só** ocorrências (`recurrence_origin_id not null`) que ainda estão com os dois campos
-- de ícone nulos. Ocorrência com ícone próprio escolhido à mão fica como está — o backfill preenche
-- buraco, não sobrescreve decisão de usuário; daqui pra frente é `propagateIconToSeries` que
-- uniformiza a série na próxima edição. Origens nunca são tocadas: elas são a fonte do ícone.
-- Cobre de graça as duas famílias de série, porque recorrência simples e série vinculada à
-- Recorrência Financeira (feature 002) gravam as duas `recurrence_origin_id`.
--
-- `occurrence.user_id = origin.user_id` é redundante no dado (a origem é sempre do mesmo dono, e a
-- FK é `on delete cascade`), mas é barato e garante que nenhum ícone cruze de usuário mesmo se
-- algum dado antigo estiver torto.
--
-- Idempotente por construção: depois da primeira passagem a ocorrência tem ícone, então
-- `icon_key is null and icon_url is null` deixa de casar e a segunda aplicação não atualiza linha
-- nenhuma (nem mexe em `updated_at`).
--
-- Sem coluna nova, sem tabela nova, sem RLS nova: só um update em colunas existentes de
-- `public.task`, que já é escopada por `user_id = auth.uid()` desde 20260803121500.

update public.task as occurrence
set
  icon_key = origin.icon_key,
  icon_url = origin.icon_url
from public.task as origin
where occurrence.recurrence_origin_id = origin.id
  and occurrence.user_id = origin.user_id
  and occurrence.icon_key is null
  and occurrence.icon_url is null
  and (origin.icon_key is not null or origin.icon_url is not null);
