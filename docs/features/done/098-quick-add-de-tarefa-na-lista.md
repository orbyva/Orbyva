---
prompt: |
  - quick add de tarefas, pela lista de tarefas, deixar um + no canto superior direito, ao clicar nele, expande um campo de input textual para a esquerda, então esse campo criará uma tarefa, recebendo somente o título, e um botão que ao expandir aparece na direita que expande e permite adicionar uma descrição. para adicionar rapidamente, e deve ser possível navegar via tab, então ao dar enter, se eu estiver no input ele cria, se eu der tab e clicar no botão de descriçõa ele amplia, se eu der tab ele vai pro botão de descrição e quando der enter também ele cria a tarefa
---

# 098 — Quick add de tarefa na Lista: `+` que expande para título (e descrição opcional)

## Contexto

Criar uma tarefa em `/tasks` tem hoje **um** caminho: o botão "Nova tarefa" (`TaskList.tsx:854`, nas
`actions` do `PageShell`; o mesmo botão se repete no `EmptyState`, `:987`), que abre o `Dialog`
(`:1209-1245`) com o `TaskFormFields` inteiro — o painel denso da feature 080, com projeto, prazo +
atalhos de prazo (083), prioridade, tags, ícone, links externos, recorrência e subtarefas. Para
anotar "comprar pão" são três gestos e um formulário inteiro. `ProjectDetail.tsx` é idêntico:
"Nova tarefa" (`:836`), o `+` por coluna do Kanban (`:879-887`) e o `EmptyState` (`:974`) abrem
todos o mesmo dialog (`:1109`).

O app **já tem** o padrão que o pedido descreve, mas preso num lugar só: o input de subtarefa dentro
do card do Kanban (`TaskViews.tsx:957-967` → `addKanbanSubtask`, `TaskList.tsx:481-500`, e o gêmeo
`ProjectDetail.tsx:756-780`) — `<Input placeholder="Adicionar subtarefa">`, Enter cria com o título
só, o campo limpa e a lista recarrega. `TaskSubtasksField.tsx:59-74` é a variante com botão
"Adicionar" ao lado e `e.preventDefault()` no Enter. Fora de Tarefas, o mais próximo de uma linha de
quick add de verdade é `DimensionsBoard.tsx:836-855` (input inline com Enter **e** Escape).

O `+` global do app é outra coisa e **não** é o `+` do pedido: o FAB `QuickAddExpenseFab`
(`AdminLayout.tsx:230`) e o `+` central do `MobileBottomNav` abrem o `QuickAddMenu`, um menu de
atalhos por área (`src/lib/quickAdd.ts`). `QUICK_ADD_ACTIONS` (`:26-119`) não tem nenhuma ação de
tarefa, e `resolveAppArea` (`:124-133`) joga qualquer rota `/tasks/*` na área `"home"`, cujo mix
curado é `["transaction","movie","habit","place","trip"]` (`:147-153`) — com teste que trava a lista
exata (`src/lib/__tests__/quickAdd.test.ts:34-43`).

E a Lista não tem `+` nenhum no canto superior direito: a barra de controles da aba
(`TaskList.tsx:931-968` — status, chips de prioridade, "Hoje", `TaskSortToggle`; e a gêmea
`ProjectDetail.tsx:955-967`) é toda alinhada à esquerda.

## Decisões

- **Componente novo `src/pages/admin/tasks/TaskQuickAdd.tsx`, não um item no QuickAdd global.** O
  nome sai de propósito sem o prefixo `QuickAdd` (`QuickAddMenu`/`QuickAddHost`/`QuickAddExpenseFab`/
  `QuickAddToggleIcon` são o outro sistema, o do FAB) — dois `+` chamados da mesma coisa em telas
  vizinhas é como se erra o arquivo na próxima sessão.
  - **Descartado — acrescentar uma ação `task` a `QUICK_ADD_ACTIONS`**: o FAB é um menu de atalhos
    que navega ou abre dialog, não um campo de digitação; o pedido é explicitamente um campo que
    expande na lista. Além disso `/tasks` cai na área `"home"`, cujo mix é fixado por teste — a ação
    apareceria em todas as telas do app ou em nenhuma.
