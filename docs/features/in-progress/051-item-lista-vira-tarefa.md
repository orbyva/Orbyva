---
prompt: |
  - ADICIONAR MÓDULO DE LISTA DE COMPRAS. EU CONTROLO EM UMA OUTRA ETAPA DENTRO DE PRODUTIVIDADE. POORÉM CONSIGO CRIAR UMA TAREFA A PARTIR DE UM ITEM NA LISTA DE COMPRAS, PARA ME COMPROMETER A COMPRÁ-LO EM UMA TAREFA DESIGNADA
    - ESSA TAREFA JÁ DEVE TER O ÍCONE VINCULADO
    - DENTRO DA LISTA DE COMPRAS EU POSSO CRIAR CATEGORIAS, QUE AGRUPAM OS ITENS A SEREM COMPRADOS
      - POSSO CRIAR UMA CATEGORIA RELACIONADA A UM PROJETO, DE MODO QUE POSSO VER OS ITENS, POR CATEGORIAS, DE UM PROJETO EM ESPECÍFICO
---

# 051 — Item da Lista vira Tarefa (vínculo + ícone)

## Contexto

Um item da lista é, ao mesmo tempo, "uma coisa que preciso comprar" e uma tarefa a que o usuário se compromete. Esta feature entrega o botão "Criar tarefa" na linha do item: cria uma tarefa já com o ícone de compras, mantém item e tarefa em sincronia (comprou → tarefa concluída; concluiu → item comprado) e mostra na linha do item que ele já tem tarefa.

Depende da 050 (tabelas, página e API do núcleo).

## Decisões

- **Vínculo unidirecional: uma única coluna `task.linked_shopping_item_id uuid references public.shopping_item(id) on delete set null`.** Espelha o padrão já em produção de `task.linked_recurring_id` (`supabase/migrations/20260806120050_task_recurring_link.sql`), inclusive o `on delete set null`: apagar o item não apaga a tarefa, só desfaz o vínculo — e o banco faz isso sozinho, sem código de limpeza.
  - **Descartada a relação bidirecional** (`task.linked_shopping_item_id` + `shopping_item.task_id`), que é o que a primeira versão deste refino tinha, por contradição própria: são duas fontes de verdade para o mesmo fato, que precisam ser escritas juntas em toda criação, exclusão e desvinculação, sem transação entre elas no cliente. A feature 002 já teve bug real dessa classe (ver Notas de `002-vinculo-tarefa-recorrencia-financeira.md`); pagar o mesmo custo aqui, para uma relação 1:1, não se justifica.
  - **Como a lista descobre "este item já tem tarefa?" sem varrer tarefas**: índice `task_linked_shopping_item_idx on public.task (linked_shopping_item_id)` + **uma** consulta por carregamento da página — `select id, title, status from task where linked_shopping_item_id in (<ids dos itens carregados>)` — montada num `Map<itemId, TaskLink>` e passada para as linhas. É uma query a mais na página inteira, não uma por item; nada de N+1.
- **Relação 1:1: um item tem no máximo uma tarefa.** Com a tarefa vinculada existindo, o botão vira "Ver tarefa" em vez de criar outra. Descartado permitir várias tarefas por item: o pedido é "me comprometer a comprá-lo em uma tarefa designada" — singular — e várias tarefas para o mesmo item tornam ambígua a regra de sincronização de status.
- **O "ícone vinculado" é `icon_key = "shopping-cart"` gravado na criação da tarefa.** Ícone de tarefa não é derivado de vínculo nenhum: é atributo direto da tarefa (`icon_key` para preset fixo **ou** `icon_url` para upload, mutuamente exclusivos — ver `src/types/tasks.ts` e `src/pages/admin/tasks/TaskIconPicker.tsx`). Como `TASK_ICON_PRESETS` (`src/pages/admin/tasks/TaskIconBadge.tsx`, linhas 13-21) hoje só tem flag/star/bookmark/pin/bell/alert-circle/check-circle, é preciso **acrescentar o preset** `{ key: "shopping-cart", label: "Compra", icon: ShoppingCart }`. Isso é edição de código puro — presets não vivem no banco, não há migration envolvida.
- **O ícone é gravado, não travado.** Depois de criada, a tarefa é uma tarefa normal: o usuário pode trocar o ícone pelo `TaskIconPicker` como em qualquer outra. Descartado impedir a troca: exigiria um caso especial em toda a UI de tarefas para proteger um valor default.
- **Sincronização de status nos dois sentidos, best-effort**, no mesmo formato da feature 002: o `try/catch` que sincroniza nunca derruba a operação principal (ver a nota "sync de `updateTask` sem try/catch" em `002-...md`, que registra o bug de não fazer isso).
  - Item marcado `purchased` → tarefa vinculada vai para `done` (com `completed_at`); item desmarcado → tarefa volta para `todo`.
  - Tarefa vinculada concluída → item vai para `purchased`; tarefa reaberta → item volta para `pending`.
  - Como na 002, o lado que reage grava direto na tabela do outro (não chama o `update*` que dispara sincronização) — é o que impede o ping-pong recursivo entre os dois lados.
