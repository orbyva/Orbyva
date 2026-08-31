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
- [x] Migration: `task.priority` (aplicada ao banco remoto — `20260807120000`)
- [x] Types + `TaskCreateRequest`: `priority`; seletor no formulário de tarefa (`TaskList.tsx` e
      `ProjectKanban.tsx`)
- [x] Expandir subtarefas inline na Lista (linha vira duas: pai + checklist recolhível)
- [x] Expandir subtarefas inline na Agenda (`TaskAgendaCard` ganha o mesmo recolhível)
- [x] Ícones de prazo/prioridade/recorrência em Lista e Agenda (também no Kanban: `TaskPriorityFlag`
      no card)
- [x] `npm run build && npm run lint` limpos + verificação manual

## Notas
- Desvio: não foi extraído `TaskListView`/`TaskAgendaView` compartilhado — a feature 007 ainda não
  existe (Kanban do projeto não tem abas Lista/Agenda hoje), então não havia um segundo consumidor
  para justificar a extração agora. `SubtaskChecklist`/`ExpandSubtasksButton`/`TaskAgendaCard`
  ficaram como componentes locais de `TaskList.tsx`. Quando a 007 for implementada, extrair esses
  componentes (e a lógica de `subtasksByParent`/`expandedTasks`) é o primeiro passo — reaproveitar
  em vez de duplicar.
- Cores de prioridade implementadas: azul (baixa) / âmbar (média) / vermelho (alta) — o plano
  original sugeria cinza para baixa, trocado por azul para ficar visualmente distinto do texto
  cinza-padrão dos metadados ao redor (prazo, badges), que já usa `text-muted-foreground`.
- Verificação manual no navegador: tarefa de teste com prioridade Alta e prazo — bandeira vermelha e
  ícone de calendário aparecem na Lista, no card do Kanban e na Agenda; subtarefa criada via Kanban
  aparece corretamente ao expandir o chevron na Lista e na Agenda (o estado de expansão persiste ao
  trocar de aba, já que é o mesmo componente); toggle da subtarefa otimista nos dois lugares. Dados
  de teste excluídos ao final (cascade apagou a subtarefa junto).
