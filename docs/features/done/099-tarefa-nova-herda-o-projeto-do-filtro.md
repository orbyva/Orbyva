---
prompt: |
  - ao criar uma tarefa, se eu estou selecionando o filtro do projeto para aquela tarefa, ela deve ser criada com aquele projeto marcado
---

# 099 — Tarefa nova herda o projeto do filtro ativo

## Contexto

Em `/tasks`, `openCreate()` (`TaskList.tsx:502-508`) sempre chama `emptyTask()` **sem argumento**, e
`emptyTask` cai em `project_id: null` quando não recebe nada (`src/domain/tasks/taskDraft.ts:11-36`).
Ou seja: com o filtro de projeto da feature 097 apontando para "Casa", clicar em "Nova tarefa" abre o
formulário com o `ProjectPicker` vazio. O usuário precisa reescolher "Casa" — e, se esquecer, a
tarefa nasce sem projeto e **desaparece da lista que ele estava olhando** no instante em que é
salva, porque `visibleTasks` (`:258-274`) recorta exatamente por esse filtro.

O mecanismo já existe e já foi usado para resolver o mesmo problema uma vez: `emptyTask` aceita
`projectId` desde a feature 042, e é assim que `ProjectDetail.tsx` garante o projeto da rota
(`:175` e `:413`, `emptyTask(id)`). Falta ligar o filtro nele.

Junto disso há uma duplicação que esta feature encosta de frente: a conversão "valor do filtro → id
de projeto" está escrita **três vezes à mão** em `TaskList.tsx` — o ternário de `visibleTasks`
(`:259-264`), o de `ganttTasks` (`:398-403`) e o `if` de `quadrantProjectTasks` (`:374-377`) —
sempre repetindo que `"all"` significa "sem recorte" e `"null"` significa "sem projeto"
(`PROJECT_FILTER_ALL`/`PROJECT_FILTER_NONE`, `src/domain/tasks/filters.ts:148-149`). Uma quarta
cópia à mão, agora com uma semântica **diferente** (criação, onde `"all"` também vira `null`), é
como a regra se perde.

## Decisões

