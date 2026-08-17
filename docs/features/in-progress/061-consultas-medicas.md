---
prompt: |
  - SUB-MÓDULO DE VIDA.SAÚDE
    - CONTROLAR MEDICAMENTOS
    - CONSULTAS (VIRAM EVENTOS NO CALENDÁRIO GERAL)
    - E PROGRESSO NO CUIDADO COM O PRÓPRIO CORPO
      - CONTROLE DE NOTIFICAÇÕES PARA ALIMENTAÇÃO
      - CONTROLE DE NOTIFICAÇÕES PARA INGESTÃO DE ÁGUA
      - TUDO NO FUTURO VAI DAR UMA PUSH NOTIFICATION PARA O USUÁRIO
---

# 061 — Consultas médicas no calendário geral

## Contexto
O usuário pediu que consultas "virem eventos no calendário geral". O app tem duas entidades de tempo: `task` (data + hora opcional, com status e recorrência) e `project_event` (timestamp, obrigatoriamente ligado a um projeto, sem status). Uma consulta é pessoal e precisa ser marcada como comparecida, o que a coloca do lado de `task`. Esta feature adiciona a flag `is_consultation`, um atalho de criação e a renderização distinta no calendário, reusando toda a materialização de recorrência que já existe.

## Decisões
- **Consulta é `task` com flag `is_consultation`**, espelhando exatamente o que a 049 fez com `is_medication`. Ganha de graça: aparição no calendário geral (`groupCalendarItemsByDay` já recebe as tasks), recorrência via `recurrence_rule` + `materializeRecurringInstances` para consultas periódicas, e `completed_at` marcando o comparecimento com hora real.
  - **Descartado — `project_event`**: é escopo de projeto (`project_id` obrigatório) e não tem `status` nem `completed_at`, então não daria para marcar "compareci". Consulta não é bloco de agenda de projeto.
  - **Descartado — tabela `consultation` própria**: hoje os campos que ela teria (especialista, local) cabem em `title`/`description`, e uma tabela nova exigiria replicar materialização de recorrência e a junção no calendário. Se depois surgir demanda real de histórico clínico (anexar exames, encadear retornos), aí sim ela se justifica — com o mesmo padrão de vínculo `entidade → task` que a 064 vai estabelecer para medicação.
- **Especialista vai no `title`, local e preparo vão na `description`.** O `title` é o único campo que o calendário renderiza na célula do dia, então "Cardiologista — Dr. Silva" é o que precisa estar visível; abrir a tarefa mostra o resto. Sem coluna nova: uma coluna `specialist` em `task` só faria sentido para uma fração das linhas da tabela.
- **Sem RLS nova**: `task` já tem as políticas por `user_id = auth.uid()`, e a flag não muda isso.

