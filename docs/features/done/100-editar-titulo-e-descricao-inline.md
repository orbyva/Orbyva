---
prompt: |
  - deve ser possível alterar o título ou a descrição sem abrir o modal da tarefa, somente clicando no título ou descrição
---

# 100 — Editar título e descrição clicando neles, sem abrir o modal

## Contexto

A linha da Lista já edita quase tudo sem abrir o formulário: ícone, prioridade, prazo/horário/duração
e projeto viram popovers clicáveis pelo `TaskQuickFields` (`src/pages/admin/tasks/TaskQuickFields.tsx:41-114`,
features 029/033/035). **Título e descrição são as duas exceções, e são justamente o conteúdo.** Na
`TaskListRow` o título é um `<p className="truncate font-medium">` (`TaskViews.tsx:350-357`) e a
descrição é um `<p className="line-clamp-2">{stripMarkdown(task.description)}</p>` (`:400-404`), os
dois dentro de um card cujo `onClick` é `onEdit` (`:314`) — clicar neles abre o dialog completo
(`TaskList.tsx:1209-1245`). No `KanbanCard` é a mesma coisa (`TaskViews.tsx:870` e `:937-941`).
Corrigir uma palavra do título custa hoje: abrir o dialog, achar o campo no painel denso da 080,
editar, "Salvar alterações", fechar.

O que existe de precedente no repositório:

- **Edição inline completa: uma só.** `DimensionsBoard.tsx:796-826` (renomear subcategoria) — o nome
  é um `<button className="truncate text-left …">` que vira um `<Input autoFocus>` salvando no `blur`
  **e** no Enter, e cancelando no Escape (`handleRenameClass`, `:300-320`; nome vazio aborta sem
  salvar, `:301-304`). Não tem `aria-label` em lugar nenhum. E tem uma armadilha para copiar com
  cuidado: o Escape desmonta o input focado, e o `onBlur` desse mesmo input salva.
- **Commit por Enter/blur mais limpo do app**: `BookDetailDialog.tsx:191-208` — `onBlur` salva e o
  Enter chama `e.currentTarget.blur()`, um caminho só.
- **Único input de edição inline com `aria-label`**: `TaskIconPicker.tsx:328-350` (renomear ícone).
- Não existe componente compartilhado (`InlineEditText`/`EditableText`/similar) — o padrão é
  recopiado por tela. Também não existe `src/components/ui/textarea.tsx`: multilinha no app é o
  `MarkdownTextarea` compartilhado (`src/components/MarkdownTextarea.tsx`), que já trata `Tab` e
  repassa props (`aria-label`, `rows`, `onBlur`).

## Decisões

- **Dois componentes novos, no molde de `TaskDueQuickEdit`/`ProjectBadgeButton`:**
  `src/pages/admin/tasks/TaskTitleInlineEdit.tsx` e `src/pages/admin/tasks/TaskDescriptionInlineEdit.tsx`.
  Entram no `TaskQuickFields` como mais dois campos do resultado (`title`, `description`), mantendo a
  regra que aquele arquivo já segue: **handler presente = editável; ausente = exatamente o texto
  somente-leitura de hoje**, sem regressão para quem não passa a prop.
  - **Cuidado obrigatório**: `TaskQuickFields` é chamado como **função pura**, não como JSX
    (`TaskViews.tsx:297`, `:647`, `:835`) — inclusive dentro de um componente que o chama
    condicionalmente. Todo o estado de edição (rascunho, aberto/fechado, salvando) tem de morar
    **dentro** dos componentes novos, renderizados como JSX; um `useState` acrescentado direto em
    `TaskQuickFields` quebraria as regras de hooks nos três call sites.
  - **Descartado — um `InlineEditText` genérico em `src/components/`**: título (uma linha, Enter
    salva) e descrição (multilinha, Enter quebra linha) têm regras de teclado opostas; o "genérico"
    nasceria com um parâmetro `multiline` que só escolhe entre dois comportamentos diferentes. Se um
    terceiro caso aparecer, extrai-se então.
