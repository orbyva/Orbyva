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

### Decisões do pedido de 2026-08-23 (recorrência semanal)

- **Nada de mecanismo novo de repetição: só a UI limitava.** O único motivo de uma consulta não poder
  ser semanal é `type RepeatOption = "once" | "monthly"` em
  `ConsultationQuickCreateDialog.tsx:19`. O resto do caminho já é agnóstico de frequência:
  `RecurrenceRule.frequency` aceita `"weekly"` (`src/types/tasks.ts:104`),
  `computeMissingOccurrences` tem os dois ramos semanais (`src/domain/tasks/recurrence.ts:176-182`),
  `materializeRecurringInstances` copia `is_consultation` e o `time` da regra para cada ocorrência
  (`src/api/tasks/tasks.ts:75-79`) e `computeVirtualOccurrences` não olha a frequência. **Nenhuma
  migration, nenhum código de domínio novo.**
- **Semanal com dias da semana, reusando o que a recorrência já expõe.** A regra sai como
  `{ frequency: "weekly", interval, time, weekdays? }`. Com nenhum dia marcado, repete no mesmo dia
  da semana da data da consulta a cada N semanas (`recurrence.ts:8-9`); com dias marcados, usa
  `computeMissingWeekdayOccurrences` (`:37-72`). Sem os dias, "fisioterapia segunda, quarta e sexta"
  — o caso semanal mais comum em consulta — exigiria três séries separadas. Os rótulos vêm de
  `WEEKDAY_LABELS` (`recurrence.ts:296`) e a dica é a mesma frase que `TaskRecurrenceRules.tsx:185`
  já usa, para não haver duas explicações do mesmo comportamento no app.
- **A repetição ganha "Termina em", e isso vale também para a mensal que já existia.** Hoje o atalho
  não oferece fim nenhum: uma consulta mensal criada por ele repete para sempre. Semanal multiplica
  isso por quatro e materializa uma `task` por semana desde a data inicial até hoje. O campo é
  opcional (`until` da regra), com "Sem fim" como padrão — mudança pequena que impede a feature nova
  de piorar um problema que já estava lá.
  - **Descartado — "depois de N ocorrências" (`count`)**: existe na regra e no formulário completo
    (`useTaskRecurrenceEditor.ts:16`), mas o atalho vive de ter poucos campos, e "até tal data" é
    como consulta de retorno costuma ser combinada. Quem precisa de `count` abre a tarefa no
    formulário completo, que já oferece.
