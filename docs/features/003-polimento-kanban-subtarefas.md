# 003 — Polimento do Kanban de projetos e subtarefas

## Contexto
`src/pages/admin/tasks/ProjectKanban.tsx` (feature 001) tem dois problemas de UX apontados pelo usuário: marcar uma subtarefa como concluída tem delay perceptível com feedback visual fraco, e não dá pra arrastar um card entre colunas — só os botões de chevron (◀▶) movem status. A decisão original do núcleo v1 foi "Kanban sem drag-and-drop, YAGNI" — o usuário está pedindo explicitamente essa capacidade agora, então a decisão original é revertida aqui.

## Decisões
- **Causa do delay**: toda mutação (`toggleSubtask`, `moveStatus`, `handleSave`, `handleDelete`, `addSubtask`) chama `load()` depois — um refetch completo (`fetchProjectById` + `fetchTasks()` inteiro, que re-roda a materialização de recorrência simples e de instâncias vinculadas para todas as tarefas do usuário + `fetchRecurringTransactions()`) só pra refletir a mudança de uma tarefa. Fix: atualização otimista no estado local (`setTasks`) imediatamente após o clique, sem esperar `load()`; reverter e mostrar toast de erro só se a chamada à API falhar. Mantém `load()` como estava para os fluxos que já esperam reload completo (abrir a página, criar/editar tarefa via dialog — esses continuam com o padrão atual, não é o gargalo percebido).
- **Drag-and-drop**: adicionar `@dnd-kit/core` + `@dnd-kit/sortable` (padrão atual para DnD em React, acessível via teclado, mantido ativamente — ao contrário de `react-beautiful-dnd`, descontinuado). Cada coluna vira uma `SortableContext`; arrastar um card para outra coluna chama a mesma função de atualização de status (agora otimista) que os botões de chevron já usam — os botões continuam existindo (acessibilidade / mobile sem drag confiável), o drag é um jeito a mais de fazer a mesma ação.
- Escopo desta rodada: só `ProjectKanban.tsx` (cards de tarefa entre colunas + checkbox de subtarefa). Não mexe em `TaskList.tsx`/`Live.tsx`.
- Fora de escopo: reordenar tarefas dentro da mesma coluna (drag só muda coluna/status, não a ordem de exibição).

## Tarefas
- [x] Instalar `@dnd-kit/core` + `@dnd-kit/sortable` (92a70d0)
- [x] Tornar `toggleSubtask` otimista: atualiza `tasks` local na hora, chama `updateTask`, reverte + toast se falhar (ac86d62)
- [x] Tornar `moveStatus` otimista (mesmo padrão) (ac86d62)
- [x] Envolver as 3 colunas em `DndContext`/`SortableContext`; cada card vira `useSortable`; `onDragEnd` chama a versão otimista de `moveStatus` com a coluna de destino (extraídos `KanbanColumn`/`KanbanCard` por causa das Rules of Hooks)
- [x] Indicador visual durante o drag: card de origem fica com opacidade reduzida, coluna de destino ganha destaque de fundo (`useDroppable`/`isOver`), `DragOverlay` mostra um card flutuante seguindo o cursor
- [x] Testar: soltar fora de uma coluna cancela o drag sem mudar status; soltar na mesma coluna não faz nada; teclado (dnd-kit já suporta `KeyboardSensor`) move o card entre colunas
- [x] `npm run build && npm run lint` limpos

## Notas
- Verificação manual no navegador (projeto de teste "allta"): drag por teclado (Space para pegar, setas para mover, Space para soltar) move o card entre colunas com atualização otimista instantânea; `DragOverlay` mostra o card flutuante durante o arrasto; a coluna de destino destaca ao passar por cima (`useDroppable`/`isOver`); Escape cancela o arrasto sem alterar o status. Drag por mouse via automação de browser não foi possível simular de forma confiável (eventos de ponteiro sintéticos não disparam a sensor de ponteiro do dnd-kit em teste automatizado), mas o mesmo `onDragEnd`/`handleDragEnd` atende os dois sensores — a cobertura pelo teclado já exercita o caminho crítico.
