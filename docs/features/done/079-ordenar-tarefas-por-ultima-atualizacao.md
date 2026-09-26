---
prompt: |
  - ordene as tarefas por ordem de last_updated
---

# 079 — Ordenar as tarefas por última atualização

## Contexto

A lista de tarefas tem **uma ordenação só, fixa no código**: `sortTasksByDueDate`
(`src/domain/tasks/filters.ts:34-43`) — prazo ascendente, sem prazo no fim — aplicada em
`TaskList.tsx:247-252` e replicada em `ProjectDetail.tsx`. Depois disso o resultado é distribuído
nas caixas de prazo (`groupTasksByAgendaBucket`: Atrasadas / Hoje / Esta semana / Este mês / Mais
tarde / Sem prazo). **Não existe seletor de ordenação em lugar nenhum** do módulo — só filtros
(status, prioridade, "Hoje", projeto, tag). As concluídas usam `sortTasksByCompletedAtDesc`.

Não existe coluna `last_updated`, mas existe **`updated_at`** (`task`, desde
`20260803121500_tasks_projects.sql:60`, `timestamptz not null default now()`). Duas particularidades
que mudam o desenho:

- **Não há trigger mantendo `updated_at`.** Nenhuma das 88 migrations usa `moddatetime`/
  `set_updated_at`; o único trigger em `task` é o `trg_enforce_app_access`. Quem carimba é o cliente,
  em `updateTask` (`src/api/tasks/tasks.ts:241-244`) e em `propagateIconToSeries` (`:232`).
- **`createTask` não carimba** — confia no `default now()`, o que dá `updated_at == created_at` numa
  tarefa nunca editada. Isso é o comportamento desejado (tarefa nova é "recém-atualizada").

`fetchTasks` só faz `.order("due_date", ...)`, e as materializações **anexam** linhas ao array
depois (`[...tasks, ...data]`), então a ordem do servidor não vale nada — quem ordena de verdade é o
cliente.

## Decisões

- **As caixas de prazo ficam.** O pedido irmão deste mesmo texto bruto (feature `081`) reclama
  justamente que ao mudar o prazo a tarefa não vai "cada um em cada caixa" — o usuário gosta dos
  buckets. Então "ordenar por last_updated" é lido como **a ordem dentro de cada caixa**, não como
  achatar a lista.
- **A ordenação vira uma escolha explícita, com um seletor "Ordenar por"** ao lado dos filtros da
  aba Lista, com duas opções: **"Última atualização"** (mais recente primeiro) e **"Prazo"** (o
  comportamento de hoje). O padrão passa a ser "Última atualização", que é o pedido literal.
  - **Descartado — trocar a ordenação fixa sem seletor**: perderia sem volta a leitura por prazo
    dentro do bucket ("das atrasadas, qual venceu primeiro"), que é útil e é o comportamento que o
    usuário tem há 78 features.
- **A escolha é lembrada** em `localStorage` (mesmo padrão das preferências locais já usadas em
  `src/lib/browserNotify.ts`), por usuário do navegador. Não é coluna de banco: é preferência de
  visualização, não dado.
- **A nova ordenação vale para Lista e para as colunas do Kanban**; a seção de Concluídas continua
  por `completed_at` desc (ali "quando terminei" é a pergunta certa, e `updated_at` seria quase
  sempre o mesmo instante).
- **Comparador com desempate determinístico**: `updated_at` desc → `created_at` desc → `id`. Sem o
  desempate, duas tarefas carimbadas no mesmo milissegundo (materialização em lote insere várias de
  uma vez) trocam de lugar a cada render.
- **Nada de trigger `moddatetime` no banco.** Todo caminho de escrita de tarefa passa por
  `updateTask`, que já carimba; um trigger novo faria as *migrations de backfill pendentes*
  (`073`, `071`) reescreverem `updated_at` de milhares de linhas no `db push` e jogarem doses antigas
  para o topo da lista. Em vez disso, uma tarefa de auditoria confirma que não há escrita em `task`
  fora de `updateTask`.
