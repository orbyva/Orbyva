---
prompt: |
  - botão 'recorrências' em tarefas, de modo que eu veja todas as tarefas com recorrência
  - seção 'Agenda' dentro de Produtividade -> Agenda
    - Conseguir criar Eventos
    - Ver Tarefas (tanto quick tasks quanto tasks com prazos)
    - Mesmo componente que está hoje em tarefas -> Agenda
    - Permitir criar eventos com arrastar no próprio layout (Tipo Google Agendas)
    - Permitir Criar Tarefas também
---

# 103 — Criar (e editar) evento e tarefa direto da Agenda

## Contexto

Cobre os itens "Conseguir criar Eventos" e "Permitir Criar Tarefas também" do segundo bullet do
`prompt:`. A moldura da seção é a feature 102; o gesto de arrastar é a 104, que depende desta.

Hoje a Agenda é **somente leitura para criação**: `AgendaGrid.tsx` edita tarefa existente
(`handleSaveTaskEdit`, `:606-645`), cria subtarefa (`subtaskMutationCtx`, `:650-664`) e exclui
(`:672-704`) — e nada mais. A feature 099 chegou a registrar isso como decisão explícita: "A Agenda
fica de fora porque não cria tarefa: `AgendaGrid.tsx` só edita […] Não há caminho de criação de
tarefa de topo para semear."

Evento é pior. `project_event` só nasce em dois lugares, os dois **dentro do dialog de projeto**:
`ProjectDetail.handleAddProjectEvent` (`:536-553`) e `Projects.tsx:395`, alimentados por um par de
inputs em `ProjectFormDialog.tsx:166-180`. Ou seja: para marcar uma reunião de quinta o usuário
precisa sair da Agenda, abrir o projeto e editar o projeto. E `src/api/tasks/projectEvents.ts` só tem
`fetchProjectEvents`, `createProjectEvent` e `deleteProjectEvent` — **não existe update**: um evento
criado no horário errado só se conserta apagando e recriando.

O que já está pronto e é reaproveitável: `project_event.project_id` aceita nulo desde a feature 076
(cópia recebida por convite), então "evento sem projeto" é representável; `AgendaGrid` já é dono do
`TaskFormFields` completo, que aceita `editing: null` para modo criação
(`TaskFormFields.tsx:54-56`); `emptyTask(projectId)` e `projectIdForNewTask` (features 042/099) já
resolvem "a tarefa nova nasce no projeto do filtro".

## Decisões

- **Um ponto de entrada só: botão "Novo" na barra da Agenda**, ao lado do `Tabs` Mês/Semana/Dia
  (`AgendaGrid.tsx:735-763`), abrindo um `DropdownMenu` com **"Evento"** e **"Tarefa"**. Dois botões
  soltos na barra empatariam visualmente com os controles de navegação; um menu de duas opções deixa
  claro que a Agenda tem dois tipos de item de primeira classe.
- **Afordância por dia, além do botão da barra**: um `+` que aparece no hover da célula do mês e no
  cabeçalho de cada coluna de Semana/Dia, abrindo o mesmo menu já com **a data daquele dia**. É o
  gesto óbvio de "quero marcar algo nesse dia" e é o que a 104 vai estender para faixa de horário.
- **`ProjectEventFormDialog.tsx` (novo)**: título, data, hora de início, hora de fim (opcional) e
  projeto (opcional). Usa `FormLabel`/`FORM_DIALOG_CONTENT_CLASS` e o `ProjectPicker` já existente,
  como o resto do módulo. Serve **criação e edição** — um formulário só, como a 042 fez para tarefa.
- **Evento sem projeto é permitido.** A coluna já aceita nulo, o pedido diz "criar eventos" sem
  mencionar projeto, e obrigar a escolher um projeto para marcar "dentista às 15h" é exatamente o
  atrito que tirou a criação de evento da Agenda até hoje. Na grade, evento sem projeto já cai no
  cinza neutro por `eventProjectColor` (`calendar.ts:336`).
- **Hora de fim é opcional e vira `ends_at`.** Sem ela, `ends_at: null`, e `getItemTimeRange`
  (`calendar.ts:111`) já desenha o bloco com `DEFAULT_ITEM_DURATION_MINUTES` (30 min). Nada muda no
  layout.