## Tarefas
- [x] Criar a migration `supabase/migrations/20260816190000_task_consultation.sql` adicionando `is_consultation boolean not null default false` em `public.task` — espelhando `20260816120000_task_medication.sql`, que adiciona `is_medication` — + harness `supabase/tests/task_consultation/` validando em Postgres 16 descartável
- [x] Adicionar `is_consultation?: boolean` ao tipo `Task` em `src/types/tasks.ts`
- [x] Em `src/api/tasks/tasks.ts`, dentro de `materializeRecurringInstances`, propagar `is_consultation` para cada ocorrência criada (mesma linha em que `is_medication` já é copiado) — coberto por `src/api/__tests__/tasks.recurring-materialization.test.ts`
- [x] Criar `src/pages/admin/tasks/ConsultationQuickCreateDialog.tsx`, espelhando `MedicationQuickCreateDialog.tsx`: campos especialidade + profissional (compõem o `title`), data, horário, "repetir a cada N meses" (opcional, vira `recurrence_rule`) e local/preparo (vira `description`); submete via `createTask` com `is_consultation: true` — coberto por `__tests__/ConsultationQuickCreateDialog.test.tsx` (5 casos) e pelo helper puro `src/domain/tasks/consultation.ts` (`buildConsultationTitle`)
- [x] Adicionar a seção "Consultas" e o botão "Agendar consulta" no `HealthDashboard.tsx` (criado na 060), abrindo o dialog acima — coberto por 3 casos novos em `HealthDashboard.flow.test.tsx` (estado vazio com CTA, agendar pelo CTA e ver a consulta na seção, dose e consulta convivendo sem trocar de seção)
- [x] Em `src/pages/admin/tasks/AgendaCalendar.tsx` (e no componente de célula que ele usa), renderizar itens com `is_consultation === true` com ícone `Stethoscope` e a cor `--health`, em vez do checkbox padrão — feito em `AgendaGrid.tsx` (`ConsultationMarker`, usado por `TaskChip`, inclusive na prévia virtual) e `AgendaHourGrid.tsx` (`TimedTaskBlock`, com a borda do bloco em `hsl(var(--health))`); coberto por `__tests__/AgendaGrid.consultation.test.tsx` (6 casos: consulta no dia certo, distinção de tarefa comum e medicação, bloco na grade de horas com a cor de Saúde, ocorrências materializadas de uma série, prévia virtual reconhecida, série comum sem regressão)
- [x] No diálogo de ocorrências de série (`TaskList.tsx` e `ProjectDetail.tsx`), tratar `is_consultation` como a 049 trata `is_medication`: ocorrência `done` exibe "Compareceu às HH:mm" a partir de `completed_at`, e a lista vazia exibe "Nenhuma consulta registrada ainda." — o dialog, que era duplicado byte a byte entre as duas telas, virou `src/pages/admin/tasks/SeriesOccurrencesDialog.tsx`; coberto por `TaskList.consultation-occurrences.test.tsx` (4 casos) e `ProjectDetail.consultation-occurrences.test.tsx` (2), com a não-regressão da 049 provada pelos testes de medicação existentes, que seguem passando sem alteração
- [x] Estender `HealthSummary` em `src/types/health.ts` com `nextConsultation: Task | null` e preencher em `loadHealthSummary` (`src/api/health.ts`), com a próxima task `is_consultation = true` e `status = 'todo'` — coberto por 4 casos novos em `src/api/__tests__/health.test.ts` (forma da consulta por flag, consulta mais próxima, descarte de passada/comparecida/de outro usuário, e as duas flags não se misturando)
- [x] `npm run build` — limpo (`tsc -b` sem erros); `npm run check:bundle` também: "Bundle budget OK"
- [x] `npm run lint` — 0 erros (13 warnings pré-existentes de `react-refresh/only-export-components`, nenhum em arquivo desta feature)
- [x] `npm run test` — cobre apenas o domínio puro: adicionar caso em `src/domain/tasks/` verificando que uma série marcada como consulta gera ocorrências nas datas esperadas via `computeMissingOccurrences` — feito em `src/domain/tasks/__tests__/consultation.test.ts` (retorno a cada 3 meses: datas geradas, ocorrência já materializada, retorno que ainda não chegou, `until`, série sem repetição)
- [x] Verificação manual no navegador: substituída por cobertura automatizada — a skill `next` proíbe Chrome como rede de segurança, mesmo caminho que a 049 tomou. Cada item do roteiro tem hoje um artefato: consulta não recorrente no dia certo do calendário geral com o estetoscópio (`AgendaGrid.consultation.test.tsx`, casos 1 e 3); recorrente mensal com as ocorrências materializadas (`tasks.recurring-materialization.test.ts` para o insert + `AgendaGrid.consultation.test.tsx` casos 4 e 5 para a exibição); "Compareceu às HH:mm" no histórico da série (`TaskList.consultation-occurrences.test.tsx` e `ProjectDetail.consultation-occurrences.test.tsx`); tarefa comum e medicação renderizando como antes (`AgendaGrid.consultation.test.tsx` caso 2 e 6 + os testes de medicação da 049, que passam sem alteração). O que **não** dá para cobrir sem banco (RLS, `not null default false`, idempotência da migration) está no harness `supabase/tests/task_consultation/run.sh`, em Postgres 16 real
- [ ] **Aguarda o usuário**: aplicar `supabase/migrations/20260816190000_task_consultation.sql` no
      banco remoto (`supabase db push`), junto com as das features 050, 051, 052, 055, 056 e 058
      ainda pendentes (a ordem do `push` já é a dos timestamps; esta é a última). Até lá a coluna
      `task.is_consultation` não existe no banco real: **agendar uma consulta falha** (o `insert`
      manda a coluna nova) e o dashboard de Saúde mostra erro em toast ao carregar a seção
      Consultas — nada quebra a tela, mas o fluxo não funciona de ponta a ponta. Depois de
      aplicada, conferir no SQL editor: `select is_consultation from task limit 1` responde (coluna
      existe) e `select count(*) from task where is_consultation` devolve 0 antes de qualquer
      consulta ser criada (as tarefas antigas herdaram `false`, sem update). Depois, no app: agendar
      uma consulta única e ver o estetoscópio no dia certo do calendário geral; agendar uma
      recorrente mensal e conferir que as ocorrências passadas foram materializadas com a flag;
      marcar uma como concluída e ver "Compareceu às HH:mm" no histórico da série; conferir que uma
      tarefa comum e uma medicação continuam renderizando como antes

