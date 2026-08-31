---
prompt: |
  i need more controls in the tasks visualizations
  - attribute prioridade, prazo (com horário)
  - mudar projeto (sem abrir edição de tarefa, somente clicar no ícone do projeto (que precisa inclusive trazer a cor do projeto, e abrir um mini modal em cima, tipo um updown, ou dropdown, para eu selecionar o projeto. principalmento quando naõ tiver projeto assimilado e eu tiver que assinalar um projeto))
---

# 029 — Edição rápida inline na aba Lista de Tarefas

## Contexto
Na aba Lista de `/tasks` (`TaskList.tsx`, view padrão), cada card (`TaskListRow`,
`TaskViews.tsx:164-338`) hoje só mostra prioridade, prazo e projeto — nenhum dos três é editável
sem abrir o dialog completo de edição (`onEdit`, que abre o form com abas Geral/Data e
repetição/Organização). Levantamento do estado atual de cada controle:

- **Prioridade**: `TaskPriorityFlag` (`TaskPriorityField.tsx:14-26`) renderiza só um ícone
  `Flag` colorido (azul/âmbar/vermelho conforme `TaskPriority`) quando a tarefa tem prioridade —
  sem prioridade, não renderiza nada, não há elemento clicável. A edição só existe dentro do form
  completo, via `TaskPriorityField` (grupo de botões Baixa/Média/Alta, mesmo arquivo,
  linhas 28-54) — reaproveitável para o popover rápido.
- **Prazo (com horário)**: `TaskListRow` mostra `task.due_date`/`task.due_time` formatados como
  texto estático (`TaskViews.tsx:284-289`, `formatDateTimeBR`) só quando a tarefa não está
  concluída e tem `due_date`; sem prazo, não renderiza nada. A edição só existe no form completo,
  via `DatePicker` (`src/components/DatePicker.tsx`, já usado com `clearable` em
  `TaskRecurrenceField.tsx:292-307`) + `<Input type="time">`/`OptionalTimeInput`
  (`src/components/OptionalTimeInput.tsx`).
- **Projeto**: `TaskListRow` recebe um `projectBadge?: ReactNode` (feature `done/025`) — em
  `TaskList.tsx` (linhas 674-677 na aba Lista), é montado inline como
  `<Badge variant="outline">{project.name}</Badge>`, texto puro, sem a cor do projeto e sem
  interação (não é clicável). A troca de projeto só existe no form completo, via `ProjectPicker`
  (`ProjectPicker.tsx`, feature `done/026`) — já é exatamente uma lista clicável com bolinha da
  cor do projeto (`project.color`) e "Sem projeto" como primeira opção; é o componente ideal para
  reaproveitar dentro de um popover.

Pedido do usuário: os três controles direto no card da lista, sem abrir o form — prioridade e
prazo (com horário) editáveis inline, e o "ícone do projeto" clicável (mostrando a cor do
projeto) abrindo um mini modal/dropdown para trocar, especialmente quando a tarefa ainda não tem
projeto nenhum.

**Proximidade com features existentes, sem encaixar limpo**: `done/025` adicionou o *badge*
somente-leitura de projeto na Lista e o quadrante/filtros — não tocou em edição. `done/026`
trocou o `<Select>` de projeto por `ProjectPicker` só dentro do *formulário* de criar/editar
tarefa — não expôs esse componente fora do form. Nenhuma das duas cobre "editar campos sem abrir
o form" — é um pedido novo (edição inline), por isso vira feature própria, reaproveitando os
componentes que ambas deixaram prontos (`TaskPriorityField`, `ProjectPicker`).

## Decisões
- **Escopo: só a aba Lista** (`TaskListRow` usado em `TaskList.tsx`), mesmo recorte que `done/025`
  já usou ("filtros mais diretos" era só a Lista). Kanban, Gantt e Agenda ficam de fora nesta
  rodada — `KanbanCard` já tem seu próprio layout de card e fica para uma extensão futura se o
  usuário pedir. `ProjectDetail.tsx` (Lista de um projeto específico) também fica fora do controle
  de projeto (todas as tarefas já pertencem ao projeto aberto, não há ambiguidade a resolver ali),
  mas ganha prioridade/prazo inline de graça, já que reaproveita a mesma `TaskListRow` — sem
  trabalho extra, sem regressão.
- Sem endpoint novo: as três edições usam `updateTask({ id, <campo> })` (`api/tasks/tasks.ts:168`)
  já existente, um PATCH parcial (só o campo tocado entra no payload — não reintroduz o bug do
  `due_date` zerado corrigido em `done/002`, que só acontecia no submit do form completo com todos
  os campos).
