---
prompt: |
  - i'm unable to delete a task with recorrence. i have the task SEMTRI, that is my medications, but i'm unable to delete it. when a task is related to a recorrence. make a forms with the possibility to delete all the items![alt text](image.png) they are duplicated
---

# 075 — Apagar de verdade uma série de recorrência ou de medicação

## Contexto

Metade (b) do prompt: "i'm unable to delete it… make a forms with the possibility to delete all the
items". A metade (a), a duplicação, é a feature `074` — o diagnóstico dela é insumo desta, mas as
duas correções são independentes.

O dialog de exclusão com escopo já existe: `TaskDeleteDialog.tsx` (feature `done/028`) mostra
"Excluir somente esta" / "Excluir todas as ocorrências" quando
`isSimpleRecurringTask(task) && !!onConfirmAll` (`TaskDeleteDialog.tsx:46-47`). Três coisas fazem
com que ele não sirva para a "SEMTRI":

1. **Uma dose de medicação não é uma série para nenhuma abstração do domínio.** Ela nasce com
   `recurrence_rule: null`, `recurrence_origin_id: null` e `linked_recurring_id: null`
   (`src/api/health/medications.ts:215-236`), então `seriesKey` (`src/domain/tasks/agenda.ts:87-92`)
   devolve `null`, `isRecurringTask`/`isSimpleRecurringTask` devolvem `false`, e o dialog cai na
   variante simples — um botão "Excluir", nunca a opção em massa. Cada dose é uma linha solta na
   lista (`collapseRecurringSeries` também não a agrupa).
2. **Apagar uma dose é inútil.** `deleteTask` (`src/api/tasks/tasks.ts:372-380`) apaga a linha e não
   olha `medication_id`; a linha de `medication` continua `active`, e a próxima `fetchTasks` chama
   `materializeAllMedicationDoses`, que recalcula desde `started_on` (até `MAX_DAYS = 400`) e
   **recria a dose apagada**. É a explicação mais direta de "i'm unable to delete it": a tarefa some
   e volta. O único desligamento real hoje é `deactivateMedication`
   (`src/api/health/medications.ts:135-155`), acessível só por `/life/health/medications`.
3. **"Excluir todas as ocorrências" devolve um conjunto incompleto quando a origem é de medicação.**
   `findSeriesTasks` (`agenda.ts:171-175`) é um `filter` no array já carregado **e já filtrado** da
   tela (`visibleTasks` em `TaskList.tsx:204-216`, recortado por projeto/tag/status), então um filtro
   ativo faz o botão apagar só parte da série, em silêncio. E numa origem que veio do backfill 049→064
   (`recurrence_rule` preservada + `medication_id`), a `seriesKey` é `simple:<originId>`: entram a
   origem e as ocorrências legadas, mas **nenhuma** dose criada por `materializeMedicationDoses`,
   porque essas têm `recurrence_origin_id: null`. Contraste: `propagateIconToSeries`
   (`src/api/tasks/tasks.ts:213-236`, feature `073`) resolve o escopo **no servidor**, justamente
   pra não depender da lista do cliente.

E onde o usuário viu o problema — a agenda — **não existe exclusão nenhuma**: `AgendaGrid.tsx` não
importa `TaskDeleteDialog`, o modal do dia (`:710-737`) só renderiza chips, e o dialog de editar
tarefa aberto por um chip (`:739-788`) tem só "Salvar alterações". O único `Trash2` de lá é do
`ConfirmDeleteDialog` de evento de projeto (`:812-817`).

## Decisões

- **`TaskDeleteDialog` ganha uma terceira variante: "dose de medicação".** Quando
  `task.medication_id` estiver preenchido, o dialog explica que a dose é gerada por um tratamento e
  oferece três ações:
  - **"Encerrar o tratamento e apagar as doses futuras"** (ação recomendada, em destaque) —
    `deactivateMedication` + apagar as doses futuras não concluídas. É a única que resolve o pedido
    de verdade: sem encerrar, qualquer exclusão volta na próxima carga.
  - **"Apagar só esta dose"** — mantém o comportamento de hoje, **com o aviso explícito** de que ela
    será recriada enquanto o tratamento estiver ativo. Sem esse aviso o usuário repete o mesmo susto.
  - **"Apagar todas as doses deste tratamento"** — com um checkbox "incluir as doses já tomadas"
    **desmarcado por padrão**. Doses concluídas são o histórico de adesão da `064`; apagá-las por
    omissão falsificaria a métrica sem o usuário perceber.
