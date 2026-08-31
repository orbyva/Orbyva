---
prompt: |
  - Na lista de prioridades: NÃO PRECISA DIZER (MÉDIA, BAIXA, SEM PRIORIDADE, ENTÃO REMOVA ESSAS LINHAS) SÓ A BANDEIRINHA VAI SER CAPAZ DE DIZER. E PERMITA A REORDENAÇÃO PARA AS PRIORIDADES DA MESMA FAIXA
---

# 082 — Lista por prioridade: só a bandeirinha, e reordenável dentro da faixa

## Contexto

A "lista de prioridades" é o painel **"Por prioridade"** de `TaskQuadrant.tsx` (renderizado em
`TaskList.tsx:714-720` quando um projeto específico está selecionado na trilha de projetos, feature
`done/025`). É o único lugar do app que escreve as palavras que o prompt manda tirar — o cabeçalho
de cada faixa é `TaskQuadrant.tsx:71-79`:

```tsx
{p !== "none" && <TaskPriorityFlag priority={p} />}
{p === "none" ? "Sem prioridade" : PRIORITY_LABELS[p]}
<Badge variant="outline" className="text-[10px]">{byPriority[p].length}</Badge>
```

Os chips de filtro do topo da Lista usam `PRIORITY_OPTIONS` e dizem "Nenhuma", não "Sem prioridade"
— e são filtros, não linhas de lista; ficam fora desta feature. `TaskPriorityFlag`
(`TaskPriorityField.tsx:14-26`) desenha a bandeirinha (azul/âmbar/vermelho) e **devolve `null`
quando não há prioridade**, o que hoje deixa a faixa "none" sem marcador nenhum.

Sobre reordenar: **não existe ordem manual em lugar nenhum**. `@dnd-kit` já é dependência
(`core`/`sortable`/`utilities`) e é usado no Kanban de `TaskList`, `ProjectDetail` e `Projects` — mas
só para **mudar o status da coluna**: o `over.id` de outro card é lido apenas para descobrir o status
de destino, e a reordenação é descartada (`SortableContext` + `verticalListSortingStrategy` estão
ali decorativos). Não há coluna `position`/`sort_order`/`manual_order` em `task` nem em nenhuma
migration.

## Decisões

- **O cabeçalho de faixa perde o texto e fica só bandeirinha + contagem.** O rótulo por extenso vira
  `aria-label`/`title` no cabeçalho — remover o texto da tela não pode significar remover a
  informação do leitor de tela.
- **A faixa "sem prioridade" ganha uma bandeirinha vazada** (`Flag` com
  `text-muted-foreground/40`), via variante nova de `TaskPriorityFlag`. Sem ela, tirar o texto deixa
  um cabeçalho literalmente em branco — parece defeito. **As linhas de tarefa continuam sem
  bandeirinha quando não há prioridade** (`TaskPriorityFlag` segue devolvendo `null` no caso solto):
  a bandeirinha vazada é marcador de faixa, não de tarefa.
- **A reordenação é persistida**, senão ela se desfaz no próximo `load()` e o pedido não foi
  atendido. Coluna nova `task.sort_order integer not null default 0`, com migration própria.
  - **Descartado — ordem só em `localStorage`**: some ao trocar de máquina e diverge entre abas.
  - **Descartado — índice fracionário (`0.5`, `0.75`)**: elegante para listas grandes, mas exige
    rebalanceamento e um tipo numérico novo; uma faixa de prioridade dentro de **um projeto** é
    pequena o bastante para reescrever os inteiros da faixa inteira numa tacada.
- **Ao soltar, a faixa afetada é renumerada de 0..n-1 numa escrita em lote** (função nova
  `updateTasksSortOrder(pairs)` em `src/api/tasks/tasks.ts`), não N chamadas de `updateTask` — mesmo
  raciocínio do `deleteTasks` da feature `028`.
- **Arrastar entre faixas muda a prioridade**, além de posicionar. `@dnd-kit` já entrega o alvo de
  graça, o Kanban já usa exatamente esse gesto para status, e sem isso arrastar para a faixa vizinha
  seria um no-op confuso. O prompt só pede "dentro da mesma faixa"; isto é o comportamento
  consistente do gesto, registrado aqui como decisão para não parecer escopo escondido.
- **A ordem manual só manda dentro do painel "Por prioridade".** A lista principal e o painel "Por
  prazo" continuam com a ordenação deles (feature `079`). Uma coluna `sort_order` convida a virar
  ordenação global; se o usuário quiser isso, é pedido novo.
- **Desempate**: `sort_order` asc, e depois o comparador padrão da tela (`079`) para tarefas que
  nunca foram arrastadas — todas nascem com `sort_order = 0`, então sem o desempate a faixa inteira
  ficaria em ordem indefinida.