- **Onde fica**: no fim (direita) da barra de controles da aba Lista, com `ml-auto`. É o "canto
  superior direito" da lista, e mantém o botão "Nova tarefa" do `PageShell` onde está — o `+` é o
  caminho rápido, o dialog continua sendo o caminho completo. Os dois convivem, como o input de
  subtarefa convive com o dialog hoje.
- **Estados**: fechado, só o `+` (`Button variant="outline" size="icon"`, `aria-label="Adicionar
  tarefa rápida"`, `aria-expanded`, `aria-controls` — mesmo formato do `+` por coluna do Kanban de
  `ProjectDetail.tsx:879-887`). Aberto, a tira substitui o `+` por
  `[input de título] [alternar descrição] [Criar]`, ancorada à direita, crescendo **para a esquerda**
  (o contêiner é `ml-auto` e o input vai de largura zero até `w-64`, então a expansão acontece
  visualmente para a esquerda, como pedido).
- **Ordem de tabulação e Enter — o pedido se contradiz aqui, e a contradição é resolvida assim:**
  o texto diz que clicar no botão de descrição "amplia" **e** que dar Enter nele "também cria a
  tarefa". As duas coisas não cabem no mesmo botão: no HTML, Enter num `<button>` focado dispara o
  clique dele, então "Enter cria" só existiria matando o Enter do botão — e aí a descrição ficaria
  **inalcançável por teclado**, que é justamente o que o pedido pede ("deve ser possível navegar via
  tab"). A tira é um `<form>` e fica assim:
  1. **Input de título** → Enter faz o submit implícito do form e **cria** (pedido literal).
  2. **Botão "Adicionar descrição"** (`type="button"`, `aria-expanded`/`aria-controls`) → Enter,
     Espaço e clique fazem a mesma coisa: **abrem a descrição** e movem o foco para dentro dela.
     Teclado e mouse têm de fazer o mesmo, senão o clique vira o único caminho.
  3. **Botão "Criar"** (`type="submit"`) → o último ponto de tabulação da tira. É aqui que "dar tab e
     depois Enter cria a tarefa" acontece de verdade, com semântica de botão intacta.
  - **Descartado — Enter no botão de descrição cria a tarefa**: é a leitura mais literal da última
    frase, mas quebra a semântica de botão, torna a descrição inacessível por teclado e contradiz a
    frase anterior do próprio pedido ("clicar no botão de descrição ele amplia").
- **Descrição abre *abaixo* da tira, não dentro dela.** Um `textarea` não cabe numa faixa de uma
  linha. É o `MarkdownTextarea` compartilhado (`src/components/MarkdownTextarea.tsx`, o mesmo do
  `TaskDescriptionField` e do editor de notas, com o handler de `Tab` que indenta), markdown cru e
  **sem** as abas Escrever/Visualizar — preview dentro de um quick add é o oposto de rápido. Dentro
  da textarea: Enter quebra linha, **Ctrl/Cmd+Enter** cria.
  - **Consequência assumida**: dentro do `MarkdownTextarea` o `Tab` indenta em vez de sair do campo
    (é o comportamento dele no form e nas notas). A saída é Escape, ou clicar no "Criar".
- **Só título e descrição vão no payload**; o resto vem de `emptyTask(projectId)`
  (`taskDraft.ts:11-36`), exatamente como o input de subtarefa já monta o dele
  (`TaskList.tsx:485-490`).
- **Costura com a feature 099 (`todo/099-tarefa-nova-herda-o-projeto-do-filtro.md`)**: o componente
  recebe `projectId: string | null` por prop e **não** sabe o que é filtro de projeto. Quem resolve
  "filtro ativo → projeto da tarefa nova" é a 099, que também liga essa prop. Se a 099 entrar antes,
  a prop já nasce ligada; se entrar depois, ela é quem liga. As duas features registram esta costura,
  no molde do hand-off 080↔083.
- **Depois de criar: limpa os dois campos, mantém a tira aberta e devolve o foco ao título.** O caso
  de uso é anotar três coisas seguidas; fechar a tira a cada criação obrigaria a reabrir toda vez.
  Nenhum inline create do app refoca hoje — aqui é requisito, não enfeite.
- **Tem toast de sucesso, contrariando a convenção dos inline creates do app (que não têm), e o
  motivo está registrado**: o input de subtarefa cria uma linha **dentro do card que o usuário está
  olhando** — o feedback é a própria linha aparecendo. Aqui não: a tarefa nasce sem prazo, cai na
  caixa "Sem prazo" (`groupTasksByAgendaBucket`), que pode estar muitas telas abaixo, e com um chip
  de prioridade ou "Hoje" ligado (`TaskList.tsx:942-966`) ela pode **não aparecer em lugar nenhum**.
  Sem aviso, o clique parece não ter feito nada. O toast diz onde ela foi parar, reusando
  `AGENDA_BUCKET_LABELS` — mesmo vocabulário do aviso "Movida para «caixa»" da 081
  (`TaskList.tsx:787`) — e, quando os filtros ativos escondem a tarefa recém-criada, diz isso em vez
  do nome da caixa.
- **Título em branco (ou só espaço) não cria**: "Criar" fica `disabled` e o Enter é no-op, sem toast
  — não há nada a reportar. Mesmo guard de `handleSave` (`TaskList.tsx:572-574`) e de
  `addKanbanSubtask` (`:483`).
- **Criação em voo trava a tira** (`saving`): input e botões desabilitados até a resposta. Enter
  duplo num campo que já disparou não pode criar duas tarefas.
- **Erro preserva o que foi digitado.** Toast destrutivo com `getErrorMessage` (convenção de
  `docs/stack.md`) e o texto continua no campo, com o foco de volta no título. Perder um título
  digitado por causa de uma falha de rede é o pior desfecho possível para um campo que existe para
  ser rápido.
- **Escape fecha a tira e devolve o foco ao `+`**; o rascunho fica guardado no estado do componente,
  então reabrir restaura o que estava escrito. Clicar fora fecha **só se** título e descrição
  estiverem vazios — com texto dentro, a tira continua aberta. Nada é criado sem um comando
  explícito, e nada é apagado por acidente.
- **Não persiste rascunho entre sessões.** `localStorage` aqui é diferente de `taskSortPreference`/
  `taskProjectFilterPreference`: aquilo é preferência de visualização, isto é conteúdo pela metade.
  Um rascunho ressuscitando três dias depois assusta mais do que perder duas palavras.
- **Vale para a aba Lista de `/tasks` e para a aba Lista de `ProjectDetail`** (a mesma barra,
  `:955-967`), com `projectId` fixo na rota lá. Kanban, Gantt e Agenda ficam de fora: o pedido é
  "pela lista de tarefas", o Kanban já tem o input por card e o `+` por coluna, e a Agenda não cria
  tarefa em lugar nenhum (`AgendaGrid.tsx` só edita e cria subtarefa).
- **Mobile**: abaixo de `sm` a tira ocupa a linha inteira (`w-full`, quebrando com o `flex-wrap` que
  a barra já tem) em vez de crescer para a esquerda — um input expandindo para a esquerda dentro de
  360px estoura a tela. A animação de largura leva `motion-reduce:transition-none` (variante já usada
  no projeto).
- **Sem `track()`.** Os eventos `quick_add_*` de `src/lib/analytics.ts` são do FAB global
  (`QuickAddMenu.tsx:44`); misturar duas origens diferentes no mesmo nome estraga a métrica que já
  existe.
- **Sem migration** — nenhum campo novo, `createTask` já existente (`api/tasks/tasks.ts:201`).

## Tarefas

- [x] Criar `src/pages/admin/tasks/TaskQuickAdd.tsx` com o **estado fechado**: só o `+`
      (`Button variant="outline" size="icon"`), `aria-label="Adicionar tarefa rápida"`, `title` igual,
      `aria-expanded={false}` e `aria-controls` apontando pro id da tira. Props:
      `projectId: string | null`, `onCreate: (payload: { title: string; description: string }) =>
      Promise<void>`, `disabled?: boolean`. Docblock no padrão do arquivo vizinho
      (`TaskDueQuickEdit.tsx`) explicando que não é o QuickAdd global. Verificação: `npm run build`
- [x] `TaskQuickAdd`: **estado aberto** — o `+` dá lugar a um `<form>` com `Input` de título
      (`aria-label="Título da tarefa"`, `placeholder="O que precisa ser feito?"`, `className="h-8
      text-sm"`), foco automático ao abrir, e os dois botões à direita. Verificação:
      `npm run build && npm run lint`
- [x] `TaskQuickAdd`: submit do form cria — Enter no input dispara o submit implícito;
      título vazio/só espaço deixa "Criar" `disabled` e o submit vira no-op.
      Verificação: `npm run build && npm run lint`
- [x] `TaskQuickAdd`: botão **"Adicionar descrição"** (`type="button"`, ícone `AlignLeft`,
      `aria-expanded`/`aria-controls`) que revela um `MarkdownTextarea` abaixo da tira e move o foco
      pra dentro dela — mesmo efeito no clique, no Enter e no Espaço. Verificação:
      `npm run build && npm run lint`
- [x] `TaskQuickAdd`: dentro da textarea, `Ctrl/Cmd+Enter` cria e Enter puro quebra linha; a textarea
      tem `aria-label="Descrição"` e `rows={3}`. Verificação: `npm run build && npm run lint`
- [x] `TaskQuickAdd`: botão **"Criar"** (`type="submit"`, `size="sm"`) como último ponto de
      tabulação da tira, depois do botão de descrição. Verificação: `npm run build && npm run lint`
- [x] `TaskQuickAdd`: estado `saving` — input, textarea e os dois botões desabilitados enquanto o
      `onCreate` está em voo; sucesso limpa título e descrição, recolhe a descrição, **mantém a tira
      aberta** e devolve o foco ao input de título. Verificação: `npm run build && npm run lint`
- [x] `TaskQuickAdd`: falha do `onCreate` (promise rejeitada) **não** limpa os campos e devolve o
      foco ao título — quem mostra o toast é o dono da página, não o componente.
      Verificação: `npm run build && npm run lint`
- [x] `TaskQuickAdd`: Escape fecha a tira e devolve o foco ao `+`, preservando o rascunho no estado;
      clique fora fecha só quando título e descrição estão vazios. Verificação:
      `npm run build && npm run lint`
- [x] `TaskQuickAdd`: responsivo e movimento — `w-full` abaixo de `sm` (a barra já é `flex-wrap`),
      transição de largura com `motion-reduce:transition-none`, e alvo de toque ≥44px nos três
      controles no mobile. Verificação: `npm run build && npm run lint`
- [x] Regra pura em `src/domain/tasks/filters.ts` (ao lado de `filterTasks`):
      `isTaskVisibleInList(task, { priority, todayOnly, statusView, todayIso })` — devolve se uma
      tarefa recém-criada passaria pelos chips rápidos da Lista. Exportar em
      `src/domain/tasks/index.ts`. Verificação: `npm run build`
- [x] Testar `isTaskVisibleInList` em `src/domain/tasks/__tests__/filters.test.ts`: sem filtro nenhum
      passa; chip de prioridade ligado esconde a tarefa nova (que nasce sem prioridade); "Hoje"
      ligado esconde (nasce sem prazo); `statusView = "done"` esconde. Verificação:
      `npm test src/domain/tasks`
- [x] `TaskList.tsx`: `handleQuickAddCreate({ title, description })` — `createTask({
      ...emptyTask(projectIdForQuickAdd), title, description })`, `load()`, e toast de 2000ms dizendo
      a caixa de destino (`AGENDA_BUCKET_LABELS[bucketForDueDate(null, todayIso)]`) **ou** que os
      filtros ativos a escondem, decidido por `isTaskVisibleInList`. Erro → toast destrutivo com
      `getErrorMessage` e `throw` de volta (o componente precisa saber que falhou).
      Verificação: `npm run build && npm run lint`
- [x] `TaskList.tsx`: renderizar `<TaskQuickAdd />` no fim da barra da aba Lista (`:931-968`) com
      `className="ml-auto"`, passando `projectId={null}` por enquanto — a prop real chega pela
      feature 099, e o ponto de costura fica marcado por comentário no código, como a 080 fez pra 083.
      Verificação: `npm run build && npm run lint`
- [x] `ProjectDetail.tsx`: mesmo par (handler + render) na barra da aba Lista (`:955-967`), com
      `projectId={id}` — o projeto é o da rota, sem ambiguidade. Verificação:
      `npm run build && npm run lint`
- [x] Teste novo `src/pages/admin/tasks/__tests__/TaskQuickAdd.test.tsx`: fechado mostra só o `+`
      (com `aria-expanded="false"`); clicar abre a tira e o foco cai no input; digitar título e dar
      Enter chama `onCreate` com `{ title, description: "" }`; título só com espaços não chama nada e
      "Criar" está desabilitado. Verificação: `npm test src/pages/admin/tasks`
- [x] No mesmo arquivo — **navegação por teclado, o coração do pedido**: a partir do input, `Tab`
      leva ao botão de descrição e outro `Tab` ao "Criar"; Enter no botão de descrição **abre** a
      descrição e move o foco pra textarea (e Espaço faz o mesmo); Enter no "Criar" cria;
      `Ctrl+Enter` dentro da textarea cria com título **e** descrição. Verificação:
      `npm test src/pages/admin/tasks`
- [x] No mesmo arquivo — bordas: `onCreate` em voo desabilita tudo e um segundo Enter não cria de
      novo; `onCreate` que rejeita mantém o texto digitado e devolve o foco ao título; Escape fecha,
      devolve o foco ao `+` e reabrir restaura o rascunho; clique fora com texto **não** fecha.
      Verificação: `npm test src/pages/admin/tasks`
- [x] Teste novo `src/pages/admin/tasks/__tests__/TaskList.quick-add.test.tsx` (molde de
      `TaskList.sort.test.tsx`): na aba Lista, criar pelo `+` chama `createTask` com o payload de
      `emptyTask()` + título, a tarefa aparece na caixa "Sem prazo" depois do `load()`, e o dialog
      completo **nunca** é aberto (nenhum "Criar tarefa" na tela). Verificação:
      `npm test src/pages/admin/tasks`
- [x] No mesmo arquivo: com o chip "Hoje" ligado, criar pelo `+` avisa que os filtros escondem a
      tarefa (toast) em vez de anunciar a caixa; e falha do `createTask` mostra toast destrutivo sem
      limpar o campo. Verificação: `npm test src/pages/admin/tasks`
- [x] Estender `src/pages/admin/tasks/__tests__/ProjectDetail.tabs.test.tsx` (ou arquivo novo
      `ProjectDetail.quick-add.test.tsx`, o que ficar mais limpo): o `+` aparece na aba Lista do
      projeto e cria a tarefa **já com `project_id` do projeto da rota**. Verificação:
      `npm test src/pages/admin/tasks`
- [x] `npm run build && npm run lint && npm test && npm run check:bundle` limpos, com a contagem de
      arquivos/testes antes e depois registrada em `## Notas`.
- [x] Verificação do pedido literal, item a item: `+` no canto superior direito da lista; clicar
      expande um campo de texto para a esquerda; o campo cria a tarefa só com o título; há um botão à
      direita que expande e permite adicionar descrição; dá pra navegar tudo por Tab; Enter no input
      cria. (Rastreabilidade completa em `## Notas`, com o teste que prova cada trecho.)

## Prompts

_(Nenhum pedido novo do usuário durante a implementação — tudo saiu do `prompt:` do frontmatter.)_

## Notas

- **Desvio do plano — `projectId` viaja no payload de `onCreate`.** As Tarefas escreviam a
  assinatura como `onCreate: (payload: { title, description }) => Promise<void>`, com o `projectId`
  entrando só como prop. Implementado assim, a prop ficaria **sem nenhum uso dentro do componente**
  (quem monta o payload é a página, que já tem o valor) — código morto que a próxima sessão
  apagaria por parecer sobra. A assinatura ficou
  `onCreate: (payload: TaskQuickAddPayload & { projectId: string | null }) => Promise<void>`: o
  componente devolve o projeto que recebeu, e as duas páginas fazem `emptyTask(payload.projectId)`.
  O contrato da costura com a 099 continua o mesmo e fica **melhor**: a 099 muda um lugar só
  (`projectIdForQuickAdd` em `TaskList.tsx`, marcado por docblock no código), sem tocar em
  `TaskQuickAdd` nem no handler.
- **`MarkdownTextarea` sobrescreve o `onKeyDown` que recebe por prop** (ele precisa do próprio, que
  indenta no `Tab`). Por isso `Ctrl/Cmd+Enter` e `Escape` são captados no contêiner da tira, por
  bubbling, em vez de na textarea — e o componente compartilhado não precisou ser alterado.
- **Retorno de foco não pode ser `focus()` direto.** Tanto no sucesso (`saving` desabilita o input
  de título) quanto no Escape (o `+` só volta ao DOM no render seguinte), o elemento-alvo não está
  focável no instante em que o handler roda. Os dois casos usam um ref-bandeira + `useEffect`, que
  refoca depois do commit. Sem isso, criar duas tarefas seguidas por teclado não funcionaria.
- **Botão "Adicionar descrição" não fecha a descrição.** Com ela já aberta, ele leva o foco pra
  dentro da textarea em vez de recolher: fechar num Enter distraído esconderia texto já digitado.
- **Suíte antes:** 236 arquivos / 2616 testes. **Depois:** 239 arquivos / 2659 testes, 0 falhas
  (3 arquivos novos: `TaskQuickAdd.test.tsx` 26, `TaskList.quick-add.test.tsx` 7,
  `ProjectDetail.quick-add.test.tsx` 4; mais 6 casos novos de `isTaskVisibleInList` em
  `filters.test.ts`). `npm run build`, `npm run lint` (0 erros, 87 warnings pré-existentes de
  `react-refresh`) e `npm run check:bundle` ("Bundle budget OK") limpos.

### Rastreabilidade do `prompt:` — trecho → teste que prova

Sem Chrome (regra da skill `next`), cada pedaço do pedido tem de ter um artefato automatizado:

| Trecho do pedido | Prova |
| --- | --- |
| "quick add de tarefas, **pela lista de tarefas**" | `TaskList.quick-add.test.tsx` › "criar pelo `+` grava o payload de emptyTask() + título e não abre o dialog completo"; `ProjectDetail.quick-add.test.tsx` › "o `+` aparece na aba Lista do projeto (e não no Kanban)" |
| "deixar um **+ no canto superior direito**" | `TaskList.quick-add.test.tsx` › "o `+` é o último controle da barra da aba Lista, empurrado para a direita" (`ml-auto` + último filho da barra do "Ordenar por") |
| "ao clicar nele, **expande um campo de input textual para a esquerda**" | `TaskQuickAdd.test.tsx` › "clicar no `+` troca ele pela tira, com o foco já no título" + "o campo abre com largura zero e cresce — ancorado à direita, ou seja, para a esquerda" |
| "esse campo **criará uma tarefa, recebendo somente o título**" | `TaskQuickAdd.test.tsx` › "digitar o título e dar Enter chama onCreate com a descrição vazia"; `TaskList.quick-add.test.tsx` › asserção literal do payload (`emptyTask()` + título) |
| "**um botão que ao expandir aparece na direita** que expande e permite adicionar uma descrição" | `TaskQuickAdd.test.tsx` › "clique/Enter/Espaço no botão de descrição revela a textarea e leva o foco pra dentro dela" + "a descrição digitada vai junto no onCreate" |
| "para **adicionar rapidamente**" | `TaskList.quick-add.test.tsx` › "dá pra anotar duas coisas seguidas sem reabrir a tira" |
| "deve ser possível **navegar via tab**" | `TaskQuickAdd.test.tsx` › "do título, Tab leva ao botão de descrição e outro Tab ao «Criar»" |
| "**ao dar enter, se eu estiver no input ele cria**" | `TaskQuickAdd.test.tsx` › "digitar o título e dar Enter chama onCreate com a descrição vazia" |
| "se eu der tab e **clicar no botão de descrição ele amplia**" | `TaskQuickAdd.test.tsx` › o mesmo `it.each` de clique/Enter/Espaço (os três abrem a descrição e movem o foco) |
| "se eu der tab ele vai pro botão de descrição e **quando der enter também ele cria a tarefa**" | Resolvido pela Decisão "Ordem de tabulação e Enter": o Enter que cria é no **"Criar"**, o ponto de tabulação seguinte — `TaskQuickAdd.test.tsx` › "Enter no «Criar» (o último ponto de tabulação) cria a tarefa" |