- **Duas funções puras em `src/domain/tasks/filters.ts`, ao lado de `normalizeProjectFilter`**, e não
  mais ternários espalhados:
  - `projectFilterToProjectId(value): string | null | undefined` — a semântica de **filtragem** que
    `filterTasks` já espera: `"all"` → `undefined` (sem recorte), `"null"` → `null`, id → o id.
  - `projectIdForNewTask(value): string | null` — a semântica de **criação**: id → o id;
    `"all"`, `"null"` e qualquer outra coisa → `null`.
  São duas porque são duas regras diferentes (em `"all"` uma diz "não filtre" e a outra diz "sem
  projeto"); juntá-las numa só com um parâmetro de modo esconderia justamente a diferença que importa.
- **Só o valor inicial do rascunho é semeado.** Trocar o filtro com o dialog aberto **não** mexe no
  formulário, e escolher "Sem projeto" no `ProjectPicker` continua valendo — o filtro é um palpite
  bom, não uma trava. Reabrir o dialog semeia de novo, com o filtro de então.
- **Filtro em "Sem projeto" (`"null"`) cria sem projeto.** É literalmente o recorte escolhido, e é
  também o comportamento de hoje — nada muda nesse caso, de propósito.
- **Filtro em "Todos os projetos" (`"all"`) cria sem projeto**, como hoje. "Todos" não é um projeto;
  inventar um default aqui (o primeiro da lista, o mais ativo) seria escolher pelo usuário.
- **Vale para os dois caminhos de criação da Lista**: o botão "Nova tarefa" do `PageShell` e do
  `EmptyState` (`openCreate`, `TaskList.tsx:502`, `:987`) **e** o quick add da feature 098.
  - **Costura com a 098 (`todo/098-quick-add-de-tarefa-na-lista.md`)**: aquele componente recebe
    `projectId` por prop e não sabe o que é filtro; é esta feature que passa
    `projectIdForNewTask(projectFilter)` para ele. Se a 098 entrar primeiro, a prop já está lá
    esperando (marcada por comentário no código); se esta entrar primeiro, a tarefa correspondente
    vira no-op e é registrada em `## Notas`. Mesmo hand-off que a 080 fez para a 083.
- **`ProjectsRail` (a trilha de projetos da esquerda) alimenta o mesmo `projectFilter`
  (`TaskList.tsx:924-928`)** — clicar num projeto ali passa a semear a criação de graça, sem código
  novo. É o gesto mais provável antes de "e agora crio uma tarefa aqui".
- **`ProjectDetail` não muda**: já cria com `emptyTask(id)` (`:413`), que é a mesma ideia aplicada à
  rota. Ganha só a consistência de continuar igual.
- **A Agenda fica de fora porque não cria tarefa**: `AgendaGrid.tsx` só edita (`handleSaveTaskEdit`,
  `:606-645`) e cria subtarefa pelo `subtaskMutationCtx` (`:650-660`). Não há caminho de criação de
  tarefa de topo para semear.
- **Subtarefa continua herdando do pai, não do filtro** (`TaskList.tsx:485-490`,
  `ProjectDetail.tsx:756-780`, `taskDraft.ts:53-65`): subtarefa mora onde a mãe mora, regra da 036.
  Um filtro ativo que contradiga a mãe não pode ganhar dela.
- **Projeto apagado não chega ao `createTask`**: `normalizeProjectFilter` já derruba o filtro para
  `"all"` depois que `projects` carrega (`TaskList.tsx:298-308`), então `projectIdForNewTask` nunca
  recebe um id morto. Vale um teste, não código novo.
- **Sem toast, sem aviso.** O feedback é a tarefa aparecer na lista filtrada — que é exatamente o que
  o pedido quer. Anunciar "criada no projeto Casa" quando o usuário já está olhando o recorte de Casa
  seria ruído.
- **Descartado — herdar também o filtro de Tag** (`tagFilter`, `TaskList.tsx:156`, `:901-918`): não
  foi pedido, e tag é multivalorada (`tag_ids`) com semântica de rótulo, não de "onde a tarefa mora".
  Semear uma tag por causa de um recorte de leitura é bem mais intrusivo que semear o projeto. Fica
  registrado como decisão, não como esquecimento.
- **Sem migration** — nada de schema, só o valor inicial de um rascunho de formulário.

## Tarefas

- [x] `src/domain/tasks/filters.ts`: `projectFilterToProjectId(value): string | null | undefined`
      (`"all"` → `undefined`, `"null"` → `null`, id → id), com docblock explicando que é a semântica
      de **filtragem** que `filterTasks` espera. Exportar em `src/domain/tasks/index.ts`.
      Verificação: `npm run build`
- [x] `src/domain/tasks/filters.ts`: `projectIdForNewTask(value): string | null` — id quando há um
      projeto real selecionado, `null` para `"all"`, `"null"`, string vazia e qualquer outro valor.
      Docblock deixando explícita a diferença em relação à função acima no caso `"all"`. Exportar em
      `src/domain/tasks/index.ts`. Verificação: `npm run build && npm run lint`
- [x] Testar as duas em `src/domain/tasks/__tests__/filters.test.ts`: os três casos de cada uma, mais
      `undefined`/`null`/número/string vazia caindo no valor neutro, e um teste nomeado que fixa a
      **divergência proposital** em `"all"` (`undefined` numa, `null` na outra). Verificação:
      `npm test src/domain/tasks`
- [x] `TaskList.tsx`: trocar os três ternários/`if` à mão por `projectFilterToProjectId` —
      `visibleTasks` (`:259-264`), `ganttTasks` (`:398-403`) e `quadrantProjectTasks` (`:374-377`).
      Comportamento idêntico, uma definição só. Verificação: `npm run build && npm run lint`
- [x] Conferir que a suíte existente continua verde depois desse refactor, em especial
      `TaskList.project-filter.test.tsx` e `TaskList.priority-reorder.test.tsx` (o painel "Por
      prioridade" depende de `quadrantProjectTasks`). Verificação: `npm test src/pages/admin/tasks`
- [x] `TaskList.tsx`: `openCreate()` (`:502-508`) passa a chamar
      `emptyTask(projectIdForNewTask(projectFilter))`. Verificação: `npm run build && npm run lint`
- [x] `TaskList.tsx`: passar `projectId={projectIdForNewTask(projectFilter)}` para o
      `<TaskQuickAdd />` da feature 098, consumindo o comentário de costura deixado lá. Se a 098
      ainda não tiver entrado, marcar a tarefa como no-op e registrar em `## Notas`. Verificação:
      `npm run build && npm run lint`
- [x] Teste novo `src/pages/admin/tasks/__tests__/TaskList.inherit-project.test.tsx` (molde de
      `TaskList.project-filter.test.tsx`, que já monta projetos e mexe no `<Select>` de Projeto): com
      o filtro em "Casa", abrir "Nova tarefa" mostra "Casa" já escolhido no `ProjectPicker` do
      formulário. Verificação: `npm test src/pages/admin/tasks`
- [x] No mesmo arquivo: salvar esse formulário chama `createTask` com `project_id` do projeto
      filtrado — a prova de ponta a ponta do pedido. Verificação: `npm test src/pages/admin/tasks`
- [x] No mesmo arquivo: com o filtro em "Todos os projetos" e com o filtro em "Sem projeto", o
      formulário abre sem projeto e o `createTask` recebe `project_id: null` (nenhuma regressão do
      comportamento de hoje). Verificação: `npm test src/pages/admin/tasks`
- [x] No mesmo arquivo: escolher um projeto pela `ProjectsRail` (e não pelo `<Select>`) semeia
      igual — é o mesmo `handleProjectFilterChange`. Verificação: `npm test src/pages/admin/tasks`
- [x] No mesmo arquivo: o filtro é um palpite, não uma trava — abrir o formulário com "Casa" ativo e
      trocar para "Sem projeto" no `ProjectPicker` salva com `project_id: null`; e trocar o filtro da
      barra com o dialog aberto **não** muda o rascunho. Verificação: `npm test src/pages/admin/tasks`
- [x] No mesmo arquivo: preferência salva apontando para um projeto que não está mais na lista →
      `normalizeProjectFilter` derruba para "all" e a tarefa nova sai sem projeto (nenhum id morto
      chega ao `createTask`). Verificação: `npm test src/pages/admin/tasks`
- [x] Teste do quick add herdando o filtro, em `TaskList.quick-add.test.tsx` (arquivo da 098) ou no
      arquivo desta feature: com "Casa" filtrado, criar pelo `+` manda `project_id` de "Casa".
      Verificação: `npm test src/pages/admin/tasks`
- [x] Teste de não-regressão da subtarefa: com um filtro de projeto ativo diferente do projeto da
      tarefa-mãe, a subtarefa criada pelo input do card do Kanban continua nascendo com o projeto
      **da mãe**. Verificação: `npm test src/pages/admin/tasks`
- [x] `npm run build && npm run lint && npm test && npm run check:bundle` limpos, com a contagem de
      arquivos/testes antes e depois registrada em `## Notas`.
- [x] Verificação do pedido literal: com o filtro de projeto apontando para um projeto, criar uma
      tarefa (pelo formulário **e** pelo quick add) já a deixa com aquele projeto marcado, e ela
      continua visível no recorte em que foi criada. (Rastreabilidade completa em `## Notas`, com o
      teste que prova cada trecho.)

## Prompts

_(Nenhum pedido novo do usuário durante a implementação — tudo saiu do `prompt:` do frontmatter.)_

## Notas

- **A costura com a 098 chegou pronta e mais simples do que as Tarefas previam.** A 098 entrou
  antes e fechou com `onCreate: (payload: TaskQuickAddPayload & { projectId: string | null })` —
  o `TaskQuickAdd` devolve no payload o `projectId` que recebeu e as duas páginas fazem
  `emptyTask(payload.projectId)`. Por isso a tarefa "passar `projectId` para o `<TaskQuickAdd />`"
  virou **uma linha só**: `projectIdForQuickAdd`, em `TaskList.tsx`, deixou de ser `null` fixo e
  passou a ser `projectIdForNewTask(projectFilter)`. Nada de `TaskQuickAdd.tsx` nem do
  `handleQuickAddCreate` precisou mudar. Nenhuma tarefa virou no-op.
- **`quadrantProjectTasks` usa `projectFilterToProjectId` como predicado**, não um terceiro `if`:
  "projeto específico escolhido" é exatamente "a tradução não é nem `undefined` nem `null`". Mesma
  regra, uma definição só — que era o ponto do refactor.
- **O cenário literal da tarefa de não-regressão da subtarefa não existe na tela.** Ela pedia
  "filtro de projeto ativo **diferente** do projeto da tarefa-mãe", mas o filtro esconde a mãe:
  com o recorte em "Casa", só cards de Casa aparecem, então a mãe visível sempre pertence ao
  projeto filtrado. A divergência foi provada pelo outro lado, que é alcançável: com o filtro em
  "Todos os projetos" o palpite da 099 vale `null` e a subtarefa do card do "Trabalho" tem de
  nascer em **Trabalho** — se ela lesse o palpite em vez da mãe, sairia sem projeto. O caso
  "filtro em Casa + card da Casa" ficou como sanidade.
- **Verificação por tarefa usou `npx tsc -b` no lugar de `npm run build` inteiro** (o `vite build`
  chegou a levar 15min nesta máquina por contenção de CPU, contra 10s do `tsc -b`, e é ele que
  checa tipo). O `npm run build` completo foi rodado no fim, na tarefa de gate, e passou.
- **Os dois testes-chave foram conferidos em vermelho antes do verde** (a skill `next` proíbe
  Chrome, então o teste é a única prova): revertendo `openCreate` para `emptyTask()` o teste do
  formulário falha, e voltando `projectIdForQuickAdd` para `null` fixo o teste do quick add falha.
  Sem isso, os dois passariam mesmo com a feature desligada.
- **Suíte antes:** 239 arquivos / 2659 testes. **Depois:** 240 arquivos / 2681 testes, 0 falhas
  (1 arquivo novo, `TaskList.inherit-project.test.tsx`, com 13 casos; mais 9 casos novos em
  `filters.test.ts`). `npm run build`, `npm run lint` (0 erros, 87 warnings pré-existentes de
  `react-refresh`) e `npm run check:bundle` ("Bundle budget OK") limpos.
  - **Flake de contenção, não regressão:** com a concorrência padrão do Vitest, 13 testes de 7
    arquivos alheios estouraram o timeout de 5s (`TaskList.form-panel`, `*.external-links`,
    notas). Rodando isolados eles passam — `TaskList.form-panel` › "um campo de cada bloco" leva
    3,6s sozinho, ou seja, já nasce perto do limite. A medição válida é a de
    `npm test -- --maxWorkers=2`: **240/240 arquivos, 2681/2681 testes**.

### Rastreabilidade do `prompt:` — trecho → teste que prova

| Trecho do pedido | Prova |
| --- | --- |
| "ao criar uma tarefa" (formulário completo, botão "Nova tarefa") | `TaskList.inherit-project.test.tsx` › "salvar o formulário grava `project_id` do projeto filtrado, e a tarefa fica no recorte" |
| "ao criar uma tarefa" (o outro caminho da Lista, o `+` da 098) | `TaskList.inherit-project.test.tsx` › "o quick add também nasce no projeto do filtro, e a tarefa fica no recorte" |
| "se eu estou **selecionando o filtro do projeto**" (pelo `<Select>` da barra) | `TaskList.inherit-project.test.tsx` › "com o filtro em «Casa», «Nova tarefa» abre com «Casa» já escolhido no ProjectPicker" |
| "se eu estou selecionando o filtro do projeto" (pela `ProjectsRail`, o mesmo `projectFilter`) | `TaskList.inherit-project.test.tsx` › "escolher o projeto pela ProjectsRail (e não pelo `<Select>`) semeia igual" |
| "ela deve ser criada **com aquele projeto marcado**" (marcado na tela) | `TaskList.inherit-project.test.tsx` › primeiro teste: o `aria-selected="true"` cai em "Casa" no `ProjectPicker`, e não em "Sem projeto" |
| "ela deve ser criada com aquele projeto marcado" (gravado de fato) | `TaskList.inherit-project.test.tsx` › `createTask` chamado com `project_id: "p-casa"`, nos dois caminhos de criação |
| Consequência implícita: a tarefa **não some** da lista que o usuário estava olhando | `TaskList.inherit-project.test.tsx` › depois do `load()` a tarefa nova aparece na tela filtrada e a do outro projeto continua fora |
| Não-regressão do que existia antes (filtro em "Todos"/"Sem projeto") | `TaskList.inherit-project.test.tsx` › `it.each` "o formulário abre sem projeto e grava `project_id: null`" + "com o filtro em «Todos os projetos», o quick add continua criando sem projeto" |
| Decisão "é palpite, não trava" | `TaskList.inherit-project.test.tsx` › "trocar para «Sem projeto» no formulário vence o filtro…", "trocar o filtro da barra com o dialog aberto não mexe no rascunho" e "reabrir o formulário semeia com o filtro de então" |
| Decisão "subtarefa herda da mãe, não do filtro" (regra da 036) | `TaskList.inherit-project.test.tsx` › describe "subtarefa continua herdando da mãe, não do filtro" (2 casos) |
| Decisão "projeto apagado não chega ao `createTask`" | `TaskList.inherit-project.test.tsx` › "preferência apontando para um projeto apagado não vaza o id morto para a tarefa nova" |
| Refactor de apoio (uma definição só das duas semânticas) | `filters.test.ts` › describes `projectFilterToProjectId` e `projectIdForNewTask`, incluindo "divergência proposital: em «all» uma diz `undefined` (não filtre) e a outra `null` (sem projeto)"; e a suíte de `src/pages/admin/tasks` inteira verde depois da troca dos três ternários |
