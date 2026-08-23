---
prompt: |
  - adicionar no player flutuante, quando tiver já uma atividade em andamento, um outro ícone de check. com hover/tooltip -> parar e marcar como concluído
---

# 072 — Player flutuante: parar e concluir a tarefa em um clique

## Contexto
O player flutuante é o `LiveWidget` (`src/components/LiveWidget.tsx`, feature `done/017`), montado
uma vez em `AdminLayout.tsx` (linha 237, dentro de `ActiveTimerProvider` e do `SidebarProvider`) e
visível em qualquer tela do app. Hoje ele tem **um** botão só: parar (`Square`) quando há timer
rodando, ou retomar (`Play`) quando não há — nesse segundo caso mostrando a última tarefa
interagida (`fetchLastInteractedEntry`) como atalho.

Falta o caminho mais comum depois de terminar uma sessão de trabalho: parar o timer **e** dar a
tarefa por concluída. Hoje isso exige parar no widget e depois ir até a Lista/Kanban/Agenda achar
a tarefa pra marcar como feita. O usuário pediu um segundo botão de check no player, com
hover/tooltip explicando "parar e marcar como concluído".

Conclusão de tarefa no projeto não tem API dedicada: é `updateTask({ id, status: "done" })`
(`src/api/tasks/tasks.ts:189`), que já grava `completed_at` e dispara os syncs de parcela
financeira (`syncLinkedInstallmentFromTask`) e de item de lista de compras
(`syncLinkedShoppingItemFromTask`). Os três call sites de status hoje (`TaskList.applyStatusChange`,
`ProjectDetail.applyStatusChange`, `AgendaGrid.toggleTaskDone`) são cópias do mesmo padrão
optimistic + rollback + toast de erro.

## Decisões
- **Botão de check só existe com timer rodando** (`runningEntry != null`). No estado "retomar"
  (timer parado + última tarefa interagida) o widget é um atalho de acesso rápido, não um controle
  de conclusão — "parar e concluir" não faz sentido sem nada rodando, e o pedido é explícito
  ("quando tiver já uma atividade em andamento").
- Se a tarefa cronometrada já estiver `status === "done"` (foi concluída por outra tela enquanto o
  timer rodava), o check não aparece — só o botão de parar. Evita um `updateTask` redundante.
- **Ordem da ação**: `stop()` primeiro, `updateTask({ id, status: "done" })` depois. Parar é o que
  fecha o registro de tempo; se a conclusão falhar, o pior caso é um timer parado com a tarefa
  ainda aberta — recuperável em qualquer tela. A ordem inversa deixaria a tarefa concluída com o
  timer rodando, que é o estado ruim.
- **Erros separados por etapa**, ambos via `useToast` + `getErrorMessage` (`@/lib/errors`), padrão
  do projeto: falha no `stop()` → "Não foi possível parar o timer." e nada é concluído; falha no
  `updateTask` depois do stop → "Timer parado, mas não foi possível concluir a tarefa." (a mensagem
  precisa dizer que o timer parou, senão o usuário clica de novo achando que nada aconteceu).
- **Reaproveitar `updateTask`**, sem criar API nova nem helper de status compartilhado: é o único
  choke point de conclusão e já carrega os side-effects de sync. Unificar as três cópias de
  `applyStatusChange` é refatoração desejável, mas fora do escopo deste pedido.
- **Sucesso dispara toast** `{ title: "Tarefa concluída!", duration: 2000 }` (padrão de
  `TaskList.tsx:467`). É o único feedback imediato: o widget some logo em seguida e a tela ao fundo
  não se atualiza sozinha (ver decisão de defasagem abaixo).
- **Tooltip**: `ActionTooltip` (`src/components/ActionTooltip.tsx`). Não precisa montar
  `TooltipProvider` — o widget está dentro do `SidebarProvider`, que já monta um
  (`src/components/ui/sidebar.tsx:134`). Aplicar tooltip também no botão de parar/retomar existente,
  que hoje só tem `aria-label`, pra os dois controles ficarem consistentes.