- **O gatilho é o próprio texto, e ele vira um `<button type="button">`** com a tipografia de hoje
  (`truncate text-left font-medium`, mais `line-through text-muted-foreground` quando concluída) —
  não um `<p onClick>`. Sem isso o `Tab` não alcança e Enter/Espaço não ativam, e a feature nasceria
  inacessível por teclado. `onClick` com `stopPropagation`, como todos os controles inline da linha
  já fazem (`TaskViews.tsx:320`, `:363`, `TaskDueQuickEdit.tsx:55`), para não disparar o `onEdit` do
  card. Nome acessível explícito (`aria-label="Editar título: <título atual>"`), no molde do
  `TaskIconPicker`.
- **Título**: `<Input>` com o valor atual, `autoFocus`, cursor **no fim** (não select-all — quem
  clica no título quase sempre quer corrigir, não substituir). **Enter** e **blur** salvam;
  **Escape** cancela e restaura o valor anterior.
  - **A armadilha do `DimensionsBoard` é tratada explicitamente**: Escape marca "cancelado" antes de
    fechar (um `ref`), e o `onBlur` disparado pelo desmonte não salva. Sem isso, Escape salvaria o
    rascunho que o usuário acabou de descartar — e isso já existe no repositório, então tem teste
    próprio nesta feature.
  - Enter usa o caminho do `BookDetailDialog` (`e.currentTarget.blur()`), para não haver duas rotas
    de salvamento que possam divergir.
