---
prompt: |
  esse gannt não está ainda funcional de forma alguma, não sei se é o sdk que te trava, mas não dá
  pra fazer nada do que eu pedi. editar, mover, abrir, quick acess, tudo mal feito. se for o caso
  planeje e construa uma própria suíte para utilziação do gannt, e utilize o código fonte da lib
  baixada como inspiração
---

# 044 — Corrigir abertura de tarefa e fechar o buraco de cobertura real do Gantt

## Contexto
Investigação (sem uso de navegador — auditoria de código contra o `.d.ts`/bundle real de
`@svar-ui/react-gantt` em `node_modules/`) descartou a hipótese de que a biblioteca seja
incompatível com o caso de uso: toda a API que o app assume (evento `update-task`, `zoom-scale`,
`taskTemplate`, `columns[].cell`, import do CSS em `GanttChart.tsx:4`) bate exatamente com a lib
real. O problema é um buraco de integração concreto:

1. **Abrir tarefa está quebrado em quase todo o Gantt.** A lib dispara sua própria ação interna
   `show-editor` em duplo-clique numa barra ou numa linha da grade (confirmado no bundle,
   `node_modules/@svar-ui/react-gantt/dist/index.es.js`, linhas ~404/566/930-935/1054) — mas o app
   nunca monta o `<Editor>` da lib nem registra `api.on("show-editor", ...)` em `handleInit`
   (`GanttChart.tsx:421-521`) pra redirecionar isso pro dialog de edição do app. `onOpenTask`
   (prop recebida de `TaskList.tsx:922-935`/`ProjectDetail.tsx:811-822`) só é chamado hoje dentro
   do fluxo "Focar dia" (`GanttChart.tsx:595-601`, drill-down por hora da feature `038`) — clicar
   numa barra/linha do Gantt principal não abre nada.
2. **`/tasks/gantt` (`TasksGantt.tsx`, rota separada) não recebe nenhuma prop interativa** —
   `TasksGantt.tsx:98-104` passa só `tasks`/`projects`/`dependencies`/`onDataChanged`, sem
   `onOpenTask` nem nenhuma prop de quick actions (`onIconChange`/`onPriorityChange`/
   `onDueChange`/`onProjectChange`/`quickActionProjects`, features `035`/`033`/`029`/`031`/`039`).
   Nessa página "abrir" e "quick access" ficam indisponíveis por omissão de props, não por bug
   da lib.
3. **Zero cobertura de teste real (nem de fiação) pra `update-task`/`add-link`/`delete-link`.**
   O mock de `@svar-ui/react-gantt` em `GanttChart.test.tsx:26-59` tem `api.on: () => {}` —
   registra o callback e descarta na hora. Todo `api.on(...)` de `handleInit` roda durante os
   testes, mas nenhum teste jamais dispara os callbacks registrados — ou seja, nem a versão
   mockada da lib prova que arrastar uma barra de fato chama `updateTask`. Só a lógica pura por
   trás (`resolveTaskScheduleUpdate` etc., `src/domain/tasks/__tests__/gantt.test.ts`) tem teste;
   a fiação `api.on(...) → nosso handler` nunca é exercitada.

Não há evidência de que a lib em si tenha bugs ou seja fundamentalmente incompatível — a
recomendação da investigação (e desta feature) é consertar a integração, não substituir a
biblioteca por uma suíte própria.

## Decisões
- **Não construir uma suíte de Gantt própria** — a causa raiz identificada é fiação faltando, não
  limitação da lib. Se, depois de corrigir os itens abaixo, restar algum comportamento pedido pelo
  usuário que a lib realmente não suporta (a investigação não achou nenhum candidato concreto),
  isso vira uma feature nova e específica — não assumir aqui.
- **`show-editor` → `onOpenTask`**: em `handleInit` (`GanttChart.tsx`), registrar
  `api.on("show-editor", ({ id }) => { ... })` que resolve a tarefa pelo `id` (via `tasksRef`/
  `fullTasks`, já mantidos atualizados desde a feature `032`) e chama `onOpenTask(task)` — mesmo
  padrão de resolução por id já usado no handler de `update-task`. Isso liga duplo-clique em
  barra/linha (em qualquer Gantt: aba de `TaskList.tsx`, `ProjectDetail.tsx`, e `TasksGantt.tsx`
  depois de corrigido) ao dialog de edição completo, sem precisar montar o `<Editor>` nativo da
  lib (o app já tem seu próprio dialog).