- **Efeito colateral aceito e documentado**: `propagateIconToSeries` (feature `073`) atualiza a série
  inteira, então trocar o ícone de uma recorrência leva todas as ocorrências para o topo. É
  correto — elas *foram* atualizadas — mas precisa estar escrito, senão vira "bug" na próxima sessão.
- **`sortTasksByDueDate` não é apagada nem alterada**: ela continua sendo o comparador da opção
  "Prazo" e é usada por outros caminhos. A função nova entra ao lado, no mesmo arquivo.
- **Convivência com a `082` (reordenação manual dentro da faixa de prioridade)**: a `082` vai
  introduzir `task.sort_order`, uma ordem manual arrastável. As duas ordenações **não disputam a
  mesma lista** — a divisão fica assim, e as duas features já a registram do seu lado
  (`082`, Decisões: "A ordem manual só manda dentro do painel «Por prioridade»"):
  - **Painel "Por prioridade" do `TaskQuadrant`**: manda `sort_order` asc; o `sortKey` desta feature
    entra só como **desempate**, porque toda tarefa nasce com `sort_order = 0` e sem desempate a
    faixa inteira ficaria em ordem indefinida. Ou seja, enquanto ninguém arrastou nada, a faixa
    aparece ordenada por última atualização; assim que o usuário arrasta, o gesto dele ganha.
  - **Lista (buckets de prazo), Kanban e painel "Por prazo"**: mandam o `sortKey` desta feature;
    `sort_order` é ignorado ali. Ordem manual global é pedido novo, não escopo de nenhuma das duas.
  - Por isso o seletor "Ordenar por" **não** aparece no painel "Por prioridade": ele governa a Lista
    e o Kanban, e mostrá-lo sobre uma lista que obedece ao arraste seria mentira de interface.
  - **Descartado — deixar o `sortKey` sobrepor `sort_order`**: desfaria o arraste no render
    seguinte, que é exatamente o que a `082` existe para consertar.
  - **Descartado — `sort_order` mandar em toda a Lista**: o padrão de fábrica (`0` para todas)
    deixaria a Lista sem ordenação nenhuma até o usuário arrastar tarefa por tarefa.

## Tarefas

- [x] Criar `sortTasksByUpdatedAtDesc(tasks)` em `src/domain/tasks/filters.ts`: `updated_at` desc,
      desempate por `created_at` desc e depois por `id`; tarefa sem `updated_at` cai para
      `created_at`, e sem nenhum dos dois vai para o fim. Não muta o array de entrada.
      Verificação: `npm run build`
- [x] Testar em `src/domain/tasks/__tests__/filters.test.ts`: ordem básica; empate de `updated_at`
      resolvido por `created_at`; empate total resolvido por `id` (ordem estável entre chamadas);
      `updated_at` ausente; lista vazia; a entrada não é mutada. Verificação: `npm test src/domain/tasks`
- [x] Criar o tipo e as constantes de ordenação (`TaskSortKey = "updated" | "due"`, rótulos
      "Última atualização" / "Prazo") em `src/domain/tasks/filters.ts`, com
      `sortTasksBy(key, tasks)` despachando para o comparador certo. Verificação: `npm run build`
- [x] Persistência da preferência: helper `readTaskSortKey()` / `writeTaskSortKey(key)` em
      `src/lib/` (chave `orbyva_task_sort_v1`), tolerando `localStorage` indisponível e valor
      inválido (cai no padrão "updated"). Verificação: teste unitário do helper
- [x] `TaskList.tsx`: estado `sortKey` inicializado pela preferência, `pendingTasks` passa a usar
      `sortTasksBy(sortKey, ...)` no lugar de `sortTasksByDueDate`. Verificação: `npm run build && npm run lint`