- **Acessibilidade não é acabamento**: `@dnd-kit` tem `KeyboardSensor`; a reordenação precisa
  funcionar por teclado (Espaço para pegar, setas para mover, Espaço para soltar) e anunciar o
  resultado. As linhas de `QuadrantTaskRow` já são `<button>` — vira alça de arraste com
  `useSortable`, mantendo o clique que abre a tarefa.
- **Sem `supabase db push`**: a migration é escrita e validada em Postgres 16 descartável (harness
  `supabase/tests/<nome>/run.sh`, molde de `supabase/tests/task_is_quick/`), e a aplicação fica como
  tarefa "Aguarda o usuário".
- **Fora de escopo**: os chips de filtro por prioridade do topo da Lista (são filtros, e "Nenhuma"
  ali é opção de filtro, não linha de lista) e o painel "Por prazo" do mesmo quadrante.

## Tarefas

- [x] `TaskPriorityField.tsx`: `TaskPriorityFlag` ganha `variant?: "task" | "band"`; em `"band"`,
      `null` desenha um `Flag` vazado (`text-muted-foreground/40`) em vez de não renderizar nada, e
      todo caso recebe `aria-label` com o rótulo por extenso. Verificação: `npm run build && npm run lint`
- [x] Testar `TaskPriorityFlag` em `src/pages/admin/tasks/__tests__/`: sem prioridade em `"task"`
      não renderiza; sem prioridade em `"band"` renderiza a bandeirinha vazada com
      `aria-label="Sem prioridade"`; as três prioridades mantêm cor e rótulo acessível.
      Verificação: `npm test src/pages/admin/tasks`
- [x] `TaskQuadrant.tsx`: cabeçalho de faixa vira bandeirinha + `Badge` de contagem, sem texto, com
      `aria-label`/`title` carregando "Alta"/"Média"/"Baixa"/"Sem prioridade"; remover o import de
      `PRIORITY_LABELS` se ele deixar de ser usado ali. Verificação: `npm run build && npm run lint`
- [x] Teste em `src/pages/admin/tasks/__tests__/TaskQuadrant.test.tsx` (criar se não existir): os
      textos "Média", "Baixa" e "Sem prioridade" **não** aparecem no painel "Por prioridade"; a
      contagem continua aparecendo; o nome acessível de cada faixa continua correto; o painel "Por
      prazo" **não** foi alterado. Verificação: `npm test src/pages/admin/tasks`
- [x] `supabase/migrations/20260820140000_task_sort_order.sql`:
      `alter table public.task add column if not exists sort_order integer not null default 0` +
      `comment on column` ("ordem manual dentro da faixa de prioridade do quadrante de projeto").
      **Não rodar `supabase db push`.**
- [x] Harness `supabase/tests/task_sort_order/run.sh` (molde de `supabase/tests/task_is_quick/`):
      aplica a migration **duas vezes**, prova que a coluna é `integer not null default 0`, que as
      tarefas existentes ficam em `0`, que RLS e `trg_enforce_app_access` continuam de pé, que um
      `authenticated` não reordena tarefa alheia, e um controle negativo sem a migration.
      Verificação: `bash supabase/tests/task_sort_order/run.sh`
- [x] `src/types/tasks.ts`: `sort_order?: number` em `Task`; `emptyTask()` em
      `src/domain/tasks/taskDraft.ts` semeia `sort_order: 0`. Verificação: `npm run build` + teste
      em `taskDraft.test.ts`
- [x] Criar `reorderWithinBand(tasks, activeId, overId)` puro em `src/domain/tasks/priority.ts`:
      devolve os pares `{ id, sort_order }` renumerados de 0..n-1 para a faixa afetada.
      Verificação: `npm run build`
- [x] Testar `reorderWithinBand`: mover para cima, para baixo, para a primeira e para a última
      posição; soltar no mesmo lugar não gera escrita; faixa com um item só; ids desconhecidos são
      ignorados. Verificação: `npm test src/domain/tasks`
- [x] Criar `updateTasksSortOrder(pairs)` em `src/api/tasks/tasks.ts`: escrita em lote (`upsert` por
      `id`), escopada a `user_id`, carimbando `updated_at` como o `updateTask` já faz.
      Verificação: `npm run build && npm run lint`
- [x] Testar `updateTasksSortOrder` em `src/api/__tests__/` (Supabase falso): uma escrita só para N
      tarefas; erro sobe para o chamador; lista vazia não chama o banco.
      Verificação: `npm test src/api`
- [x] `TaskQuadrant.tsx`: `DndContext` + um `SortableContext` por faixa (`verticalListSortingStrategy`),
      `QuadrantTaskRow` com `useSortable`, preservando o `onClick` que abre a tarefa (arrastar não
      pode virar clique). Verificação: `npm run build && npm run lint`
