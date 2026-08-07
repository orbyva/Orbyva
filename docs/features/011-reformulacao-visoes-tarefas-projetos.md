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
- [x] Fix `isNavItemActive`/`nav-main.tsx`: "Tarefas" só ativa em `/tasks` exato
- [x] `TaskListRow`, `KanbanCard` (tarefas), `ProjectCard`: clique no corpo abre edição/navega;
      `stopPropagation` nos controles internos (`TaskAgendaCard` não existe mais desde a feature
      015 — seu comportamento já foi herdado por `TaskListRow`)
- [x] Título recorrente separa "abrir edição" (clique no corpo do card) de "ver ocorrências"
      (ícone `Repeat` clicável à parte), disponível para tarefas recorrentes e não-recorrentes
- [x] Seção "Subtarefas" no dialog de tarefa (criação e edição, nos dois formulários) — encadeia
      `createTask` da pai + subtarefas ao criar; componente novo compartilhado
      `TaskSubtasksField.tsx`
- [x] `DndContext`/`SortableContext` no Kanban de projetos; `onDragEnd` chama a troca de status
      (mesma função do `<select>` atual) com atualização otimista; indicador visual do drag
- [x] Botão "Nova tarefa" no cabeçalho da página `/tasks/projects/:id` (em `/tasks` já estava fora
      das abas desde antes da feature 015)
- [x] Hook/contexto compartilhado de timer ativo (`useActiveTimer`, montado em `AdminLayout`),
      consumido por `Live.tsx` e pelas novas ações inline; ícone de play/stop nos cards; estado
      visual de "rodando"; regra de timer único (já resolvida no nível da API — `startTimer` já
      parava qualquer timer anterior antes de iniciar um novo, feature 001)
- [x] `npm run build && npm run lint` limpos (322 testes Vitest passando, 0 erros de lint,
      `tsc -b` limpo)
- [ ] Verificação manual no navegador (clique em cada tipo de card/linha abre o esperado sem
      disparar ações internas por engano; criar tarefa já com subtarefas; drag-and-drop no Kanban
      de projetos por mouse/teclado; iniciar timer pelo Kanban e ver refletido em Live) —
      **bloqueada**: sem credenciais de login disponíveis nesta sessão, mesmo bloqueio já
      registrado nas features 009 e 015

## Notas
- **Seção "Clareza Lista vs Agenda + botão de criar global" não foi implementada como planejada
  originalmente** — a feature 015 (implementada antes desta, na ordem escolhida pelo usuário) já
  fundiu Lista e Agenda numa visão só, então o texto de apoio explicando a diferença entre elas
  deixou de fazer sentido. A parte do botão "Nova tarefa" fora das abas sobreviveu e foi aplicada
  em `ProjectDetail.tsx` (a página `/tasks` já não tinha mais abas desde a 015).
- **Kanban de tarefas manteve o input inline de "Adicionar subtarefa" por cartão** — a decisão
  original dizia que a seção nova do dialog "substitui o input separado que só o Kanban tem hoje".
  Na implementação, optei por manter os dois: o input inline do Kanban continua (é rápido, não
  força abrir um dialog só pra adicionar uma subtarefa enquanto se navega pelo board), e a seção
  nova do dialog cobre o que faltava de verdade — criar subtarefas já na criação da tarefa-pai, e
  dar essa mesma capacidade à Lista, que não tinha nenhuma. Reavaliar com o usuário se o input
  inline do Kanban deveria mesmo sumir.
- Verificação manual completa (clique-para-abrir em cada superfície, drag-and-drop do Kanban de
  projetos, timer inline refletindo em `/tasks/live`) não foi possível nesta sessão por falta de
  credenciais de login — build/lint/testes automatizados e revisão manual do código (incluindo os
  pontos de `stopPropagation`) foram a verificação disponível.