- [x] `TaskList.tsx`: seletor "Ordenar por" na barra de filtros da aba Lista — 2 opções, então
      **botões visíveis** (par de botões no mesmo estilo dos chips de prioridade), não um dropdown.
      Com `aria-pressed` e rótulo por extenso. Verificação: `npm run build && npm run lint`
- [x] `ProjectDetail.tsx`: mesma mudança (estado, comparador e seletor), compartilhando a preferência
      com a Lista. Verificação: `npm run build && npm run lint`
- [x] Kanban: as colunas (`topLevelByStatus`) passam a usar o mesmo `sortKey`. Verificação:
      `npm run build` + teste de que a ordem dentro de uma coluna muda ao trocar o seletor
- [x] Teste de fluxo em `src/pages/admin/tasks/__tests__/TaskList.*.test.tsx`: com o seletor em
      "Última atualização", dentro do bucket "Hoje" a tarefa editada por último aparece primeiro;
      trocar para "Prazo" restaura a ordem por data; a escolha sobrevive a remontar o componente.
      Verificação: `npm test src/pages/admin/tasks`
- [x] Teste de que a seção "Concluídas" **não** muda de ordenação (continua `completed_at` desc) em
      nenhuma das duas opções. Verificação: `npm test src/pages/admin/tasks`
- [x] Auditoria: varrer `src` por `.from("task")` com `update`/`insert`/`upsert` fora de
      `src/api/tasks/tasks.ts` e confirmar que ou passam por `updateTask` ou são inserts (onde
      `default now()` basta). Registrar o resultado em `## Notas`; se algum caminho escrever sem
      carimbar, corrigir. Verificação: a varredura + `npm run build`
- [x] Documentar em `## Notas` o efeito da `073`: trocar o ícone de uma série atualiza todas as
      ocorrências e por isso leva a série inteira para o topo com "Última atualização"
- [x] `npx tsc -p tsconfig.app.json --noEmit && npm run build && npm run lint && npm test`
      (+ `npm run check:bundle`), com a contagem registrada em `## Notas`
- [x] Verificação do pedido literal, por teste: com o padrão de fábrica (sem preferência salva), a
      lista já sai ordenada por última atualização, mais recente primeiro

## Prompts

## Notas

- **Auditoria das escritas em `task` (2026-08-20).** Varredura de `.from("task")` em `src/`, fora de
  testes — 23 ocorrências, todas classificadas:
  - **`update` que já carimbava**: `tasks.ts:updateTask` (a porta principal),
    `tasks.ts:propagateIconToSeries` (073), `recurring.ts:226` (parcela paga/reaberta),
    `shopping/items.ts:92` (item de compra sincronizando a tarefa).
  - **`insert`/`upsert`** (`default now()` basta, e `updated_at == created_at` numa tarefa nova é o
    comportamento desejado): `tasks.ts:createTask`, `taskRows.ts:41` (materialização em lote, com
    `ignoreDuplicates`), `shopping/items.ts:143`.
  - **`select`/`delete`** (não mexem em `updated_at`): `fetchTasks`, `fetchTaskById`,
    `health/index.ts:37`, `health/medications.ts:292,314`, `taskRows.ts:52,78,166`,
    `tasks.ts:deleteTask`, os `select` de `syncLinkedShoppingItemFromTask`/
    `syncLinkedInstallmentFromTask` e `tags.ts:44`.
  - **Um furo real, corrigido**: `deleteTag` (`src/api/tasks/tags.ts:53`) atualizava `tag_ids` das
    tarefas que usavam a tag **sem** carimbar `updated_at`. Como não há trigger `moddatetime`, a
    tarefa mudava de conteúdo e mesmo assim afundava na ordenação por "Última atualização". Agora
    carimba, com teste dedicado em
    `src/api/tasks/__tests__/deleteTag-stamps-updated-at.test.ts`.