- **Título em branco (ou só espaço) não salva**: restaura o valor anterior e avisa ("O título não
  pode ficar vazio"). `task.title` é `not null` no banco, e uma linha sem nome na lista é um item
  impossível de reencontrar. Mesmo espírito do guard silencioso de `handleSave`
  (`TaskList.tsx:572-574`), só que aqui **com** aviso, porque aqui o usuário apagou de propósito e
  merece saber por que não colou.
- **Valor inalterado não chama `updateTask`** — nem gasta round-trip nem carimba `updated_at` à toa
  (o que, com `sortKey = "updated"`, moveria a linha por nada).
- **Descrição**: `MarkdownTextarea` (o mesmo do `TaskDescriptionField` e do editor de notas, com o
  handler de `Tab`), markdown **cru**, **sem** as abas Escrever/Visualizar — o card volta a mostrar o
  `stripMarkdown` assim que salva (`src/lib/markdown.ts:6-23`, que achata as quebras de linha), e
  duas abas dentro de uma linha de lista é o oposto de "sem abrir o modal". **Ctrl/Cmd+Enter** e
  **blur** salvam, **Escape** cancela; Enter puro quebra linha, porque descrição é multilinha e
  Enter-salva impediria escrever uma lista.
  - **Consequência assumida**: dentro do `MarkdownTextarea` o `Tab` indenta em vez de sair do campo —
    é o comportamento dele no formulário e nas notas. A saída é Escape ou clicar fora.
  - **Descartado — autosave com debounce, como o editor de notas** (`NoteEditor.tsx`, 800 ms +
    `SaveIndicator`): faz sentido num documento aberto em tela cheia; numa lista de N linhas seria um
    `updateTask` por pausa de digitação, um `updated_at` novo a cada pausa e um indicador de
    salvamento por card. E o `SaveIndicator` está copiado à mão em dois lugares hoje — não vale
    espalhar um terceiro.
- **Tarefa sem descrição ganha um alvo.** Hoje o `<p>` simplesmente não é renderizado, então não há
  onde clicar. Com `onDescriptionChange` presente, aparece um "+ Descrição" discreto — mesmo padrão
  do "+ Prazo" (`TaskDueQuickEdit.tsx:62`) e do badge "Sem projeto" da 029. Sem o handler, continua
  não renderizando nada.
- **Salvar não chama `load()`.** Atualiza `tasks` localmente **sem** mexer em `updated_at` no estado:
  com `sortKey = "updated"` (o padrão de fábrica da 079) um `load()` jogaria a linha para o topo da
  caixa no exato instante em que o usuário terminou de digitar — a mesma queixa que as features
  029/081 resolveram para o prazo (`TaskList.tsx:743-766`). A ordem real se acerta na próxima
  recarga natural (F5, troca de filtro, navegação).
- **Falha desfaz o otimismo**: o texto volta ao que era + toast destrutivo com `getErrorMessage`,
  no molde exato de `handleDueChange` (`TaskList.tsx:750-766`).
- **Ocorrência de série não propaga.** Editar o título de uma ocorrência muda **só** aquela linha. A
  073 propaga o **ícone** para a série inteira de propósito (`api/tasks/tasks.ts:222-245`); título e
  descrição não entram nessa regra — é o que o dialog completo já faz hoje, e mudar isso escondido
  dentro de um atalho seria comportamento novo sem pedido. Registrado, não esquecido.
- **Onde entra**: `TaskListRow` (e portanto a Lista de `/tasks`, a Lista de `ProjectDetail`, a seção
  "Concluídas" e as linhas aninhadas de subtarefa) **e** `KanbanCard`. Os dois já compartilham
  `TaskQuickFields`, e deixar o Kanban de fora recriaria a assimetria que a 033 corrigiu.
  - **Fora**: o mini-card de subtarefa do Kanban (`KanbanSubtaskCard`, `TaskViews.tsx:635-743`), que
    não mostra descrição e cujo título é praticamente o card inteiro; o popover de quick action do
    Gantt (feature 039) e a Agenda, que não mostram descrição nenhuma.
- **Tarefa concluída continua editável.** Diferente do prazo, que o `TaskQuickFields` trava quando
  `done` (`:87-90`) porque reagendar algo concluído não faz sentido — corrigir o nome de algo já
  feito faz. O `line-through` continua no texto.
- **O dialog completo continua a um clique**: o lápis (`TaskViews.tsx:423-425`) e qualquer ponto do
  card fora do título e da descrição. O pedido é "sem abrir o modal", não "sem modal".
- **Sem migration** — `title` e `description` já existem, e `TaskUpdateRequest` é
  `Partial<TaskCreateRequest> & { id }` (`src/types/tasks.ts:213`), então `updateTask({ id, title })`
  já é um PATCH parcial válido.

## Tarefas

- [x] Criar `src/pages/admin/tasks/TaskTitleInlineEdit.tsx`: props `value: string`,
      `onChange: (title: string) => void | Promise<void>`, `done?: boolean`, `className?`. Estado de
      leitura = `<button type="button">` com a tipografia de hoje (`truncate text-left font-medium`,
      `line-through text-muted-foreground` quando `done`), `aria-label="Editar título: <valor>"`
      e `stopPropagation` no clique. Verificação: `npm run build`
- [x] `TaskTitleInlineEdit`: estado de edição — `<Input aria-label="Título">` com `autoFocus`, cursor
      no fim (`setSelectionRange` no `onFocus`), Enter chamando `e.currentTarget.blur()` e o `onBlur`
      salvando. Verificação: `npm run build && npm run lint`
- [x] `TaskTitleInlineEdit`: Escape cancela **sem** salvar — flag em `ref` marcada antes de fechar,
      lida pelo `onBlur` do desmonte (é o defeito latente do `DimensionsBoard.tsx:796-826`; não
      recopiar). Verificação: `npm run build && npm run lint`
- [x] `TaskTitleInlineEdit`: título em branco/só espaço restaura o valor anterior e chama um
      `onInvalid?: (message: string) => void` (quem mostra o toast é a página); valor inalterado não
      chama `onChange`. Verificação: `npm run build && npm run lint`
- [x] Criar `src/pages/admin/tasks/TaskDescriptionInlineEdit.tsx`: props `value: string | null`,
      `onChange`, `className?`. Leitura = `<button>` com `line-clamp-2 text-xs text-muted-foreground`
      mostrando `stripMarkdown(value)`, ou o placeholder "+ Descrição" quando vazia; `aria-label`
      próprio nos dois casos. Verificação: `npm run build && npm run lint`
- [x] `TaskDescriptionInlineEdit`: estado de edição com `MarkdownTextarea`
      (`aria-label="Descrição"`, `rows={3}`, `autoFocus`), `Ctrl/Cmd+Enter` e `blur` salvando, Escape
      cancelando com a mesma proteção de flag do título; Enter puro quebra linha.
      Verificação: `npm run build && npm run lint`
- [x] `TaskQuickFields.tsx`: acrescentar `title` e `description` ao `TaskQuickFieldsResult` e às
      props (`onTitleChange?`, `onDescriptionChange?`, `onInvalidTitle?`), com os componentes novos
      quando os handlers vêm e o texto de hoje quando não vêm. Documentar no docblock do arquivo que
      o estado mora nos componentes (o `TaskQuickFields` continua sendo função pura, sem hooks).
      Verificação: `npm run build && npm run lint`
- [x] `TaskViews.tsx` / `TaskListRow`: trocar o `<p>` do título (`:350-357`) por `quickFields.title`
      e o `<p>` da descrição (`:400-404`) por `quickFields.description`, mantendo o layout e o
      truncamento; declarar as props novas com docblock no padrão do arquivo. Verificação:
      `npm run build && npm run lint`
- [x] `TaskViews.tsx` / `KanbanCard`: mesma troca no título (`:870`) e na descrição (`:937-941`),
      com as props novas declaradas. Verificação: `npm run build && npm run lint`
- [x] `TaskViews.tsx`: `SubtaskRowActions` (`:154-170`) ganha `onTitleChange?`/`onDescriptionChange?`
      e a `TaskListRow` aninhada os repassa bindados por subtarefa (mesmo formato dos outros
      handlers, `:469-488`); `CompletedTasksSection` (`:503-613`) repassa os dois por tarefa.
      Verificação: `npm run build && npm run lint`
- [x] `TaskList.tsx`: `handleTitleChange(taskId, title)` e `handleDescriptionChange(taskId,
      description)` — otimistas em `tasks` **sem** tocar em `updated_at`, `updateTask` parcial, e
      reversão + toast destrutivo na falha (molde de `handleDueChange`, `:750-766`). Mais o
      `onInvalidTitle` virando toast. Verificação: `npm run build && npm run lint`
- [x] `TaskList.tsx`: passar os handlers novos nas quatro chamadas — `TaskListRow` da Lista
      (`:1002-1040`), `CompletedTasksSection` (`:1047-1083`), `subtaskActions` (`:822-834`) e
      `KanbanCard` (`:1122-1151`). Verificação: `npm run build && npm run lint`
- [x] `ProjectDetail.tsx`: os mesmos dois handlers (ao lado de `handlePriorityChange`, `:635`) e as
      mesmas quatro ligações — `TaskListRow` (`:990-1017`), `CompletedTasksSection` (`:1024-1061`),
      `subtaskActions` (`:786-799`) e `KanbanCard` (`:903-931`). Verificação:
      `npm run build && npm run lint`
- [x] Teste novo `src/pages/admin/tasks/__tests__/TaskTitleInlineEdit.test.tsx`: o título aparece
      como botão nomeado; clicar troca por um input com o valor atual e o foco dentro; digitar +
      Enter chama `onChange` com o texto novo; Escape **não** chama `onChange` e restaura o texto;
      título vazio chama `onInvalid` e não `onChange`; texto inalterado não chama nada.
      Verificação: `npm test src/pages/admin/tasks`
- [x] No mesmo arquivo — teclado puro: `Tab` alcança o botão do título e Enter/Espaço abrem o input
      (sem mouse nenhum). Verificação: `npm test src/pages/admin/tasks`
- [x] Teste novo `src/pages/admin/tasks/__tests__/TaskDescriptionInlineEdit.test.tsx`: tarefa sem
      descrição mostra "+ Descrição" e clicar abre a textarea vazia; tarefa com descrição mostra o
      texto **sem sintaxe markdown** (via `stripMarkdown`) e clicar abre a textarea com o markdown
      **cru**; `Ctrl+Enter` salva, Enter puro quebra linha, Escape cancela; blur salva.
      Verificação: `npm test src/pages/admin/tasks`
- [x] Estender `src/pages/admin/tasks/__tests__/TaskViews.test.tsx`: sem os handlers, título e
      descrição continuam texto estático e clicar neles dispara `onEdit` (não-regressão); com os
      handlers, clicar no título **não** dispara `onEdit`; a linha aninhada de subtarefa edita o
      título com o id da subtarefa; o `KanbanCard` faz o mesmo. Verificação:
      `npm test src/pages/admin/tasks`
- [x] Teste novo `src/pages/admin/tasks/__tests__/TaskList.inline-title.test.tsx` (molde de
      `TaskList.due-regroup.test.tsx`): na aba Lista, clicar no título, editar e dar Enter chama
      `updateTask({ id, title })`, o card mostra o título novo **e o dialog completo nunca abre**.
      Verificação: `npm test src/pages/admin/tasks`
- [x] No mesmo arquivo: com "Ordenar por → Última atualização" (padrão de fábrica), editar o título
      **não** move a linha de posição nem de caixa — a prova da decisão de não chamar `load()`.
      Verificação: `npm test src/pages/admin/tasks`
- [x] No mesmo arquivo: `updateTask` que rejeita devolve o título antigo ao card e mostra toast
      destrutivo; e editar o título de uma ocorrência de série chama `updateTask` **só** com o id
      daquela ocorrência (nada de propagação, ao contrário do ícone da 073). Verificação:
      `npm test src/pages/admin/tasks`
- [x] Teste em `src/pages/admin/tasks/__tests__/ProjectDetail.subtask-edit.test.tsx` (ou arquivo
      novo): a mesma edição inline funciona na Lista de um projeto, inclusive numa tarefa concluída
      dentro da seção "Concluídas". Verificação: `npm test src/pages/admin/tasks`
- [x] `npm run build && npm run lint && npm test && npm run check:bundle` limpos, com a contagem de
      arquivos/testes antes e depois registrada em `## Notas`.
- [x] Verificação do pedido literal: clicar **no título** edita o título e clicar **na descrição**
      edita a descrição, as duas coisas sem que o modal da tarefa abra em momento nenhum.

## Prompts

## Notas

- **Uma rota de salvamento só, e a flag de cancelamento é lida nela.** O plano dizia "flag em `ref`
  lida pelo `onBlur` **do desmonte**". Implementado um passo mais forte: Escape (e `Ctrl/Cmd+Enter`,
  e Enter no título) **não** desmontam nada — eles chamam `blur()` no campo focado, e o `onBlur` é
  o único lugar que decide entre gravar, descartar (flag ligada) e ignorar (vazio/inalterado). Sem
  isso a proteção seria não-testável: se o navegador/jsdom não disparasse blur no desmonte, o teste
  passaria mesmo com a guarda removida. Do jeito que ficou, ela é verificável em vermelho — e foi
  verificada: **desligando o `if (cancelledRef.current)` os testes de Escape falham nos dois
  componentes** (o rascunho descartado seria gravado, que é exatamente o defeito latente de
  `DimensionsBoard.tsx:796-826`).