- **Validação inline, não por toast**: título vazio (após `trim`), data ausente e fim ≤ início
  bloqueiam o "Salvar" e mostram a mensagem no campo. Toast fica reservado para falha de I/O, com
  `getErrorMessage`, como manda `docs/stack.md`.
- **`starts_at`/`ends_at` são montados em hora local e gravados em ISO**, exatamente como
  `handleAddProjectEvent` já faz (`new Date(startsAt).toISOString()`). Passar a string do `<input
  type="datetime-local">` direto gravaria como UTC e deslocaria o evento no fuso do usuário.
- **Evento passa a ser editável**: `updateProjectEvent` novo em `src/api/tasks/projectEvents.ts`
  (`update ... .eq("id").eq("user_id").select().single()`, como as irmãs), e o dialog de detalhe do
  evento (`AgendaGrid.tsx:961-1017`) ganha "Editar" ao lado de "Convidar"/"Excluir". Sem isso, criar
  pela Agenda seria criar sem conserto — e a 104, que cria por arrasto, produziria horários
  aproximados que ninguém consegue ajustar.
- **A cópia recebida por convite (feature 076, `project_id` nulo) também é editável**, porque é uma
  linha da agenda do próprio usuário (RLS por `user_id`) — mas o dialog mostra uma linha dizendo que
  a alteração **não volta para quem convidou**. Bloquear a edição esconderia que a cópia é dele;
  editar em silêncio faria parecer que o anfitrião foi avisado.
- **Criar tarefa reusa o `TaskFormFields` que a Agenda já hospeda**, com `editing={null}` e
  `emptyTask(projectIdForNewTask(projectFilter))` — a Agenda deixa de ser a exceção registrada na
  099 e passa a herdar o projeto do filtro como Lista e Projeto. O `handleSave` de criação segue o
  molde de `TaskList.handleSave` (`:621-675`): `createTask` → subtarefas em rascunho → `saveExternal
  LinksForTask` só depois de existir `task_id`.
- **A tarefa criada pela Agenda nasce com o `due_date` do dia escolhido** (e `due_time` quando o
  gesto trouxer horário, na 104). Criar pela Agenda e a tarefa não aparecer na Agenda seria o mesmo
  bug que a 099 consertou na Lista.
- **Sem quick add na Agenda.** A tira `TaskQuickAdd` (feature 098) cria tarefa **sem prazo**, que é
  justamente o item que não tem onde pousar num calendário. O caminho curto aqui é o gesto da 104,
  não um segundo campo de digitação.
- **Depois de criar/editar, `load()` e toast curto (2000ms)** — o mesmo padrão das outras mutações
  do arquivo. Nada de inserção otimista: a Agenda recalcula ocorrências virtuais e doses a partir de
  `tasks`, e um item enxertado à mão sairia do lugar.
- **Fora de escopo, de propósito**: mover/redimensionar item existente arrastando (não foi pedido; o
  pedido é criar arrastando — 104); recorrência de **evento** (`project_event` não tem regra, e
  inventar uma é feature de banco); e o fluxo de convite, que continua onde está (076).
- **Sem migration.** `project_event` já tem tudo (`title`, `starts_at`, `ends_at`, `project_id`
  nulo).

## Tarefas

- [x] `src/api/tasks/projectEvents.ts`: `updateProjectEvent({ id, ...campos })` — `update` filtrado
      por `id` **e** `user_id`, `.select().single()`, erro virando `Error(error.message)` como as
      irmãs. Exportar em `src/api/tasks/index.ts`. Verificação: `npm run build && npm run lint`
- [x] `src/api/tasks/__tests__`: teste de `updateProjectEvent` no molde dos testes de API já
      existentes (mock do `supabase`), provando o filtro duplo `id` + `user_id`.
      Verificação: `npm test src/api/tasks`