- **Tarefa excluída não apaga o item.** O item volta a ser um item comum, `pending` se estava `purchased` por causa da tarefa. Descartado apagar o item junto: o usuário ainda precisa comprar a coisa; excluir a tarefa é desistir do compromisso, não da compra.
- **A tarefa criada não é recorrente.** `recurrence_rule` fica nulo, então `materializeRecurringInstances` (`src/api/tasks/tasks.ts`) nunca gera instâncias a partir dela e não há como duas tarefas disputarem o mesmo item. Descartado permitir item recorrente ("comprar café todo mês") nesta feature: exigiria decidir o que "comprado" significa por ocorrência — é feature própria, se o usuário pedir.

## Tarefas

- [x] Migration `supabase/migrations/20260816140000_task_shopping_item_link.sql`: `alter table public.task add column if not exists linked_shopping_item_id uuid references public.shopping_item(id) on delete set null`; índice `task_linked_shopping_item_idx on public.task (linked_shopping_item_id)`; `comment on column` explicando o vínculo. Espelhar `20260806120050_task_recurring_link.sql`. Verificação: `supabase db push` só após confirmação do usuário.
- [x] `src/types/tasks.ts`: acrescentar `linked_shopping_item_id: string | null` a `Task`. Verificação: `npm run build`.
- [x] `src/pages/admin/tasks/TaskIconBadge.tsx`: acrescentar o preset `{ key: "shopping-cart", label: "Compra", icon: ShoppingCart }` (ícone `ShoppingCart` do lucide-react) ao array `TASK_ICON_PRESETS`. Verificação: `npm run build` e ~~abrir o `TaskIconPicker` de qualquer tarefa~~ testes de componente em `TaskIconPicker.test.tsx` (navegador está fora deste fluxo, ver Notas) — o novo preset aparece no grid e pode ser selecionado.
- [x] `src/domain/shopping/taskLink.ts`: funções puras `buildTaskDraftFromItem(item, category)` (retorna `{ title, description, icon_key: "shopping-cart", linked_shopping_item_id }`) e `resolveItemStatusFromTask(taskStatus)` / `resolveTaskStatusFromItem(itemStatus)` (os dois mapeamentos de status, num lugar só, sem I/O). Verificação: `npm run build`.
- [x] `src/domain/shopping/__tests__/taskLink.test.ts`: testes Vitest dos três — título/descrição copiados, `icon_key` sempre `"shopping-cart"`, `purchased ↔ done` e `pending ↔ todo` nos dois sentidos. Verificação: `npm test`.
- [x] `src/api/shopping/items.ts`: `createTaskFromShoppingItem(itemId)` — monta o rascunho com `buildTaskDraftFromItem` e insere a tarefa; e `fetchTaskLinksForItems(itemIds)` — a consulta única `where linked_shopping_item_id in (...)` que devolve o `Map<itemId, { taskId, title, status }>`. Verificação: `npm run build`.
- [x] `src/api/shopping/items.ts`: em `setShoppingItemStatus`, sincronizar a tarefa vinculada (grava direto em `task`, dentro de `try/catch` que só loga em caso de falha). Verificação: `npm run build && npm run lint`.
- [x] `src/api/tasks/tasks.ts`: em `updateTask`, quando a tarefa tem `linked_shopping_item_id` e o `status` muda de/para `done`, sincronizar o item (grava direto em `shopping_item`, em `try/catch` que só loga) — mesmo formato do bloco que já sincroniza Recorrência Financeira. Verificação: `npm run build && npm run lint`.
- [x] `src/pages/admin/shopping/ShoppingItemRow.tsx`: botão "Criar tarefa" quando o item não tem vínculo (chama `createTaskFromShoppingItem`, toast de sucesso com o título da tarefa); quando já tem, no lugar dele um badge "Tarefa" com o `TaskIconBadge` do ícone de compras, clicável, que leva à tarefa. Verificação: `npm run build && npm run lint`.
- [x] `src/pages/admin/shopping/ShoppingList.tsx`: carregar os vínculos com uma chamada a `fetchTaskLinksForItems` após carregar os itens e repassar o mapa às linhas. Verificação: ~~aba Network do navegador~~ teste que conta as chamadas de vínculo num carregamento com muitos itens e afirma que é exatamente **1**, independentemente da quantidade de itens (navegador está fora deste fluxo, ver Notas).
- [x] Verificação fim a fim automatizada (substitui a manual, mesmo padrão de `ShoppingList.flow.test.tsx` da 050): backend falso em memória que imita o schema (inclusive `on delete set null`) — criar item → "Criar tarefa" → a tarefa existe com `icon_key: "shopping-cart"` e `linked_shopping_item_id`; concluir a tarefa e conferir que o item vira `purchased`; desmarcar o item e conferir que a tarefa volta a `todo`; excluir a tarefa e conferir que o item continua na lista, sem vínculo; excluir um item vinculado e conferir que a tarefa continua existindo, com o vínculo nulo.

