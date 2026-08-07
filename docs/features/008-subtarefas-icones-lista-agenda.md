# 008 — Subtarefas visíveis + ícones de prazo/prioridade/recorrência

## Contexto
Na Lista (`/tasks`, aba Lista) e na Agenda (aba Agenda, feature 004), subtarefas são invisíveis —
só aparecem no Kanban. O usuário quer poder ver as subtarefas nessas duas visões, e quer ícones
rápidos de prazo, prioridade e recorrência em cada card/linha. Prioridade ainda não existe no
modelo — é campo novo.

## Decisões
- **`task.priority`**: coluna nova `text` nullable, `"low" | "medium" | "high"`, sem valor = sem
  prioridade (não força todo mundo a classificar tudo). Seletor compacto no formulário de tarefa
  (mesmo estilo de botões do `TaskRecurrenceField` da feature 005: Nenhuma/Baixa/Média/Alta).
- **Subtarefas em Lista e Agenda**: cada linha/card de tarefa de topo com `subtasks.length > 0` gera
  um botão de expandir (chevron) que revela o checklist de subtarefas inline — mesmo padrão visual
  e de atualização otimista já usado no Kanban (`toggleSubtask`/`applyStatusChange`). Fechado por
  padrão. Não busca subtarefas à parte: `TaskList.tsx` já carrega todas as tarefas do usuário, só
  precisa agrupar por `parent_task_id` (mesmo `subtasksByParent` que `ProjectKanban.tsx` já tem).
- **Ícones**: `Calendar` antes do prazo (já é só texto hoje), `Flag` colorida por prioridade
  (vermelho=alta, amarelo=média, cinza=baixa) quando `priority` setada, `Repeat` quando a tarefa é
  recorrente (a Agenda já tem; a Lista ganha agora). Um pequeno conjunto visual, sem tooltip
  explicativo — os ícones já são autoexplicativos com as cores padrão do design system.
- Estas melhorias entram nos componentes compartilhados `TaskListView`/`TaskAgendaView` que a
  feature 007 extrai de `TaskList.tsx` — ver Notas da 007. Construídos juntos na prática.

## Tarefas
- [ ] Migration: `task.priority` — pedir confirmação antes de `supabase db push`
- [ ] Types + `TaskCreateRequest`: `priority`; seletor no formulário de tarefa (`TaskList.tsx` e
      `ProjectKanban.tsx`)
- [ ] Expandir subtarefas inline na Lista (linha vira duas: pai + checklist recolhível)
- [ ] Expandir subtarefas inline na Agenda (`TaskAgendaCard` ganha o mesmo recolhível)
- [ ] Ícones de prazo/prioridade/recorrência em Lista e Agenda
- [ ] `npm run build && npm run lint` limpos + verificação manual

## Notas
