---
prompt: |
  - permitir uma visualização única de agenda. em que lá eu veja todas as tarefas, recorrências, e possa criar eventos também relacionados, seja a projetos , seja a tarefas. fica dentro de Produtividade->Agenda
---

# 067 — Criar, editar e excluir eventos direto na Agenda

## Contexto
A Agenda (`/tasks/agenda`, `src/pages/admin/tasks/AgendaGrid.tsx`) é hoje uma tela de **leitura** de
eventos: ela busca `fetchProjectEvents`, desenha `EventChip`/`TimedEventBlock` e, ao clicar,
abre um dialog que só mostra título + data, com "Ir para o projeto" e excluir. Criar evento só é
possível dentro do dialog de projeto (`ProjectFormDialog.tsx`, seção "Eventos", que só aparece para
projeto já existente) — ou seja, para marcar uma reunião você precisa sair da agenda, achar o
projeto e usar um mini-form com dois campos (título + `datetime-local`), sem hora de fim e sem
edição posterior.

O prompt pede exatamente o contrário: criar evento **na** agenda, relacionado a projeto **ou a
tarefa**. Com a 066 no lugar (`project_id` nullable, `task_id`, `updateProjectEvent`), esta feature
entrega o caminho de escrita: um dialog de evento de verdade (título, início, fim opcional, vínculo)
acionável pelo header e por clique num dia/slot vazio do calendário, com editar e excluir no mesmo
form.

Depende da 066. Fora de escopo: criar **tarefa** pela Agenda (o prompt fala de eventos; a tarefa
continua nascendo em Lista/Kanban/projeto) e evento recorrente (recorrência hoje é conceito de
tarefa; um evento repetido se resolve criando vários — abrir isso puxaria série/ocorrência virtual
inteira, como em `computeVirtualOccurrences`).

## Decisões
- **Um componente novo `src/pages/admin/tasks/EventFormDialog.tsx`**, usado tanto para criar quanto
  para editar (mesmo padrão de `ProjectFormDialog.tsx`, feature 065: `editing: ProjectEvent | null`,
  estado `saving` interno, erro em `onSave` não fecha o dialog). A 068 vai reusar esse mesmo
  componente dentro do dialog de projeto — por isso ele nasce genérico, com o vínculo podendo vir
  travado por prop.
- **Campos**: Título (obrigatório), Início (`datetime-local`, obrigatório), Fim (`datetime-local`,
  opcional) e Vínculo. Sem descrição/cor: `project_event` não tem essas colunas e criá-las aqui
  ampliaria a migration da 066 sem pedido.
- **Vínculo por segmento + picker**: `Tabs`/segmento "Sem vínculo | Projeto | Tarefa"; escolhendo
  Projeto aparece o `ProjectPicker` já existente; escolhendo Tarefa, um `TaskPicker` novo (busca +
  lista rolável, mesmo desenho de `ProjectPicker` com `role="listbox"`). Trocar de segmento limpa o
  outro id — é o que mantém a check constraint `project_event_single_link` sempre satisfeita.
- **Conversão de fuso fica em `src/lib/dates.ts`**, não no componente: `toLocalDateTimeInputValue(iso)`
  e `localDateTimeInputToIso(value)`. O código atual (`Projects.tsx:393`, `ProjectDetail.tsx:360`)
  faz `new Date(startsAt).toISOString()` inline e não tem o caminho de volta — sem o helper, editar um
  evento mostraria a hora errada em fusos UTC−, que é o bug que `formatLocalIsoDate` já existe para
  evitar.
- **Dois pontos de entrada para criar**: botão "Novo evento" no header da Agenda (ao lado do filtro
  de projeto) e clique na área vazia de um dia (visão mês) ou de um slot de hora (visões
  semana/dia). O clique pré-preenche o início — dia + `09:00` no mês, dia + hora clicada nas grades
  de hora. É o gesto que todo calendário tem e o que torna a agenda "o lugar onde se marca coisa".