- [x] `src/domain/tasks/projectEvent.ts` (novo): `buildProjectEventPayload({ title, date, startTime,
      endTime, projectId })` → `{ project_id, title, starts_at, ends_at }` em ISO local, e
      `validateProjectEventDraft(...)` → lista de erros por campo (título vazio, data ausente, fim ≤
      início). Função pura, sem I/O — é a regra que os dois modos (criar/editar) e a 104 vão
      compartilhar. Exportar no `index.ts` do domínio. Verificação: `npm run build && npm run lint`
- [x] `src/domain/tasks/__tests__/projectEvent.test.ts` (novo): payload com e sem hora de fim
      (`ends_at: null`), com e sem projeto (`project_id: null`), horário montado em **hora local**
      (não deslocado pelo fuso), e os três casos de validação + o caso válido.
      Verificação: `npm test src/domain/tasks`
- [x] `src/pages/admin/tasks/ProjectEventFormDialog.tsx` (novo): dialog controlado
      (`open`/`onOpenChange`), props `initial` (para edição e para o pré-preenchimento da 104),
      `projects`, `onSubmit`. Campos título/data/início/fim/projeto com `FormLabel`, botão "Salvar"
      desabilitado enquanto a validação não passa e erros inline por campo.
      Verificação: `npm run build && npm run lint`
- [x] `ProjectEventFormDialog.tsx`: estado de envio (`saving`) travando o botão e os campos — Enter
      duplo não pode criar dois eventos (mesmo cuidado do `TaskQuickAdd`).
      Verificação: `npm run build && npm run lint`
- [x] `ProjectEventFormDialog.tsx`: em modo edição de uma cópia recebida por convite (`project_id`
      nulo + flag vinda do call site), mostrar a linha "Recebido por convite — a alteração vale só
      na sua agenda". Verificação: `npm run build && npm run lint`
- [x] `src/pages/admin/tasks/__tests__/ProjectEventFormDialog.test.tsx` (novo): salvar com título e
      horário devolve o payload esperado; título só com espaços não salva; fim antes do início mostra
      erro inline e não chama `onSubmit`; sem hora de fim manda `ends_at: null`.
      Verificação: `npm test src/pages/admin/tasks`
- [x] `AgendaGrid.tsx`: botão "Novo" + `DropdownMenu` ("Evento" / "Tarefa") na barra de controles,
      ao lado do `Tabs` de visão. Ainda sem abrir nada — só a estrutura e o `aria-label`.
      Verificação: `npm run build && npm run lint`
- [x] `AgendaGrid.tsx`: estado `creatingEvent` + `<ProjectEventFormDialog>` ligado ao
      `createProjectEvent`, com `load()` + toast "Evento criado" no sucesso e toast destrutivo +
      `getErrorMessage` no erro. Verificação: `npm run build && npm run lint`
- [x] `AgendaGrid.tsx`: "Editar" no dialog de detalhe do evento (`viewingEvent`), reabrindo o mesmo
      `ProjectEventFormDialog` em modo edição e salvando com `updateProjectEvent`.
      Verificação: `npm run build && npm run lint`
- [x] `AgendaGrid.tsx`: estado `creatingTask` — `TaskFormFields` com `editing={null}`,
      `form = emptyTask(projectIdForNewTask(projectFilter))`, `subtaskDrafts: string[]` para as
      subtarefas antes de existir id (molde de `TaskList.tsx:171`, `:1355-1358`) e
      `externalLinkDrafts` começando vazio. Verificação: `npm run build && npm run lint`
- [x] `AgendaGrid.tsx`: `handleCreateTask` no molde de `TaskList.handleSave` — valida título,
      `createTask(payload)`, cria as subtarefas em rascunho, grava os links só depois do insert,
      `load()` + toast; erro cai em toast destrutivo. Verificação: `npm run build && npm run lint`
- [x] `AgendaGrid.tsx`: `+` de hover na célula do mês e no cabeçalho da coluna de Semana/Dia,
      abrindo o menu "Evento/Tarefa" com a data daquele dia pré-preenchida (`due_date` da tarefa,
      `date` do evento). Botão com `aria-label` datado, como o número do dia já tem.
      Verificação: `npm run build && npm run lint`
- [x] `AgendaGrid.tsx`: garantir que o `+` **não** dispara o `onClick` do número do dia nem do chip
      (`stopPropagation`) — a célula já tem dois alvos clicáveis hoje.
      Verificação: `npm run build && npm run lint`
