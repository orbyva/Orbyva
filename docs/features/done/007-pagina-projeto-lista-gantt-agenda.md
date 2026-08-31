# 007 — Página do projeto: Lista, Gantt e Agenda além do Kanban

## Contexto
Hoje, entrar num projeto (`/tasks/projects/:id`) só mostra o Kanban (`ProjectKanban.tsx`, feature
001+003). O usuário quer, dentro do projeto, alternar entre Lista, Gantt e Agenda também — as
mesmas formas de ver tarefas que já existem globalmente em `/tasks` (feature 004), só que
filtradas para as tarefas daquele projeto, com subtarefas visíveis.

## Decisões
- **Extrai visões compartilhadas**: a lógica de renderização de linha de Lista e de card de Agenda
  hoje mora dentro de `TaskList.tsx` (página global). Vira componentes compartilhados
  (`TaskListView`, `TaskAgendaView`) que recebem a lista de tarefas já filtrada como prop, usados
  tanto pela página global `/tasks` quanto pela página do projeto. Evita duplicar a melhoria de
  subtarefas/ícones da feature 008 em dois lugares.
- **Página do projeto vira tabs**: Kanban (inalterado) / Lista / Agenda / Gantt, mesmo padrão de
  `Tabs` já usado em `/tasks` e `/finance/recurring`.
- **Gantt exige uma data de início**: `due_date` sozinho não dá pra desenhar uma barra. Adiciona
  `task.start_date` (date, nullable). Barra vai de `start_date` até `due_date`; sem `start_date`,
  vira um marcador de um dia só em `due_date`; tarefa sem nenhuma data não aparece no Gantt (nota
  visível: "N tarefas sem data não aparecem aqui").
- **Gantt é uma grade CSS própria, sem lib externa**: uma coluna por dia num intervalo (do menor
  `start_date`/`due_date` ao maior, com folga de alguns dias), linhas por tarefa de topo com
  subtarefas indentadas logo abaixo, barra colorida por status. YAGNI — nada de zoom/drag/resize
  nesta rodada, só visualização.
- **Escopo do Gantt é sempre um projeto** — não faz um Gantt global misturando projetos diferentes
  (ficaria ilegível); a versão global de tarefas continua só com Lista/Agenda (feature 004).

## Tarefas
- [x] Migration: `task.start_date` (date, nullable) — aplicada ao banco remoto (`20260807130000`)
- [x] Types + `TaskCreateRequest`: `start_date`; campo "Início" no formulário de tarefa (dentro de
      `TaskRecurrenceField`, ao lado de "Prazo")
- [x] Extrai `TaskAgendaCard`/`TaskListRow`/`SubtaskChecklist`/`ExpandSubtasksButton` de
      `TaskList.tsx` para `TaskViews.tsx`, parametrizados por lista de tarefas; `TaskList.tsx` passa
      a usá-los sem mudar de comportamento
- [x] `domain/tasks/gantt.ts`: função pura pra calcular o intervalo de dias e a posição de cada
      barra (testável com Vitest)
- [x] Componente de Gantt (grade CSS, linhas com subtarefas indentadas)
- [x] Tabs Kanban/Lista/Agenda/Gantt — `ProjectKanban.tsx` renomeado para `ProjectDetail.tsx`
      (rota `/tasks/projects/:id` inalterada)
- [x] `npm run build && npm run lint` limpos + verificação manual

## Notas
- `TaskListView`/`TaskAgendaView` viraram, na prática, `TaskViews.tsx` com componentes nomeados
  (`TaskAgendaCard`, `TaskListRow`, etc.) em vez de dois componentes de página inteira — ficou mais
  granular do que o plano original previa, mas o objetivo (zero duplicação entre `TaskList.tsx` e
  `ProjectDetail.tsx`) foi alcançado. `groupSubtasksByParent` também virou função de domínio
  compartilhada.
- Verificação manual no navegador: tarefa de teste com Início 09/08 e Prazo 14/08 — barra do Gantt
  cobrindo exatamente esse intervalo, subtarefa indentada abaixo sem barra (sem datas); abas
  Lista/Agenda do projeto mostrando a mesma tarefa com subtarefa expansível, badge do projeto
  correto na Agenda. Dados de teste excluídos ao final (cascade removeu a subtarefa).