- [x] `TaskQuadrant.tsx`: `onReorder(pairs)` e `onPriorityChange(taskId, priority)` como props;
      `TaskList.tsx` implementa chamando `updateTasksSortOrder`/`updateTask` + `load()`, com
      atualização otimista e reversão em caso de erro. Verificação: `npm run build && npm run lint`
- [x] Ordenação da faixa passa a ser `sort_order` asc com desempate pelo comparador da tela (feature
      `079`, ou `sortTasksByDueDate` se a `079` ainda não estiver feita).
      Verificação: teste de que duas tarefas com `sort_order = 0` mantêm ordem estável
- [x] Teste do pedido em `TaskQuadrant.test.tsx`: arrastar a segunda tarefa da faixa "Alta" para o
      topo chama `onReorder` com a renumeração certa, a ordem persiste depois de um `load()`
      simulado, e a mudança é otimista (a linha se move antes da resposta).
      Verificação: `npm test src/pages/admin/tasks`
- [x] Teste de arraste entre faixas: soltar uma tarefa "Baixa" dentro da faixa "Alta" chama
      `onPriorityChange` com `"high"` **e** `onReorder` com a posição.
      Verificação: `npm test src/pages/admin/tasks`
- [x] Reordenação por teclado (`KeyboardSensor`) com anúncios (`announcements` do `@dnd-kit`), e
      teste cobrindo pegar/mover/soltar sem mouse. Verificação: `npm test src/pages/admin/tasks`
- [x] Estados de borda por teste: erro na persistência reverte a ordem na tela e mostra toast;
      faixa vazia continua escondida (comportamento atual); painel inteiro some quando não há tarefa
      (`tasks.length === 0`, comportamento atual preservado).
      Verificação: `npm test src/pages/admin/tasks`
- [x] `npx tsc -p tsconfig.app.json --noEmit && npm run build && npm run lint && npm test`
      (+ `npm run check:bundle`), com a contagem registrada em `## Notas`
- [x] **Migration aplicada pelo usuário** (2026-08-23): o usuário rodou `supabase db push` e
      confirmou que `20260820140000_task_sort_order.sql` está no banco remoto. Isso destrava o
      acoplamento que a tarefa avisava — `emptyTask()` manda `sort_order: 0` no `insert`, então até
      o push **criar tarefa falhava** com "column sort_order does not exist"; agora a coluna existe.
      A migration já estava validada em Postgres 16 descartável
      (`bash supabase/tests/task_sort_order/run.sh`), inclusive na reaplicação e com controle
      negativo.
      **A conferência pós-push NÃO foi executada por esta sessão** — as consultas leem o banco
      remoto, ao qual esta esteira não tem acesso, e o roteiro pedia um `select count(*) from task`
      **antes** do push que nunca foi anotado. A versão post-hoc, que não depende dele, ficou em
      `## Notas` como pendência explícita do usuário

## Prompts

## Notas