- **Prioridade**: novo componente `TaskPriorityQuickPick.tsx` (`src/pages/admin/tasks/`) —
  trigger clicável (reaproveita `TaskPriorityFlag`; quando `priority` é `null`, mostra um ícone
  `Flag` outline/apagado como placeholder, para sempre ter algo clicável) dentro de um
  `Popover`/`PopoverContent` com os mesmos botões Baixa/Média/Alta de `TaskPriorityField`
  (extrair o grupo de botões para reuso, ou renderizar `TaskPriorityField` inteiro dentro do
  popover — decidir na implementação pelo que exigir menos duplicação).
- **Prazo com horário**: novo componente `TaskDueQuickEdit.tsx` — trigger clicável (texto/ícone
  de calendário; sem prazo, mostra um placeholder tipo "+ Prazo") abrindo um `Popover` com
  `DatePicker` (`clearable`) para a data e um `<Input type="time">` (mostrado só quando há data,
  mesmo padrão condicional do form) para o horário. Ao mudar, chama `updateTask({ id, due_date,
  due_time })` com os dois campos juntos (evita duas chamadas/duas linhas de `load()`).
- **Projeto**: novo componente `ProjectBadgeButton.tsx` — trigger é um badge colorido (bolinha com
  `project.color`, igual ao padrão já usado em `ProjectPicker`/`ProjectsRail`; sem projeto, mostra
  um badge neutro tipo "Sem projeto" — sempre clicável, resolve o caso "principalmente quando não
  tiver projeto" citado no pedido) abrindo um `Popover` com o `ProjectPicker` já existente dentro
  (`projects` ordenados por `rankProjectsByActivity`, já calculado em `TaskList.tsx` como
  `projectsByActivity`). Ao selecionar, chama `updateTask({ id, project_id })` e fecha o popover.
  Substitui o `projectBadge` montado inline em `TaskList.tsx` (linhas 674-677) na aba Lista.
- Todos os `Popover`/`PopoverContent` recebem `onClick={(e) => e.stopPropagation()}` no wrapper
  (mesmo padrão já usado nos controles inline de `TaskListRow`, ex. o `<Select>` de status,
  `TaskViews.tsx:260-274`) para não disparar `onEdit` do card ao clicar.
- (Adição 2026-08-13) `handleDueChange` hoje chama `updateTask` e depois `load()` — `load()` refaz
  o fetch completo e reagrupa tudo por `groupTasksByAgendaBucket`, então definir um prazo move a
  tarefa na hora para outro bucket (ex. "Sem prazo" → "Este mês") e ela some da posição onde o
  usuário estava olhando. Fix: `handleDueChange` (e só ele — `handlePriorityChange`/
  `handleProjectChange` não mudam o bucket de agenda, sem esse problema) passa a atualizar o campo
  localmente no estado (`tasks`/`agendaGroups` já carregados) sem re-rodar o agrupamento por prazo
  imediatamente, mantendo a tarefa na posição/bucket atual até o próximo `load()` natural (troca de
  filtro, navegação, F5). O valor exibido no `TaskDueQuickEdit` (`formatDateTimeBR`) já reflete o
  novo prazo — só a posição na lista que fica "congelada" até a próxima recarga real.
- (Adição 2026-08-13) `TaskDueQuickEdit` hoje usa o componente `DatePicker` inteiro dentro do seu
  popover — `DatePicker` é ele mesmo um botão/trigger que abre um segundo `Popover` com o
  calendário (`src/components/DatePicker.tsx:88-96`). Isso exige dois cliques pra chegar no
  calendário (abrir o popover de prazo, depois clicar no botão "Selecione a data"/data atual pra
  abrir o calendário de verdade). Fix: `TaskDueQuickEdit` renderiza o `Calendar`
  (`src/components/ui/calendar.tsx`, mesmo componente que `DatePicker` usa internamente) direto
  dentro do seu próprio popover, sem o botão/trigger intermediário do `DatePicker` — calendário já
  aberto assim que o popover de prazo abre, com o campo Horário abaixo dele (mesma posição de hoje).
  Reaproveita as mesmas props/config de navegação de mês que `DatePicker` já usa (`captionLayout`,
  `startMonth`/`endMonth`, `locale`), só sem o wrapper de trigger.
- `TaskListRow` ganha três props novas opcionais — `onPriorityChange?`, `onDueChange?`,
  `onProjectChange?` (mais `projects`/`projectValue` quando `onProjectChange` está presente, ou o
  próprio `ProjectBadgeButton` já pronto passado como prop, a exemplo de como `projectBadge` já
  funciona hoje — decidir o formato exato na implementação, mas mantendo compatível com
  `ProjectDetail.tsx`, que não passa projeto e continua funcionando sem essas props). Ausência de
  qualquer uma delas mantém o comportamento somente-leitura de hoje (sem regressão).

## Tarefas
- [x] Criar `TaskPriorityQuickPick.tsx`: trigger clicável (com placeholder quando `null`) +
      popover com seleção Baixa/Média/Alta, chamando `onChange`
- [x] Criar `TaskDueQuickEdit.tsx`: trigger clicável (com placeholder "+ Prazo" quando `null`) +
      popover com `DatePicker` (clearable) e `<Input type="time">` condicional, chamando `onChange`
      com `{ due_date, due_time }`
- [x] Criar `ProjectBadgeButton.tsx`: trigger badge colorido (cor do projeto, ou neutro "Sem
      projeto") + popover reaproveitando `ProjectPicker`, chamando `onChange` com `project_id`
- [x] Adicionar props opcionais `onPriorityChange`/`onDueChange`/`onProjectChange` em
      `TaskListRow` (`TaskViews.tsx`), renderizando os três componentes novos no lugar do
      `TaskPriorityFlag`/texto de prazo/`projectBadge` estáticos quando as props forem passadas
- [x] Em `TaskList.tsx` (aba Lista): adicionar handlers `handlePriorityChange`/`handleDueChange`/
      `handleProjectChange` (cada um chamando `updateTask` + `load()`, mesmo padrão de
      `handleDelete`) e passar as três props novas para `TaskListRow`, substituindo o
      `projectBadge` inline (linhas 674-677) por `onProjectChange` + `ProjectBadgeButton`
- [x] Em `ProjectDetail.tsx`: passar `onPriorityChange`/`onDueChange` (sem `onProjectChange`, fora
      de escopo ali) para `TaskListRow` na aba Lista, com os mesmos handlers via `updateTask`
- [x] `npx tsc --noEmit && npm run build && npm run lint` — todos passam sem erros novos (só os
      warnings pré-existentes de `react-refresh`/`exhaustive-deps` em arquivos não tocados por
      esta feature)
- [x] Teste manual: na aba Lista de `/tasks`, testar os três controles em uma tarefa (mudar
      prioridade, mudar prazo/horário, trocar projeto — incluindo uma tarefa sem projeto nenhum),
      confirmar que nada abre o form completo e que o quadrante/filtros da feature `done/025`
      continuam funcionando com os valores atualizados; repetir prioridade/prazo dentro de um
      projeto em `ProjectDetail.tsx`
- [x] Corrigir `handleDueChange` (`TaskList.tsx` e o equivalente em `ProjectDetail.tsx`) para não
      re-rodar o agrupamento por prazo (`load()` completo) logo após salvar — atualizar o campo
      localmente e manter a tarefa no bucket/posição atual até a próxima recarga natural da lista
- [x] Em `TaskDueQuickEdit.tsx`, trocar o uso do componente `DatePicker` (que tem seu próprio
      trigger/popover aninhado) por `Calendar` renderizado direto no popover — calendário já aberto
      assim que o popover de prazo abre, campo Horário logo abaixo (mesma posição/condição de hoje)
- [x] Teste manual: numa tarefa em "Sem prazo", abrir o popover de prazo — confirmar que o
      calendário já aparece aberto (sem precisar de um segundo clique) com o campo Horário abaixo;
      definir uma data futura (ex. daqui a 2 semanas) — confirmar que o card continua no
      lugar/bucket onde estava (não pula pra "Este mês"/outro bucket na hora) e que o valor exibido
      no trigger já reflete a nova data; trocar de aba/filtro e voltar (ou dar F5) e confirmar que
      aí sim o card aparece no bucket correto; `npx tsc --noEmit && npm run build && npm run lint`

## Prompts
- 2026-08-13 — "o modal de adição de prazo na tela de visualização das tarefas, já deve incluir também o horário. cuidado para ao atualizar o prazo, não mover o card, fazendo com que o usuário o perca de foco. mas a ideia é já poder informar o prazo(opcional)->horário(opcional)"
- 2026-08-13 — "ao clicar para adicionar o prazo na tela de visualização de tarefas, é legal já aparecer o calendário aberto, com o horário embaixo, no modal" (via `docs/features/to-refine/refine.md`)

## Notas
- O dev server local (`localhost:5173`) não tinha sessão autenticada disponível para automação
  (redireciona para `/login`) — não dá pra logar via browser tool (entrar com senha é ação
  proibida). Todo o restante foi implementado e verificado via `tsc`/`build`/`lint`/leitura de
  código.
- 2026-08-13: teste manual completo feito via automação de navegador numa sessão logada (ngrok).
  Confirmado na aba Lista de `/tasks`: clicar no ícone de prioridade abre popover com
  `TaskPriorityField` reaproveitado, seleção persiste e reordena a lista; clicar em "+ Prazo" abre
  popover com `DatePicker` + campo "Horário" (confirma prazo com horário, pedido original), data
  selecionada persiste e a tarefa reagrupa para o bucket certo (ex. "Este mês"); clicar no badge de
  projeto abre popover com `ProjectPicker` reaproveitado, troca de projeto persiste e a tarefa some
  do filtro atual (confirma reatividade com o `projectFilter` da feature `done/025`). Nenhum dos
  três abre o form completo de edição. Testado também em `ProjectDetail.tsx` (aba Lista de um
  projeto específico): popover de prioridade abre e funciona igual. Dados de teste revertidos ao
  estado original ao final (prioridade, prazo e projeto da tarefa usada como teste).
- 2026-08-13: implementadas as duas adições do usuário. (1) `TaskDueQuickEdit.tsx` agora usa
  `InlineCalendarPicker` — novo componente extraído de dentro de `DatePicker.tsx` (o corpo do
  calendário: navegação de mês, grade, atalhos "Hoje"/"Limpar"), sem o botão/trigger próprio que o
  `DatePicker` tinha. `DatePicker` virou um wrapper fino (`Popover` + botão + `InlineCalendarPicker`
  dentro do `PopoverContent`) — mesmo comportamento de sempre em todo o resto do app (Data e
  repetição do form de tarefa, Recorrência Financeira, etc.), só `TaskDueQuickEdit` ganhou o
  calendário direto. (2) Para não mover o card ao editar o prazo: `TaskList.tsx` e `ProjectDetail.tsx`
  passaram a guardar um snapshot (`frozenDueDatesRef`, um `Map<taskId, due_date>`) tirado no último
  `load()` real; `pendingTasks`/`agendaGroups` usam esse snapshot (não o `due_date` live) como chave
  de ordenação/bucket, e `handleDueChange` para de chamar `load()` — só atualiza `tasks` localmente.
  Card mostra o novo prazo na hora, mas só muda de bucket/posição na próxima recarga real (F5, troca
  de filtro, navegação).
- **Bug encontrado e corrigido durante o teste manual**: a primeira versão do fix usava
  `frozenDueDatesRef.current.get(task.id) ?? task.due_date` — `??` trata `null` como "ausente" e cai
  pro valor live, mas `due_date: null` (tarefa sem prazo) é o valor congelado mais comum, então o
  freeze não funcionava justamente no caso principal (confirmado ao vivo: definir prazo numa tarefa
  "Sem prazo" movia o card na hora mesmo assim). Corrigido trocando por `.has(task.id) ? (.get(...) ??
  null) : task.due_date` — só cai pro valor live quando a tarefa realmente não está no snapshot
  (recém-criada), não quando o snapshot tem `null` de propósito. Reconfirmado ao vivo depois do fix:
  tarefa fica no bucket original tanto ao definir quanto ao limpar o prazo, até o próximo reload.
- 2026-08-20 — **Esta decisão foi revista pela feature `081`.** O congelamento total descrito acima
  (o card só muda de bucket na próxima recarga real) virou congelamento **enquanto o popover de
  prazo daquela linha está aberto**: `TaskDueQuickEdit` ganhou `onOpenChange`, e
  `TaskList`/`ProjectDetail` ganharam `handleDueOpenChange`, que ao fechar remove a tarefa do
  `frozenDueDatesRef` e chama `load()` — a lista reagrupa na hora, e a tarefa cai na caixa de prazo
  certa. O motivo original do freeze continua valendo e continua testado (ajustar data, horário e
  duração na mesma abertura sem o popover saltar/fechar), então o `frozenDueDatesRef` **não** é
  código morto: quem for lê-lo depois deve procurar `docs/features/done/081-*.md` antes de "limpar".
