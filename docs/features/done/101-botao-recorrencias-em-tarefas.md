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

# 101 — Botão "Recorrências" em Tarefas

## Contexto

Esta feature cobre o **primeiro bullet** do `prompt:` ("botão 'recorrências' em tarefas, de modo que
eu veja todas as tarefas com recorrência"). Os outros bullets (a seção Agenda) viram as features 102,
103 e 104.

Hoje não existe nenhuma tela que responda "o que se repete na minha vida, e com que regra". O que
existe é pontual e por tarefa:

- `TaskListRow` abre `SeriesOccurrencesDialog` ("Ocorrências de…") quando o usuário clica numa tarefa
  que por acaso é de uma série (`TaskList.tsx:1126`, `:1176`, `:1331-1335`) — ou seja, é preciso já
  ter achado a tarefa para descobrir que ela é recorrente.
- A regra em si (`"A cada 2 semanas, seg e qua"`) só é legível **dentro** do formulário, no gatilho do
  `TaskRecurrenceDialog`, via `formatRecurrenceSummary` (`src/domain/tasks/recurrence.ts:370`).
- Pior: a Lista **colapsa** cada série na próxima ocorrência em aberto (`collapseRecurringSeries`,
  `src/domain/tasks/agenda.ts:147`), e séries **sem** ocorrência em aberto somem inteiras da tela. Uma
  recorrência que já terminou (`count`/`until` esgotados) ou cujo tratamento foi encerrado é
  literalmente invisível hoje.

O material para montar a tela já está quase todo escrito e testado — `seriesKey`
(`agenda.ts:127`, privado), `findSeriesTasks` (`:237`), `isRecurringTask` (`:197`),
`isSimpleRecurringTask` (`:214`), `isMedicationDoseTask` (`:232`), `formatRecurrenceSummary`,
`SeriesOccurrencesDialog`, `TaskDeleteDialog` + `runScopedTaskDelete` (`scopedDelete.ts`). Falta a
agregação "uma linha por série" e a página que a exibe.

## Decisões

- **Botão "Recorrências" no cabeçalho de `/tasks`**, nas `actions` do `PageShell`
  (`TaskList.tsx:945-961`), ao lado de "Live" e "Tags" — é exatamente o padrão que a feature 023
  fixou para o que é do módulo Tarefas mas não merece item fixo na sidebar. Navega para
  **`/tasks/recurrences`**, registrada em `src/routes.tsx` junto de `live`/`tags`/`link-icons`.
- **Fora da sidebar**, como Live e Tags. Quem entra em Recorrências veio de Tarefas.
- **Título da página: "Tarefas recorrentes"**, mesmo com o botão rotulado "Recorrências" (que é a
  palavra do pedido). Já existe **Finanças → Recorrências** (`/finance/recurring`,
  `Recurring.tsx`), que é outra coisa — duas páginas com o mesmo `title` em módulos diferentes é
  como se erra a tela na próxima sessão. O `eyebrow` é "Produtividade", como o resto do módulo.
- **Uma linha por série, não por ocorrência.** "Ver todas as tarefas com recorrência" com uma linha
  por ocorrência materializada devolveria centenas de linhas de "Tomar Losartana" — o que o usuário
  quer ver é a **regra**, com as ocorrências a um clique (o `SeriesOccurrencesDialog`, que já faz
  isso).
- **Os quatro tipos de série entram**, porque no vocabulário do usuário todos são "tarefa com
  recorrência", e cada um ganha um `Badge` que o identifica:
  - recorrência simples (`recurrence_rule`/`recurrence_origin_id`) — badge "Repetição";
  - vinculada a uma Recorrência Financeira (`linked_recurring_id`) — badge "Financeira";
  - tratamento/medicação (`medication_id`, feature 064) — badge "Medicação";
  - consulta médica recorrente (`is_consultation` + regra, feature 061) — badge "Consulta".
  Os dois últimos são recortes de exibição sobre os dois primeiros, não uma quinta chave de
  agrupamento.
- **Nova função pura `groupTaskSeries` em `src/domain/tasks/series.ts`** (arquivo novo, exportado por
  `src/domain/tasks/index.ts`), devolvendo `TaskSeriesSummary[]`. A diferença essencial em relação a
  `collapseRecurringSeries` — e a razão de ser uma função nova em vez de um parâmetro nela — é que
  **esta não descarta série encerrada**: aqui, "acabou" é informação, não motivo para sumir.
- **A chave de agrupamento estende `seriesKey`, e a ordem dos testes importa:** `medication:<id>`
  **antes** de delegar ao `seriesKey` de `agenda.ts`. O backfill 049→064 preserva a
  `recurrence_rule` na tarefa-origem do tratamento, então a origem tem `recurrence_rule` **e**
  `medication_id` enquanto as doses materializadas têm os dois campos de série nulos: delegando
  primeiro, a origem cairia em `simple:<id>` e as doses em `null`, e o mesmo tratamento apareceria
  como uma série de uma linha só + um monte de tarefa avulsa. É a mesma armadilha que a feature 074
  documentou em `computeVirtualOccurrences`.
- **`seriesKey` deixa de ser privado**: passa a ser exportado de `agenda.ts` (como `taskSeriesKey`,
  com os usos internos atualizados) para `series.ts` delegar a ele. Duas definições de "o que é a
  mesma série" é como as telas passam a discordar.
- **Ordenação padrão: ativas primeiro** (as que têm próxima ocorrência em aberto), por próxima
  ocorrência ascendente; depois as encerradas, por última ocorrência descendente. É a ordem de
  "o que me espera" → "o que já foi".
- **Filtro de status próprio da página**: `<Select>` "Ativas / Encerradas / Todas", com "Ativas" como
  padrão. Não reaproveita `TaskStatusView` (`pending`/`done`/`all`), que fala de **ocorrência**
  concluída — aqui o eixo é a **série** estar viva ou não.
- **Reaproveita o filtro de projeto persistido** (`readTaskProjectFilter`/`writeTaskProjectFilter`,
  `@/lib/taskProjectFilterPreference`, feature 097), com o mesmo `<Select>` de três vocábulos
  (`all`/`null`/id) e o mesmo `normalizeProjectFilter` contra projeto apagado. O recorte "estou
  trabalhando no projeto X" é do usuário, não da tela — mesma decisão da 097.
- **Ações por linha, todas reusando o que já existe:**
  - "Ver ocorrências" → `SeriesOccurrencesDialog` com `findSeriesTasks(tasks, origem)`;
  - "Excluir" → `TaskDeleteDialog` + `runScopedTaskDelete`, os mesmos das outras três telas
    (inclusive o "Encerrar tratamento" da 075, que é a única exclusão que funciona para medicação);
  - "Editar repetição" → `TaskRecurrenceDialog` + `useTaskRecurrenceEditor`, salvando com
    `updateTask` na **tarefa-origem**.
- **A página não vira um quarto dono do `TaskFormFields`.** Ela edita só a repetição — que é o
  assunto dela. Título, prazo, tags e o resto continuam no formulário completo, em Lista/Projeto/
  Agenda. Uma página sobre recorrências onde não dá para consertar uma regra errada mandaria o
  usuário caçar a tarefa na Lista; um quarto formulário completo duplicaria ~150 linhas de fiação
  (tags, recorrências financeiras, dimensões, subtarefas, links) sem pedido nenhum.
- **Mudar a regra não mexe nas ocorrências já materializadas** — é o comportamento que o formulário
  já tem hoje (`materializeRecurringInstances` só cria o que falta, nunca apaga o que sobra). Não é
  regressão nova, mas o dialog ganha uma linha avisando disso, porque aqui o usuário está justamente
  olhando a lista de ocorrências.
- **Ocorrências virtuais (`virtual:`) não entram.** Elas são preview de calendário
  (`computeVirtualOccurrences`), não existem no banco, e esta página lê `fetchTasks()` direto — a
  contagem "N ocorrências" tem de ser a das linhas reais.
- **Sem migration.** Nenhuma coluna nova: tudo já está em `task`/`medication`.
- **Descartado — "só um chip 'Recorrentes' na barra da Lista"**: caberia em uma linha de código, mas
  não resolve o pedido. A Lista colapsa série e esconde série encerrada, e a regra continuaria
  invisível — o usuário veria "tarefas que por acaso se repetem", não "as recorrências".

## Tarefas

- [x] `src/domain/tasks/agenda.ts`: exportar `seriesKey` como `taskSeriesKey` (mesma implementação,
      docblock explicando que é a definição única de "mesma série"), atualizando os usos internos
      (`collapseRecurringSeries`, `findSeriesTasks`) e o `index.ts` do domínio.
      Verificação: `npm run build && npm test src/domain/tasks`
- [x] `src/domain/tasks/series.ts` (novo): tipo `TaskSeriesSummary` — `key`, `kind`
      (`"simple" | "linked" | "medication"`), `origin: Task`, `tasks: Task[]`, `occurrenceCount`,
      `doneCount`, `nextOpen: Task | null`, `lastOccurrence: Task | null`, `active: boolean`. Só o
      tipo + docblock nesta tarefa. Verificação: `npm run build`
- [x] `series.ts`: `taskSeriesGroupKey(task)` — `medication:<medication_id>` **antes** de delegar a
      `taskSeriesKey`, com o comentário explicando o backfill 049→064 (origem tem regra **e**
      `medication_id`; doses não têm nenhum dos dois). Verificação: `npm run build && npm run lint`
- [x] `series.ts`: `groupTaskSeries(tasks): TaskSeriesSummary[]` — agrupa por
      `taskSeriesGroupKey`, escolhe a origem (a linha com `recurrence_rule`, senão a de menor
      `due_date`), calcula contagens, `nextOpen` (menor `due_date` com `status !== "done"`),
      `lastOccurrence` (maior `due_date`) e `active` (`nextOpen != null`). Ordena ativas primeiro
      por `nextOpen.due_date` asc, encerradas depois por `lastOccurrence.due_date` desc. Não muta a
      entrada. Verificação: `npm run build && npm run lint`
- [x] `src/domain/tasks/index.ts`: exportar `series.ts`. Verificação: `npm run build`
- [x] `src/domain/tasks/__tests__/series.test.ts` (novo): agrupamento dos três `kind`, tarefa sem
      recorrência nenhuma fica de fora, e o caso que mais importa — origem de medicação backfillada
      (regra + `medication_id`) cai no **mesmo** grupo das doses, e não numa série própria.
      Verificação: `npm test src/domain/tasks`
- [x] Mesmo arquivo: série **encerrada** (todas as ocorrências `done`) continua na saída, com
      `active: false` — o teste que fixa a divergência proposital em relação a
      `collapseRecurringSeries`, que a descarta. Verificação: `npm test src/domain/tasks`
- [x] Mesmo arquivo: bordas — série de uma ocorrência só; ocorrência sem `due_date`; contagens
      (`occurrenceCount`/`doneCount`); ordenação com ativas e encerradas misturadas; entrada vazia.
      Verificação: `npm test src/domain/tasks`
- [x] `src/pages/admin/tasks/TaskRecurrences.tsx` (novo): `PageShell` (`title="Tarefas recorrentes"`,
      `eyebrow="Produtividade"`), carga com `Promise.all([fetchTasks(), fetchProjects()])`,
      `TableLoadingSkeleton` enquanto carrega e `toast` + `getErrorMessage` no erro. Ainda sem
      lista — só o esqueleto da página. Verificação: `npm run build && npm run lint`
- [x] `src/routes.tsx`: registrar `{ path: "recurrences", element: <TaskRecurrences /> }` dentro de
      `tasks`, com `lazy(...)` como as irmãs, e o comentário de que fica fora da sidebar (como
      `tags`/`link-icons`). Verificação: `npm run build`
- [x] `TaskList.tsx`: botão "Recorrências" (ícone `Repeat` do lucide) nas `actions` do `PageShell`,
      entre "Live" e "Tags", `asChild` + `<Link to="/tasks/recurrences">`.
      Verificação: `npm run build && npm run lint`
- [x] `TaskRecurrences.tsx`: linha da série — ícone (`TaskIconBadge`), título, `Badge` do `kind`,
      resumo da regra (`formatRecurrenceSummary`, passando a descrição da Recorrência Financeira
      quando `kind === "linked"`), nome do projeto, próxima ocorrência (`formatDateTimeBR`) e
      "N ocorrências · M concluídas". Verificação: `npm run build && npm run lint`
- [x] `TaskRecurrences.tsx`: carregar também `fetchRecurringTransactions()` e `fetchMedications()`
      (sem filtro de ativos — tratamento encerrado tem de continuar aparecendo como série
      encerrada), com o mesmo `.catch` tolerante que `AgendaGrid.load` usa para medicação: uma falha
      aí não pode zerar a página inteira. Verificação: `npm run build && npm run lint`
- [x] `TaskRecurrences.tsx`: `<Select>` de status da série (Ativas / Encerradas / Todas, padrão
      "Ativas") e `<Select>` de projeto no vocabulário `all`/`null`/id, semeado por
      `readTaskProjectFilter()`, gravado por `writeTaskProjectFilter` e saneado por
      `normalizeProjectFilter` depois que `projects` carrega. Verificação: `npm run build && npm run lint`
- [x] `TaskRecurrences.tsx`: estados vazios distintos com `EmptyState` — "nenhuma tarefa recorrente
      ainda" (base sem série nenhuma, com ação "Ir para Tarefas") e "nenhuma série neste recorte"
      (há séries, mas os filtros zeraram a lista, com ação "Limpar filtros"). Um texto só para os
      dois faria o usuário achar que perdeu as recorrências. Verificação: `npm run build && npm run lint`
- [x] `TaskRecurrences.tsx`: botão "Ver ocorrências" por linha, abrindo `SeriesOccurrencesDialog`
      com `findSeriesTasks(tasks, origem)`. Verificação: `npm run build && npm run lint`
- [x] `TaskRecurrences.tsx`: exclusão por linha com `TaskDeleteDialog` + `runScopedTaskDelete`
      (`{ reload: load, notify: toast }`), idêntica à das outras três telas — inclusive o
      "Encerrar tratamento" da 075 para as séries de medicação.
      Verificação: `npm run build && npm run lint`
- [x] `TaskRecurrences.tsx`: "Editar repetição" — `useTaskRecurrenceEditor` + `TaskRecurrenceDialog`
      alimentados pela tarefa-origem, salvando com `updateTask({ id: origem.id, due_date, due_time,
      recurrence_rule, linked_recurring_id })` + `load()` + toast. Uma linha no dialog avisando que
      as ocorrências já criadas não são reescritas. Verificação: `npm run build && npm run lint`
- [x] `src/pages/admin/tasks/__tests__/TaskRecurrences.test.tsx` (novo, molde de `Tags.test.tsx` /
      `AgendaGrid.test.tsx` para os mocks de `@/api/tasks`): com uma série simples, uma financeira e
      um tratamento na base, a página mostra **três** linhas, com o resumo da regra de cada uma —
      e nenhuma linha para as tarefas avulsas. Verificação: `npm test src/pages/admin/tasks`
- [x] Mesmo arquivo: skeleton enquanto carrega, toast de erro quando `fetchTasks` rejeita, e os dois
      `EmptyState` (base vazia × filtro que zerou). Verificação: `npm test src/pages/admin/tasks`
- [x] Mesmo arquivo: filtro "Encerradas" mostra a série cujas ocorrências acabaram — a que a Lista
      esconde hoje —, e "Ativas" (padrão) a deixa de fora. É a prova do "**todas** as tarefas com
      recorrência" do pedido. Verificação: `npm test src/pages/admin/tasks`
- [x] Mesmo arquivo: filtro de projeto recorta as séries e sobrevive ao reload (preferência salva);
      preferência apontando para projeto apagado cai em "Todos". Verificação: `npm test src/pages/admin/tasks`
- [x] Mesmo arquivo: "Ver ocorrências" abre o dialog com as ocorrências daquela série; excluir uma
      série chama `deleteTaskSeries` com o escopo da série (e não `deleteTask` de uma linha só);
      editar a repetição chama `updateTask` no id da **origem**.
      Verificação: `npm test src/pages/admin/tasks`
- [x] Teste de navegação: `TaskList` renderiza o botão "Recorrências" apontando para
      `/tasks/recurrences`, e a rota resolve contra `appRoutes` montando a página (molde de
      `notes-navigation.test.tsx`). Verificação: `npm test src/pages/admin/tasks`
- [x] `npm run build && npm run lint && npm test && npm run check:bundle` limpos, com a contagem de
      arquivos/testes antes e depois registrada em `## Notas`.
- [x] Verificação do pedido literal: existe um botão "Recorrências" em Tarefas, e clicar nele mostra
      **todas** as tarefas com recorrência — inclusive as que a Lista de hoje esconde (série
      colapsada e série encerrada). Registrar a rastreabilidade trecho → teste em `## Notas`.
- [x] (aberta pela checagem de satisfação) Com o padrão "Ativas", a série encerrada continua
      **invisível ao abrir a tela** — que é literalmente a queixa do pedido ("veja **todas**"),
      só que numa tela nova. Sem mexer no padrão (decisão registrada acima), a linha de aviso
      "N série encerrada fora deste recorte", com ação para trocar o filtro, quando há encerradas
      escondidas. Verificação: `npm test src/pages/admin/tasks` com um teste que prova o aviso e
      que ele some quando não há nada escondido.

## Prompts

_(Nenhum pedido novo do usuário durante a implementação — tudo saiu do `prompt:` do frontmatter.)_

## Notas

- 2026-08-31 (esteira): o agente implementador foi morto no meio da tarefa do botão
  "Recorrências", por limite de sessão da conta — não por falha do código. Ficaram prontas as
  10 primeiras tarefas (`series.ts`, `series.test.ts`, rota `/tasks/recurrences`,
  `TaskRecurrences.tsx`). O arquivo `TaskRecurrences.navigation.test.tsx` sobrou com 2 testes
  válidos (a rota resolve; fica dentro de `/tasks` sem roubar a index) mais um bloco de imports
  órfãos preparado para a asserção do botão, que nunca chegou a ser escrita: esses imports
  quebravam `tsc` e foram removidos pela esteira. Estado ao retomar: `tsc` limpo e 27 testes
  verdes nos dois arquivos novos. A asserção de que o botão do cabeçalho aponta para a rota
  continua pendente, junto da tarefa do botão.

### Desvios do plano original (2026-08-31, retomada)

- **O botão "Recorrências" já estava em `TaskList.tsx`** quando a esteira retomou — o agente
  anterior chegou a escrevê-lo antes de ser morto, mas não conseguiu marcar a tarefa nem provar
  nada. A retomada não reescreveu o botão: escreveu a prova que faltava
  (`TaskRecurrences.navigation.test.tsx`, dois testes novos — o `href` do link e a ordem
  Live → Recorrências → Tags no cabeçalho).

- **"Ver ocorrências" usa `series.tasks`, não `findSeriesTasks(tasks, origem)`** como as Decisões
  previam. `findSeriesTasks` delega a `taskSeriesKey`, que **não conhece medicação**: para um
  tratamento ela devolveria só a tarefa-origem, porque as doses materializadas nascem sem
  `recurrence_rule` e sem `recurrence_origin_id`. É exatamente a armadilha que `taskSeriesGroupKey`
  existe para evitar — e usar `findSeriesTasks` aqui a reintroduziria na única tela que agrupa
  medicação. Nas séries simples e financeiras os dois conjuntos são idênticos (a chave de grupo
  delega a `taskSeriesKey` justamente nesses casos). Fixado pelo teste "no tratamento, lista **as
  doses** — `findSeriesTasks` devolveria só a tarefa-origem".

- **A regra da linha de medicação sai de `formatPosology(medication)`, não de
  `formatRecurrenceSummary`.** Foi o que deu função ao `fetchMedications()` que o plano pedia sem
  dizer para quê: a regra de um tratamento mora na `medication` (posologia, horários, intervalo),
  não na `recurrence_rule` da tarefa — e uma série cujas doses sobreviveram à origem apagada cairia
  num "Não se repete" falso. Fallback preservado: sem o registro (falha de carga), a linha volta ao
  resumo que sai da própria tarefa.

- **`TaskRecurrenceDialog` ganhou uma prop `footer?: ReactNode`.** No formulário completo o dialog
  não tem rodapé nenhum — as mudanças caem no rascunho e quem grava é o "Salvar" do formulário. Esta
  página o abre **sozinho**, sem formulário em volta, então precisa do próprio botão de salvar e do
  aviso de que as ocorrências já materializadas não são reescritas. Prop opcional: os três
  consumidores antigos não mudaram (`TaskFormFields.test.tsx`, 50 testes, verde).

- **Tratamento não oferece "Editar repetição".** Editar a `recurrence_rule` da tarefa-origem de um
  tratamento não mudaria dose nenhuma — `materializeMedicationDoses` recalcula tudo pela
  `medication` na carga seguinte —, então o botão seria um controle que não faz nada. Quem edita
  tratamento é Saúde → Medicações. Fixado por teste.

- **Série financeira cai na variante "tarefa comum" do `TaskDeleteDialog`**, sem "excluir todas as
  ocorrências". Não é omissão: é a decisão da feature 028 (`isSimpleRecurringTask` exclui
  `linked_recurring_id`, que tem sync bidirecional próprio). Como numa tela de *séries* isso é fácil
  de ler errado, a linha passa uma `description` explícita ao dialog dizendo que sai só aquela
  ocorrência e que a Recorrência continua em Finanças.