- **A decisão "não chama `load()`" também foi conferida em vermelho:** acrescentando um `load()` ao
  `handleTitleChange`, `TaskList.inline-title.test.tsx` › "com «Última atualização» (padrão), editar
  o título não move a linha" falha (a linha editada pula para o topo). O mock do `updateTask` desse
  arquivo carimba um `updated_at` novo de propósito, que é o que o banco faz — sem isso o teste
  passaria com a feature desligada.
- **Desvio do plano — `titleClassName`/`descriptionClassName` no `TaskQuickFields`.** A tipografia
  do título não é a mesma nas duas visões (Lista: `truncate font-medium`; Kanban: `min-w-0 truncate
  text-sm font-medium`) e a descrição da Lista precisa do `mt-1` que o `space-y-2` do card do Kanban
  já dá. Em vez de dois componentes ou um `if (view === …)`, a diferença viaja como classe, aplicada
  **igual** nos dois estados (clicável e somente-leitura), pra não existirem dois visuais do mesmo
  texto. **Consequência assumida:** o card **concluído** do Kanban passou a ganhar o
  `line-through`/`text-muted-foreground` que só a Lista tinha — convergência de um caractere, não
  regressão.
- **Desvio do plano — `taskTitle` no `TaskDescriptionInlineEdit`.** O `aria-label` "Adicionar
  descrição" colidia com o botão de mesmo nome da tira de quick add da 098 (quebrou
  `ProjectDetail.quick-add` › "a descrição digitada na tira vai junto") e, pior, seria o mesmo nome
  em **todas** as linhas sem descrição. O botão da linha passou a se chamar
  `"Adicionar descrição: <título da tarefa>"`, no mesmo molde do `"Editar título: <valor>"`; com
  descrição escrita, quem já dá o contexto é a prévia (`"Editar descrição: <prévia>"`). O visível
  continua "+ Descrição".
