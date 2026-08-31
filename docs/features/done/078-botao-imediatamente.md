---
prompt: |
  - botão 'IMEDIATAMENTE' ao clicar nele, inicia ela no timer, se ela tiver duração (o que quero que todas tenham) já preenche o prazo com a data do dia + hora do dia + duração estimada
---

# 078 — Botão "Imediatamente": começa agora e define o prazo

## Contexto

Hoje, colocar uma tarefa em execução são três gestos separados: apertar o Play (inicia o timer),
abrir o quick-edit de prazo e escolher a data, e abrir de novo pra pôr o horário. O pedido é
colapsar isso num botão só — clicou, o timer roda e o prazo já fica sendo "agora + a duração
estimada", que é quando a tarefa deveria estar pronta.

O que já existe:
- **Timer**: `startTimer(taskId)` em `src/api/tasks/timeEntries.ts:71` — para o timer anterior antes
  de iniciar o novo (só um "Live" por vez, garantido também no banco pelo índice único parcial
  `task_time_entry_one_running_idx`, `20260803121500_tasks_projects.sql:140`). O acesso pela UI é o
  contexto `useActiveTimer` (`src/hooks/useActiveTimer.tsx`, provider montado em
  `src/layouts/AdminLayout.tsx`), com `start`/`stop`/`refresh`.
- **Onde o Play aparece hoje**: `TaskListRow` (`TaskViews.tsx:337-346`), `KanbanCard`
  (`TaskViews.tsx:764-774`), linhas de subtarefa (`SubtaskRowActions`, `:380-384`) e o player
  flutuante (`LiveWidget.tsx:174-186`, features `017`/`072`). Todos recebem `onToggleTimer` de fora;
  o handler `toggleTimer(task)` está **duplicado byte a byte** em `TaskList.tsx:154-165` e
  `ProjectDetail.tsx:198-209`. O Gantt e a Agenda **não** têm botão de timer.
- **Duração**: `task.estimated_duration` em **minutos** (`src/types/tasks.ts:107`), editada pelo
  `TaskDurationQuickPick` (presets 15/30/60/90/120/240 + personalizado). `is_quick` (feature `070`)
  é o oposto dela: tarefa pontual não tem duração, e as duas são mutuamente exclusivas na UI.
- **Não existe** nenhum helper que combine `due_date` + `due_time` num `Date`, nem aritmética de
  minutos: `isDoseLate` (`src/domain/tasks/medication.ts:10-14`) monta isso inline, e
  `src/domain/tasks/duration.ts` só trabalha em granularidade de dia. `date-fns` está no projeto mas
  `addMinutes` nunca foi usado.

## Decisões

- **O botão é uma ação nova ao lado do Play**, nas mesmas superfícies onde o Play já está
  (`TaskListRow`, `KanbanCard`, linhas de subtarefa). Ícone `Zap` + `ActionTooltip` "Imediatamente —
  começa agora e marca o prazo", com `aria-label` completo. O rótulo textual "IMEDIATAMENTE" não
  cabe numa linha densa da lista; o texto por extenso vive no tooltip e no `aria-label`.
  - **Descartado — pôr no `LiveWidget`**: o player só aparece quando já existe um timer rodando; a
    ação existe justamente para o momento em que não existe.
- **Um clique = três efeitos, numa transação lógica só**: parar o timer anterior (se houver),
  iniciar o desta tarefa, e gravar `due_date`/`due_time` = agora + duração. Se o `updateTask` do
  prazo falhar depois do timer ter começado, **o timer não é revertido** (o trabalho de fato começou)
  — o toast avisa que só o prazo não foi salvo. Reverter um timer já iniciado apagaria um registro de
  tempo real.
- **O cálculo mora numa função pura**, `computeImmediateSchedule(task, now)` em
  `src/domain/tasks/immediate.ts` (exportada por `src/domain/tasks/index.ts`), devolvendo
  `{ due_date, due_time, usedFallbackMinutes }`. Nada de aritmética de data espalhada no componente —
  é o mesmo motivo pelo qual `resolveTaskSchedule` já vive no domínio.
- **Tarefa sem duração cai num padrão de 30 min** (`DEFAULT_ITEM_DURATION_MINUTES`, já exportado de
  `src/domain/tasks/calendar.ts:87` e já usado pela agenda como duração implícita) e o toast diz que
  usou o padrão. Não bloquear a ação por falta de duração: o pedido é sobre velocidade.
- **Tarefa pontual (`is_quick`) recebe prazo = agora, sem somar nada.** Ela é um instante por
  definição (`070`); somar 30 minutos inventaria uma duração que a própria flag nega.