- [x] `src/pages/admin/tasks/__tests__/AgendaGrid.create-event.test.tsx` (novo, molde de
      `AgendaGrid.test.tsx` para os mocks de `@/api/tasks`): "Novo" → "Evento" → preencher →
      `createProjectEvent` chamado com `starts_at` no dia/hora escolhidos, e o evento aparece na
      grade depois do reload. Verificação: `npm test src/pages/admin/tasks`
- [x] Mesmo arquivo: criar pelo `+` de um dia específico já vem com aquela data; criar sem projeto
      manda `project_id: null` e o chip aparece com o rótulo/cor neutros.
      Verificação: `npm test src/pages/admin/tasks`
- [x] Mesmo arquivo: falha do `createProjectEvent` mostra toast destrutivo e **mantém o dialog
      aberto** com o que foi digitado — perder o formulário num erro de rede é o pior desfecho
      possível aqui. Verificação: `npm test src/pages/admin/tasks`
- [x] `src/pages/admin/tasks/__tests__/AgendaGrid.edit-event.test.tsx` (novo): abrir um evento →
      "Editar" → mudar horário → `updateProjectEvent` com o id certo; e a cópia recebida por convite
      mostra o aviso de que a alteração não volta para o anfitrião.
      Verificação: `npm test src/pages/admin/tasks`
- [x] `src/pages/admin/tasks/__tests__/AgendaGrid.create-task.test.tsx` (novo): "Novo" → "Tarefa" →
      título + prazo → `createTask` chamado, tarefa aparece na grade; criar pelo `+` de um dia nasce
      com `due_date` daquele dia. Verificação: `npm test src/pages/admin/tasks`
- [x] Mesmo arquivo: com o filtro de projeto da Agenda apontando para um projeto, a tarefa nova
      nasce com aquele `project_id` (costura com a decisão da 099, que tinha deixado a Agenda de
      fora); com o filtro em "Todos"/"Sem projeto", nasce com `null`.
      Verificação: `npm test src/pages/admin/tasks`
- [x] Mesmo arquivo: título vazio não cria; links externos só são gravados depois do `createTask`
      (nunca antes, porque não há `task_id`). Verificação: `npm test src/pages/admin/tasks`
- [x] Não-regressão: a suíte de Agenda existente (`AgendaGrid*.test.tsx`, `AgendaHourGrid.test.tsx`)
      continua verde — em especial a edição de tarefa e a exclusão com escopo, que dividem estado
      com os dialogs novos. Verificação: `npm test src/pages/admin/tasks`
- [x] `npm run build && npm run lint && npm test && npm run check:bundle` limpos, com a contagem de
      arquivos/testes antes e depois em `## Notas`.
- [x] Verificação do pedido literal: dentro da Agenda dá para **criar um evento** e **criar uma
      tarefa**, sem passar por Projetos nem pela Lista, e o item criado aparece no dia certo.
      Rastreabilidade trecho → teste em `## Notas`.

## Prompts

_(Nenhum pedido novo do usuário durante a implementação — tudo saiu do `prompt:` do frontmatter.)_

## Notas

### Suíte

- **Antes** (fechamento da 102): 249 arquivos / 2812 testes / 0 falhas.
- **Depois** (fechamento da 103): **255 arquivos / 2867 testes / 0 falhas** —
  `npm run build`, `npm run lint` (0 erros, 91 warnings pré-existentes de `react-refresh`),
  `npm test` e `npm run check:bundle` ("Bundle budget OK") todos limpos.
- Arquivos novos: `updateProjectEvent.test.ts`, `projectEvent.test.ts`,
  `ProjectEventFormDialog.test.tsx`, `AgendaGrid.create-event.test.tsx`,
  `AgendaGrid.edit-event.test.tsx`, `AgendaGrid.create-task.test.tsx`.
- `TaskList.external-links.test.tsx` falhou **uma vez** por timeout (5s) rodando a pasta
  `src/pages/admin/tasks` inteira em paralelo, e passa sozinho (8/8) e na suíte completa. É lentidão
  sob carga, não regressão — mesma classe dos flakes já conhecidos do projeto.

