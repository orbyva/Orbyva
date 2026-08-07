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
- [ ] Migration: `task.start_date` (date, nullable) — pedir confirmação antes de `supabase db push`
- [ ] Types + `TaskCreateRequest`: `start_date`; campo "Início" no formulário de tarefa (opcional,
      só relevante pra quem for usar o Gantt)
- [ ] Extrair `TaskListView`/`TaskAgendaView` de `TaskList.tsx` para componentes parametrizados por
      lista de tarefas; `TaskList.tsx` passa a usá-los sem mudar de comportamento
- [ ] `domain/tasks/gantt.ts`: função pura pra calcular o intervalo de dias e a posição de cada
      barra (testável com Vitest)
- [ ] Componente de Gantt (grade CSS, linhas com subtarefas indentadas)
- [ ] Tabs Kanban/Lista/Agenda/Gantt em `ProjectKanban.tsx` (ou renomear a página — avaliar no
      código se `ProjectKanban.tsx` deve virar `ProjectDetail.tsx`)
- [ ] `npm run build && npm run lint` limpos + verificação manual

## Notas
- Depende de `TaskListView`/`TaskAgendaView` existirem com o suporte a subtarefas da feature 008 —
  ordem real de implementação: 008 antes (ou junto) da parte de Lista/Agenda desta feature, mesmo
  a numeração do usuário sendo 007 → 008. O Kanban e o Gantt desta feature não dependem da 008.