- **O escopo da série passa a ser resolvido no servidor**, não por `findSeriesTasks` sobre a lista
  filtrada da tela. Nova função `deleteTaskSeries(task, options)` em `src/api/tasks/tasks.ts`, no
  molde de `propagateIconToSeries`:
  - dose/medicação → `.eq("medication_id", id)` (+ `gte("due_date", hoje)` e `is("completed_at", null)`
    conforme a opção escolhida);
  - recorrência simples → `.or("id.eq.<originId>,recurrence_origin_id.eq.<originId>")`, o mesmo
    escopo que a `073` fixou;
  - sempre `.eq("user_id", userId)`.
  `findSeriesTasks` continua existindo para **contar/exibir** ocorrências no dialog e no
  `SeriesOccurrencesDialog`, mas deixa de ser quem define o que é apagado.
- **A contagem exibida no dialog também passa a vir do servidor** (um `count` na mesma query), senão
  o texto continua mentindo quando há filtro ativo na tela. Enquanto carrega, o botão mostra estado
  de carregamento em vez de um número errado.
- **Uma origem com `medication_id` deixa de ser tratada como recorrência simples.**
  `isSimpleRecurringTask` ganha `&& !task.medication_id` — hoje ela devolve `true` para a origem
  backfilled e oferece um "excluir todas as ocorrências" que apaga o conjunto errado. Quem manda numa
  linha com `medication_id` é a variante de medicação.
- **A agenda ganha exclusão.** O dialog de editar tarefa da agenda (`AgendaGrid.tsx:739-788`) ganha
  um botão de excluir montando o mesmo `TaskDeleteDialog`, com os mesmos handlers. É onde o usuário
  estava quando tentou apagar; hoje ele teria de sair pra Lista sem que nada indique isso. Itens
  virtuais (`virtual:`) continuam sem exclusão — não existem no banco.
- **Sem `supabase db push` e sem migration nesta feature**: nada aqui muda schema.
- **Fora de escopo**: apagar a linha de `medication` em si (a `064` decidiu deliberadamente não
  apagar, para não zerar `task.medication_id` das doses passadas via `on delete set null`) e a
  duplicação de doses (feature `074`).

## Tarefas

- [x] `isSimpleRecurringTask` (`src/domain/tasks/agenda.ts:166-168`) passa a exigir
      `!task.medication_id`; `isMedicationDoseTask(task)` novo no mesmo arquivo
      (`!!task.medication_id`). Verificação: casos novos em `src/domain/tasks/__tests__/agenda.test.ts`
      — origem backfilled (`recurrence_rule` + `medication_id`) não é série simples; dose é dose;
      recorrência comum não regride
- [x] Criar `resolveDeleteScope(task, option)` puro em `src/domain/tasks/agenda.ts` (ou
      `taskDelete.ts` novo): recebe a tarefa e a opção escolhida e devolve um descritor
      (`{ kind: "single" | "series" | "doses"; originId?; medicationId?; onlyFuture: boolean;
      includeCompleted: boolean }`). É o que mantém a regra fora da camada de I/O. Verificação:
      `npm run build`
- [x] Testar `resolveDeleteScope`: dose com "encerrar tratamento", dose com "todas as doses" com e
      sem concluídas, ocorrência de recorrência simples, origem de recorrência simples, tarefa avulsa,
      tarefa vinculada a Recorrência Financeira (continua exclusão única). Verificação:
      `npm test src/domain/tasks`
- [x] Criar `countTaskSeries(task, option)` em `src/api/tasks/tasks.ts`: `select` com
      `{ count: "exact", head: true }` no mesmo escopo do descritor, escopado a `user_id`.
      Verificação: `npm run build`
