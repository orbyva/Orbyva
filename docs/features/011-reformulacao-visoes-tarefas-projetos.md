# 011 — Reformulação das visões de tarefas e projetos

## Contexto
Depois das features 001-008, o usuário aponta que a experiência de navegar/interagir com
tarefas e projetos ainda tem vários atritos concretos, todos girando em torno de "como eu clico,
crio e me localizo" nas visões existentes (Lista, Agenda, Kanban de tarefas, Kanban/Lista de
projetos):

1. Clicar no card/linha de uma tarefa ou projeto não abre nada — só um ícone de lápis dedicado
   funciona (`TaskViews.tsx:202`, `ProjectDetail.tsx:171-178`, `Projects.tsx:125`); a Agenda nem
   tem botão de editar em tarefas não-recorrentes (`TaskViews.tsx:97-102`,
   `disabled={!recurring}`).
2. Subtarefas só podem ser adicionadas depois que a tarefa-pai já existe, via um input separado no
   card do Kanban (`ProjectDetail.tsx:506-521`) — `TaskList.tsx` nem tem essa capacidade.
3. O item "Tarefas" da sidebar fica destacado junto com "Projetos" sempre que a rota é
   `/tasks/projects*`, porque `isNavItemActive` usa `startsWith("/tasks/")` sem excluir o prefixo
   mais específico (`src/components/nav-main.tsx:24-30`).
4. O Kanban de **projetos** (`Projects.tsx`, feature 006) não tem drag-and-drop — usa um `<select>`
   compacto para trocar de coluna — diferente do Kanban de **tarefas**, que já tem drag-and-drop
   desde a feature 003 (`@dnd-kit/core`+`@dnd-kit/sortable`).
5. O usuário não entende a diferença entre a aba Lista e a aba Agenda (features 004/008), e a
   Agenda dentro de um projeto (feature 007) soa confusa.
6. O botão de criar tarefa só existe dentro do conteúdo do Kanban — nas abas Lista/Agenda não há
   como criar uma tarefa nova sem trocar de aba primeiro.
7. Não existe nenhuma ação de "iniciar timer" direto num card/linha de tarefa — só em `/tasks/live`
   escolhendo a tarefa num `Select` (`Live.tsx:176-187`, `handleStart` linha 111).

## Decisões