- **"o que quero que todas tenham"** — o usuário diz querer duração em todas as tarefas. **Não** vamos
  semear `estimated_duration: 30` em `emptyTask()`: isso daria duração falsa a toda tarefa nova e
  mudaria a barra do Gantt (`estimatedDurationDays`) e a altura do bloco na agenda de todo mundo, sem
  o usuário ter pedido essa mudança global. O fallback de 30 min do botão cobre o caso concreto.
  Registrado aqui como decisão consciente — se o usuário quiser mesmo o default global, é pedido novo.
- **Virada de dia é caso normal, não borda**: começar 23h50 uma tarefa de 30 min põe o prazo em
  00h20 do **dia seguinte**. A função pura resolve isso e o teste trava.
- **A duplicação de `toggleTimer` não é aumentada.** A lógica nova entra num hook compartilhado
  `useStartTaskNow()` (`src/hooks/useStartTaskNow.ts`), usado por `TaskList.tsx` e
  `ProjectDetail.tsx` — em vez de uma terceira e quarta cópia do handler. O `toggleTimer` existente
  fica como está (deduplicá-lo é limpeza para outra hora).
- **Depois de aplicar, a tela recarrega (`load()`)**, ao contrário do quick-edit de prazo de hoje: a
  tarefa passa a ter prazo "hoje" e **deve** pular para o bucket "Hoje" na hora — que é exatamente o
  que a feature `081` pede para o quick-edit. As duas precisam concordar.
- **Onde o botão não aparece**: tarefa concluída (mesma guarda do Play, `!done`) e ocorrência virtual
  da agenda (`virtual:`, não existe no banco).

## Tarefas

- [x] Criar `computeImmediateSchedule(task, now)` puro em `src/domain/tasks/immediate.ts` e exportar
      em `src/domain/tasks/index.ts`: devolve `{ due_date: "YYYY-MM-DD", due_time: "HH:mm",
      usedFallbackMinutes: number | null }`, usando `estimated_duration`, ou `0` quando `is_quick`,
      ou `DEFAULT_ITEM_DURATION_MINUTES` quando não houver duração. Verificação: `npm run build`
- [x] Testar `computeImmediateSchedule` em `src/domain/tasks/__tests__/immediate.test.ts`: duração de
      90 min às 10h00 → hoje 11h30; sem duração → +30 min e `usedFallbackMinutes = 30`; `is_quick` →
      agora exato e sem fallback; **virada de dia** (23h50 + 30 min → amanhã 00h20); duração
      absurda (1440 min) cai no dia seguinte; minutos formatados com dois dígitos.
      Verificação: `npm test src/domain/tasks`
- [x] Criar `src/hooks/useStartTaskNow.ts`: usa `useActiveTimer().start`, calcula o horário com
      `computeImmediateSchedule`, chama `updateTask({ id, due_date, due_time })`, dispara os toasts e
      devolve `{ startNow, pending }`. O erro do timer e o erro do prazo têm mensagens distintas.
      Verificação: `npm run build && npm run lint`
- [x] Testar o hook em `src/hooks/__tests__/useStartTaskNow.test.tsx`: caminho feliz chama `start` e
      `updateTask` com o payload certo; falha no `start` **não** chama `updateTask`; falha no
      `updateTask` **não** desfaz o timer e mostra o toast específico; `pending` bloqueia clique
      duplo. Verificação: `npm test src/hooks`
- [x] Toast de sucesso informativo: "Começou agora · prazo 11:30" e, quando houve fallback, "sem
      duração estimada — usamos 30 min". Quando o `start` parou um timer de **outra** tarefa, o toast
      diz qual foi parada (hoje isso acontece em silêncio). Verificação: teste no arquivo do hook
- [x] `TaskViews.tsx`: prop nova `onStartNow?: (task: Task) => void` em `TaskListRow` e
      `KanbanCard`; botão `Zap` ao lado do Play, com `ActionTooltip` e `aria-label`, escondido quando
      a prop está ausente ou a tarefa está concluída (mesmo padrão opcional que `onDeleteAll` usa
      desde a `028`). Verificação: `npm run build && npm run lint`
- [x] `TaskViews.tsx`: mesma ação nas linhas de subtarefa (`SubtaskRowActions`), já que subtarefa é
      tarefa completa desde a `036`. Verificação: `npm run build && npm run lint`
- [x] Testes em `src/pages/admin/tasks/__tests__/TaskViews.test.tsx`: o botão aparece na linha e no
      card, some em tarefa concluída, some quando a prop não é passada, e tem nome acessível
      ("Imediatamente"). Verificação: `npm test src/pages/admin/tasks`
- [x] Ligar em `TaskList.tsx`: `useStartTaskNow()` + `onStartNow` nos três pontos que hoje passam
      `onToggleTimer`, com `load()` depois para a tarefa reagrupar no bucket "Hoje".
      Verificação: `npm run build && npm run lint`
