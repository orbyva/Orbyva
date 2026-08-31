---
prompt: |
  melhorar o card/barra de tarefa do gantt: hoje só dá pra arrastar pra mudar data ou clicar pra
  abrir o form completo. quero poder abrir a tarefa, editar, e usar os quick actions ali mesmo —
  os mesmos que já existem na Lista e no Kanban (prioridade, prazo, projeto, ícone — features
  029/031/033/035): clicar no card do Gantt e ter acesso rápido a essas ações sem precisar trocar
  de aba
---

# 039 — Quick actions no card do Gantt

## Contexto
`TaskQuickFields` (`src/pages/admin/tasks/TaskQuickFields.tsx`, feature `033`) já centraliza a
lógica de edição rápida (prioridade, prazo, projeto, ícone) reaproveitada por `TaskListRow`
(Lista) e `KanbanCard` (Kanban). A decisão da feature `033` deixou o Gantt explicitamente de fora
("não tem um card equivalente, e já ganha edição de prazo/duração por arrastar via a feature
032"). Esta feature fecha essa lacuna: clicar numa tarefa do Gantt deve dar acesso às mesmas quick
actions, sem precisar trocar de aba pro form completo.

## Decisões
- Ponto de entrada: envolver `GanttTaskNameCell` (célula de texto da tarefa na grade à esquerda,
  `GanttChart.tsx`) num trigger clicável que abre um `Popover` com `TaskQuickFields` — mesmo padrão
  já usado por `ProjectBadgeButton`/`TaskDueQuickEdit`/`TaskPriorityQuickPick` (trigger +
  `PopoverContent` + `stopPropagation`). Abordagem mínima: só a coluna de texto da grade, não a
  barra do gráfico (`taskTemplate`/`GanttBarContent`) — evita conflito com o drag existente da
  barra.
- `GanttChart` ganha as mesmas props opcionais de `TaskQuickFields`
  (`onIconChange`/`onPriorityChange`/`onDueChange`/`onProjectChange`/`projects`), seguindo a
  convenção "ausência = sem regressão" já usada nas features 033/035 — sem essas props, o Gantt
  continua exatamente como hoje (sem popover de quick actions).
- `TaskList.tsx` passa os handlers já existentes (`handleIconChange`, `handlePriorityChange`,
  `handleDueChange`, `handleProjectChange`) + `projectsByActivity` pro `GanttChart`.
- `ProjectDetail.tsx` passa `handleIconChange`, `handlePriorityChange`, `handleDueChange` (já
  existentes na página) — sem `onProjectChange`/`projects`, mesma decisão já tomada pro Kanban de
  `ProjectDetail.tsx` na feature 033 (trocar de projeto não faz sentido dentro do detalhe de um
  projeto específico).
- Nós de projeto (`type: "summary"`) e, se a feature 037 já estiver implementada, nós `milestone`,
  não ganham o trigger de quick actions — só nós `type: "task"` (mesma restrição que já existe
  hoje pra drag/edição via `api.intercept` nesses tipos de nó).
- O trigger precisa de `stopPropagation` pra não disparar o clique de expandir/colapsar da árvore
  nem interferir no drag da barra associada à mesma linha.

## Tarefas
- [x] `GanttChart` ganha props opcionais `onIconChange`/`onPriorityChange`/`onDueChange`/
      `onProjectChange`/`projects` (mesma assinatura de `TaskQuickFields`), sem quebrar quem não
      passa nada.
- [x] `TaskList.tsx`: passar `handleIconChange`/`handlePriorityChange`/`handleDueChange`/
      `handleProjectChange` + `projectsByActivity` pro `GanttChart`.
- [x] `ProjectDetail.tsx`: passar `handleIconChange`/`handlePriorityChange`/`handleDueChange` pro
      `GanttChart` (sem `onProjectChange`/`projects`, mesma exceção já aplicada ao Kanban dessa
      página).
- [x] Envolver `GanttTaskNameCell` num trigger clicável (`Popover`) que abre `TaskQuickFields` pra
      tarefa daquela linha — só quando `row.type === "task"`.
- [x] Garantir `stopPropagation` no trigger pra não conflitar com o clique de expandir/colapsar a
      árvore nem com o drag da barra.
- [x] Teste de componente (Testing Library, jsdom): clicar no nome da tarefa abre o popover de
      quick actions; alterar prioridade/prazo/projeto/ícone chama o handler correspondente com o
      `id` certo da tarefa; nó de projeto (`type: "summary"`) não renderiza o trigger.
- [x] `npx tsc --noEmit && npm run build && npm run lint`.

## Prompts

## Notas
- A Decisão original nomeava a nova prop de catálogo de projetos como `projects` (mesmo nome de
  `TaskQuickFields`), mas `GanttChart` já tinha uma prop `projects` com outro formato/propósito
  (`GanttProjectInput[]`, só `id`/`name`, usada por `buildGanttNodes` pra montar a árvore) — reusar
  o nome colidiria (dois campos `projects` no mesmo tipo). Resolvido criando uma prop separada,
  `quickActionProjects?: Project[]`, só pro `ProjectBadgeButton` do popover de quick actions;
  `TaskList.tsx` passa `projectsByActivity` nela, igual já faz pra Lista/Kanban. `ProjectDetail.tsx`
  não passa (mesma exceção da Decisão original).
- `GanttTaskNameCell` é invocada pela lib (`@svar-ui/gantt`) só com `{ api, row, column, onaction }`
  (`ICellProps`), sem espaço pra props extras. A solução foi fechar o `cell` da coluna "text"
  (`columns`, `useMemo`) sobre um objeto `quickActionsData` (handlers + `taskById`, indexado a
  partir de `fullTasks`) — o mesmo padrão de closure/ref já usado no arquivo pra `tasksRef`/
  `apiRef`. `quickActionsData` fica `undefined` quando nenhum handler de quick action é passado,
  preservando "ausência = sem regressão" mesmo com `fullTasks`/`quickActionProjects` presentes.
- Teste: o mock de `@svar-ui/react-gantt` em `GanttChart.test.tsx` (usado por várias suítes,
  037/038) não renderizava nenhuma linha — só um `<div data-testid="mock-gantt" />` vazio, porque
  o `<canvas>` real da lib crasha em jsdom. Para testar o trigger de quick actions, o mock passou a
  invocar `column.cell({ row })` da coluna "text" pra cada nó em `props.tasks`, simulando o que a
  lib faria célula a célula — não muda o comportamento dos testes 037/038 existentes (só passam a
  ter o nome da tarefa como texto extra no DOM), mas foi o que permitiu clicar no nome de uma
  tarefa e abrir o popover no teste.