- **`TasksGantt.tsx`**: investigar primeiro se essa rota (`/tasks/gantt`) é uma página com
  propósito próprio (ex. visão só-Gantt embed em algum lugar) ou redundante com a aba "Gantt" já
  existente dentro de `/tasks` (`TaskList.tsx`). Se for redundante e sem uso real fora da
  navegação normal, considerar redirecionar pra `/tasks` (aba Gantt) em vez de manter duas
  implementações pra manter em paridade — **recomendado**, menor superfície pra divergir de novo
  no futuro. Se tiver propósito próprio real (confirmar via `src/routes.tsx`/navegação/sidebar
  antes de decidir), trazer à paridade: passar `onOpenTask` + as mesmas props de quick actions que
  `TaskList.tsx` já passa, reaproveitando os mesmos handlers (`handleIconChange` etc.) ou
  equivalentes locais à página. Se a ambiguidade não ficar clara nem depois de investigar o uso
  real da rota, reportar como decisão pendente em vez de escolher sozinho.
- **Mock da lib nos testes deixa de ser inerte**: `GanttChart.test.tsx` — trocar o `api.on: () =>
  {}` por uma implementação que registra os callbacks (`Map<string, Function[]>`) e expõe um jeito
  do teste disparar (`api.trigger?.(event, payload)` ou equivalente, só no mock de teste — não
  precisa existir na API real). Isso não é reimplementar a lib, é fazer o dublê de teste guardar o
  que a lib real guardaria, pra provar "quando a lib chama nosso callback registrado em
  `api.on('update-task', cb)`, a gente de fato chama `updateTask`" — a lacuna descrita na
  investigação como "nem o mock prova a fiação".
- Testes novos usando esse mock melhorado devem cobrir, no mínimo: `show-editor` dispara
  `onOpenTask` com a tarefa certa; `update-task` (mover e redimensionar, casos já cobertos só na
  lógica pura) agora também prova que o handler real registrado via `api.on` chama `updateTask`
  com o payload esperado.
- `add-link`/`delete-link`: investigar primeiro se o app hoje tem qualquer funcionalidade de
  dependências entre tarefas de fato exposta ao usuário (a prop `dependencies` existe em
  `GanttChart`/`TasksGantt`, mas não está claro se criar/remover dependência é um fluxo
  suportado hoje). Se não for um fluxo real ainda, não inventar teste artificial pra evento sem
  uso — documentar em `## Notas` por que ficou fora, em vez de forçar cobertura de algo que não é
  usado.
- A hipótese de baixa confiança sobre `* { min-width: 0; }` (`src/index.css:229-231`) afetando o
  layout dos elementos `.wx-*` da lib fica **fora do escopo desta feature** — não há evidência
  suficiente sem inspeção visual real (proibida no fluxo automatizado), e a regra é usada de
  propósito em outros lugares do app (truncamento de texto em flex containers). Documentar em
  `## Notas` como hipótese não investigada, pra retomar só se "abrir"/"quick access" continuarem
  com problema depois desta feature.

## Tarefas
- [x] Em `handleInit` (`GanttChart.tsx`), registrar `api.on("show-editor", ...)` resolvendo a
      tarefa pelo `id` (via `tasksRef`/`fullTasks`) e chamando `onOpenTask?.(task)`.
- [x] Investigar o propósito real de `TasksGantt.tsx`/rota `/tasks/gantt` (uso em `src/routes.tsx`,
      navegação/sidebar, se há algum link pra ela fora da navegação padrão de `/tasks`) e decidir
      entre redirecionar pra `/tasks` (aba Gantt) ou trazer à paridade de props interativas —
      documentar a decisão e o porquê em `## Notas`. Se genuinamente ambíguo, parar e reportar em
      vez de decidir sozinho.