### Rastreabilidade — pedido → prova

O `prompt:` do frontmatter é o mesmo das features 101/102/104; esta cobre dois bullets dele.

| Trecho do `prompt:` | Prova (teste que passou) |
| --- | --- |
| "Conseguir criar Eventos" (dentro da Agenda) | `AgendaGrid.create-event.test.tsx` › "«Novo» → «Evento» → preencher → `createProjectEvent` com `starts_at` no dia/hora escolhidos" e "o evento criado aparece na grade depois do reload" |
| idem, pelo gesto do dia | mesmo arquivo › "criar pelo `+` de um dia já vem com aquela data no formulário de evento" |
| "Permitir Criar Tarefas também" | `AgendaGrid.create-task.test.tsx` › "título + prazo chamam `createTask`, e a tarefa aparece na grade depois do reload" e "criar pelo `+` de um dia nasce com o `due_date` daquele dia" |
| Evento editável (Decisões, pré-requisito da 104) | `AgendaGrid.edit-event.test.tsx` › "mudar o horário chama `updateProjectEvent` com o id certo e o novo `starts_at`"; `updateProjectEvent.test.ts` › filtro duplo `id` + `user_id` |
| Horário em hora local, não UTC | `projectEvent.test.ts` › "monta `starts_at` em hora local, não como UTC"; asserções de `getHours()` nos dois testes de Agenda |
| Herdar o projeto do filtro (costura com a 099) | `AgendaGrid.create-task.test.tsx` › bloco "tarefa nova herda o projeto do filtro (features 099/103)", 3 casos |

### Desvios e decisões tomadas na implementação

- **O `+` da célula do mês ficou absoluto no canto, não em linha com o número do dia.** A primeira
  versão embrulhava número + `+` num `<div>` de cabeçalho e quebrou 21 testes de uma vez:
  `AgendaGrid.quick/medication/series-icon/consultation` acham a célula por
  `badge.parentElement` (o `<div>` da grade). Com o embrulho, `parentElement` virava o cabeçalho
  novo. Posicionar o `+` em `absolute` mantém o número do dia como filho direto da célula — o
  contrato que aqueles testes assumem — e ainda evita que o `+` empurre os chips.
- **`fieldset disabled` no `ProjectEventFormDialog`** em vez de `disabled` campo a campo: o
  `ProjectPicker` não tem prop `disabled` própria, e o `fieldset` trava os botões dele junto.
- **Hora de fim igual ao início também é erro** (o plano dizia "fim ≤ início", implementado
  literalmente): evento de duração zero é sempre engano de digitação e viraria um bloco de 1 minuto
  ilegível na grade.
- **`projectEventToDraft` foi adicionada ao domínio além do que o plano listava.** Sem o inverso de
  `buildProjectEventPayload`, o modo edição teria de reconverter ISO → hora local dentro do
  componente, que é exatamente a duplicação que a função pura existe para evitar. Coberta por teste
  de ida e volta.
- **⚠️ `project_id` nulo ficou ambíguo — vale refino depois.** Antes desta feature, evento sem
  projeto **só** existia como cópia recebida por convite (076), e a UI usa isso como sinal: o badge
  do dialog de detalhe diz "Recebido por convite" (`EVENT_WITHOUT_PROJECT_LABEL`) e agora o
  formulário de edição mostra o aviso "não volta para quem convidou". Como a 103 passou a permitir
  **criar** evento sem projeto (decisão explícita, para não obrigar a escolher projeto para marcar
  "dentista às 15h"), um evento próprio sem projeto também cai nesses dois rótulos — e eles ficam
  falsos nesse caso. O sinal preciso existe no banco (`event_invite.accepted_event_id` aponta para a
  cópia), mas ler isso do lado do convidado é investigação de RLS/consulta nova, fora do "sem
  migration" desta feature. Ficou como está (o plano prescreve `project_id` nulo + flag do call
  site); o conserto — uma coluna/flag própria de "recebido por convite", ou trocar o rótulo neutro
  por "Sem projeto" e mostrar o aviso só quando houver convite de verdade — é candidato a
  `to-refine/`.
