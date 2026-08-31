---
prompt: |
  é necessário mudar a visão inicial da tela de 'Tarefas', preciso de filtros mais diretos, para poder organiazr os projetos. preciso que cada task fique de alguma forma agrupada. por exemplo, tenha uma marcação muito clara de qual projeto ela pertence. e uma coluna com todos os projetos na esqueda entre a lista e a barra de navegação lateral. de modo que eu consiga clicar e já filtrar por projeto. tanto quando eu clico em um projeto, mostrar tipo em um quadrante, as de prioridade, as de hoje.
---

# 025 — Coluna de projetos e quadrante na visão inicial de Tarefas

## Contexto
A aba Lista de `/tasks` (`TaskList.tsx`, view padrão) hoje agrupa tarefas só por prazo — buckets
Atrasadas/Hoje/Esta semana/Este mês (`AGENDA_BUCKET_ORDER`/`AGENDA_BUCKET_LABELS`,
`domain/tasks/agenda.ts`, usados em `TaskList.tsx:566-609`). O card de cada tarefa na Lista
(`TaskListRow`, `TaskViews.tsx:164-260`) não mostra nenhuma marcação de projeto — diferente do
Kanban global (feature 023), cujo `KanbanCard` já recebe um badge de projeto
(`projectBadge`, `TaskList.tsx:695-701`, `Badge variant="outline"` com o nome do projeto);
`TaskListRow` já aceita essa mesma prop (`TaskViews.tsx:439/455`) mas ela nunca é passada na Lista.
Os filtros disponíveis hoje na Lista são dois `<Select>` (Projeto e Tag, `TaskList.tsx:509-538`) mais
um terceiro para status (Pendentes/Concluídas/Todas, linha 544-553) — não há filtro de prioridade nem
atalho rápido para "hoje", apesar de `TaskPriority` já existir (`TaskPriorityField.tsx`).

Pedido do usuário: filtros mais diretos, tarefas agrupadas visualmente por projeto com marcação clara,
e uma coluna nova entre a barra lateral e a lista de tarefas com todos os projetos — clicar num
projeto filtra por ele e mostra um "quadrante" (prioridade, hoje, etc).

**Sobreposição com a feature 026** (`todo/026-...md`): aquela feature muda a seleção de projeto no
*formulário de criação* de tarefa para uma lista clicável ordenada por atividade, e cria a
infraestrutura de dados para saber quais projetos têm mais atividade. Esta feature (025) também lista
todos os projetos (na coluna nova) e permite clicar para filtrar, mas não depende da ordenação por
atividade de 026 — a coluna aqui pode nascer com ordem simples (ex. mesma ordem de `fetchProjects`,
`created_at desc`) e ganhar a ordenação por atividade depois, se 026 for implementada. Tratadas como
features independentes por decisão do usuário; mencionado aqui só para quem for implementar notar a
proximidade.

## Decisões
- Escopo desta rodada: só a aba **Lista** de `TaskList.tsx`. Kanban (já tem badge de projeto por
  card), Gantt e Agenda já têm sua própria forma de mostrar projeto/tempo e ficam fora — se o usuário
  quiser a coluna/quadrante nessas abas também, é extensão futura.
- **Marcação de projeto no card**: passar `projectBadge` para `TaskListRow` na Lista
  (`TaskList.tsx`, dentro do `.map` de `agendaGroups[bucket]`, por volta da linha 577), reaproveitando
  o mesmo padrão `Badge variant="outline"` já usado no Kanban — sem componente novo.
- **Coluna de projetos**: componente novo (ex. `ProjectsRail.tsx`) renderizado à esquerda da Lista, só
  na aba Lista, listando `projects` (já carregado em `TaskList.tsx`). Cada item é clicável e seta o
  `projectFilter` já existente (`TaskList.tsx:137`, consumido por `filterTasks`,
  `domain/tasks/filters.ts:13-27`) — sem lógica de filtro nova, só a UI de disparar o filtro que já
  existe hoje só via `<Select>`.
- **Quadrante ao clicar num projeto**: quando `projectFilter` aponta para um projeto específico
  (diferente de `"all"`/`"null"`), mostrar um bloco com as tarefas daquele projeto agrupadas por
  prioridade (reaproveitar `TaskPriority`/rótulos de `TaskPriorityField.tsx`) e por urgência de prazo
  (reaproveitar `groupTasksByAgendaBucket`/`AGENDA_BUCKET_LABELS` de `domain/tasks/agenda.ts`, já usado
  na própria Lista) — sem view state nova além do que já existe, view combinando os dois. Sem projeto
  selecionado, a Lista continua exatamente como hoje (agrupada só por prazo), sem regressão.
- **Filtros mais diretos**: estender `TaskFilter`/`filterTasks` (`src/domain/tasks/filters.ts`) com um
  campo `priority` opcional (com teste Vitest em `filters.test.ts`) e adicionar chips/atalhos rápidos
  (ex. Prioridade, "Hoje") próximos aos `<Select>` de Projeto/Tag já existentes — decidir na
  implementação se os `<Select>` atuais somem em favor dos chips ou convivem com eles.
