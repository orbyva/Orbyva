# 012 — Edição completa de subtarefas + descrição visível nos cards

## Contexto
Subtarefa hoje é só um checkbox com título — `addSubtask` já cria a linha com `description: ""` e
`due_date: null` (`ProjectDetail.tsx:506-521`), os campos existem no schema (`Task.description`,
`Task.due_date`, mesma tabela `task`), mas não há nenhum jeito de editá-los depois: `toggleSubtask`
só alterna status (`ProjectDetail.tsx:476-482`), e `SubtaskChecklist` (`TaskViews.tsx:11-35`)
renderiza só checkbox + título truncado, sem `onClick` — clicar numa subtarefa não faz nada. Além
disso, a **tarefa de topo** já tem `description` preenchível no formulário
(`TaskList.tsx:415`, `ProjectDetail.tsx:763`), mas esse texto nunca aparece em nenhum card/linha
depois de salvo (`grep` por `task.description` só encontra o campo do formulário, nunca uma
renderização em `TaskListRow`/`TaskAgendaCard`/`KanbanCard`) — só `ProjectCard` já mostra preview
de descrição hoje (`Projects.tsx:116-117`). Sem mudança de schema — é só UI faltando sobre campos
que já existem.

## Decisões
- **Subtarefa vira clicável**: `SubtaskChecklist` ganha `onClick` no título (mesmo padrão de
  `stopPropagation` no checkbox usado na feature 011 para os cards de topo) — clique abre um dialog
  de edição de subtarefa.
- **Dialog de edição de subtarefa é uma versão enxuta do dialog de tarefa** — não o formulário
  completo (sem seletor de Projeto, sem recorrência/vínculo financeiro, já que subtarefas não são
  vinculáveis por decisão da feature 002; sem tags/prioridade nesta rodada, o usuário não pediu).
  Campos: **Título**, **Descrição** (textarea, mesmo padrão do formulário de tarefa), **Prazo**
  (date picker, mesmo campo `due_date` que já existe). Salva via `updateTask` existente, sem
  endpoint novo.
- **Descrição visível no card**: `TaskListRow`, `TaskAgendaCard` e `KanbanCard` ganham preview de
  `description` (1-2 linhas truncadas, `text-xs text-muted-foreground`, mesmo padrão já usado em
  `ProjectCard`) quando o campo não está vazio. Aplica-se tanto à tarefa de topo quanto, dentro do
  `SubtaskChecklist`, a cada subtarefa (versão ainda mais compacta — só uma linha truncada abaixo do
  título, já que é uma lista mais densa).
- **Prazo visível na subtarefa**: `SubtaskChecklist` ganha um badge compacto de data (ícone
  `Calendar` + `due_date` formatada, reaproveitando `formatDateBR` se a feature 009 já tiver sido
  implementada — senão, formatação local equivalente por ora) ao lado do título, só quando
  `due_date` estiver preenchido.
- Escopo: só a mecânica de editar campos já existentes em subtarefas + exibir descrição/prazo onde
  já deveriam aparecer. Não adiciona prioridade, tags, ou recorrência a subtarefas — nenhuma dessas
  três foi pedida e abriria escopo que as decisões anteriores (002, 008) deixaram de fora
  deliberadamente para subtarefas.

## Tarefas
- [ ] `SubtaskChecklist` (`TaskViews.tsx`): título vira clicável (abre edição), badge de prazo
      (`Calendar` + data) quando `due_date` presente, linha de descrição truncada quando presente
- [ ] Dialog de edição de subtarefa (Título/Descrição/Prazo) — novo componente compartilhado, usado
      a partir do clique em `SubtaskChecklist` (tanto em `ProjectDetail.tsx`/Kanban quanto em
      `TaskList.tsx`/`TaskViews.tsx` onde a checklist aparece expandida)
- [ ] Salvar edição de subtarefa via `updateTask` existente; atualização otimista no estado local
      (mesmo princípio das features 003/004 — sem reload completo por edição)
- [ ] Preview de descrição (1-2 linhas truncadas) em `TaskListRow`, `TaskAgendaCard`, `KanbanCard`
      quando a tarefa de topo tem `description` preenchida
- [ ] `npm run build && npm run lint` limpos + verificação manual (editar descrição e prazo de uma
      subtarefa existente e ver refletido no card; criar tarefa de topo com descrição e confirmar
      que aparece no card em Lista/Agenda/Kanban)

## Notas