- [x] Criar `deleteTaskSeries(task, option)` em `src/api/tasks/tasks.ts`: `delete` no escopo do
      descritor (`.or(...)` para recorrência simples, `.eq("medication_id", ...)` +
      `gte("due_date", hoje)` / `is("completed_at", null)` para doses), sempre com
      `.eq("user_id", userId)`. Verificação: `npm run build && npm run lint`
- [x] Criar `src/api/__tests__/tasks.delete-series.test.ts` (Supabase falso no molde de
      `tasks.series-icon.test.ts`): apagar a série de uma ocorrência alcança origem + irmãs; apagar
      doses alcança só as do `medication_id`; "só futuras" não toca o passado; "incluir tomadas" é o
      que libera apagar linhas com `completed_at`; o escopo **não** depende da lista carregada no
      cliente. Verificação: `npm test src/api`
- [x] Criar `endMedicationAndDeleteFutureDoses(medicationId)` em `src/api/health/medications.ts`:
      `deactivateMedication` seguido de `deleteTaskSeries` das futuras não concluídas, com o erro
      subindo pro chamador. Verificação: teste no mesmo arquivo de testes de medicação
- [x] Testar o caso que é o cerne do bug: apagar uma dose com o tratamento **ativo** e rodar
      `fetchTasks` de novo **recria** a dose; apagar com o tratamento **encerrado** não recria.
      Verificação: `npm test src/api`
- [x] `TaskDeleteDialog.tsx`: variante "dose de medicação" com as três ações e o checkbox "incluir as
      doses já tomadas" (desmarcado por padrão), texto explicando que apagar só esta não impede a
      recriação, e a ação recomendada em destaque. Cuidar do contraste do botão secundário — a `028`
      já apanhou disso (`text-foreground` explícito na className do `AlertDialogAction`).
      Verificação: `npm run build && npm run lint`
- [x] `TaskDeleteDialog.tsx`: a contagem exibida passa a vir de `countTaskSeries`, com estado de
      carregamento (skeleton/"…") enquanto busca e mensagem de erro amigável (`getErrorMessage`) se a
      contagem falhar — sem número inventado. Verificação: `npm run build && npm run lint`
- [x] Testes de `src/pages/admin/tasks/__tests__/TaskDeleteDialog.test.tsx` (criar se não existir):
      tarefa avulsa mostra um botão só; ocorrência de recorrência simples mostra as duas opções de
      sempre; dose mostra as três novas; o checkbox de concluídas começa desmarcado; a contagem
      aparece só depois de carregar; erro de contagem não trava o dialog. Verificação:
      `npm test src/pages/admin/tasks`
- [x] `TaskList.tsx` e `ProjectDetail.tsx`: `handleDeleteSeries` passa a chamar `deleteTaskSeries`
      (em vez de montar ids com `findSeriesTasks` + `deleteTasks`) e ganha o handler da variante de
      medicação; `load()` depois, com toast de sucesso dizendo **quantas** linhas saíram.
      Verificação: `npm run build && npm run lint`
- [x] Teste de regressão do bug do filtro: com um filtro de projeto/tag ativo em `TaskList`,
      "excluir todas as ocorrências" apaga a série **inteira** e não só a parte visível.
      Verificação: `npm test src/pages/admin/tasks`
- [x] `AgendaGrid.tsx`: botão de excluir no dialog de editar tarefa (`:739-788`), montando
      `TaskDeleteDialog` com os mesmos handlers, `load()` depois. Item virtual (`virtual:`) não
      mostra o botão. Verificação: `npm run build && npm run lint`
- [x] Teste em `src/pages/admin/tasks/__tests__/AgendaGrid.medication.test.tsx`: abrir uma dose pelo
      chip/bolinha da agenda oferece excluir; escolher "encerrar o tratamento" chama
      `deactivateMedication` e a bolinha some do calendário sem reload manual; item virtual não
      oferece exclusão. Verificação: `npm test src/pages/admin/tasks`
- [x] Estados de borda cobertos por teste: exclusão que falha (toast destrutivo, nada some da tela),
      série com uma ocorrência só (texto no singular), tratamento já inativo (a ação recomendada vira
      "apagar as doses futuras", sem "encerrar" redundante). Verificação:
      `npm test src/pages/admin/tasks`