- [x] **Migration aplicada no banco remoto** (2026-08-18): o usuário rodou `supabase db push` e `npx supabase migration list` mostra `20260816140000_task_shopping_item_link` com `local` == `remote` (a da 050 também). `task.linked_shopping_item_id` existe no banco real e o botão "Criar tarefa" tem coluna para escrever. Verificação: a saída do `migration list` (leitura — esta sessão nunca roda `db push`); o comportamento continua provado pelos testes citados acima, do fluxo fim a fim ao `on delete set null` em Postgres 16. Sobra só o teste de fumaça do usuário na conta real, passo dele e não trabalho de código (ver Notas).

## Prompts

- 2026-08-16 — "- ADICIONAR MÓDULO DE LISTA DE COMPRAS. EU CONTROLO EM UMA OUTRA ETAPA DENTRO DE PRODUTIVIDADE. POORÉM CONSIGO CRIAR UMA TAREFA A PARTIR DE UM ITEM NA LISTA DE COMPRAS, PARA ME COMPROMETER A COMPRÁ-LO EM UMA TAREFA DESIGNADA / - ESSA TAREFA JÁ DEVE TER O ÍCONE VINCULADO / - DENTRO DA LISTA DE COMPRAS EU POSSO CRIAR CATEGORIAS, QUE AGRUPAM OS ITENS A SEREM COMPRADOS / - POSSO CRIAR UMA CATEGORIA RELACIONADA A UM PROJETO, DE MODO QUE POSSO VER OS ITENS, POR CATEGORIAS, DE UM PROJETO EM ESPECÍFICO"

## Notas

- **Recorte do prompt-mãe que esta feature cumpre**: "CONSIGO CRIAR UMA TAREFA A PARTIR DE UM ITEM NA LISTA DE COMPRAS, PARA ME COMPROMETER A COMPRÁ-LO EM UMA TAREFA DESIGNADA" + "ESSA TAREFA JÁ DEVE TER O ÍCONE VINCULADO". É esse recorte que o item 8 do `CLAUDE.md` deve conferir no fechamento.
- Ordem de implementação: depende da **050** (tabelas `shopping_category`/`shopping_item`, página e `ShoppingItemRow`). Independente da 052 — as duas podem ser feitas em qualquer ordem depois da 050.
- "Ícone vinculado" no pedido do usuário significa "a tarefa já nasce com o ícone certo", não "o ícone é derivado do vínculo": o mecanismo real de ícone de tarefa é o par `icon_key`/`icon_url` (features `done/040` e `done/008`), e nenhum preset de compras existe hoje — daí a tarefa de acrescentá-lo.
- A migration desta feature é `20260816140000_task_shopping_item_link.sql`, distinta da 050 (`...130000...`) e da 052 (`...150000...`).
- **Migration verificada sem `supabase db push`** (2026-08-16): Postgres 16 descartável em Docker,
  com stubs de `auth.users`/`auth.uid()`/`enforce_app_access`/`personal_goal` e as migrations
  `20260803121500_tasks_projects.sql` + `20260816130000_shopping_list.sql` aplicadas antes. 8
  assertivas passaram: coluna `uuid` nullable; FK → `shopping_item(id)` com `confdeltype = 'n'`
  (`on delete set null`); índice `task_linked_shopping_item_idx`; `comment on column` presente;
  excluir o item mantém a tarefa e zera o vínculo; FK rejeita item inexistente; cascade da
  categoria apaga o item sem apagar a tarefa (vínculo vira `NULL`); RLS de `task` segue ligada com
  4 policies. Reaplicar a migration é idempotente. **Continua pendente de `supabase db push` pelo
  usuário no banco remoto** (a 050 também está).