- **Mobile não tem hover**: o tooltip é bônus de desktop; a acessibilidade continua garantida pelo
  `aria-label` ("Parar e marcar como concluída"). Nada de texto visível no pill — o espaço já é
  disputado pelo título truncado e pelo cronômetro.
- **Estado de carregamento**: enquanto a ação roda, os dois botões ficam `disabled` e o check vira
  `Loader2` girando (mesmo padrão de `TaskIconPicker`). Sem isso, dois cliques rápidos disparam dois
  `stop()`/`updateTask` concorrentes.
- **Depois de concluir, o widget deve sumir sozinho**: com `runningEntry` nulo, o efeito refaz
  `fetchLastInteractedEntry` + `fetchTaskById`, e a regra já existente (`!isRunning && task.status
  === "done" → return null`) esconde o pill. Isso precisa acontecer sem recarregar a página —
  garantir que o estado local `task` não fique preso na versão antiga (`status: "todo"`).
- **Defasagem das telas abertas é aceita nesta feature**: `TaskList`/`ProjectDetail`/`AgendaGrid`
  guardam as tarefas em `useState` local e não têm como saber de uma conclusão feita pelo widget
  global (o projeto não tem event bus nem React Query). A lista se corrige no próximo `load()`.
  Introduzir um barramento global só pra isso é um padrão novo desproporcional ao pedido — fica
  registrado aqui como conhecido, a revisitar se incomodar na prática.
- **Sem cascata em subtarefas e sem tratamento especial de recorrência**: concluir pelo player é
  uma conclusão comum: subtarefas não são tocadas (o app inteiro não cascateia hoje) e uma
  ocorrência materializada de série conclui só a própria linha, com `collapseRecurringSeries`
  levando a Lista pra próxima ocorrência — mesmo comportamento de concluir pelo checkbox.

## Tarefas
- [x] Em `src/components/LiveWidget.tsx`, criar o handler `stopAndComplete()` — `await stop()` e
      depois `await updateTask({ id: activeEntry.task_id, status: "done" })` — com estado local
      `completing` controlando `disabled` dos botões.
- [x] Adicionar o botão de check (`Check`/`CheckCircle2` do lucide) ao lado do botão de parar,
      renderizado só quando `isRunning && task.status !== "done"`, com
      `aria-label="Parar e marcar como concluída"` e `Loader2` girando enquanto `completing`.
- [x] Envolver o botão novo em `ActionTooltip` com o label "Parar e concluir", e envolver também o
      botão de parar/retomar existente ("Parar timer" / "Retomar timer").
- [x] Tratamento de erro em duas etapas no `stopAndComplete`: `try/catch` separado pro `stop()` e
      pro `updateTask`, cada um com seu toast destrutivo via `getErrorMessage`, e `completing`
      voltando a `false` no `finally`.
- [x] Toast de sucesso `{ title: "Tarefa concluída!", duration: 2000 }` após o `updateTask` passar.
- [x] Garantir que o widget some sozinho depois de concluir: conferir que o estado local `task` é
      refeito (ou zerado) quando `runningEntry` cai pra `null`, sem depender de reload — ajustar os
      efeitos de `fetchLastInteractedEntry`/`fetchTaskById` se estiverem servindo dado velho.
- [x] Conferir o layout com três controles em viewport estreita (barra mobile, `inset-x-3`): o
      título precisa continuar truncando e os botões não podem quebrar linha — ajustar `gap`/
      `shrink-0` se necessário.
- [x] Criar `src/components/__tests__/LiveWidget.test.tsx` (Testing Library/jsdom, mockando
      `@/api/tasks` e `@/hooks/useActiveTimer` no molde de `src/pages/admin/tasks/__tests__/`):
      com timer rodando, o botão "Parar e marcar como concluída" aparece; clicar chama `stop` e
      depois `updateTask` com `{ status: "done" }`, nessa ordem.