- [x] `npx tsc -p tsconfig.app.json --noEmit && npm run build && npm run lint && npm test`, com a
      contagem registrada em `## Notas`
- [x] Verificação do pedido literal, por teste: a partir de uma dose de um tratamento ativo (o caso
      "SEMTRI"), existe um caminho de um dialog só que faz a tarefa sumir **e não voltar** na carga
      seguinte — na Lista e na Agenda

## Prompts

## Notas

### Verificação final

`npx tsc -p tsconfig.app.json --noEmit` — 0 erro. `npm run lint` — 0 erro, 78 warnings de
`react-refresh/only-export-components` (pré-existentes, os mesmos que a `073`/`074` registraram).
`npm run build` + `npm run check:bundle` — OK, teto de rota (160 KB gzip) respeitado.
`npm test` — **185 arquivos / 1866 testes / 0 falhas** (baseline antes desta feature: 180 / 1799;
esta feature soma 5 arquivos e 67 testes).

Uma das rodadas da suíte inteira teve **um** teste falhando por erro pós-teardown em
`src/pages/admin/health/__tests__/MedicationQuickCreateDialog.test.tsx`
(`dispatchEvent` do `focus-scope` do Radix disparando depois do ambiente cair, sob carga). A rodada
seguinte passou inteira. É a mesma família da intermitência conhecida em
`HealthDashboard.reminders.test.tsx`, sem relação com esta feature.

### Onde o escopo da exclusão passou a ser resolvido

`resolveDeleteScope` (`src/domain/tasks/taskDelete.ts`) decide **o que** apagar; `countTaskSeries` e
`deleteTaskSeries` (`src/api/tasks/taskRows.ts`) traduzem o descritor nos mesmos filtros de
PostgREST — a contagem que o dialog mostra é literalmente a query que o botão vai executar.

O escopo de um tratamento é a **união** que a `074` diagnosticou:
`id = origem OR recurrence_origin_id = origem OR medication_id = <med>`. A tarefa-origem
backfillada é série **e** dose, e a série dela tem dois tipos de filho (ocorrências antigas da `049`
com `recurrence_origin_id`; doses novas da `064` só com `medication_id`) — olhar um lado só deixa
linhas para trás, e a materialização seguinte devolve o resto para a tela.

### Desvios do plano

- **`countTaskSeries`/`deleteTaskSeries` moram em `src/api/tasks/taskRows.ts`, não em `tasks.ts`.**
  Mesmo motivo de `deleteTaskRows` na `074`: `src/api/health/medications.ts` precisa chamar
  `deleteTaskSeries` (para `endMedicationAndDeleteFutureDoses`) e `tasks.ts` já importa
  `medications.ts` — importar de volta fecharia um ciclo. `tasks.ts` **re-exporta** as duas, então
  `@/api/tasks` continua sendo a porta de entrada única das telas, como a tarefa pedia.
- **`endMedicationAndDeleteFutureDoses` recebe a tarefa, não só o `medicationId`.** O escopo precisa
  da origem da série quando a linha clicada é a origem backfillada; o `medication_id` sai da própria
  tarefa. Erro em qualquer das duas etapas vira um `EndMedicationError` com a etapa (`deactivate` /
  `delete`) — é o que permite a tela distinguir "não encerrou, nada foi apagado" de "encerrou, mas as
  doses ficaram" em vez de um "erro ao excluir" genérico.
- **A ordem é encerrar → apagar, e não o contrário.** Apagar antes de encerrar é o próprio bug: a
  carga seguinte recria tudo. Na ordem escolhida, a pior falha deixa doses velhas na tela, mas elas
  **não voltam** e uma segunda tentativa resolve.
- **"Não concluída" virou `completed_at is null` **e** `status <> 'done'`.** A tarefa só pedia
  `completed_at is null`; numa exclusão destrutiva o critério tem de ser o mais conservador, e as
  duas marcas de "já foi feito" existem no banco (linhas antigas podem estar `done` sem
  `completed_at`, que é campo posterior).