- **Checagem de satisfação — rastreabilidade** (2026-08-16). Cada pedaço do recorte do `prompt:`
  com o artefato que o comprova:
  - "CRIAR UMA TAREFA A PARTIR DE UM ITEM NA LISTA DE COMPRAS" → botão na linha do item
    (`ShoppingItemRow.test.tsx`: "clicar em 'Criar tarefa' chama a API com o id do item…") e a
    inserção real em `task` (`shopping-task-link.test.ts`: "insere em `task` uma tarefa com o
    ícone de compras e o vínculo com o item"; fluxo fim a fim em
    `ShoppingList.task-link.flow.test.tsx`).
  - "PARA ME COMPROMETER A COMPRÁ-LO EM UMA TAREFA DESIGNADA" → título "Comprar <item>",
    relação 1:1 (com tarefa, o botão some e vira atalho) e sincronização nos dois sentidos:
    `updateTask-shopping-sync.test.ts` (tarefa → item) e `shopping-task-link.test.ts`
    (item → tarefa). Os dois foram checados por mutação: desligando cada `sync`, 5 testes
    quebram em cada direção — não passam à toa.
  - "ESSA TAREFA JÁ DEVE TER O ÍCONE VINCULADO" → `icon_key: "shopping-cart"` gravado na criação
    (`taskLink.test.ts`: "grava sempre o ícone de compras, e essa chave existe no catálogo de
    presets"), preset no grid (`TaskIconPicker.test.tsx`) e o ícone renderizado no atalho da
    linha (`ShoppingItemRow.test.tsx`, `svg[aria-label="Compra"]`).
  - Integridade do vínculo (`on delete set null`) → 8 assertivas no Postgres em Docker (nota
    acima) + o fluxo fim a fim, que confere que excluir o item ou a categoria preserva a tarefa
    com o vínculo nulo.
- **Suíte completa (2026-08-16): 836 testes passando, 2 falhando** — as 2 falhas são as mesmas
  pré-existentes e alheias registradas na 050 (`src/lib/__tests__/currency.test.ts` espera "—" e
  `src/lib/currency.ts` devolve "·"); nenhum arquivo de moeda/data foi tocado aqui. Eram 782
  passando ao fim da 050.
- ~~**A feature segue em `in-progress/`, não em `done/`**~~ (desvio próprio, mesmo motivo da 050): a
  migration ainda não foi aplicada no banco remoto — `supabase db push` só com autorização do
  usuário —, então virou a tarefa final, explicitamente aguardando. Todo o resto está verificado.
  **Resolvido em 2026-08-18** — ver o item abaixo.
- **Fechamento (2026-08-18) — a migration foi aplicada pelo usuário e a feature foi para `done/`.**
  A confirmação veio de `npx supabase migration list` (`20260816140000` com `local` == `remote`),
  **não** de teste manual: a skill `next` proíbe navegador e esta sessão nunca roda `supabase db
  push` (é passo do usuário, aplica em produção).
- **Passo remanescente, do usuário, fora do código:** o teste de fumaça na conta real — criar um
  item na Lista de Compras, clicar em "Criar tarefa", conferir o ícone de compras na tarefa e a
  sincronização de status nos dois sentidos. Não ficou como tarefa em aberto porque não há código
  a escrever: o roteiro está coberto por `ShoppingList.task-link.flow.test.tsx`,
  `shopping-task-link.test.ts` e `updateTask-shopping-sync.test.ts`.
- **Checagem de satisfação reconfirmada no fechamento (2026-08-18):** a rastreabilidade item a item
  do recorte do `prompt:` já está registrada acima e continua válida — nenhum artefato foi
  invalidado. Suíte completa reexecutada com
  `npx vitest run --testTimeout=30000 --hookTimeout=30000 --maxWorkers=4` (o `npm test` puro é
  instável nesta máquina, com timeouts de 5 s em arquivos alheios): **161 arquivos, 1427 testes,
  0 falhando**. As 2 falhas de `currency.test.ts` citadas acima foram corrigidas no commit
  `eb47042`.
- **Verificações de navegador viraram teste** (2026-08-16, desvio próprio): duas tarefas pediam
  conferência manual (aba Network em `ShoppingList.tsx`, roteiro fim a fim). Navegador está fora
  deste fluxo, então viraram asserções de código — contagem de chamadas de vínculo por
  carregamento e um teste de fluxo contra backend falso, no mesmo padrão da 050.
- **Não há rota de tarefa individual no app** (`/tasks` não aceita `?task=<id>`), então o atalho
  da linha do item leva a `/tasks` e carrega o título da tarefa no `aria-label`/`title`. Criar
  deep link para uma tarefa é mudança na página de Tarefas, fora do escopo desta feature.
- `SHOPPING_TASK_ICON_KEY` mora em `src/domain/shopping/taskLink.ts`, não em `TaskIconBadge.tsx`:
  a camada de domínio é quem grava a chave e não pode depender de um componente de UI (ver o
  padrão de camadas em `docs/stack.md`).