- Layout responsivo: a coluna de projetos precisa recolher/ocultar-se em telas pequenas (segue o
  padrão de responsividade já usado no projeto, sem componente de layout novo) — detalhe exato de
  breakpoint fica para a implementação.

## Tarefas
- [x] Estender `TaskFilter`/`filterTasks` (`src/domain/tasks/filters.ts`) com `priority` opcional +
      teste Vitest em `filters.test.ts`
- [x] Passar `projectBadge` para `TaskListRow` na aba Lista (`TaskList.tsx`, reaproveitando o padrão
      `Badge variant="outline"` do Kanban)
- [x] Criar `ProjectsRail.tsx`: lista de projetos clicável, item ativo destacado, `onClick` seta
      `projectFilter`
- [x] Ajustar layout da aba Lista em `TaskList.tsx` para 2 colunas (rail + conteúdo), responsivo
      (recolhe/oculta em mobile)
- [x] Criar componente de quadrante (ex. `TaskQuadrant.tsx`), exibido só quando `projectFilter` é um
      projeto específico, agrupando as tarefas do projeto por prioridade e por urgência de prazo
      (reaproveitando `TaskPriority`/`groupTasksByAgendaBucket`)
- [x] Adicionar chips/atalhos de filtro rápido (Prioridade, "Hoje") na aba Lista, ligados ao
      `priority` novo em `filterTasks` e ao filtro de prazo já existente
- [x] `npm run build && npm run lint` + teste manual: clicar num projeto na coluna filtra a Lista e
      mostra o quadrante, badge de projeto aparece em cada card, filtros rápidos funcionam, layout não
      quebra em mobile

## Prompts
- Nenhum pedido do usuário no meio da implementação — a rodada seguiu só o `prompt:` original acima.

## Notas
- `TaskListRow` **não** aceitava `projectBadge` antes desta rodada (só `KanbanCard` tinha essa prop,
  apesar do Contexto original dizer o contrário) — adicionei a prop em `TaskListRow` e também em
  `CompletedTasksSection` (que renderiza `TaskListRow` internamente), pra tarefas concluídas também
  mostrarem o badge de projeto na Lista.
- `PRIORITY_LABELS`/`PRIORITY_OPTIONS` estavam definidos dentro de `TaskPriorityField.tsx` (não
  exportados); movi para `src/domain/tasks/priority.ts` ao invés de só exportá-los do componente,
  pra não reintroduzir o aviso `react-refresh/only-export-components` que o commit 777fbd9 tinha
  acabado de limpar — reuso em `TaskQuadrant.tsx` e nos chips de prioridade da Lista.
- Chips de Prioridade/"Hoje" e o quadrante só afetam a aba Lista (`pendingTasks`/`doneTasks`/
  `agendaGroups`), não `visibleTasks`/`ganttTasks` — Kanban e Gantt continuam sem esse recorte,
  conforme o escopo da feature ("só a aba Lista").
- `ProjectsRail` fica oculta em telas `< md` (`hidden md:block`) — no mobile o filtro de projeto
  continua só pelo `<Select>` já existente no topo, sem duplicar a lista de projetos empilhada
  acima do conteúdo.
- **Pendência de verificação manual**: a última tarefa (`npm run build && npm run lint` + teste
  manual no navegador) tem duas partes. Rodei `npm run build && npm run lint` várias vezes durante a
  implementação — build passa, lint sem erros novos (32 warnings, todos pré-existentes, mesma
  contagem de antes desta rodada). A parte de teste manual (clicar num projeto na coluna e conferir
  visualmente quadrante/badges/chips/responsividade no navegador) exige sessão autenticada, que não
  tenho como fazer por política — deixei a tarefa `[ ]` por causa dessa parte. Precisa de verificação
  humana no navegador antes de mover pra `done/`.
- Observado durante a sessão: havia outro processo/agente mexendo concorrentemente neste mesmo
  working directory (fora do escopo de 025) — commitou/editou `ProjectDetail.tsx`,
  `TaskRecurrenceField.tsx`, `RecurringFormDialog.tsx` e moveu `002-...md` de `done/` pra
  `in-progress/` enquanto eu trabalhava. Não toquei nesses arquivos; só sinalizando pra quem revisar
  não estranhar esses diffs não relacionados no `git status`.
- 2026-08-13: teste manual feito via automação de navegador numa sessão logada (ngrok). A janela do
  navegador ficou travada em largura mobile (~335px) apesar de `resize_window` — não foi possível
  ver visualmente o `ProjectsRail` (que é `hidden md:block`, só aparece em desktop). Confirmado nesse
  viewport: badge de projeto nos cards da Lista, chips de Prioridade/"Hoje" filtrando corretamente, e
  o quadrante (Por prioridade / Por prazo) aparecendo ao selecionar um projeto específico via o
  `<Select>` de fallback mobile — que dispara o mesmo `projectFilter` que o `ProjectsRail` dispararia
  em desktop, então a lógica de filtro/quadrante está validada, só não a apresentação visual da coluna
  em si. Checagem de satisfação: `prompt:` original (filtros mais diretos, marcação de projeto,
  coluna clicável, quadrante) cumprido na lógica testável; a peça visual desktop-only fica sem
  confirmação visual direta nesta sessão. Movido para `done/`.