## Prompts
- 2026-08-16 — "- SUB-MÓDULO DE VIDA.SAÚDE
  - CONTROLAR MEDICAMENTOS
  - CONSULTAS (VIRAM EVENTOS NO CALENDÁRIO GERAL)
  - E PROGRESSO NO CUIDADO COM O PRÓPRIO CORPO
    - CONTROLE DE NOTIFICAÇÕES PARA ALIMENTAÇÃO
    - CONTROLE DE NOTIFICAÇÕES PARA INGESTÃO DE ÁGUA
    - TUDO NO FUTURO VAI DAR UMA PUSH NOTIFICATION PARA O USUÁRIO"

## Notas
- **Recorte do prompt-mãe que esta feature cumpre**: o item "CONSULTAS (VIRAM EVENTOS NO CALENDÁRIO GERAL)", integralmente. Os demais itens são cumpridos por 062, 063 e 064.
- **Depende da 060** (o `HealthDashboard` e o `HealthSummary` precisam existir para receber a seção e o campo `nextConsultation`).
- Migration timestamp: o refino propunha `20260816120100`, mas esse valor cairia **antes** de migrations já commitadas e ainda não aplicadas (`20260816130000` a `20260816180000`, das features 050–058) — o Supabase CLI aplica por ordem de nome, então uma migration nova com timestamp anterior às pendentes é bookkeeping esquisito de graça. Adotado `20260816190000`, único e posterior a todas. Timestamps repetidos já causaram bug real do CLI — ver Notas de `docs/features/done/002-vinculo-tarefa-recorrencia-financeira.md`.
- A migration foi validada sem tocar no banco remoto: `bash supabase/tests/task_consultation/run.sh` sobe um Postgres 16 descartável em Docker com `public.task` no schema que a 049 deixou, aplica a migration duas vezes (idempotência) e assere coluna/default/`is_medication` intacta/RLS por `user_id`/`wipe_own_data`. Mesmo formato dos harnesses de `notes_core`, `note_links` e `note_canvas`. Rodados também dois controles negativos (sem a migration → falha na coluna; RLS desligada → falha no vazamento), pra provar que as assertivas não passam à toa. O `pg_isready` dos harnesses anteriores foi trocado por uma query real (`psql -tAc 'select 1'`): durante o bootstrap o initdb sobe um servidor temporário que responde ao `pg_isready` antes de o banco `orbyva` existir, e essa corrida quebrou a primeira execução aqui.
- `supabase db push` aplica direto no banco remoto (não há Supabase local neste projeto): confirmar com o usuário antes de rodar.
- Vitest neste repo cobre domínio puro, sem I/O — ele não valida RLS nem insert no Supabase. Por isso a verificação de banco desta feature é manual e está descrita passo a passo.
- **Checagem de satisfação** (skill `next`), contra o recorte do `prompt:` que esta feature cumpre — "CONSULTAS (VIRAM EVENTOS NO CALENDÁRIO GERAL)". Rastreabilidade item a item: *consulta existe como entidade* → harness em Postgres 16 (`OK: 20260816190000_task_consultation.sql validada em Postgres 16.`, com dois controles negativos falhando como esperado); *dá pra criar uma* → `ConsultationQuickCreateDialog.test.tsx` (5) + o fluxo ponta a ponta em `HealthDashboard.flow.test.tsx`; *vira evento no calendário **geral*** → `AgendaGrid.consultation.test.tsx` (6), no `AgendaGrid`, que é a Agenda de `/tasks/agenda` e a aba Agenda de Tarefas, não o dashboard de Saúde; *consulta periódica* → `tasks.recurring-materialization.test.ts` (o insert com a flag) + `consultation.test.ts` (as datas); *comparecimento* → `TaskList.consultation-occurrences.test.tsx` (4) e `ProjectDetail.consultation-occurrences.test.tsx` (2). Suíte completa: **1156 passando, 2 falhando** — as 2 são as pré-existentes e alheias de `src/lib/__tests__/currency.test.ts` (documentadas nas Notas da 049). `npm run check:bundle`: "Bundle budget OK".
- Não vai para `done/` mesmo com o pedido cumprido: sobra a tarefa de `supabase db push`, que é do usuário (aplica no banco remoto). Mesmo critério de 050, 051, 052, 055, 056 e 058.
- Uma consulta recorrente usa exatamente a mesma `recurrence_rule` das medicações; não há código de recorrência novo nesta feature, só a propagação da flag.
- Desvio do plano: o dialog "Ocorrências de..." era copiado byte a byte entre `TaskList.tsx` e
  `ProjectDetail.tsx` (herança da 049). Acrescentar o segundo tipo de série (consulta) dobraria a
  duplicação em dois arquivos, então ele virou o componente `SeriesOccurrencesDialog.tsx`, usado
  pelos dois. Os testes de medicação da 049 passaram sem alteração nenhuma — é a prova de que a
  extração foi neutra.