- **"Limpar filtros" leva o status para "Todas", não para o padrão "Ativas".** O botão só existe no
  vazio "há séries, mas o recorte zerou" — voltar para "Ativas" poderia deixar a tela vazia de novo
  (quem estava em "Encerradas" com zero encerradas). "Todas" garante que o clique resolve o que o
  usuário veio resolver. O filtro de projeto volta a `all` e é **gravado**, porque é persistido:
  sair do recorte só na tela e reencontrá-lo na sessão seguinte seria o mesmo susto de novo.

### Suíte (tarefa final)

- **Antes** (última rodada completa do dia, registrada pela esteira): 244 arquivos / 2733 testes /
  0 falhas.
- **Depois**: 247 arquivos / **2798** testes / 0 falhas (`npm test`), `npm run build` e
  `npm run lint` (0 erros, só os 90 warnings de `react-refresh` pré-existentes) e
  `npm run check:bundle` ("Bundle budget OK") limpos.
- +3 arquivos: `src/domain/tasks/__tests__/series.test.ts` (25),
  `src/pages/admin/tasks/__tests__/TaskRecurrences.test.tsx` (30) e
  `.../TaskRecurrences.navigation.test.tsx` (4).
- Uma das rodadas completas acusou **1 error** de teardown em
  `src/pages/admin/health/__tests__/MedicationQuickCreateDialog.test.tsx`
  (`dispatchEvent` do focus-scope do Radix disparando depois do ambiente derrubado, com fake
  timers). Não é regressão desta feature — o arquivo não foi tocado, passa isolado (18/18, sem
  erro) e **não reapareceu** nas duas rodadas completas seguintes. Mesma família dos flakes já
  observados em `CanvasBlock.test.tsx` e `notaSemSintaxe.test.tsx`.