- **Efeito da `073` (esperado, não é bug)**: `propagateIconToSeries` escreve o ícone na série
  inteira (`id = originId OR recurrence_origin_id = originId`) com `updated_at` novo em todas as
  linhas. Logo, **trocar o ícone de uma recorrência leva todas as ocorrências dela para o topo** da
  ordenação "Última atualização", inclusive as antigas e as já concluídas. Está correto — elas
  *foram* atualizadas —, mas é surpreendente de ver; quem quiser a leitura por prazo naquele momento
  troca o seletor para "Prazo".
- **O seletor mora na aba Lista** (e na Lista do `ProjectDetail`), mas a escolha vale também para as
  colunas do Kanban, que antes herdavam a ordem crua do `fetchTasks` (`due_date` asc, já embaralhada
  pelas materializações que anexam linhas no fim do array). Quem está no Kanban e quer trocar volta
  um clique até a Lista — não valia um segundo seletor duplicado na barra.
- **Desvio do plano**: o seletor virou um componente próprio, `TaskSortToggle.tsx`, em vez de markup
  repetido em `TaskList.tsx` e `ProjectDetail.tsx` (as tarefas pediam "a mesma mudança" nos dois).
  Um lugar só para o `aria-pressed`, os rótulos e o estilo dos botões.
- **Checagem de satisfação do `prompt:` ("ordene as tarefas por ordem de last_updated")** — sem
  navegador, cada pedaço apontando para um artefato que passou. `## Prompts` está vazio: não houve
  pedido novo do usuário no meio da implementação, então a instrução-mãe é a única a conferir.
  - *"ordene as tarefas"* → a Lista (`TaskList`), a Lista do projeto (`ProjectDetail`) e as colunas
    do Kanban dos dois passaram a ordenar pelo comparador escolhido:
    `TaskList.sort.test.tsx` › "as colunas do Kanban seguem o mesmo seletor" e
    `ProjectDetail.sort.test.tsx` › "o Kanban do projeto segue a mesma preferência".
  - *"por ordem de last_updated"* → `sortTasksByUpdatedAtDesc` (`updated_at` desc, desempate
    `created_at` desc → `id`), coberta por 8 casos em `filters.test.ts`, incluindo empates,
    carimbo ausente, sufixos `Z`/`+00:00` e não-mutação da entrada.
  - *o pedido é o padrão, não uma opção escondida* → `TaskList.sort.test.tsx` › "padrão de fábrica
    (sem preferência salva): a lista já sai por última atualização" (prova que
    `localStorage` está vazio e que a ordem na tela já é a de atualização) e
    `ProjectDetail.sort.test.tsx` › "a Lista do projeto abre ordenada por última atualização".
  - *"as tarefas"* — dentro das caixas de prazo, que continuam existindo →
    `TaskList.sort.test.tsx` › "dentro do bucket «Hoje», a tarefa editada por último aparece
    primeiro" e › "as caixas de prazo continuam as mesmas nas duas ordenações".
  - *o dado por trás do pedido ser confiável* → auditoria acima + o furo do `deleteTag` corrigido,
    com `deleteTag-stamps-updated-at.test.ts` provando o carimbo.
- **Verificação final (2026-08-20)**: `npx tsc -p tsconfig.app.json --noEmit` limpo,
  `npm run build` OK, `npm run lint` com 0 erros (80 warnings pré-existentes de
  `react-refresh/only-export-components`), `npm test` com **202 arquivos / 2060 testes / 0 falhas**
  (baseline antes desta feature: 198 / 2027) e `npm run check:bundle` "Bundle budget OK" —
  `TaskList-*.js` 7.7 KB e `ProjectDetail-*.js` 8.2 KB, bem abaixo do teto de 160 KB gzip por rota.
- **`TaskList.subtask-edit.test.tsx` precisou de escopo**: com o seletor na tela, "Prazo" passou a
  existir duas vezes no documento (opção de ordenação + rótulo do campo do formulário), e o
  `screen.getByText("Prazo")` daquele teste ficou ambíguo. Passou a consultar dentro do `dialog`.