- **`onInvalidTitle` entrou também em `SubtaskRowActions`**, o que a tarefa não pedia por escrito:
  sem ele, apagar o título de uma **subtarefa** restauraria o texto em silêncio, e a decisão de
  avisar vale para qualquer linha, não só para a de topo.
- **Cursor no fim também na descrição.** A decisão só falava do título, mas `autoFocus` numa
  textarea deixa o cursor na posição 0 — continuar escrevendo numa descrição existente inseriria
  texto **no começo** dela. Mesmo `onFocus`/`setSelectionRange` do título (pego por teste: a
  primeira versão gravou `" integral**Comprar** o pão"`).
- **Fixtures alheias mudaram de gesto — 6 arquivos, 16 testes.** `TaskList.subtask-edit`,
  `ProjectDetail.subtask-edit`, `TaskList.external-links`, `ProjectDetail.external-links`,
  `TaskList.form-panel` e `ProjectDetail.quick-add` abriam o dialog completo **clicando no título da
  tarefa** — que agora edita inline, de propósito (é literalmente o pedido). Cada um ganhou um
  helper `openFullDialog(user, título)` que clica no **lápis** da linha/card. Nenhuma asserção de
  comportamento foi afrouxada: o que mudou foi só como o teste chega ao formulário.
- **Não-propagação em série provada pelo `store`, não pela tela.** A Lista mostra **uma** ocorrência
  por série (`collapseRecurringSeries`), então a irmã nem aparece para ser comparada; a prova de que
  o título não vaza para a série é `updateTask` chamado **uma vez**, com o id da ocorrência, e a
  irmã intacta no "servidor" em memória.
