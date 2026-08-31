---
prompt: |
  - ao alterar o prazo, ele não da um reload na lista de tarefas, colocando as prioridas, prazos cada um em cada caixa
---

# 081 — Alterar o prazo reagrupa a lista na hora

## Contexto

Isso não é um esquecimento: é uma decisão anterior, do próprio usuário, sendo revertida. Na feature
`done/029` (Notas, 2026-08-13) ele pediu o oposto — "para não mover o card ao editar o prazo" — e a
implementação criou o `frozenDueDatesRef`: um `Map<taskId, due_date>` tirado no último `load()` real
(`TaskList.tsx:167-183`, idêntico em `ProjectDetail.tsx:218-250`). `withFrozenDueDate`
(`TaskList.tsx:236-245`) troca o `due_date` vivo pelo congelado **só para efeito de ordenação e de
bucket**, e `handleDueChange` (`TaskList.tsx:545-559`) deliberadamente **não** chama `load()`:

```ts
await updateTask({ id: taskId, ...next });
setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, ...next } : t)));
```

Efeito de hoje: a data escrita no card muda na hora, mas o card não sai do lugar até o próximo
`load()` de verdade (salvar pelo form, excluir, mudar prioridade/projeto/ícone, F5, trocar de
filtro). `handlePriorityChange`, `handleProjectChange` e `handleIconChange` **chamam** `load()` — daí
a incoerência que o usuário está descrevendo: prioridade reagrupa, prazo não. E o `TaskQuadrant`
(painel "Por prioridade"/"Por prazo") recebe `pendingTasks` com o `due_date` **vivo** e re-bucketiza
na hora, então a mesma tela mostra dois comportamentos diferentes ao mesmo tempo.

Havia um motivo real por trás do congelamento: o quick-edit acontece **dentro de um popover ancorado
na linha**. Se a linha se move para outro bucket enquanto o popover está aberto, o popover salta ou
fecha no meio da edição — e o usuário ainda pode querer ajustar o horário e a duração, que ficam no
mesmo popover (`TaskDueQuickEdit.tsx`, features `031`/`041`).

## Decisões

- **A reversão é parcial e resolve os dois pedidos: o card reagrupa, mas só quando o popover
  fecha.** Enquanto o popover de prazo está aberto, a linha continua no lugar (a queixa da `029`);
  ao fechar, a lista se reorganiza e a tarefa cai na caixa certa (a queixa de agora). Nenhum dos dois
  pedidos precisa perder.
- **Como**: `frozenDueDatesRef` deixa de ser atualizado só no `load()` e passa a ser **invalidado por
  tarefa** quando o popover daquela linha fecha. `TaskDueQuickEdit` ganha `onOpenChange`, e
  `TaskList`/`ProjectDetail` removem a entrada do mapa e refazem o agrupamento (com `load()`, para
  também pegar o que mudou no servidor).
  - **Descartado — simplesmente apagar o `frozenDueDatesRef` e chamar `load()` no `onChange`**: é o
    que o pedido literal diz, mas reintroduz exatamente o bug que a `029` consertou (o popover salta
    no meio da edição, e escolher a data fecharia o acesso ao horário e à duração).
- **A mudança continua otimista.** O `setTasks` local de hoje fica: a data aparece no card na hora,
  antes de qualquer ida ao servidor. O que muda é só quando a **reordenação/rebucketização**
  acontece.
- **Erro no `updateTask` reverte o otimismo e não reagrupa nada** — hoje o `catch` mostra o toast mas
  deixa a data nova na tela. Isso é bug e entra no escopo.
- **Quando a tarefa sai da vista por causa do novo prazo, a UI diz onde ela foi.** Com o filtro
  "Hoje" ativo, mudar o prazo para semana que vem faz o card **sumir**; sem aviso isso parece perda
  de dado. Toast "Movida para «Esta semana»" (nome do bucket vindo de `AGENDA_BUCKET_LABELS`).