- [x] Ligar em `ProjectDetail.tsx`, nos pontos equivalentes. Verificação: `npm run build && npm run lint`
- [x] Teste de fluxo em `src/pages/admin/tasks/__tests__/TaskList.*.test.tsx`: clicar em
      "Imediatamente" numa tarefa de "Sem prazo" com duração de 1h faz `updateTask` receber a data de
      hoje e o horário certo, o timer aparecer rodando, e a tarefa **mudar** para o bloco "Hoje" sem
      reload manual. Verificação: `npm test src/pages/admin/tasks`
- [x] Caso de borda por teste: tarefa pontual (`is_quick`) recebe prazo = agora e continua pontual
      (`estimated_duration` não é preenchida); tarefa que já tinha prazo tem o prazo **sobrescrito**
      (é o pedido) e o toast informa o prazo antigo. Verificação: `npm test src/pages/admin/tasks`
- [x] Conferir a largura da linha da lista e do card do Kanban no mobile com o botão a mais — a `072`
      já teve de apertar o `gap` do player por causa do terceiro botão. Ajustar se estourar.
      Verificação: `npm run build` + inspeção das classes
- [x] `npx tsc -p tsconfig.app.json --noEmit && npm run build && npm run lint && npm test`
      (+ `npm run check:bundle`), com a contagem registrada em `## Notas`
- [x] Verificação do pedido literal, por teste: um clique só, a partir da Lista, inicia o timer da
      tarefa **e** grava o prazo como data de hoje + hora de agora + duração estimada

## Prompts

## Notas

- **Onde o botão mora**: `src/pages/admin/tasks/TaskStartNowButton.tsx` (`TaskStartNowButton` +
  `START_NOW_LABEL`), não inline em `TaskViews.tsx`. É de propósito, para a `080` (formulário/linha
  de tarefa em painel denso) conseguir mover o botão inteiro sem reconstruir o comportamento —
  quem redesenhar o layout só precisa reposicionar esse componente e continuar passando
  `onStartNow`/`isStartingNow`.
- O componente traz o **próprio `TooltipProvider`**: o Radix (`@radix-ui/react-tooltip@1.1.8`)
  lança se `Tooltip` não tiver provider acima, e `TaskListRow`/`KanbanCard` são renderizados em
  contextos que nem sempre têm um (nos testes, por exemplo). Aninhar providers é inofensivo.
- **Desvio do plano (assinatura da prop)**: o plano dizia `onStartNow?: (task: Task) => void` em
  `TaskListRow`/`KanbanCard`; ficou `onStartNow?: () => void` (já bindada por quem renderiza),
  seguindo a convenção do `onToggleTimer` vizinho nos mesmos componentes. A versão parametrizada
  por tarefa existe onde já é o padrão: `SubtaskRowActions.onStartNow(subtask)`. Junto veio
  `isStartingNow` (booleano na linha/card, função em `SubtaskRowActions`), espelhando
  `isTimerRunning`, para desabilitar o botão enquanto a ação está em voo.
- **`computeImmediateSchedule` devolve um campo a mais** do que o plano listava (`minutes`, além de
  `due_date`/`due_time`/`usedFallbackMinutes`) — usado nos testes para provar que tarefa pontual
  soma zero, sem inferir isso do horário.
- **Ocorrência virtual da agenda já está coberta por construção**: `virtual:` só existe dentro de
  `AgendaGrid.tsx`, que não renderiza `TaskListRow`/`KanbanCard` nem passa `onStartNow`. Não foi
  preciso guarda extra — se algum dia a Agenda ganhar o botão, a guarda `isVirtualTask` tem de
  entrar junto.
- **O caso "tarefa concluída não mostra o botão" ficou no nível de componente**
  (`TaskViews.test.tsx`), não no fluxo de `TaskList`: a Lista filtra `done` para fora da visão
  padrão, então a asserção lá não provaria nada sobre a guarda.
- `load()` depois de aplicar funciona sem mexer no `frozenDueDatesRef`: o snapshot é re-tirado
  dentro do próprio `load()`, então a tarefa pula para "Hoje" na hora. É o comportamento com que a
  `081` precisa concordar quando for implementada (lá, para o quick-edit).
- **Verificação final** (20/08/2026): `npx tsc -p tsconfig.app.json --noEmit` limpo,
  `npm run build` OK, `npm run lint` 0 erros (80 warnings pré-existentes de
  `react-refresh/only-export-components`), `npm test` **198 arquivos / 2027 testes / 0 falhas**
  (baseline antes da feature: 195 / 1990), `npm run check:bundle` OK. O erro pós-teardown do
  focus-scope do Radix em `MedicationQuickCreateDialog.test.tsx` é intermitente e pré-existente.
