---
prompt: |
  coloque o quick edit também na visualização de task do kanban
  - preciso que faça o planejamento e implementação de uma organização dos components de maneira melhor. por exemplo quando eu adicionar um novo acesso rápido no 'componente de uma tarefa' isso seja refletido em todas as visualizações da tarefa: kanban, lista, gantt etc
  - tanto o a fazer quando os prazos devem ser iconificados. gosto de ícones para representar e decrever as categorias
---

# 033 — Quick edit no Kanban + organização compartilhada de componentes

## Contexto
A feature `done/029` trouxe edição rápida inline (prioridade, prazo+horário+duração, projeto) só
pra `TaskListRow`, usado na aba Lista (`TaskList.tsx`, `ProjectDetail.tsx`). `KanbanCard`
(`TaskViews.tsx:502-729`), usado na aba Kanban, ficou de fora por decisão explícita daquela feature
("Kanban, Gantt e Agenda ficam de fora nesta rodada... fica para uma extensão futura se o usuário
pedir") — é essa extensão. Hoje `KanbanCard` mostra `TaskPriorityFlag` estático (não clicável),
prazo como texto puro sem ícone (`Prazo: {formatDateTimeBR(...)}`, `TaskViews.tsx:617`) e um
`projectBadge` somente-leitura passado de fora — nenhum dos três é editável sem abrir o form
completo.

A lógica dos três quick-edits (prioridade/prazo/projeto) está hoje duplicada por composição dentro
de `TaskListRow` (condicionais `onPriorityChange ? <TaskPriorityQuickPick/> : <TaskPriorityFlag/>`
etc., linhas 278-338) — replicar isso dentro de `KanbanCard` faria a mesma lógica existir em dois
lugares, exatamente o problema que o usuário quer evitar ("quando eu adicionar um novo acesso
rápido... isso seja refletido em todas as visualizações"). A resposta é extrair esse bloco pra um
componente compartilhado.

Sobre iconificação: `TaskListRow` já mostra o prazo com ícone `Calendar` (via `TaskDueQuickEdit`
ou o texto estático de fallback) e o status via um `<Select>` só-texto (`STATUS_LABELS`); o Kanban
não tem ícone nenhum pro prazo, e o status ali é implícito pela coluna (sem rótulo/ícone no card).

## Decisões
- Extrair de `TaskListRow` o trecho condicional de prioridade/prazo/projeto (hoje inline,
  `TaskViews.tsx:278-282`, `308-316`, `322-338`) pra um novo componente
  `src/pages/admin/tasks/TaskQuickFields.tsx`, recebendo `task`, `onPriorityChange?`, `onDueChange?`,
  `onProjectChange?`, `projects?`, `projectBadge?` (fallback somente-leitura) e devolvendo os três
  elementos prontos (editável quando o handler correspondente é passado, somente-leitura senão —
  mesma regra de "ausência = sem regressão" que `TaskListRow` já segue). Esse é o componente único
  que Lista e Kanban passam a importar — um novo controle adicionado aqui aparece nas duas visões
  automaticamente, cumprindo o pedido de reorganização. Gantt fica fora do escopo de
  "quick-edit inline": não tem um "card" equivalente, e já ganha edição de prazo/duração por
  arrastar via a feature `032` — a fonte de verdade continua sendo `Task`/`updateTask`, comum às
  duas UIs.
- `TaskListRow` passa a renderizar `TaskQuickFields` no lugar do bloco inline (sem mudança de
  comportamento visível na Lista).
- `KanbanCard` ganha as mesmas props opcionais `onPriorityChange`/`onDueChange`/`onProjectChange`/
  `projects` que `TaskListRow` (mesma convenção: ausência mantém o comportamento somente-leitura de
  hoje — o Kanban de `ProjectDetail.tsx`, que não passa projeto, continua funcionando sem
  `onProjectChange`), renderizando `TaskQuickFields` no lugar do `TaskPriorityFlag` + texto de prazo
  estáticos.
- `TaskList.tsx` (aba Kanban) passa os handlers `handlePriorityChange`/`handleDueChange`/
  `handleProjectChange` já existentes (reaproveitados 1:1 da aba Lista) + `projectsByActivity` pro
  `KanbanCard`.
- Iconificação do status: novo mapa `STATUS_ICONS: Record<TaskStatus, LucideIcon>` ao lado de
  `STATUS_LABELS` em `TaskViews.tsx` (ex.: `Circle` para "A fazer", `CircleDot`/`CircleDashed` para
  "Fazendo", `CheckCircle2` para "Feito" — ajustar na implementação). Usado (a) no `SelectValue`/
  `SelectItem` de status da Lista, junto do texto, e (b) como indicador no `KanbanCard` (já que a
  coluna implica o status, mas um ícone no card reforça e mantém o mesmo vocabulário visual das duas
  visões).
- Iconificação de prazo: `KanbanCard` ganha o ícone `Calendar` junto ao texto de prazo (igual ao
  padrão já usado em `TaskListRow`/`TaskDueQuickEdit`), tanto na versão somente-leitura quanto na
  quick-edit.

## Tarefas
- [x] Criar `TaskQuickFields.tsx` extraindo a lógica condicional de prioridade/prazo/projeto de
      `TaskListRow` (mesmas props: `onPriorityChange?`, `onDueChange?`, `onProjectChange?`,
      `projects?`, `projectBadge?`).
- [x] Atualizar `TaskListRow` para renderizar `TaskQuickFields` no lugar do bloco inline (sem
      mudança visual esperada — só refatoração).
- [x] Adicionar props `onPriorityChange`/`onDueChange`/`onProjectChange`/`projects`/`projectBadge`
      em `KanbanCard`, renderizando `TaskQuickFields` no lugar do `TaskPriorityFlag` + texto de
      prazo estáticos hoje presentes.
- [x] Em `TaskList.tsx` (aba Kanban): passar `handlePriorityChange`/`handleDueChange`/
      `handleProjectChange` + `projectsByActivity` para `KanbanCard`.
- [x] Adicionar `STATUS_ICONS` (mapa status → ícone lucide) em `TaskViews.tsx`; usar no
      `SelectItem`/`SelectValue` de status da Lista (`TaskListRow`).
- [x] Adicionar indicador de status iconificado (reaproveitando `STATUS_ICONS`) no `KanbanCard`.
- [x] Confirmar que o ícone `Calendar` aparece no prazo do `KanbanCard` tanto em modo somente-leitura
      quanto quick-edit (via `TaskQuickFields`/`TaskDueQuickEdit`).
- [x] `npx tsc --noEmit && npm run build && npm run lint`.
- [x] Teste de componente cobrindo `TaskQuickFields` renderizado por `KanbanCard` e `TaskListRow`
      (`src/pages/admin/tasks/__tests__/TaskViews.test.tsx`): fallback somente-leitura sem
      handlers (nada clicável), quick-edit de prioridade/prazo/projeto funcionando no Kanban
      (não só na Lista) chamando os handlers certos, e `STATUS_ICONS` aparecendo nas duas visões
      (ícone por coluna no Kanban, ícone junto do rótulo no Select da Lista).

## Prompts

## Notas
- `TaskQuickFields` foi implementado como função pura (não componente JSX) que devolve
  `{ priority, due, project }` prontos — não um componente com wrapper próprio — porque
  `TaskListRow` e `KanbanCard` posicionam cada peça em pontos diferentes do próprio layout
  (prioridade junto do título, prazo/projeto na linha de metadados); um único wrapper JSX não
  encaixaria nos dois. Chamada diretamente como `TaskQuickFields({...})` dentro do corpo de
  ambos os componentes (não `<TaskQuickFields ... />`).
- A extração trouxe também a regra "Concluída em {data}" (que só existia em `TaskListRow`) pro
  campo `due` do Kanban — antes o Kanban sempre mostrava "Prazo: {data}" mesmo em tarefas feitas.
  É consequência direta de extrair o bloco condicional inteiro (linhas 322-338 originais) num
  componente único compartilhado, como pedia a decisão; não foi pedido à parte, mas é a mesma
  lógica “um ajuste aparece nas duas visões” que motivou a feature.
- Removido o prefixo "Prazo:" do texto estático do Kanban (agora só ícone `Calendar` + data, igual
  à Lista) — decorre da mesma extração/decisão de unificar o vocabulário visual entre as duas
  visões.
- Além da tarefa 4 (só `TaskList.tsx`), também liguei `onPriorityChange`/`onDueChange` (sem
  `onProjectChange`, que não se aplica lá) no `KanbanCard` de `ProjectDetail.tsx`, reaproveitando
  `handlePriorityChange`/`handleDueChange` que já existiam ali para a `TaskListRow` daquela
  página. Não estava listado como tarefa própria, mas a seção Decisões já citava esse Kanban
  explicitamente ("o Kanban de `ProjectDetail.tsx`... continua funcionando sem
  `onProjectChange`") e o roteiro de teste manual pede para repetir os quick-edits lá — sem essa
  ligação a task de teste manual falharia.
- `TaskList.tsx`: removida a variável local `projectById`/o `projectBadge` calculado manualmente
  para o `KanbanCard` — ficou morta assim que `onProjectChange`+`projects` passaram a ser
  passados (o `TaskQuickFields` prioriza o par `onProjectChange`/`projects` sobre `projectBadge`
  estático), então mantê-la seria código morto.
- A última tarefa foi escrita como "Teste manual" antes da skill `next` proibir Chrome/browser
  automation sem exceção. Reescrita como teste de componente automatizado
  (`src/pages/admin/tasks/__tests__/TaskViews.test.tsx`, Testing Library + jsdom) cobrindo
  `KanbanCard` e `TaskListRow`: fallback somente-leitura sem handlers, os três quick-edits
  (prioridade/prazo/projeto, incluindo card sem projeto) chamando os handlers certos no Kanban,
  e `STATUS_ICONS` renderizando o ícone certo por status nas duas visões. Ao escrever o teste de
  status descobri que o ícone de `done` (`CheckCircle2` do lucide-react) é internamente um alias
  de `CircleCheck` (`node_modules/lucide-react/dist/esm/icons/check-circle-2.js` re-exporta
  `circle-check.js`) — a classe CSS renderizada é `lucide-circle-check`, não
  `lucide-check-circle-2`; não é um bug de produto, só uma pegadinha da lib ao consultar o DOM
  por classe do ícone.
- `npm test` (checagem de satisfação) roda com 2 falhas pré-existentes e não relacionadas em
  `src/lib/__tests__/currency.test.ts` (`formatDateBR`/`formatDateTimeBR` esperando `"—"` e
  recebendo `"·"` pra data nula) — mesmo par de falhas já documentado em `done/031` e `done/032`;
  `git diff`/`git log` confirmam que `currency.ts`/`currency.test.ts` estão idênticos ao HEAD
  (`1ec9c04`), fora do diff de todas as features 029-036 desta sessão, então não é regressão
  desta feature.