- **Editar substitui o dialog de detalhe read-only**: clicar num evento abre o `EventFormDialog` em
  modo edição, com o `ConfirmDeleteDialog` de excluir (comportamento atual preservado) e o link "Ir
  para o projeto" quando houver projeto resolvido. O "Ir para a tarefa" fica na 068, junto do resto
  do reuso.
- **Filtro de projeto passa a resolver o vínculo indireto**: evento de tarefa é considerado do
  projeto da tarefa (`resolveEventProjectId` da 066), senão criar um evento vinculado a uma tarefa
  do Projeto X sumiria da tela enquanto o filtro estivesse em X. O `Select` ganha a opção
  "Sem projeto" para isolar avulsos, sem mexer no comportamento de "Todos os projetos".
- **Recarregamento otimista não**: depois de criar/editar/excluir, chama o `load()` que a tela já tem
  (mesmo padrão de `handleDeleteEvent`). Simples e sem risco de estado divergente; a lista de eventos
  é pequena.
- **Estados**: botão salvar desabilitado sem título ou sem início, e enquanto salva; erro vira toast
  (`getErrorMessage`) com o dialog aberto; fim anterior ou igual ao início bloqueia o envio com
  mensagem no próprio form (espelha a check `project_event_ends_after_starts` da 066, para o usuário
  não descobrir pelo erro cru do Postgres).

## Tarefas
- [x] Adicionar `toLocalDateTimeInputValue(iso: string): string` e
  `localDateTimeInputToIso(value: string): string` em `src/lib/dates.ts`, com o mesmo cuidado de fuso
  local de `formatLocalIsoDate` (nada de fatiar `toISOString()`), + casos em
  `src/lib/__tests__/dates.test.ts` (ida e volta preservando hora local, minuto com zero à esquerda,
  string vazia/inválida devolvendo `""`)
- [x] Estender `src/domain/tasks/events.ts` (criado na 066) com `validateEventDraft({ title, startsAt,
  endsAt })` devolvendo `{ ok: true } | { ok: false; reason: "title" | "starts" | "ends" }`, e cobrir
  em `src/domain/tasks/__tests__/events.test.ts`: título vazio/só espaços, início ausente, fim
  anterior ao início, fim igual ao início, fim vazio (válido), tudo preenchido (válido)
- [x] Criar `src/pages/admin/tasks/TaskPicker.tsx`: `Input` de busca + lista rolável com
  `role="listbox"` espelhando `ProjectPicker.tsx`, opção "Sem tarefa", filtro por título
  case-insensitive, teto de itens renderizados e rótulo do projeto da tarefa como texto secundário
- [x] Criar `src/pages/admin/tasks/EventFormDialog.tsx` com os campos Título/Início/Fim e as props
  `open`, `onOpenChange`, `editing: ProjectEvent | null`, `projects`, `tasks`, `lockedLink?`
  (`{ kind: "project"; id: string }` para a 068), `onSave(draft)`, `onDelete?`; estado `saving`
  interno; botão desabilitado por `validateEventDraft`; erro de `onSave` não fecha o dialog