### Clique abre, criação já com subtarefas, fix da sidebar
- **Clique abre**: o corpo do card/linha (não só o ícone de lápis) chama `onEdit`/navega, em:
  `TaskListRow` e `TaskAgendaCard` (Lista/Agenda), `KanbanCard` (Kanban de tarefas), `ProjectCard`
  (Lista/Kanban de projetos, navega para `/tasks/projects/:id`). O ícone de lápis continua existindo
  onde já existe hoje. Elementos com ação própria (checkbox de conclusão, expandir subtarefas, "ver
  ocorrências") usam `stopPropagation`.
- `TaskAgendaCard` ganha ação de editar para tarefas não-recorrentes também — clicar no card abre o
  dialog de edição sempre; "Ver ocorrências" vira um botão/ícone à parte.
- **Subtarefas na criação**: o dialog de criar tarefa ganha uma seção "Subtarefas" (adicionar/remover
  linha, sem checkbox — nascem `todo`) antes de salvar. Ao criar, encadeia `createTask` da pai +
  `createTask` de cada subtarefa com `parent_task_id` — sem endpoint novo. No modo de edição, a
  mesma seção substitui o input separado que só o Kanban tem hoje (unifica os dois formulários).
- **Fix da sidebar**: `isNavItemActive` passa a dar checagem exata para "Tarefas"
  (`pathname === "/tasks"`) e mantém `startsWith` para "Projetos"/"Live" — evita lógica genérica de
  especificidade que nenhum outro grupo da sidebar precisa (YAGNI).

### Drag-and-drop no Kanban de projetos
- Reaproveita o padrão já validado na feature 003: `DndContext`/`SortableContext` por coluna,
  card com `useSortable`, `DragOverlay`, `useDroppable`/`isOver` para destacar a coluna de destino,
  `onDragEnd` chama a mesma função de troca de status que o `<select>` já usa hoje — o select
  continua existindo (acessibilidade/mobile). Sem dependência nova (`@dnd-kit` já instalado).
  Reordenar dentro da mesma coluna fica fora de escopo (mesma decisão da 003).

### Clareza Lista vs Agenda + botão de criar global
- **Botão "Nova tarefa" sai das abas**: vira parte do cabeçalho da página (`/tasks` e
  `/tasks/projects/:id`), ao lado do seletor de abas, visível independente de qual aba está ativa.
  Mesmo dialog de sempre (agora com subtarefas).
- **Texto de apoio** (`text-xs text-muted-foreground`) abaixo do seletor de abas explicando a
  diferença: "Lista: todas as tarefas, filtráveis por projeto/tag/prazo" / "Agenda: agrupadas por
  Atrasadas/Hoje/Esta semana/Este mês". Renomear "Lista" para algo mais claro (ex. "Todas") é uma
  decisão final de naming a confirmar com o usuário durante a implementação.
- **Agenda dentro do projeto** reaproveita o mesmo componente da Agenda global — dentro de um
  projeto, omite o badge de projeto no card (redundante) e usa os mesmos textos de apoio acima. Se
  sobrar confusão específica além disso, é achado de verificação manual — não redesenhar do zero
  sem antes confirmar com o usuário o que ainda soa confuso.
- Fora de escopo: fundir Lista e Agenda numa visão só, ou remover uma delas.

### Timer inline
- Ícone de play em `TaskListRow`, `TaskAgendaCard` e `KanbanCard` (tarefas de topo) chama a mesma
  função de início que `Live.tsx` já usa (`api/tasks/timeEntries.ts`), sem duplicar lógica.
  Extrai o estado de "timer ativo" para um hook/contexto compartilhado (`useActiveTimer`) — hoje só
  `Live.tsx` sabe se há um timer rodando; as outras páginas precisam saber também para mostrar o
  ícone como "rodando" quando aquela tarefa é a ativa.
- **Um timer ativo por vez**: iniciar o timer de uma tarefa enquanto outra está rodando para/avisa
  antes de trocar — decisão exata de UX (parar automaticamente vs. avisar) fica para a
  implementação, mas nunca deve deixar dois timers "rodando" sem o usuário entender o que aconteceu
  com o anterior.
- Indicador de timer ativo aparece nos cards mesmo fora de `/tasks/live`, usando o mesmo hook.
  `Live.tsx` continua existindo como página dedicada (histórico do dia, pause/stop) — esta feature
  só adiciona o atalho de iniciar de outros lugares.

## Tarefas
- [ ] Fix `isNavItemActive`/`nav-main.tsx`: "Tarefas" só ativa em `/tasks` exato
- [ ] `TaskListRow`, `TaskAgendaCard`, `KanbanCard`, `ProjectCard`: clique no corpo abre
      edição/navega; `stopPropagation` nos controles internos
- [ ] `TaskAgendaCard`: separa "abrir edição" de "ver ocorrências", disponível para não-recorrentes
- [ ] Seção "Subtarefas" no dialog de tarefa (criação e edição, nos dois formulários) — encadeia
      `createTask` da pai + subtarefas ao criar
- [ ] `DndContext`/`SortableContext` no Kanban de projetos; `onDragEnd` chama a troca de status
      (mesma função do `<select>` atual) com atualização otimista; indicador visual do drag
- [ ] Mover botão "Nova tarefa" para o cabeçalho da página (fora do conteúdo das abas), em
      `/tasks` e `/tasks/projects/:id`
- [ ] Texto de apoio Lista vs Agenda + omitir badge de projeto redundante na Agenda do projeto
- [ ] Hook/contexto compartilhado de timer ativo, consumido por `Live.tsx` e pelas novas ações
      inline; ícone de play nos cards; estado visual de "rodando"; regra de timer único
- [ ] `npm run build && npm run lint` limpos + verificação manual (clique em cada tipo de
      card/linha abre o esperado sem disparar ações internas por engano; criar tarefa já com
      subtarefas; drag-and-drop no Kanban de projetos por mouse/teclado; diferença Lista/Agenda
      validada diretamente com o usuário; iniciar timer pelo Kanban e ver refletido em Live)

## Notas