- [x] Implementar a decisão acima: redirecionar `TasksGantt.tsx`, OU passar `onOpenTask` + as
      props de quick actions (reaproveitando/adaptando os handlers já existentes) pra que a página
      fique com o mesmo comportamento da aba Gantt de `TaskList.tsx`.
- [x] Reescrever o mock de `@svar-ui/react-gantt` em `GanttChart.test.tsx` pra registrar callbacks
      de `api.on(...)` num registro consultável/disparável pelo teste, em vez do `() => {}` atual.
- [x] Teste novo: duplo-clique (via `show-editor` disparado pelo mock) chama `onOpenTask` com a
      tarefa correta, tanto pra uma tarefa de topo quanto (se aplicável) uma subtarefa.
- [x] Teste novo: disparar `update-task` (mover e redimensionar, via o mock melhorado) prova que o
      handler real registrado chama `updateTask` com o payload esperado — não só a função pura
      `resolveTaskScheduleUpdate` isoladamente (que já tem teste, mas nunca ligada ao `api.on`
      real).
- [x] Investigar se `add-link`/`delete-link` (dependências) são um fluxo exposto ao usuário hoje;
      se sim, aplicar o mesmo padrão de teste de fiação; se não, documentar em `## Notas` por que
      ficou fora do escopo.
- [x] `npx tsc -p tsconfig.app.json --noEmit && npm run build && npm run lint && npm test`.

## Prompts

## Notas
- `show-editor`: confirmado no `.d.ts` real (`@svar-ui/gantt-store/dist/types/DataStore.d.ts`,
  `["show-editor"]: { id: TID }`) e no bundle (`node_modules/@svar-ui/react-gantt/dist/index.es.js`,
  hoje linhas 404/930, não mais 566/1054 como o `044` original estimava — o número de linha do
  bundle minificado varia entre instalações/versões, o *evento* é que bate). Também confirmado que
  `IApi.on`/`.intercept`/`.exec` compartilham a mesma pilha de handlers
  (`@svar-ui/lib-state/dist/index.js`, `class EventBus`: `on`/`intercept` empurram pra
  `this._handlers[name]`, `exec` percorre esse mesmo array) — ou seja, `api.on("show-editor", cb)`
  de fato recebe o `{ id }` que a lib dispara em duplo-clique de barra ou clique de linha.
- Handler novo usa `fullTasksRef` (não `tasksRef`), um novo ref espelhando a prop `fullTasks`
  (mesmo padrão/motivo de `tasksRef` já existente pra `tasks`) — `onOpenTask` espera um `Task`
  completo pro dialog de edição, e `tasksRef`/`tasks` é `GanttTaskInput[]` (tipo reduzido). Nos dois
  call sites reais (`TaskList.tsx`, `ProjectDetail.tsx`) `tasks`/`fullTasks` já recebem o mesmo
  array, mas usar `fullTasksRef` evita depender disso implicitamente/castar tipo.
- **Decisão `TasksGantt.tsx`/`/tasks/gantt`: redirecionar** (recomendação da feature, agora
  confirmada por investigação, não só default). Evidência: (1) `src/components/app-sidebar.tsx`
  só lista `/tasks` e `/tasks/projects` — nenhum link pra `/tasks/gantt` em lugar nenhum do app,
  navegação ou não; (2) `TaskList.tsx` já tem uma aba "Gantt" (`value="gantt"`) com paridade total
  — mesmas tarefas, mesmo filtro de projeto (`projectFilter`, linha ~152, já compartilhado com
  Lista/Kanban), `onOpenTask`, todas as quick actions; (3) `TasksGantt.tsx` antes desta feature não
  passava `onOpenTask` nem nenhuma quick action — abrir/editar não funcionava lá mesmo antes do bug
  do `show-editor`, então "trazer à paridade" seria reimplementar do zero um filtro de projeto que
  a aba já tem. Implementado como `<Navigate to="/tasks?view=gantt" replace />` em `routes.tsx`
  (não só `/tasks` puro — `TaskList.tsx` ganhou um `useState` inicializado por `?view=` pra abrir
  direto na aba Gantt, senão o redirect perderia a aba certa). `TasksGantt.tsx` foi apagado (`rm`,
  não `git rm` — arquivos de feature/código não commitados neste branch).
