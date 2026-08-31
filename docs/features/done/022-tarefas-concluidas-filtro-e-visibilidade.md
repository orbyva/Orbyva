# 022 — Tarefas concluídas: filtro, seção separada e visibilidade consistente

## Contexto
Hoje tarefas concluídas ficam misturadas com as pendentes em toda visão de tarefas: na Lista
(`TaskList.tsx`, agrupamento por `bucketForDueDate`/`AGENDA_BUCKET_ORDER`, feature 015), uma tarefa
feita com prazo vencido continua aparecendo dentro do bucket "Atrasadas" (só com risco no título),
e uma sem prazo fica dentro de "Sem prazo" — não existe como esconder ou isolar o que já foi
concluído. O usuário relatou que isso polui a visão do dia a dia. Pedido, em ordem de prioridade:

1. Filtro de status (Pendentes/Concluídas/Todas) no topo de Tarefas e da aba Lista de projetos,
   com "Pendentes" como padrão.
2. Seção "Concluídas" separada e recolhível (em vez de misturada dentro dos buckets de prazo),
   como Todoist/Things.
3. Estender a marcação visual de concluída (cor esmaecida/risco) também ao Gantt.
4. Revisar o widget de cronômetro (`LiveWidget.tsx`) pra não tratar tarefa já concluída como se
   estivesse disponível pra retomar.
5. Padronizar mensagens de estado vazio nas visões Kanban/Lista/Gantt.

## Decisões
- **Filtro de status**: `Select`/`Tabs` com três opções — Pendentes (padrão) / Concluídas / Todas —
  acima da lista em `TaskList.tsx` e da aba Lista de `ProjectDetail.tsx` (mesmo padrão visual dos
  filtros de projeto/tag já existentes nessas telas). Persistir em estado local do componente, sem
  querystring nem localStorage nesta rodada (YAGNI — nenhuma tela hoje persiste filtro entre
  sessões).
- **Pendentes** (padrão): comportamento de hoje, mas só tarefas com `status !== "done"` — os
  buckets de `bucketForDueDate` (Atrasadas/Hoje/Esta semana/Este mês/Mais tarde/Sem prazo) somem de
  vez as concluídas, não precisam mais lidar com elas.
- **Concluídas**: uma seção só, sem agrupamento por prazo (prazo já não importa pra algo que
  terminou) — ordenada por `completed_at` desc (mais recente primeiro). Recolhível
  (`ExpandSubtasksButton`-like toggle, ou um `Collapsible` novo se não houver componente
  reaproveitável — verificar `@/components/ui/` antes de criar um), fechada por padrão pra não
  poluir visualmente mesmo quando visível.
- **Todas**: buckets de pendentes (como hoje) + a seção "Concluídas" (recolhível) no fim, nunca
  misturados no mesmo bucket.
- **Séries recorrentes**: `collapseRecurringSeries` (`domain/tasks/agenda.ts`) já reduz uma série
  à próxima ocorrência em aberto — isso é ortogonal ao filtro novo (aplica-se só dentro de
  "Pendentes"/"Todas"; "Concluídas" mostra instâncias concluídas individualmente, sem colapsar,
  já que cada uma é um registro distinto de quando a tarefa foi feita).
- **Gantt**: nó com `progress === 100` (via `buildGanttNodes`, `domain/tasks/gantt.ts:48`) ganha
  texto esmaecido/riscado — via `style`/classe do nó se a lib (`@svar-ui/react-gantt`) expuser
  customização por linha, senão via CSS scoped no wrapper (mesmo princípio já usado pro tema
  dark/light em `GanttChart.tsx`). Decidir o mecanismo exato durante a implementação, olhando a API
  real da lib.
- **`LiveWidget.tsx`**: o fallback de "última tarefa interagida" (`activeEntry = runningEntry ??
  lastEntry`, linha 49) não checa `task.status` — se a última tarefa interagida foi concluída
  depois, o widget ainda oferece "Retomar timer" nela. Corrigir: quando `!isRunning` e
  `task.status === "done"`, não renderizar o widget (mesmo critério de `!activeEntry`/`!task` na
  linha 74) — não faz sentido reabrir timer de tarefa concluída, e buscar a próxima tarefa não-feita
  mais recente é escopo maior sem pedido explícito (YAGNI por ora).