### Rastreabilidade do `prompt:` (tarefa final)

O `prompt:` desta feature tem um só bullet (os outros viraram 102/103/104), e ele se quebra em três
exigências. `## Prompts` está vazio — nenhum pedido novo entrou durante a implementação. Nenhum
item abaixo foi conferido no navegador: a skill `next` proíbe Chrome, então cada um aponta um teste
que roda.

| Trecho do `prompt:` | Artefato que prova |
| --- | --- |
| "botão 'recorrências' **em tarefas**" | `TaskRecurrences.navigation.test.tsx` → "renderiza um link 'Recorrências' apontando para /tasks/recurrences" (assere o `href`, não só o texto) e "fica entre 'Live' e 'Tags'". A rota existe de verdade: "a URL resolve para uma rota registrada, não para o 404", contra `appRoutes`. |
| "de modo que eu veja **todas** as tarefas com recorrência" | `TaskRecurrences.test.tsx` → "mostra as três séries da base e nenhuma linha para a tarefa avulsa" (simples + financeira + tratamento numa base que também tem tarefa solta) e "cada linha ganha o badge do seu tipo". O caso que a Lista de hoje **esconde**: "'Encerradas' mostra a série que a Lista esconde hoje — e só ela" (série 100% concluída, que `collapseRecurringSeries` descarta) e, no domínio, `series.test.ts` → série encerrada continua na saída com `active: false`. O outro caso escondido — série colapsada — está em "mostra as três séries..." : duas reuniões e duas doses viram **uma** linha cada, sem perder as ocorrências ("abre 'Ocorrências de…' com as duas ocorrências reais"). |
| "recorrênciaS" (plural: a *regra*, não a tarefa) | `TaskRecurrences.test.tsx` → "cada linha mostra a regra da série" ("A cada 1 semana, seg" / "A cada 1 dia"), "a série financeira mostra a descrição da Recorrência vinculada" e "a série de tratamento mostra a posologia do `medication`". A regra também pode ser **corrigida** ali: "salva na **tarefa-origem**, e não na ocorrência que por acaso estava na frente". |

Armadilha do backfill 049→064 (a que faria o tratamento aparecer como uma série de uma linha só mais
um monte de tarefa avulsa) fixada em `series.test.ts` e na tela por "mostra as três séries...", que
tem origem backfillada **e** dose na mesma base.

**A checagem de satisfação achou um buraco, e ele virou tarefa** (a última da lista, não estava no
plano): com todas as caixinhas marcadas, abrir `/tasks/recurrences` mostrava o recorte "Ativas", e
a série encerrada continuava **invisível ao abrir a tela** — exatamente a queixa que originou a
feature, só que numa tela nova em vez da Lista. O padrão não mudou (é decisão registrada acima, e
"o que me espera" é o que se quer ver na maioria das vezes); o que entrou foi a linha
"N série encerrada está fora deste recorte" + "Mostrar todas", só quando há encerradas escondidas.
Fixado por "avisa quantas séries encerradas ficaram fora, e mostra todas num clique" e por "sem
série encerrada nenhuma, não há aviso".