- **O rótulo do intervalo passa a depender da unidade** ("A cada quantas semanas" / "A cada quantos
  meses"), em vez de um campo fixo em meses — sem isso o campo mente na opção nova.
- **Uma ocorrência por dia por série continua sendo o teto**, por causa do índice único
  `task_recurrence_occurrence_unique_idx` (`20260820100000_task_dedupe_doses_e_ocorrencias.sql:90`).
  Duas consultas no mesmo dia da mesma série não existem — o que é o comportamento certo aqui, mas
  fica registrado porque é uma restrição de banco, não de tela.

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
- [x] **Migration aplicada pelo usuário** (2026-08-23): o usuário rodou `supabase db push` e
      confirmou que `supabase/migrations/20260816190000_task_consultation.sql` está no banco remoto,
      junto com as das features 050, 051, 052, 055, 056 e 058. A coluna `task.is_consultation`
      existe, então agendar consulta e a seção Consultas do dashboard passam a funcionar de ponta a
      ponta.
      **O roteiro de conferência pós-push NÃO foi executado por esta sessão** — as duas consultas
      SQL leem o banco remoto e os quatro passos seguintes são teste de fumaça na interface; esta
      esteira não tem acesso a nenhum dos dois (navegador é proibido pela skill `next`). Tudo ficou
      registrado em `## Notas` como pendência explícita do usuário, com o SQL e os passos exatos.
      Nenhum deles está sendo dado como passado.

### Tarefas do pedido de 2026-08-23 (recorrência semanal)

- [x] `ConsultationQuickCreateDialog.tsx`: `type RepeatOption` ganha `"weekly"`, o `<Select>` de
      Repetição ganha `<SelectItem value="weekly">Repetir a cada X semanas</SelectItem>`, e o campo
      de intervalo (hoje `monthsInterval`, `:167-180`) passa a ser um `intervalValue` só, com o
      rótulo variando por unidade ("A cada quantas semanas" / "A cada quantos meses"). Verificação:
      `npm run build && npm run lint` — build limpo, lint 0 erros. Além disso (a skill `next` exige
      assertiva de comportamento, não só compilação): caso novo "repetição semanal troca o rótulo do
      intervalo e monta uma regra weekly" em `ConsultationQuickCreateDialog.test.tsx`, 6/6 passando
- [x] No mesmo arquivo: linha de dias da semana, visível só com `repeat === "weekly"`, com os sete
      botões alternáveis de `WEEKDAY_LABELS` (`src/domain/tasks/recurrence.ts:296`) e a dica
      "Nenhum dia marcado repete no mesmo dia da semana do prazo, a cada intervalo", copiada de
      `TaskRecurrenceRules.tsx:185`. Cada botão com `aria-pressed` e `aria-label` do dia por extenso
      (`WEEKDAY_NAMES_SHORT` não serve de nome acessível sozinho). Verificação:
      `npm run build && npm run lint` — limpos. Assertiva de comportamento: caso "dias da semana
      marcados viram `weekdays` ordenado" (7/7 no arquivo), que confere a linha só na semanal, os 7
      botões, `aria-pressed`, o nome acessível por extenso e a dica na tela. `TaskRecurrenceDialog` +
      `TaskFormFields` (56) seguem passando depois da extração da dica para `WEEKDAYS_EMPTY_HINT`
- [x] No mesmo arquivo: campo "Termina em" (`<input type="date">`, opcional, rótulo `FormLabel
      optional`), visível quando `repeat !== "once"`, alimentando `until` na regra — vale para
      semanal **e** para a mensal que já existia. Verificação: `npm run build && npm run lint` —
      limpos. Assertiva: caso "«Termina em» vira `until` na regra — vale também para a repetição
      mensal" (8/8 no arquivo), que também confere que o campo não existe na consulta única
- [x] `handleSave` monta a regra pelas três opções: `once` → `recurrence_rule: null`; `weekly` →
      `{ frequency: "weekly", interval, time: dueTime || null, ...(weekdays.length ? { weekdays } :
      {}), ...(endsOn ? { until: endsOn } : {}) }`; `monthly` → o objeto de hoje mais o `until`.
      O intervalo passa por `Math.max(1, parseInt(...) || 1)`, como já faz em `:65`. Verificação:
      `npm run build && npm run lint` — limpos. Assertiva: caso "semanal completa: dias + término na
      mesma regra, e intervalo inválido vira 1" (9/9 no arquivo) fecha a semanal com tudo junto; as
      outras duas opções já estavam cobertas (`once` → `null` no caso da consulta única, `monthly`
      no caso `:99-118` intacto)
- [x] Bordas e estados do dialog, que o pedido não menciona e a tela exige: "Termina em" anterior à
      data da consulta é barrado com mensagem `role="alert"` no campo (série vazia é pior que erro);
      trocar de `weekly` para `once` limpa dias e término do payload; reabrir o dialog depois de
      salvar volta ao padrão (`once`, sem dias, sem término); o botão de salvar continua desabilitado
      sem especialidade ou sem data, como hoje. Verificação: `npm run build && npm run lint` —
      limpos. Assertivas: 3 casos novos (`término anterior à data da consulta é barrado…`, `voltar de
      semanal para consulta única limpa dias e término`, `depois de agendar, o formulário volta ao
      padrão…`), 12/12 no arquivo; o botão desabilitado já era o primeiro caso do arquivo
- [x] Estender `src/pages/admin/tasks/__tests__/ConsultationQuickCreateDialog.test.tsx`: semanal sem
      dias marcados monta `{ frequency: "weekly", interval: 2, time: "08:00" }`; semanal com terça e
      quinta acrescenta `weekdays: [2, 4]` ordenado; "Termina em" vira `until` na regra **também** no
      caso mensal; o caso mensal existente (`:99-118`) continua passando sem alteração; conferir se
      o `screen.getByRole("combobox")` de `:107` ainda resolve para um só elemento e, se não,
      qualificar por nome. Verificação: `npm test src/pages/admin/tasks` — **52 arquivos / 529 testes
      / 0 falhas**. O arquivo foi de 5 para 12 casos; os 5 antigos seguem byte a byte como estavam, e
      o `getByRole("combobox")` sem nome continua resolvendo sozinho (só há um `combobox` no dialog —
      o `<SelectTrigger>` ganhou `aria-label="Repetição"` para os casos novos poderem qualificar)
- [x] Estender `src/domain/tasks/__tests__/consultation.test.ts` com um `describe` semanal, no molde
      do mensal (`:33`): série toda terça a cada 1 semana gera as datas certas até hoje; a cada 2
      semanas pula a semana do meio; com `weekdays: [1, 3, 5]` gera três por semana; com `until` no
      passado para na data certa; ocorrência já materializada não é regerada. Verificação:
      `npm test src/domain/tasks` — **19 arquivos / 323 testes / 0 falhas** (o arquivo foi de 8 para
      13 casos). As datas esperadas foram tiradas do calendário de março/2026, não do output da
      implementação; `until` é conferido nos dois ramos (com e sem `weekdays`), que cortam a série em
      pontos diferentes do código (`break` vs `continue`)
- [x] Estender `src/pages/admin/tasks/__tests__/AgendaGrid.consultation.test.tsx`: uma consulta
      semanal aparece com o estetoscópio em **cada** dia da série dentro da grade do mês — nas
      ocorrências já materializadas e na prévia virtual pontilhada — sem duplicar bolinha em nenhum
      dia (a não-regressão da 074). Fixar a data do sistema como o arquivo já faz. Verificação:
      `npm test src/pages/admin/tasks` — **52 arquivos / 531 testes / 0 falhas** (o arquivo foi de 6
      para 8 casos). Os dois casos novos varrem a grade por célula de dia (helper `dayCell`): a série
      toda terça rende 5 chips (origem + materializada de 11/08 + prévias de 18/08, 25/08 e 01/09),
      **um por dia** — a materializada não ganha prévia por cima —, e a série seg/qua/sex rende 15,
      caindo nos três dias marcados e em nenhum outro (terça e quinta vazias)
- [x] **Tarefa acrescentada na checagem de satisfação**: a série semanal tinha artefato para as datas
      (`consultation.test.ts`) e para a tela (`AgendaGrid.consultation.test.tsx`), mas o **insert** só
      estava provado na frequência mensal — `tasks.recurring-materialization.test.ts` não tocava
      `weekly`. Acrescentar um caso com `{ frequency: "weekly", weekdays: [1,3,5] }` conferindo as
      linhas enviadas ao `insert`: datas, `is_consultation: true` e o horário da regra.
      Verificação: `npm test src/api` — **18 arquivos / 225 testes / 0 falhas**. O caso novo
      ("consulta semanal com dias marcados materializa cada sessão da semana como consulta") prova as
      5 linhas enviadas ao `insert` (05, 07, 10, 12 e 14/08), cada uma com `is_consultation: true`,
      `due_time: "07:30"` vindo da regra e `recurrence_rule: null`
- [x] `npm run build && npm run lint && npm test && npm run check:bundle` limpos, com a contagem de
      testes registrada aqui — `build`: `tsc -b` + Vite sem erro; `lint`: **0 erros** (81 warnings de
      `react-refresh/only-export-components`, todos pré-existentes e nenhum em arquivo desta
      feature); `npm test`: **218 arquivos / 2314 testes / 0 falhas** (baseline da esteira era
      218/2299 — os 15 a mais são os desta rodada: 7 no dialog, 5 no domínio, 2 na Agenda e 1 na
      materialização); `check:bundle`: "Bundle budget OK"

## Prompts
- 2026-08-23 — "- agendar consulta deve permitir também recorrência semanal"
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
- ~~Não vai para `done/` mesmo com o pedido cumprido: sobra a tarefa de `supabase db push`.~~
  **Superado em 2026-08-23**: o usuário rodou o push e confirmou. A feature foi para `done/`.
- **PENDÊNCIA DO USUÁRIO — conferência pós-push (2026-08-23).** A migration está aplicada, mas o
  roteiro abaixo **não foi executado nem visto passar por esta sessão** (SQL no banco remoto e teste
  de fumaça na interface — nenhum dos dois é alcançável daqui).

  No SQL editor:
  ```sql
  -- a coluna chegou, com o default certo e sem alterar nada do que já existia
  select column_name, data_type, is_nullable, column_default
    from information_schema.columns
   where table_schema = 'public' and table_name = 'task' and column_name = 'is_consultation';
  -- esperado: boolean, NO, false

  -- nenhuma tarefa antiga mudou de comportamento: tem de devolver 0
  -- (rodar ANTES de agendar a primeira consulta)
  select count(*) from public.task where is_consultation;
  ```

  No app (teste de fumaça, 4 passos):
  1. agendar uma consulta única pelo CTA do dashboard de Saúde e ver o **estetoscópio** no dia certo
     do calendário geral (`/tasks/agenda`);
  2. agendar uma recorrente mensal e conferir que as ocorrências passadas foram materializadas já
     com a flag (aparecem com estetoscópio, não como tarefa comum);
  3. marcar uma ocorrência como concluída e ver **"Compareceu às HH:mm"** no diálogo de ocorrências
     da série;
  4. conferir que uma tarefa comum e uma medicação continuam renderizando como antes — é a
     não-regressão da 049.

  Os quatro passos já têm equivalente automatizado passando (`AgendaGrid.consultation.test.tsx`,
  `tasks.recurring-materialization.test.ts`, `TaskList.consultation-occurrences.test.tsx`), então o
  que o roteiro acrescenta é só a confirmação contra o Postgres real e o dado do usuário.
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
### Rodada de 2026-08-23 (recorrência semanal)

- **Checagem de satisfação** (skill `next`) do pedido "agendar consulta deve permitir também
  recorrência semanal". Rastreabilidade item a item, cada um com artefato que rodou:
  - *"agendar consulta"* — é o atalho `ConsultationQuickCreateDialog`, e não o formulário completo
    (que já oferecia semanal). `ConsultationQuickCreateDialog.test.tsx`: **12 casos**, de 5 para 12.
  - *"recorrência semanal"* — a opção existe e monta a regra certa: caso "repetição semanal troca o
    rótulo do intervalo e monta uma regra weekly" (`{ frequency: "weekly", interval: 2, time:
    "08:00" }`) e "semanal completa: dias + término na mesma regra" (`weekdays: [1,3,5]` +
    `until`).
  - *a série semanal realmente acontece* — três provas em camadas diferentes:
    `consultation.test.ts` (as datas: toda terça, a cada 2 semanas, seg/qua/sex, `until`,
    já materializada); `tasks.recurring-materialization.test.ts` (as linhas que chegam ao `insert`,
    com `is_consultation: true` e o horário da regra); `AgendaGrid.consultation.test.tsx` (o
    estetoscópio em cada dia da série no calendário geral, materializadas e prévias, uma bolinha por
    dia).
  - *"também"* (semanal **soma**, não substitui) — o caso mensal de `:99-118` continua no arquivo,
    sem uma linha alterada, e passando; e o "Termina em" novo vale para a mensal também (caso
    "«Termina em» vira `until` na regra").
  - Suíte completa: **218 arquivos / 2314 testes / 0 falhas**; `check:bundle` OK. Numa das rodadas
    `TaskList.form-panel.test.tsx` estourou o `testTimeout` de 5s sob carga total e passou isolado
    em 2,2s — intermitência conhecida da esteira, não regressão.
- Confirmado no código antes de construir, como o refino previa: **nenhuma migration**.
  `recurrence_rule` é `jsonb` sem constraint (`20260803121500_tasks_projects.sql:57`), e
  `materializeRecurringInstances` não olha a frequência — só chama `computeMissingOccurrences` e
  copia o subconjunto de campos (incluindo `is_consultation` e o `time` da regra).
- Desvio pequeno: o intervalo padrão passou a depender da unidade (`DEFAULT_INTERVAL`: 1 semana / 6
  meses). Com um valor só, escolher "semanal" deixava "a cada 6 semanas" pré-selecionado, que não é
  cadência de fisioterapia nenhuma.
- Desvio pequeno: em vez de copiar a frase da dica de dias da semana, ela virou
  `WEEKDAYS_EMPTY_HINT` em `src/domain/tasks/recurrence.ts`, usada pelo formulário completo
  (`TaskRecurrenceRules.tsx`) e pelo atalho. Era exatamente o que a decisão pedia ("não haver duas
  explicações do mesmo comportamento"), só que garantido pelo compilador. `WEEKDAY_NAMES_LONG`
  também passou a ser exportado — é o nome acessível dos botões de dia, já que `WEEKDAY_LABELS` é só
  a inicial ("S" é segunda e sábado).
- A Repetição continua sendo `<Select>`, não radio group, embora a skill `form-design` recomende
  radio até ~5 opções: o plano especificava o `<SelectItem>` novo, e trocar o widget invalidaria o
  caso mensal existente que a tarefa manda preservar intacto. O `<SelectTrigger>` ganhou
  `aria-label="Repetição"` para os casos novos poderem qualificar o `getByRole("combobox")` — o
  antigo, sem nome, continua resolvendo sozinho.
- Validação de "Termina em" anterior à data da consulta segue o molde da 096
  (`aria-invalid` + `role="alert"` + validação no blur): uma série que termina antes de começar
  passaria por `computeMissingOccurrences` e devolveria nenhuma ocorrência — o usuário pediria
  recorrência e receberia consulta única, sem aviso.
- A propagação em `materializeRecurringInstances` não tinha teste nenhum antes (a função é privada, só alcançável por `fetchTasks`). Criado `src/api/__tests__/tasks.recurring-materialization.test.ts`, com um Supabase falso que **guarda as linhas enviadas no insert** — assere as datas geradas, `is_consultation: true` em cada ocorrência, a não-regressão de `is_medication` (049) e que ocorrência já materializada não é recriada.