- **Escopo: Lista de `TaskList.tsx` e Lista de `ProjectDetail.tsx`.** Kanban agrupa por status e não
  é afetado (o mesmo handler serve, sem efeito visível). O popover do Gantt usa o mesmo
  `handleDueChange`; ele já tem `onDataChanged`/`load()` no caminho de arrastar a barra — conferir
  que o caminho do popover não fica duplicando recarga.
- **Coerência com a `079` (ordenar por última atualização) e a `078` (botão "Imediatamente")**: as
  três mexem em quando a lista se reordena. A `078` já decide recarregar na hora (a tarefa acabou de
  virar "hoje"); esta feature é a mesma regra aplicada ao quick-edit. Se `079` já tiver sido
  implementada, o reagrupamento tem de respeitar o `sortKey` escolhido, não voltar a ordenar por
  prazo à força.
- **Nada de migration** — é comportamento de tela.

## Tarefas

- [x] `TaskDueQuickEdit.tsx`: prop nova `onOpenChange?: (open: boolean) => void`, disparada pelo
      `Popover` (e também ao fechar por Esc ou clique fora). Verificação: `npm run build && npm run lint`
- [x] Teste em `src/pages/admin/tasks/__tests__/TaskDueQuickEdit.test.tsx`: `onOpenChange(true)` ao
      abrir e `onOpenChange(false)` ao fechar pelos três caminhos (selecionar data, Esc, clique
      fora). Verificação: `npm test src/pages/admin/tasks`
- [x] `TaskQuickFields.tsx`: repassar `onDueOpenChange` para o `TaskDueQuickEdit` (mantendo opcional,
      no padrão "presença de prop" já usado ali). Verificação: `npm run build`
- [x] `TaskViews.tsx`: propagar a prop nova em `TaskListRow`, `KanbanCard` e
      `CompletedTasksSection`. Verificação: `npm run build && npm run lint`
- [x] `TaskList.tsx`: `handleDueOpenChange(taskId, open)` — ao fechar, remove `taskId` de
      `frozenDueDatesRef` e chama `load()`. Verificação: `npm run build && npm run lint`
- [x] `TaskList.tsx`: corrigir o `handleDueChange` para **reverter** o `setTasks` otimista quando o
      `updateTask` falhar (hoje o toast aparece e a data errada fica na tela).
      Verificação: teste de falha da API em `TaskList.*.test.tsx`
- [x] `TaskList.tsx`: toast "Movida para «Bucket»" quando o bucket calculado pelo prazo novo for
      diferente do antigo, usando `bucketForDueDate` + `AGENDA_BUCKET_LABELS`.
      Verificação: `npm run build && npm run lint`
- [x] `ProjectDetail.tsx`: as mesmas três mudanças (handler de abertura, reversão no erro, toast).
      Verificação: `npm run build && npm run lint`
- [x] Teste central do pedido em `src/pages/admin/tasks/__tests__/TaskList.*.test.tsx`: uma tarefa em
      "Sem prazo" recebe prazo de hoje pelo quick-edit → **enquanto o popover está aberto** ela não
      se move; ao fechar, ela aparece dentro do bloco "Hoje" e sumiu de "Sem prazo".
      Verificação: `npm test src/pages/admin/tasks`
- [x] Teste do caso que a `029` consertou e que não pode regredir: com o popover aberto, mudar a data
      e depois o horário e a duração **na mesma abertura** — o popover não fecha nem salta, e as três
      mudanças são salvas. Verificação: `npm test src/pages/admin/tasks`
- [x] Teste do caso "some da vista": com o filtro "Hoje" ativo, mudar o prazo para a semana que vem
      tira o card da lista **e** mostra o toast dizendo para qual caixa foi.
      Verificação: `npm test src/pages/admin/tasks`
- [x] Teste de borda: **limpar** o prazo (valor `null`) devolve a tarefa para "Sem prazo" — é o caso
      que a `029` documenta como o mais comum e o que quebrou a primeira versão do freeze (`??` vs
      `.has()`). Verificação: `npm test src/pages/admin/tasks`
- [x] Conferir o caminho do Gantt (`TaskList.tsx:920`, `ProjectDetail.tsx:963`): o popover do card
      usa o mesmo `handleDueChange`; garantir que não passa a recarregar duas vezes (uma pelo
      `onDueOpenChange`, outra pelo `onDataChanged` do arrastar). Verificação: teste em
      `GanttChart.test.tsx`
