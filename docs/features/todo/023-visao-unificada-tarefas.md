# 023 — Visão unificada de Tarefas (Lista/Kanban/Gantt/Agenda no mesmo lugar)

## Contexto
Hoje o grupo "Produtividade" da sidebar tem 6 itens, cada um sua própria página/rota:
Tarefas (`/tasks`, `TaskList.tsx`), Agenda (`/tasks/agenda`), Projetos (`/tasks/projects`), Gantt
(`/tasks/gantt`), Live (`/tasks/live`) e Tags (`/tasks/tags`) — `src/components/app-sidebar.tsx`,
`NAV_PRODUTIVIDADE`. Cada visão (Lista, Kanban, Gantt, Agenda) já existe em algum lugar, mas
espalhada: Kanban de tarefas só existe hoje **dentro de um projeto** (`ProjectDetail.tsx`, aba
Kanban) — não existe um Kanban global cruzando todos os projetos, ao contrário de Gantt e Agenda,
que já têm versão "todos os projetos" (`TasksGantt.tsx`, `AgendaCalendar.tsx`).

Pedido do usuário: em vez de abas/rotas separadas para cada visão, ter tudo dentro de **Tarefas**
— Lista, Kanban, Gantt e Agenda como a mesma tela, alternando visão. **Projetos** continua como
está, sendo a visão geral (overview) de projetos. Live e Tags deixam de ser itens fixos da sidebar
— viram acesso secundário a partir da própria tela de Tarefas (o usuário citou como exemplo: "tudo
podem ser botões na página de [Tarefas]").

## Decisões
- **Sidebar `NAV_PRODUTIVIDADE` encolhe pra 2 itens**: Tarefas e Projetos. Agenda, Gantt, Live e
  Tags saem da lista fixa (`app-sidebar.tsx`).
- **`TaskList.tsx` ganha seletor de visão** (`Tabs`/`TabsList` — mesmo componente/padrão já usado
  em `ProjectDetail.tsx` linhas 720-722 e `Projects.tsx` para Lista/Kanban) com 4 opções: Lista
  (padrão, o que `TaskList.tsx` já é hoje) / Kanban / Gantt / Agenda.
  - **Gantt**: reaproveita `GanttChart.tsx` direto (já aceita `tasks`+`projects` e já suporta "todos
    os projetos", usado hoje por `TasksGantt.tsx`) — sem componente novo.
  - **Agenda**: reaproveita a grade mensal de `AgendaCalendar.tsx` — precisa extrair o conteúdo da
    página pra um componente (`AgendaGrid`?) reutilizável dentro da aba, já que hoje
    `AgendaCalendar.tsx` é a página inteira (`PageShell` + grade). Decidir o corte exato do
    componente durante a implementação.
  - **Kanban: não existe hoje uma versão global.** Precisa ser construído — colunas por status
    (A fazer/Fazendo/Feito, mesmo padrão de `ProjectDetail.tsx`), cards cruzando todos os projetos
    (com badge do projeto em cada card, já que aqui não há um projeto implícito), drag-and-drop
    entre colunas trocando status (reaproveita o padrão já validado em `ProjectDetail.tsx`/
    `Projects.tsx`, `@dnd-kit`). Este é o item de maior esforço da feature — praticamente uma tela
    nova, não só mover código.
- **Projetos continua como está** — visão geral de projetos (Lista/Kanban de *projetos*, não de
  tarefas — já existe em `Projects.tsx`, sem mudança). A aba Kanban/Lista/Gantt *dentro* de um
  projeto (`ProjectDetail.tsx`) continua existindo do jeito que está — é o escopo "tarefas deste
  projeto", diferente do escopo "todas as tarefas" que `TaskList.tsx` ganha aqui. Nenhuma duplicação
  nova: `ProjectDetail.tsx` já filtra por projeto; a versão em `TaskList.tsx` sempre mostra todos
  (com filtro de projeto já existente na Lista, reaproveitado pelas outras abas também).
- **Live**: sai da sidebar; vira um botão no cabeçalho de `TaskList.tsx` (ao lado de "Nova tarefa")
  que navega pra `/tasks/live` — a página/rota em si **não muda** nesta rodada (menor risco que
  tentar embutir o timer + histórico completo dentro de uma aba). `LiveWidget.tsx` (widget
  flutuante global) já cobre boa parte do "acesso rápido" que motivaria embutir Live de verdade;
  reavaliar embutir por completo como Onda 2 se o usuário achar o botão-pra-página insuficiente.
- **Tags**: mesma decisão — sai da sidebar, vira botão em `TaskList.tsx` navegando pra
  `/tasks/tags`. Rota mantida.
- **Rotas preservadas**: `/tasks/agenda`, `/tasks/gantt`, `/tasks/live`, `/tasks/tags` continuam
  existindo (só saem da sidebar) — evita quebrar links/bookmarks e mantém `TasksGantt.tsx`/
  `AgendaCalendar.tsx` como páginas standalone reaproveitáveis pelos componentes extraídos acima,
  em vez de apagar código que a aba nova volta a usar.
- Fora de escopo nesta rodada: embutir Live/Tags de verdade dentro da tela de Tarefas (dialog/sheet
  em vez de navegação); remover as páginas standalone de Agenda/Gantt.

## Tarefas
- [ ] Reduzir `NAV_PRODUTIVIDADE` (`app-sidebar.tsx`) pra Tarefas + Projetos
- [ ] Adicionar seletor de visão (`Tabs`) em `TaskList.tsx`: Lista (padrão) / Kanban / Gantt /
      Agenda
- [ ] Aba Gantt: embutir `GanttChart.tsx` com todos os projetos (mesmo uso de `TasksGantt.tsx`)
- [ ] Aba Agenda: extrair a grade de `AgendaCalendar.tsx` pra um componente reutilizável e embutir
- [ ] Aba Kanban: construir Kanban global de tarefas (colunas por status, cards de todos os
      projetos com badge de projeto, drag-and-drop trocando status) — não existe hoje, maior peça
      desta feature
- [ ] Botões "Live" e "Tags" no cabeçalho de `TaskList.tsx`, navegando pras rotas existentes
- [ ] Testes Vitest para qualquer lógica de domínio nova (ex.: agrupamento do Kanban global)
- [ ] `npm run build && npm run lint` + teste manual: alternar entre as 4 visões sem perder
      filtro/contexto, Kanban global funcionando (drag-and-drop, todos os projetos), botões Live/Tags
      navegando certo

## Notas
- **Presunções a confirmar com o usuário antes de implementar** (a mensagem original terminou em
  "tudo podem ser botões na página de" sem nomear a página — assumi que é a de Tarefas, por ser
  onde o pedido diz que "tudo deve funcionar"):
  1. Live e Tags viram *navegação* (botão → rota existente), não um dialog/painel embutido — meno
     risco, mas pode não ser o que o usuário imaginou ao dizer "botões". Confirmar.
  2. O Kanban global é a peça de maior esforço aqui (tela nova) — vale confirmar se entra nesta
     rodada ou se as outras 3 visões (Lista/Gantt/Agenda unificadas) já resolvem a maior parte do
     incômodo, deixando Kanban global pra depois.
  3. Esta feature tem sobreposição com 014 (Gantt) e 016 (Agenda semana/dia), ambas em andamento —
     faz mais sentido implementar 023 depois delas, pra a aba embutida já nascer com as visões de
     semana/dia e edição por arrasto, em vez de embutir a versão antiga e ter que atualizar de
     novo depois.