- **Testes escritos junto com cada tarefa, não só no fim.** A skill `next` proíbe marcar `[x]` sem
  uma asserção concreta de comportamento, e as tarefas de teste vinham depois das de código: cada
  componente/costura foi verificado pelo seu teste no mesmo passo, e as tarefas de teste
  correspondentes foram marcadas quando a lista chegou nelas.
- **Verificação por tarefa usou `npx tsc -b` no lugar de `npm run build`** (mesma razão da 099: é
  ele que checa tipo e custa ~20s contra o build inteiro). O `npm run build` completo rodou no gate
  e passou.
- **Suíte antes:** 240 arquivos / 2681 testes. **Depois:** 244 arquivos / 2733 testes, 0 falhas
  (4 arquivos novos: `TaskTitleInlineEdit.test.tsx` 15, `TaskDescriptionInlineEdit.test.tsx` 11,
  `TaskList.inline-title.test.tsx` 9, `ProjectDetail.inline-title.test.tsx` 6; mais 11 casos novos
  em `TaskViews.test.tsx`). `npm run build`, `npm run lint` (0 erros, 87 warnings pré-existentes de
  `react-refresh`) e `npm run check:bundle` ("Bundle budget OK") limpos.
  - **Flake de contenção conhecido:** com a concorrência padrão do Vitest, os mesmos arquivos que a
    099 registrou (`TaskList.form-panel`, `*.external-links`, `TaskList.inherit-project`) estouram o
    timeout de 5s nesta máquina e passam isolados. A medição válida é a de `--maxWorkers=2`:
    **244/244 arquivos, 2733/2733 testes**.

### Rastreabilidade do `prompt:` — trecho → teste que prova

Sem Chrome (regra da skill `next`), cada pedaço do pedido tem de ter um artefato automatizado:

| Trecho do pedido | Prova |
| --- | --- |
| "deve ser possível **alterar o título** (…) **somente clicando no título**" | `TaskList.inline-title.test.tsx` › "clicar no título, editar e dar Enter grava `updateTask({ id, title })` — e o dialog nunca abre" (um clique, sem gesto intermediário) |
| "alterar (…) **a descrição** (…) somente clicando (…) **na descrição**" | `TaskList.inline-title.test.tsx` › "clicar na descrição, editar e dar Ctrl+Enter grava `updateTask({ id, description })` — sem o dialog" |
| "**sem abrir o modal da tarefa**" | Os dois testes acima checam `queryByRole("dialog")` **nulo** antes, durante e depois da edição; mais `TaskViews.test.tsx` › "com os handlers, clicar no título edita ali mesmo e **não** abre o dialog" e "com `onDescriptionChange`, clicar na descrição edita ali mesmo e **não** abre o dialog" (`onEdit` nunca chamado) |
| Consequência do pedido: numa tarefa **sem** descrição tem de haver onde clicar | `TaskList.inline-title.test.tsx` › "tarefa sem descrição ganha o «+ Descrição», e escrever nele grava a descrição nova"; `TaskDescriptionInlineEdit.test.tsx` › "mostra «+ Descrição» e clicar abre a textarea vazia e focada" |
| Consequência do pedido: o que se digita é o que se grava (markdown cru, prévia limpa) | `TaskDescriptionInlineEdit.test.tsx` › "o card mostra o texto sem sintaxe e a textarea abre com o markdown cru"; `TaskList.inline-title.test.tsx` › a prévia volta como "comprar pao integral" e o payload como `"comprar **pao** integral"` |
| Decisão "o gatilho é um `<button>`, alcançável por teclado" | `TaskTitleInlineEdit.test.tsx` › describe "teclado puro, sem mouse nenhum" (Tab alcança, Enter e Espaço abrem, dá pra corrigir e salvar sem mouse) |
| Decisão "Escape cancela **sem** salvar" (o defeito do `DimensionsBoard`) | `TaskTitleInlineEdit.test.tsx` › describe "Escape cancela sem salvar" (2 casos) e `TaskDescriptionInlineEdit.test.tsx` › "Escape cancela sem salvar e devolve a prévia antiga" — **conferidos em vermelho** com a guarda desligada |
| Decisão "título em branco não salva, e avisa" | `TaskTitleInlineEdit.test.tsx` › "título em branco chama onInvalid, não onChange" + "só espaço em branco conta como vazio"; `TaskList.inline-title.test.tsx` › "título apagado por inteiro não grava nada e avisa por toast" |
| Decisão "valor inalterado não chama `updateTask`" | `TaskTitleInlineEdit.test.tsx` › "texto inalterado não chama nada" e "espaço sobrando nas pontas não conta como mudança"; `TaskDescriptionInlineEdit.test.tsx` › "texto inalterado não chama onChange" |
| Decisão "Enter puro quebra linha na descrição; `Ctrl/Cmd+Enter` salva" | `TaskDescriptionInlineEdit.test.tsx` › "Enter puro quebra linha (não salva) e Ctrl+Enter é que grava as duas linhas" + "Cmd+Enter salva igual (macOS)" |
| Decisão "blur salva, nos dois campos" | `TaskTitleInlineEdit.test.tsx` › "blur (clicar fora) salva pelo mesmo caminho do Enter"; `TaskDescriptionInlineEdit.test.tsx` › "blur (clicar fora) salva pelo mesmo caminho" |
| Decisão "salvar não chama `load()`" | `TaskList.inline-title.test.tsx` › "com «Última atualização» (padrão), editar o título não move a linha de posição nem de caixa" — **conferido em vermelho** com um `load()` acrescentado |
| Decisão "falha desfaz o otimismo" | `TaskList.inline-title.test.tsx` › "`updateTask` que rejeita devolve o título antigo ao card e mostra toast destrutivo"; `ProjectDetail.inline-title.test.tsx` › "falha do updateTask devolve o título antigo e mostra toast destrutivo" |
| Decisão "ocorrência de série não propaga" | `TaskList.inline-title.test.tsx` › "editar o título de uma ocorrência de série chama `updateTask` só com o id daquela ocorrência" |
| Decisão "tarefa concluída continua editável" | `TaskViews.test.tsx` › "tarefa concluída continua editável, com o line-through no botão"; `ProjectDetail.inline-title.test.tsx` › "dentro da seção «Concluídas», a tarefa concluída também é editável" |
| Decisão "onde entra": Lista, Kanban, linha aninhada de subtarefa, Concluídas, e a Lista do projeto | `TaskViews.test.tsx` › "o KanbanCard faz o mesmo…", "a linha aninhada de subtarefa edita título e descrição com a **subtarefa**, não com a mãe"; `TaskList.inline-title.test.tsx` › "na seção «Concluídas»…"; `ProjectDetail.inline-title.test.tsx` › 6 casos (Lista, Concluídas, subtarefa, Kanban do projeto) |
| Decisão "handler ausente = texto de hoje, sem regressão" | `TaskViews.test.tsx` › "sem os handlers, título e descrição continuam texto estático e clicar neles abre o dialog", "sem `onDescriptionChange`, tarefa sem descrição continua sem renderizar nada", "no Kanban sem os handlers…", "sem os handlers em `subtaskActions`, a linha aninhada continua com o texto estático" |
| Decisão "o dialog completo continua a um clique" ("sem abrir o modal", não "sem modal") | `TaskViews.test.tsx` › "o lápis continua abrindo o dialog completo"; `TaskList.inline-title.test.tsx` › "o dialog completo continua a um clique: o lápis da linha abre o formulário de sempre" |