- Consulta **não** ganha o badge "Atrasada" da 049: `isDoseLate` compara `completed_at` com o
  horário agendado, o que é critério de dose (o remédio tem hora a cumprir). Chegar depois do
  horário marcado numa consulta em geral é a espera do consultório, não um atraso do usuário — o
  app não tem como julgar isso, então não exibe julgamento. Fica registrado caso alguém queira
  reabrir a discussão.
- A tarefa citava `AgendaCalendar.tsx`, mas esse arquivo é só um `PageShell` em volta de `AgendaGrid` — a renderização de chip/bloco mora em `AgendaGrid.tsx` (`TaskChip`) e `AgendaHourGrid.tsx` (`TimedTaskBlock`), que são os "componentes de célula" citados. O marcador virou `ConsultationMarker`, exportado de `AgendaGrid.tsx` e reusado pelos dois, pra não haver duas versões do mesmo ícone/cor.
- O teste do calendário fixa a data do sistema em 16/08/2026 (domingo) de propósito: a grade do mês fica entre 26/07 e 05/09, o que torna determinística a data da prévia virtual (05/09, um mês depois da origem em 05/08). Sem isso, se a ocorrência seguinte cai fora da grade o teste passaria ou falharia conforme o dia em que rodasse.
- Desvio de ordem: a tarefa do `HealthSummary.nextConsultation` (penúltima da lista) foi feita
  **antes** da seção "Consultas" no dashboard — a seção lê `summary.nextConsultation`, então na
  ordem escrita o TS não compilaria. As duas foram verificadas separadamente.
- `loadHealthSummary` foi refatorada num helper `fetchNextPendingTask(userId, flag, today)`, usado
  duas vezes em `Promise.all` — a consulta de medicação e a de consulta médica só diferem na flag,
  e duplicar a cadeia de `.eq/.gte/.order` seria duas fontes de verdade pro mesmo critério.
- Desvio do plano (pequeno, espelha a 049): `emptyTask()` em `src/domain/tasks/taskDraft.ts` também ganhou `is_consultation: false`, e o `toMatchObject` de `taskDraft.test.ts` foi atualizado. Sem isso o draft do form completo mandaria `undefined` para a coluna `not null` numa edição de consulta.
- A propagação em `materializeRecurringInstances` não tinha teste nenhum antes (a função é privada, só alcançável por `fetchTasks`). Criado `src/api/__tests__/tasks.recurring-materialization.test.ts`, com um Supabase falso que **guarda as linhas enviadas no insert** — assere as datas geradas, `is_consultation: true` em cada ocorrência, a não-regressão de `is_medication` (049) e que ocorrência já materializada não é recriada.