- **Estados vazios**: hoje divergem em ícone/copy/ação entre `TaskList.tsx` (`icon={ListTodo}`,
  "Nenhuma tarefa", botão "Nova tarefa"), `TasksGantt.tsx` (sem ícone, "Nenhuma tarefa ainda", sem
  botão), `ProjectDetail.tsx` aba Lista (`icon={ListTodo}`, "Nenhuma tarefa", sem botão) e as
  colunas do Kanban (`Projects.tsx`/`ProjectDetail.tsx`, texto "Nenhuma tarefa" cru dentro da
  coluna, sem `EmptyState`). Padronizar: mesmo ícone (`ListTodo`) e mesma copy-base
  ("Nenhuma tarefa" + variação contextual de description), botão de ação onde fizer sentido criar
  ali mesmo (Lista/Kanban) e sem botão onde não (Gantt, coluna vazia de Kanban por status
  específico).

## Tarefas
- [x] Filtro de status (Pendentes/Concluídas/Todas, padrão Pendentes) em `TaskList.tsx`
- [x] Mesmo filtro na aba Lista de `ProjectDetail.tsx`
- [x] Seção "Concluídas" recolhível (ordenada por `completed_at` desc, sem agrupamento por prazo),
      substituindo a mistura atual dentro dos buckets — nas duas telas acima
- [x] Testes Vitest para a lógica de domínio nova (filtrar/agrupar por status), se alguma função de
      `domain/tasks/agenda.ts` mudar de assinatura ou ganhar uma variante
- [x] Marcação visual de concluída no Gantt (`GanttChart.tsx`/`domain/tasks/gantt.ts`) — texto
      esmaecido/riscado pra nós com `progress === 100`
- [x] `LiveWidget.tsx`: não mostrar o widget (nem "Retomar") quando a única tarefa disponível
      (fallback de última interagida) já está `status === "done"`
- [x] Padronizar `EmptyState` (ícone, copy, presença/ausência de botão) em `TaskList.tsx`,
      `TasksGantt.tsx`, aba Lista e colunas do Kanban de `ProjectDetail.tsx`
- [x] `npm run build && npm run lint` + teste manual em cada item (filtro nas duas telas, seção
      concluídas recolhe/expande, Gantt mostra tarefa concluída esmaecida, widget não aparece pra
      tarefa concluída, estados vazios visualmente consistentes)

## Notas
- **Mecanismo real do Gantt**: `@svar-ui/react-gantt` não expõe `rowStyle`/classe por linha na
  grade (só a barra do timeline tem `data-task-id`, útil pra CSS mas não pro texto da grade à
  esquerda, que é o que a spec pedia). Achado o hook oficial revendo o bundle: a lib expõe
  `getDefaultColumns()` (re-exportado por `@svar-ui/react-gantt`) e, se a coluna `"text"` receber
  um `cell` customizado, a própria lib preserva o ícone de expandir/recolher e a indentação da
  árvore (embrulha meu componente automaticamente). `GanttChart.tsx` clona `getDefaultColumns()`,
  seta `cell` só na coluna `text` pra esmaecer/riscar quando `row.type === "task" && row.progress
  === 100`, e passa o array via `columns` — resto do Gantt (drag, dependências, zoom) intacto.
- **`EmptyState` das colunas do Kanban**: mantive o placeholder inline leve (`<p>` com borda
  tracejada, sem ícone/botão) como está em `ProjectDetail.tsx` — já era consistente com o mesmo
  padrão em `Projects.tsx` (que é "Nenhum projeto" por status, entidade diferente, não tarefa).
  Trocar por `EmptyState` cheio (ícone+título+descrição) numa coluna estreita de 3 colunas ficaria
  desproporcional; a decisão já previa "sem botão" pra esse caso, então só a ausência de botão
  importava aqui, não o componente em si.