- [x] No `EventFormDialog`, implementar o seletor de vínculo (segmento "Sem vínculo | Projeto |
  Tarefa" + `ProjectPicker`/`TaskPicker`), zerando o id do outro lado ao trocar de segmento e
  escondendo o seletor inteiro quando `lockedLink` estiver presente
- [x] Em `AgendaGrid.tsx`: importar `createProjectEvent`/`updateProjectEvent`, adicionar estado
  `eventDialog` (`{ open, editing, prefillStartsAt }`) e o botão "Novo evento" no header, ao lado do
  filtro de projeto
- [x] Em `AgendaGrid.tsx`: implementar `handleSaveEvent` (create ou update conforme `editing`, toast
  de erro com `getErrorMessage`, fecha o dialog e chama `load()`) e ligar `handleDeleteEvent`
  (já existe) ao `onDelete` do dialog novo
- [x] Em `AgendaGrid.tsx` (visão mês): clique na área vazia da célula do dia abre o dialog de criação
  com início pré-preenchido em `dia 09:00` — sem capturar o clique dos chips nem do "+N mais" (parar
  a propagação neles), e com `aria-label` no alvo clicável para o teste conseguir mirar
- [x] Em `AgendaHourGrid.tsx`: nova prop opcional `onCreateAt(day: Date, hour: number)`; cada linha de
  hora de cada coluna de dia vira alvo clicável (atrás dos blocos posicionados, sem roubar o clique
  deles) que dispara a criação com início `dia HH:00`
- [x] Substituir o dialog read-only de evento em `AgendaGrid.tsx` pelo `EventFormDialog` em modo
  edição (`openEventFromChip` passa a abrir o form), mantendo excluir via `ConfirmDeleteDialog` e o
  "Ir para o projeto" só quando houver projeto resolvido
- [x] Em `AgendaGrid.tsx`: trocar o filtro `e.project_id === projectFilter` por
  `resolveEventProjectId(event, taskById)`, adicionar a opção "Sem projeto" no `Select` de filtro e
  usar o mesmo projeto resolvido para a cor passada a `EventChip`/`TimedEventBlock`
- [x] Criar `src/pages/admin/tasks/__tests__/EventFormDialog.test.tsx`: salvar desabilitado sem
  título e sem início; fim anterior ao início bloqueia e mostra a mensagem; criar chama `onSave` com
  título, ISO de início/fim e o vínculo escolhido; trocar o segmento de vínculo zera o id anterior
  (`project_id` e `task_id` nunca vão preenchidos juntos); modo edição pré-preenche os campos a
  partir de `editing` (inclusive a hora local correta); `lockedLink` esconde o seletor e fixa o
  projeto; erro em `onSave` mantém o dialog aberto e reabilita o botão
- [x] Criar `src/pages/admin/tasks/__tests__/AgendaGrid.events.test.tsx` (mocks de `@/api/tasks` no
  mesmo formato de `AgendaGrid.test.tsx`): "Novo evento" abre o dialog; clique num dia vazio do mês
  pré-preenche a data; salvar chama `createProjectEvent` com `project_id: null` + `task_id`
  preenchido ao vincular a uma tarefa; clicar num evento existente abre o form preenchido e salvar
  chama `updateProjectEvent` com o `id` certo; excluir chama `deleteProjectEvent`; erro na criação
  mostra toast e mantém o dialog; filtro por projeto mantém visível o evento vinculado a uma tarefa
  daquele projeto e o esconde ao filtrar outro projeto; opção "Sem projeto" deixa só os avulsos
- [x] Adicionar em `src/pages/admin/tasks/__tests__/AgendaHourGrid.test.tsx` os casos da grade de
  horas: clicar num slot vazio dispara `onCreateAt` com o dia e a hora corretos; clicar num bloco de
  evento/tarefa **não** dispara `onCreateAt` (chama o handler de abrir)
- [x] `npm run build`, `npm run lint` e `npm test` — sem erros novos e sem regressão nos testes de
  Agenda existentes (`AgendaGrid.test.tsx`, `AgendaGrid.consultation.test.tsx`,
  `AgendaHourGrid.test.tsx`)
- [ ] **Aguarda o usuário**: conferir no navegador o fluxo ponta a ponta na Agenda (criar evento
  avulso, de projeto e de tarefa; editar horário; excluir; filtro por projeto) depois de a migration
  da 066 estar aplicada — teste manual é do usuário, não do agente

## Prompts

## Notas
- As duas tarefas do `EventFormDialog` (campos e seletor de vínculo) foram entregues no mesmo
  commit: sem o seletor, as props `projects`/`tasks` ficam sem uso e `tsc`/`eslint` reprovam o
  arquivo, então não havia como verificar a primeira sozinha.
- O `EventFormDialog` ganhou duas props que o plano não listava: `prefillStartsAt` (o início
  sugerido pelo clique num dia/slot, que a tarefa da `AgendaGrid` previa guardar no estado
  `eventDialog`) e `extraActions` (slot para o "Ir para o projeto" do modo edição, que é específico
  da Agenda e não pode nascer dentro de um componente que a 068 vai reusar).
- Na visão Mês o alvo de criação virou um `<button>` absoluto **atrás** do conteúdo (`z-0` contra
  `z-10` dos chips, wrapper `pointer-events-none` com `[&>*]:pointer-events-auto` nos chips) em vez
  de `stopPropagation` nos chips: assim o chip nunca precisa saber que existe um alvo embaixo dele.
  Ele fica fora da ordem de tabulação (`tabIndex={-1}`) — 42 alvos de dia antes do conteúdo
  quebrariam a navegação por teclado, que continua tendo o botão "Novo evento" do header.
- `handleSaveEvent` re-lança o erro depois do toast: o `EventFormDialog` só continua aberto se
  `onSave` rejeitar, então engolir a exceção na Agenda faria o dialog fechar como se tivesse
  salvado. Os mocks `vi.mock("@/api/tasks", ...)` de `AgendaGrid.test.tsx` e
  `AgendaGrid.consultation.test.tsx` ganharam `createProjectEvent`/`updateProjectEvent` (mesmo
  problema já registrado nas Notas da 065/066).
- Verificação final: `npm run build` (exit 0), `npm run lint` (0 erros, 18 warnings
  `react-refresh/only-export-components` pré-existentes) e a suíte inteira com
  `npx vitest run --testTimeout=30000 --hookTimeout=30000 --maxWorkers=4` — 1411/1412 testes
  passando. O único vermelho foi `src/pages/admin/notes/__tests__/notes-navigation.test.tsx` (timeout
  do `findByLabelText`), sem relação com a Agenda e verde ao rodar isolado: `npm test` puro nesta
  máquina estoura timeout em arquivos aleatórios, daí os timeouts explícitos no comando.
- A opção "Sem projeto" do filtro virou o sentinela `NO_PROJECT_FILTER` + o helper
  `matchesProjectFilter(projectId, filter)` exportados de `AgendaGrid.tsx`, e o helper passou a valer
  **também para as tarefas**, não só para os eventos: com o filtro em "Sem projeto", a comparação
  antiga (`t.project_id === projectFilter`) esconderia toda tarefa, inclusive as soltas — o filtro do
  header é da tela inteira, não só da faixa de eventos. `Select` do Radix não aceita `value=""`, daí
  o sentinela em vez de `null`.
- Os quatro casos de edição/exclusão e os dois de filtro entraram em `AgendaGrid.events.test.tsx`
  depois que o arquivo já existia (as tarefas de teste tinham sido escritas antes das de código):
  clicar num evento abre o form preenchido com a hora local certa, salvar chama `updateProjectEvent`
  com o id clicado (e nunca `createProjectEvent`), excluir chama `deleteProjectEvent`, "Ir para o
  projeto" só aparece com projeto resolvido, e o filtro resolve o vínculo indireto nos dois sentidos.
- Os testes da 066 em `AgendaGrid.event-link.test.tsx` continuam passando sem alteração mesmo com o
  dialog read-only removido: o nome do projeto que eles procuram agora vem do `ProjectPicker`
  (evento de projeto) ou do texto secundário do `TaskPicker` (evento de tarefa), e "Excluir"/"Ir para
  o projeto" seguem no mesmo lugar do dialog.
- `src/pages/admin/tasks/__tests__/TaskPicker.test.tsx` não estava no plano, mas entrou junto com o
  componente: a verificação é só por código (sem navegador) e o `EventFormDialog.test.tsx` previsto
  cobre a escolha do vínculo, não o que é específico do picker — busca case-insensitive, teto de 50
  itens com o aviso de quantos ficaram de fora e o nome do projeto como texto secundário.