- **PENDÊNCIA DO USUÁRIO — conferência pós-push (2026-08-23).** A migration está aplicada (o usuário
  rodou `supabase db push` e confirmou), mas o que segue **não foi executado nem visto passar por
  esta sessão** (banco remoto e interface). O roteiro original pedia `select count(*) from task`
  **antes** do push; isso não foi anotado. A versão abaixo tem resultado esperado absoluto:

  ```sql
  -- (1) a coluna chegou com o contrato certo
  select column_name, data_type, is_nullable, column_default
    from information_schema.columns
   where table_schema = 'public' and table_name = 'task' and column_name = 'sort_order';
  -- esperado: sort_order | integer | NO | 0

  -- (2) nenhuma tarefa nasceu com ordem manual. Tem de dar 0
  --     (rodar ANTES de arrastar qualquer linha no painel "Por prioridade")
  select count(*) from public.task where sort_order <> 0;
  ```

  A migration é um `add column ... not null default 0`, então não podia inserir nem apagar linha —
  é por isso que a ausência do `count(*)` de partida não deixa buraco real aqui.

  Na interface (teste de fumaça): abrir a Lista com um projeto selecionado, conferir que o painel
  "Por prioridade" mostra **só bandeirinha + contagem** (sem as palavras "Média", "Baixa", "Sem
  prioridade"), arrastar uma tarefa dentro da faixa "Alta" e recarregar a página confirmando que a
  ordem persistiu; e arrastar uma tarefa "Baixa" para dentro da faixa "Alta", conferindo que ela
  muda de prioridade **e** de posição. Tudo já passa em teste (`TaskQuadrant.test.tsx`,
  `TaskQuadrant.keyboard.test.tsx`, `TaskList.priority-reorder.test.tsx`) — o roteiro só confirma
  contra o Postgres real, e em especial que criar tarefa voltou a funcionar.
- **Verificação final (20/08/2026)**: `npx tsc -p tsconfig.app.json --noEmit` limpo,
  `npm run build` OK, `npm run lint` com 0 erros (81 avisos, todos do `react-refresh` pré-existente
  — o +1 em relação ao baseline é o `buildQuadrantAnnouncements` exportado de um arquivo de
  componente), `npm test` **213 arquivos / 2192 testes / 0 falhas** (baseline antes da feature:
  207 / 2137), `npm run check:bundle` OK — rota `TaskList` em 9.0 KB de 160 KB gzip.
  Sob carga total a suíte às vezes estoura o `testTimeout` de 5s em arquivos pesados
  (`TaskList.form-panel`, `notaSemSintaxe`, `notes-navigation`); rodados isolados passam, e a
  rodada limpa acima confirma. O erro pós-teardown do focus-scope do Radix continua aparecendo
  como "1 error", intermitente e pré-existente (registrado pela 080).
- **Contrato com a 079 conferido no código depois de pronto**: `sort_order` só é lido em
  `groupTasksByPriority` (`TaskQuadrant.tsx`), que serve **apenas** o painel "Por prioridade"; o
  painel "Por prazo" (`groupTasksByAgendaBucket`), a Lista em caixas e as colunas do Kanban
  continuam saindo de `sortTasksBy(sortKey, …)` e não olham a coluna nova. O `TaskSortToggle` não é
  renderizado dentro do `TaskQuadrant` — ele segue na barra da aba Lista, governando Lista/Kanban.
  Testes que fixam isso: "o painel «Por prazo» ignora sort_order" (`TaskQuadrant.test.tsx`) e a
  suíte da 079 (`TaskList.sort.test.tsx`/`ProjectDetail.sort.test.tsx`), que continua verde.
- **Onde ficou cada teste** (o plano falava só em `TaskQuadrant.test.tsx`; virou uma família de
  três, porque `vi.mock` é por arquivo):
  - `TaskQuadrant.test.tsx` — @dnd-kit real, cobre o texto que saiu, contagem, nome acessível,
    faixa vazia escondida, painel sumindo, e a ordem da faixa (`sort_order` asc + desempate 079).
  - `TaskQuadrant.keyboard.test.tsx` — @dnd-kit real **inclusive o `KeyboardSensor`**: Espaço pega,
    seta move, Espaço solta e `onReorder` recebe a renumeração; Esc cancela sem escrever; Enter
    continua abrindo a tarefa; e os anúncios (`buildQuadrantAnnouncements`) têm teste próprio.
  - `TaskList.priority-reorder.test.tsx` — @dnd-kit trocado por um duplo que guarda o `onDragEnd`;
    cobre o pedido ponta a ponta na tela real (renumeração, otimismo, persistência entre `load()`s,
    reversão + toast no erro, arraste entre faixas mudando a prioridade).
- **O que jsdom não entrega**: o gesto de mouse (`PointerSensor`) não existe ali. O arraste por
  **teclado** roda de verdade, com um único remendo — um stub de `getBoundingClientRect` dando
  altura às linhas. Detalhe que custou tempo e vale registrar: dar retângulo aos **contêineres**
  (painel/wrappers) faz o `closestCenter` escolher alvos errados; só as linhas podem ter altura.
- **A faixa não é um droppable próprio** (desvio do que a implementação chegou a ter): um alvo do
  tamanho da faixa cobre as linhas dela e disputa a colisão — o centro da faixa cai em cima de uma
  linha do meio — deixando a solta imprevisível. Como faixa vazia fica escondida, toda faixa
  visível tem pelo menos uma linha para receber a solta.
- **`KeyboardSensor` com `keyboardCodes` customizado**: só `Espaço` pega/solta. Com o padrão do
  @dnd-kit (`Espaço` **e** `Enter`) não sobraria tecla para *abrir* a tarefa pelo teclado, já que a
  linha inteira é a alça de arraste.
- `updateTasksSortOrder` faz um `select id, title` antes do `upsert` (desvio pequeno do plano, que
  falava só em "upsert por id"): `task.title`/`task.user_id` são `not null` sem default, então um
  upsert com `{id, sort_order}` estouraria o not-null **antes** do `on conflict`; e o mesmo `select`
  escopado por `user_id` é o que impede um id forjado/inexistente de virar **linha nova** em vez de
  no-op. Continua sendo uma escrita só para a faixa inteira.
- O teste da `081` (`TaskList.due-regroup.test.tsx`) observava o reagrupamento pelo **texto** da
  faixa ("Sem prioridade" → "Alta"). Como este é justamente o texto que a `082` remove, as três
  assertivas passaram a usar `getByTitle`/`queryByTitle` — o reagrupamento continua sendo o que o
  teste prova, só o seletor mudou. Nada do comportamento da `081` foi desfeito.