- [x] Conferir a coerência com `TaskQuadrant`, que já re-bucketiza na hora: depois desta feature as
      duas metades da tela concordam. Verificação: teste de que quadrante e lista mostram a tarefa na
      mesma caixa depois de fechar o popover
- [x] Acrescentar em `docs/features/done/029-edicao-rapida-inline-na-lista-de-tarefas.md`, seção
      Notas, uma linha apontando que o congelamento total foi substituído pelo congelamento
      **enquanto o popover está aberto** por esta feature — sem esse rastro o `frozenDueDatesRef`
      volta a ser lido como bug na próxima sessão
- [x] `npx tsc -p tsconfig.app.json --noEmit && npm run build && npm run lint && npm test`, com a
      contagem registrada em `## Notas`
- [x] Verificação do pedido literal, por teste: alterar o prazo de uma tarefa deixa a lista com
      "prazos cada um em cada caixa" sem nenhum reload manual
- [x] (Aberta na checagem de satisfação, 2026-08-20) O `prompt:` fala em "**as prioridas**, prazos
      cada um em cada caixa" — as caixas de prioridade são o painel "Por prioridade" do
      `TaskQuadrant`, e não havia artefato provando que elas também acompanham. Teste: mudar a
      prioridade inline reagrupa o painel "Por prioridade", e mudar o prazo (com o popover fechado)
      não bagunça esse painel. Verificação: `npm test src/pages/admin/tasks`

## Prompts

## Notas

- 2026-08-20 — Desvio na tarefa 2: os "três caminhos de fechar" previstos eram *selecionar data, Esc,
  clique fora*, mas **selecionar a data não fecha o popover** (o `InlineCalendarPicker` de dentro do
  `TaskDueQuickEdit` não tem `PopoverClose`, de propósito — é o que mantém horário e duração
  acessíveis na mesma abertura, features 031/041). Fechar por seleção contradiria a tarefa 10. O
  teste cobre então os caminhos reais — gatilho de novo, Esc e clique fora — mais uma asserção
  explícita de que escolher a data **não** emite `onOpenChange(false)` e o popover continua aberto.
- 2026-08-20 — Verificação final: `npx tsc -p tsconfig.app.json --noEmit` limpo, `npm run build` OK,
  `npm run lint` com 0 erros (80 warnings pré-existentes de `react-refresh/only-export-components`),
  `npm run check:bundle` "Bundle budget OK" (teto de rota 160 KB gzip), `npm test` **207 arquivos /
  2137 testes / 0 falhas** (baseline da esteira era 205/2122 — +2 arquivos e +15 testes desta
  feature; a última rodada já inclui o teste extra aberto pela checagem de satisfação).
- 2026-08-20 — Desvio de escopo (pequeno, e necessário): o chip "Hoje" da Lista filtrava por
  `task.due_date` **vivo**, não pelo congelado. Com ele ligado, escolher uma data fora de hoje
  tirava a linha da lista **no meio da edição** — e o popover, que é filho da linha, ia junto (sem
  `onOpenChange(false)`, sem descongelar, sem `load()`). O filtro passou a usar o mesmo prazo
  congelado do bucket (`frozenDueDateOf`), então a linha só some quando o popover fecha. Coberto
  pelo teste "com o filtro «Hoje» ligado, empurrar o prazo tira o card da lista".
- 2026-08-20 — O toast "Movida para «caixa»" sai no **fechamento** do popover
  (`handleDueOpenChange`), não a cada `onChange`: no `onChange` sairia um toast por data
  experimentada, com a linha ainda parada. No fechamento, ele coincide com o momento em que o card
  realmente muda de lugar (ou some, com o chip "Hoje" ligado).
- 2026-08-20 — O Gantt **não** recebe `onDueOpenChange` de propósito: ele já recarrega pelo
  `onDataChanged` do arrastar da barra, e ligar as duas coisas faria o caminho do popover recarregar
  duas vezes. Coberto pelo teste novo em `GanttChart.test.tsx`.