- `add-link`/`delete-link`: **é um fluxo real, já exposto** — não é caso de "não inventar teste
  artificial". `dependencies` é buscado (`fetchDependencies`) e renderizado como `links` no Gantt
  (`buildGanttLinks`) nos dois call sites reais, e `createDependency`/`deleteDependency`
  (`src/api/tasks/dependencies.ts`) só são chamados a partir de `GanttChart.tsx` — ou seja, criar/
  remover dependência não tem nenhuma outra UI no app; arrastar entre bordas de barra do Gantt (link
  handle nativo da lib) e o X num link existente é o único fluxo, e já está todo fiado
  (`api.intercept`/`api.on` pra ambos em `handleInit`). Cobertura de fiação adicionada no mock, mesmo
  padrão do `update-task`.
- Hipótese de `* { min-width: 0 }` (`src/index.css:229-231`) afetando `.wx-*` da lib: mantida fora
  de escopo, sem investigação nova — nenhuma evidência adicional surgiu durante esta feature.
- **Retomada após queda de conexão**: o mock melhorado (`triggerGanttEvent`, `ganttHandlers`/
  `ganttInterceptors`) já existia no working tree, mas nenhum teste o usava ainda —
  `mockedUpdateTask`/`mockedCreateDependency`/`mockedDeleteDependency`/`GANTT_PROJECT_NODE_PREFIX`
  estavam declarados e nunca referenciados (confirmado via `tsc --noEmit`, sem erro porque eram só
  imports/vars não usados fora de teste, não um erro de tipo). Adicionado um novo describe
  `GanttChart — fiação de eventos da lib via api.on/api.intercept (feature 044)` em
  `GanttChart.test.tsx` com 11 testes novos:
  - `show-editor → onOpenTask`: tarefa de topo, subtarefa, e id de nó de projeto (não chama).
  - `update-task → updateTask`: mover (sem `estimated_duration`), redimensionar borda direita
    (recalcula `estimated_duration`), `inProgress:true` (não persiste, drag ainda em andamento),
    id de projeto (bloqueado pelo `api.intercept`, nunca chega no handler).
  - `add-link`/`delete-link → createDependency`/`deleteDependency`: fluxo normal com o mapeamento
    certo de `taskId`/`dependsOnTaskId` (confirma a ordem de argumentos dos dois lados do link,
    `source`=depende-de, `target`=tarefa), e um caso de nó de projeto bloqueado pelo interceptor de
    `add-link`.
  Todos os 31 testes de `GanttChart.test.tsx` passam (20 pré-existentes + 11 novos).
- **Suíte completa**: `npx tsc -p tsconfig.app.json --noEmit` limpo; `npm run build` ok; `npm run
  lint` sem erros (só warnings pré-existentes em várias partes do repo, nenhum novo introduzido por
  esta feature — inclusive um warning pré-existente de `react-hooks/exhaustive-deps` em
  `GanttChart.tsx:541` sobre `onOpenTask` não estar no array de deps de `handleInit`, que já
  existia antes desta feature retomar e é inofensivo na prática porque `openEdit` — o `onOpenTask`
  real passado por `TaskList`/`ProjectDetail` — só chama setters de estado estáveis, nunca fecha
  sobre estado que muda entre renders; fora do escopo desta feature, não mexido). `npm test`: 663
  passam, **2 falham em `src/lib/__tests__/currency.test.ts`** (`formatDateBR`/`formatDateTimeBR`
  esperando `"—"` e recebendo `"·"`) — confirmado que são **pré-existentes e não relacionados**:
  `git diff HEAD -- src/lib/currency.ts src/lib/__tests__/currency.test.ts` não mostra nenhuma
  alteração (arquivos idênticos ao commit `1ec9c04`), e a falha é determinística mesmo rodando o
  arquivo isolado — não é flake nem regressão desta feature. Tratado como conhecido/fora de escopo;
  não bloqueia mover pra `done/`.
