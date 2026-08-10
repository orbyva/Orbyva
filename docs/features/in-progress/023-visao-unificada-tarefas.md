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
- **Status inline na lista**: trocar o badge estático (`TaskListRow` em
  `src/pages/admin/tasks/TaskViews.tsx:230-232`) por um `<Select>` (shadcn) com as 3 opções (A
  fazer/Fazendo/Feito). Reaproveita `applyStatusChange(task, nextStatus)` — já existe em
  `TaskList.tsx`/`ProjectDetail.tsx` e é a mesma função usada pelo Kanban e pelo toggle atual — sem
  duplicar a persistência (`updateTask`, `src/api/tasks/tasks.ts:168`). O botão-check circular
  (`onToggleDone`) pode continuar como atalho pra `done`, ou sair de cena a favor do Select —
  decidir durante a implementação conforme o resultado visual.
- **Bug: flicker do `TagCombobox`**: causa mais provável é `PopoverAnchor asChild` envolvendo o
  próprio `Input` — o formulário pai (`TaskList.tsx`) re-renderiza a árvore inteira a cada tecla
  digitada (`setForm`), e o Radix Popover interpreta isso como interação externa e fecha o popover
  logo depois de abrir. Investigar trocar `PopoverAnchor` por um `PopoverTrigger` dedicado e/ou
  isolar o `TagCombobox` do re-render do pai (`React.memo`, ou mover o estado de digitação pra
  dentro do próprio componente sem depender do form pai). Causa exata só se confirma testando no
  browser.
- **Prazo de subtarefa ≤ prazo da tarefa pai**: criar uma função de validação em
  `src/domain/tasks/subtasks.ts` (ex. `isSubtaskDueDateValid(subtaskDueDate, parentDueDate)`) e
  reaproveitar nos dois pontos de entrada — criação (`TaskSubtasksField.tsx`) e edição
  (`SubtaskEditDialog.tsx`) — em vez de duplicar a checagem. Regra: se a tarefa pai tem `due_date`
  definido, a subtarefa não pode ter `due_date` posterior (mesmo campo em ambos, `Task.due_date`,
  `src/types/tasks.ts:86`). Se a tarefa pai não tiver prazo, subtarefa fica livre. Bloquear no date
  picker (se o componente suportar limite máximo) e também validar antes de salvar, com mensagem de
  erro clara.
- **Modal de criação/edição de tarefa mais largo em telas web**: `FORM_DIALOG_CONTENT_CLASS`
  (`src/components/FormLabel.tsx:32`, hoje `max-w-md sm:max-w-lg w-full p-4 sm:p-6`) é compartilhada
  por 6 dialogs (Tags, Projects, ProjectDetail, AgendaGrid, SubtaskEditDialog, TaskList). Alargar a
  constante global afetaria dialogs simples (Tags, Subtask) que não precisam do espaço extra —
  então criar uma variante nova (`FORM_DIALOG_CONTENT_CLASS_LG`, ex.
  `max-w-md sm:max-w-2xl lg:max-w-3xl w-full p-4 sm:p-6`) só pro dialog de criar/editar tarefa
  (`TaskList.tsx:527`), que é o formulário em abas com mais campos.

## Tarefas
- [x] Reduzir `NAV_PRODUTIVIDADE` (`app-sidebar.tsx`) pra Tarefas + Projetos
- [x] Adicionar seletor de visão (`Tabs`) em `TaskList.tsx`: Lista (padrão) / Kanban / Gantt /
      Agenda
- [x] Aba Gantt: embutir `GanttChart.tsx` com todos os projetos (mesmo uso de `TasksGantt.tsx`)
- [x] Aba Agenda: extrair a grade de `AgendaCalendar.tsx` pra um componente reutilizável e embutir
- [x] Aba Kanban: construir Kanban global de tarefas (colunas por status, cards de todos os
      projetos com badge de projeto, drag-and-drop trocando status) — não existe hoje, maior peça
      desta feature
- [x] Botões "Live" e "Tags" no cabeçalho de `TaskList.tsx`, navegando pras rotas existentes
- [x] Testes Vitest para qualquer lógica de domínio nova (ex.: agrupamento do Kanban global) — não
      precisou de função nova; agrupamento por status é um loop inline (mesmo padrão já usado sem
      teste dedicado em `ProjectDetail.tsx`)
- [x] `npm run build && npm run lint` + teste manual: alternar entre as 4 visões sem perder
      filtro/contexto, Kanban global funcionando (drag-and-drop, todos os projetos), botões Live/Tags
      navegando certo
- [ ] Trocar badge de status por `<Select>` inline na lista (`TaskViews.tsx`), reaproveitando
      `applyStatusChange`
- [ ] Investigar e corrigir o flicker do `TagCombobox.tsx` (popover fechando logo após abrir)
- [ ] Criar `isSubtaskDueDateValid` em `src/domain/tasks/subtasks.ts` + teste Vitest cobrindo:
      subtarefa sem prazo, subtarefa igual ao prazo do pai, subtarefa depois do pai (inválida), pai
      sem prazo (qualquer prazo de subtarefa válido)
- [ ] Aplicar a validação em `SubtaskEditDialog.tsx` e `TaskSubtasksField.tsx` (bloquear
      seleção/salvamento além do prazo do pai)
- [ ] Criar `FORM_DIALOG_CONTENT_CLASS_LG` em `FormLabel.tsx` e aplicar no dialog de tarefa
      (`TaskList.tsx:527`)
- [ ] Teste manual extra: mudar status pela lista, abrir tags sem flicker, tentar salvar subtarefa
      com prazo além do pai (deve bloquear), abrir modal de criar tarefa em tela grande (deve estar
      visivelmente mais largo)

## Notas
- **Presunções confirmadas com o usuário antes de implementar** (2026-08-10):
  1. Live e Tags viram *navegação* (botão → rota existente), não um dialog/painel embutido —
     confirmado.
  2. Kanban global entra nesta rodada, junto com Lista/Gantt/Agenda unificados — confirmado, não
     fica pra depois.
  3. 014 (Gantt) e 016 (Agenda) já estão em `done/`, e 016 ganhou uma extensão com visões
     semana/dia (`Tabs` Mês/Semana/Dia) — a aba embutida de Agenda aqui já nasce reaproveitando
     tudo isso, sem versão desatualizada pra atualizar depois.
- **Encaixe em vez de feature nova** (2026-08-10): 4 pedidos avulsos (status inline na lista, bug
  de flicker no `TagCombobox`, prazo de subtarefa limitado pelo prazo da tarefa pai, modal de
  criação mais largo) foram encaixados aqui em vez de virarem um `024` novo — todos mexem nas
  mesmas telas que esta feature já está tocando (`TaskList.tsx`, formulário de tarefa, subtarefas).
  Regra registrada em `CLAUDE.md`: priorizar encaixar em feature já documentada antes de criar uma
  nova.