- [x] Teste: sem timer rodando (estado "retomar"), o botão de check **não** é renderizado; e com
      timer rodando numa tarefa que já está `done`, também não.
- [x] Teste: `updateTask` falhando depois do `stop` mostra toast destrutivo com a mensagem de
      "timer parado, mas não foi possível concluir" e os botões voltam a ficar habilitados
      (`completing` não trava).
- [x] Teste: depois de concluir com sucesso, o widget deixa de renderizar (rerender com
      `runningEntry: null` e a tarefa `done`).
- [x] `npx tsc -p tsconfig.app.json --noEmit && npm run build && npm run lint && npm test` (+ `npm run check:bundle`).

## Prompts

## Notas
- **Rastreabilidade do prompt** (sem Chrome; tudo em `src/components/__tests__/LiveWidget.test.tsx`,
  11 testes): "no player flutuante" → os testes renderizam o próprio `LiveWidget`; "quando tiver já
  uma atividade em andamento" → "com timer rodando, mostra o botão…" + "sem timer rodando (estado
  retomar), o botão de concluir não é renderizado" + "timer rodando numa tarefa já concluída também
  não mostra o botão"; "um outro ícone de check" → assert em `lucide-check` no `svg` do botão, com o
  botão de parar ao lado; "com hover/tooltip" → "hover no check revela o texto «Parar e concluir»";
  "parar e marcar como concluído" → "clicar para o timer e só então conclui a tarefa, nessa ordem"
  (`invocationCallOrder` de `stop` < `updateTask`, chamado com `{ id, status: "done" }`). Que
  `updateTask({status:"done"})` carimba `completed_at` já é provado pela 071 em
  `src/api/tasks/__tests__/updateTask-shopping-sync.test.ts` — reusado, não reprovado.
- **Verificação final**: `tsc -p tsconfig.app.json --noEmit` limpo, `npm run lint` 0 erros (78
  warnings pré-existentes de react-refresh), `npm run build` OK, `npm run check:bundle` OK
  (`ActionTooltip` continua num chunk de 0,2 KB), `npm test` 175 arquivos / 1742 testes / 0 falhas
  (era 174 / 1731 antes — a diferença são os 11 testes desta feature).
- **Mensagem de erro pós-`stop` foi para o título do toast**, não para a descrição como as Decisões
  sugeriam: `getErrorMessage(error, fallback)` devolve a mensagem do próprio erro quando ela não
  parece técnica, o que descartaria o fallback e apagaria justamente o "Timer parado" que o usuário
  precisa ler. Ficou `title: "Timer parado, mas não foi possível concluir a tarefa."` +
  `description: getErrorMessage(error, "Tente concluir pela lista de tarefas.")`.
- **O sumiço do widget tem dois caminhos, não um.** O caminho feliz é o previsto nas Decisões: com
  `runningEntry` nulo há um render intermediário em que `activeTaskId` fica `null` (o `lastEntry`
  ainda não chegou), o efeito zera `task`, e o refetch seguinte já traz a tarefa concluída. Mas
  `ActiveTimerProvider.refresh()` engole erros — se ele falhar, `runningEntry` continua preenchido e
  o `task` velho (`status: "todo"`) manteria o check ali, convidando a um `updateTask` redundante.
  Por isso `stopAndComplete` também marca `task` como `done` localmente; teste "se o timer não zerar
  (refresh falhou)…" cobre exatamente esse caminho.
- Botão de concluir renderiza com `isRunning || completing`: entre o `stop()` (que já zera
  `runningEntry`) e o fim do `updateTask` o botão sumiria no meio da ação, levando o spinner junto.
- Layout: o grupo de controles ganhou `flex-nowrap` e `gap-1.5` (era `gap-2`) e cada botão ganhou
  `shrink-0`, para o terceiro controle caber na barra mobile sem empurrar o cronômetro para outra
  linha. Quem cede espaço continua sendo o título, que trunca.