- **`allTasks` saiu do `TaskDeleteDialog` e das três linhas de `TaskViews`.** Era a prop que
  alimentava `findSeriesTasks` para decidir o que apagar; com o escopo no servidor ela virou peso
  morto, e mantê-la seria convidar a próxima pessoa a voltar a resolver escopo no cliente.
  `findSeriesTasks` continua onde ainda faz sentido: o `SeriesOccurrencesDialog`, que **exibe** a
  linha do tempo da série.
- **A premissa do "bug do filtro" só se confirma em `ProjectDetail`, não em `TaskList`.** O
  `Contexto` supunha `findSeriesTasks` rodando sobre `visibleTasks`; na verdade `TaskList` passava
  `allTasks={tasks}` (a lista **inteira** do usuário). Quem recortava era `ProjectDetail`, que guarda
  `taskList.filter(t => t.project_id === id)` — ali as ocorrências da mesma série em outro projeto
  (ou sem projeto, como toda dose) nunca chegavam ao cliente e o botão apagava pela metade. O teste
  de regressão (`TaskList.delete-series.test.tsx`) cobre os dois casos.
- **`runScopedTaskDelete` (`src/pages/admin/tasks/scopedDelete.ts`) é compartilhado pelas três
  telas.** `TaskList`, `ProjectDetail` e `AgendaGrid` precisam do mesmo comportamento em dois pontos
  fáceis de divergir entre cópias: a operação de duas partes do encerramento e o recarregamento no
  erro **parcial**.
- **O número do dia na célula do mês virou botão que abre o modal do dia.** Sem isso a exclusão
  recém-adicionada ao dialog de editar tarefa não teria caminho justamente na visão em que o usuário
  estava: a bolinha de uma dose só conclui/reabre, e o `+N` da fileira só aparece com excesso — uma
  dose sozinha na célula era **inalcançável**. Em semana/dia o número já era botão
  (`AgendaHourGrid`), e a própria `070` documentava esse caminho ("o outro é o número do dia") sem
  tê-lo implementado no mês. As asserções de "quantas bolinhas tem esta célula" da `070`/`074`
  passaram a consultar a fileira (`role="group"` do `QuickTaskDotRow`) em vez de "todo botão da
  célula" — ficaram mais precisas, não mais frouxas.
- **O teste de UI da Agenda usa a API falsa; quem prova o encerramento é o teste de API.**
  `AgendaGrid.medication.test.tsx` mocka `@/api/health/medications`, então ele prova o caminho da
  tela até `endMedicationAndDeleteFutureDoses`. Que essa função desativa a `medication` — e que sem
  isso a dose volta — está provado contra o Supabase falso em `health.medications.test.ts`, com
  `fetchTasks` de verdade rodando por cima.

### Rastreabilidade do pedido original

O `prompt:` tem duas metades; a duplicação é da `074`. Esta feature cobre a outra:

- *"i'm unable to delete it"* → `health.medications.test.ts` › "com o tratamento ativo, apagar a dose
  não resolve — ela volta na carga seguinte" (o bug, reproduzido) × "encerrando o tratamento junto, a
  dose some e **não** volta" (a correção), as duas com `fetchTasks` real.
- *"make a forms with the possibility to delete all the items"* → `TaskDeleteDialog.test.tsx`, 12
  testes: as três ações da variante de dose, o checkbox de doses tomadas desmarcado por padrão, a
  contagem que só aparece depois do servidor responder e o erro de contagem que não trava o dialog.
- *"when a task is related to a recorrence"* → `tasks.delete-series.test.ts` (15 testes) e
  `TaskList.delete-series.test.tsx`: a série inteira sai mesmo com a tela recortada.
- *"i have the task SEMTRI"* (o caminho de ponta a ponta) → `TaskList.delete-series.test.tsx` › "um
  dialog só encerra o tratamento e faz a dose sumir" e `AgendaGrid.medication.test.tsx` ›
  "'encerrar o tratamento' encerra e a bolinha some sem reload manual".

### Fora de escopo, confirmado

Nenhuma migration: o schema não muda. Nenhum `supabase db push` foi rodado, e esta feature não
adiciona nada à fila de push das `064`/`070`/`071`/`073`/`074`.
