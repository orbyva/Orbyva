---
prompt: |
  - ADICIONAR MÓDULO DE LISTA DE COMPRAS. EU CONTROLO EM UMA OUTRA ETAPA DENTRO DE PRODUTIVIDADE. POORÉM CONSIGO CRIAR UMA TAREFA A PARTIR DE UM ITEM NA LISTA DE COMPRAS, PARA ME COMPROMETER A COMPRÁ-LO EM UMA TAREFA DESIGNADA
    - ESSA TAREFA JÁ DEVE TER O ÍCONE VINCULADO
    - DENTRO DA LISTA DE COMPRAS EU POSSO CRIAR CATEGORIAS, QUE AGRUPAM OS ITENS A SEREM COMPRADOS
      - POSSO CRIAR UMA CATEGORIA RELACIONADA A UM PROJETO, DE MODO QUE POSSO VER OS ITENS, POR CATEGORIAS, DE UM PROJETO EM ESPECÍFICO
---

# 050 — Núcleo da Lista de Compras

## Contexto

Módulo novo dentro de Produtividade: uma lista de coisas que o usuário precisa comprar, agrupadas em categorias que ele mesmo cria. Esta feature entrega a fatia vertical completa do núcleo — migration, tipos, domínio, API e página funcional em `/shopping-list` — de modo que ao fim dela o usuário já cria categorias, cria itens dentro delas e vê a lista agrupada, marcando o que já comprou.

Fora do escopo desta feature (cada uma tem a sua): vínculo item↔tarefa (051) e categoria vinculada a projeto (052).

## Decisões

- **Fatia vertical, não por camada.** Migration + types + domain + api + página + rota + sidebar entram juntos, seguindo o precedente de `docs/features/done/001-nucleo-tarefas-projetos.md`, que entregou o núcleo de Tarefas/Projetos inteiro num arquivo só. Descartado fatiar por camada (schema numa feature, API noutra): nenhuma das fatias seria demonstrável sozinha nem fecharia pelo critério do item 8 do `CLAUDE.md`.
- **Duas tabelas, `shopping_category` e `shopping_item`**, seguindo o padrão de `supabase/migrations/20260803121500_tasks_projects.sql`: PK `uuid default gen_random_uuid()`, `user_id uuid not null references auth.users(id) on delete cascade`, `created_at`/`updated_at timestamptz`, RLS habilitada com as 4 policies (`select`/`insert`/`update`/`delete`) sempre `user_id = auth.uid()`, sem soft-delete. Descartado reaproveitar `tag` ou `project` como agrupador: categoria de compra tem ciclo de vida próprio e o usuário pediu explicitamente "criar categorias" dentro da lista.
- **`shopping_item.status` com dois valores: `pending` | `purchased`.** Descartado um terceiro estado ("crossed"/desisti): não está no pedido e um enum de status é caro de mudar depois de ter dados — melhor acrescentar um valor quando a necessidade aparecer do que carregar um estado sem uso. Item comprado continua visível na lista, riscado, e não some.
- **`shopping_item.provider_link text`** — URL do produto no fornecedor. Não está no prompt-mãe, mas está na visão original em `docs/coworking.md` (linha 4: "em que eu possa planejar a compra, por exemplo já colocar o item/link de um provider"). É um campo de texto simples, preenchido à mão; é a semente do que a extensão do Chrome vai popular depois. Descartado modelar "provider" como entidade própria (nome, logo, preço): especulativo, nada no pedido pede comparação de fornecedores.
- **`quantity numeric` + `unit text` livres**, não um enum de unidades. Descartado catálogo fechado de unidades (kg/L/un): o usuário compra coisas heterogêneas ("2 caixas", "3 m de cabo") e um enum vira atrito no formulário.
- **Sem cor de módulo nova.** A Lista de Compras é uma página dentro do grupo "Produtividade" da sidebar, como "Tarefas" e "Projetos" — ambas já usam `moduleColors.productivity` do grupo, sem token próprio. Descartado criar `moduleColors.shopping` + variáveis CSS light/dark: seria uma cor a manter sem nenhuma superfície que a use.
- **Rota `/shopping-list`**, irmã de `/tasks`, registrada em `src/routes.tsx` e adicionada a `NAV_PRODUTIVIDADE.items` em `src/components/app-sidebar.tsx` (linhas 85-94). Descartado aninhar em `/tasks/shopping-list`: a lista não é uma visão de tarefas, é um módulo próprio que apenas convive no mesmo grupo de navegação.
- **Categoria vazia é permitida** e aparece na lista com estado vazio próprio. Deletar categoria apaga seus itens em cascata (`on delete cascade`), com `ConfirmDeleteDialog` avisando quantos itens serão perdidos. Descartado bloquear a exclusão de categoria com itens: obriga o usuário a esvaziar item a item para se livrar de uma categoria que ele criou errado.

### Reabertura 2026-08-18 — item sem categoria

- **`shopping_item.shopping_category_id` passa a ser nullable; item sem categoria é um estado
  legítimo, não um erro.** Revisa a decisão original desta feature ("categoria obrigatória via
  select") pelo pedido direto do usuário. Motivo real: a categoria é uma classificação que só faz
  sentido depois que a lista existe — obrigar a criá-la antes de anotar "pilha AA" transforma um
  gesto de 3 segundos num cadastro de duas telas, e hoje a página **bloqueia** de fato o botão
  "Novo item" enquanto não houver nenhuma categoria (`disabled={categories.length === 0}`).
- **O FK continua `on delete cascade`.** Apagar uma categoria segue apagando os itens dela, com o
  mesmo `ConfirmDeleteDialog` avisando quantos serão perdidos — é decisão desta feature e o pedido
  não a toca. Descartado trocar para `on delete set null` (que jogaria os itens no grupo "Sem
  categoria" em vez de apagá-los): é uma mudança de comportamento que o usuário não pediu, muda o
  significado do aviso de exclusão que ele já conhece, e é um `alter` de uma linha se ele quiser
  depois.
- **"Sem categoria" é um grupo sintético na renderização, não uma linha na tabela.** `groupItemsByCategory`
  passa a devolver um grupo extra, **por último**, só quando existe pelo menos um item sem
  categoria. Descartado criar uma categoria real "Sem categoria" por usuário: viraria uma linha
  editável/apagável que o app teria que proteger, e recriá-la a cada conta é migration com dado.
- **O grupo sintético nunca aparece vazio** e **nunca aparece com filtro de projeto ativo**: item
  sem categoria não tem projeto (o vínculo com projeto é da categoria, decisão da 052), então ele
  não pertence a projeto nenhum. Consequência aceita e explícita: `ProjectShoppingSection` não muda.
- **No dialog, "Categoria" vira opcional com a opção "Sem categoria"**, usando um valor sentinela
  (o Radix `Select` proíbe `value=""` — mesmo truque do `ALL_PROJECTS = "__all__"` que a página já
  usa). O "Novo item" do cabeçalho passa a nascer **sem categoria**, em vez de pré-selecionar
  silenciosamente a primeira da lista como hoje; o "Adicionar item em X" de cada seção continua
  chegando com `defaultCategoryId`. Motivo: o chute silencioso arquiva o item no lugar errado sem o
  usuário perceber.
- **Categorizar depois é o caminho normal de edição**, pelo mesmo `Select` do dialog. Descartado
  arrastar item entre seções nesta rodada: a página não tem DnD e trazê-lo por isso é
  desproporcional.

## Tarefas

- [x] Migration `supabase/migrations/20260816130000_shopping_list.sql`: cria `shopping_category` (`id`, `user_id`, `name`, `description`, `color`, `created_at`, `updated_at`) e `shopping_item` (`id`, `user_id`, `shopping_category_id uuid not null references public.shopping_category(id) on delete cascade`, `title`, `description`, `quantity numeric`, `unit text`, `provider_link text`, `status text not null default 'pending' check (status in ('pending','purchased'))`, `created_at`, `updated_at`); índices `shopping_category_user_idx (user_id)`, `shopping_item_user_status_idx (user_id, status)` e `shopping_item_category_idx (shopping_category_id)`; `comment on table` nas duas; RLS + 4 policies por tabela; as duas tabelas incluídas no array de `wipe_own_data()` e no laço do trigger `trg_enforce_app_access` (copiar a forma exata de `20260803121500_tasks_projects.sql`, linhas 170-241). Verificação: `supabase db push` só depois de o usuário confirmar (ver `docs/stack.md`).
- [x] `src/types/shopping.ts`: `ShoppingItemStatus`, `ShoppingCategory`, `ShoppingItem`, `ShoppingCategoryCreateRequest`/`UpdateRequest`, `ShoppingItemCreateRequest`/`UpdateRequest`, espelhando o estilo de `src/types/tasks.ts` (campos opcionais `user_id?`, timestamps `string`, `Omit<...>` para os requests). Verificação: `npm run build`.
- [x] `src/domain/shopping/filters.ts`: `groupItemsByCategory(items, categories)` (retorna as categorias na ordem recebida, cada uma com seus itens, itens `pending` antes de `purchased`) e `countPendingByCategory(items)`. Funções puras, sem I/O. Verificação: `npm run build`.
- [x] `src/domain/shopping/__tests__/filters.test.ts`: testes Vitest de `groupItemsByCategory` (categoria sem itens aparece vazia; item de categoria inexistente é ignorado; ordenação pending→purchased) e `countPendingByCategory`. Verificação: `npm test`.
- [x] `src/api/shopping/categories.ts`: `fetchShoppingCategories()`, `createShoppingCategory()`, `updateShoppingCategory()`, `deleteShoppingCategory()` — mesmo formato de I/O de `src/api/tasks/projects.ts`. Verificação: `npm run build`.
- [x] `src/api/shopping/items.ts`: `fetchShoppingItems()`, `createShoppingItem()`, `updateShoppingItem()`, `deleteShoppingItem()`, `setShoppingItemStatus(id, status)`. Verificação: `npm run build`.
- [x] `src/pages/admin/shopping/ShoppingList.tsx`: página com `PageShell`, `TableLoadingSkeleton` durante o load, `EmptyState` quando não há categoria nenhuma, botões "Nova categoria" e "Novo item"; render agrupado por categoria usando `groupItemsByCategory`; cada categoria mostra nome, cor, contagem de pendentes e ações editar/excluir. Toda mutação com `useToast` + `getErrorMessage` (`@/lib/errors`). Verificação: `npm run build && npm run lint`.
- [x] `src/pages/admin/shopping/ShoppingCategoryDialog.tsx`: dialog de criar/editar categoria (nome obrigatório, descrição, cor). Verificação: `npm run build`.
- [x] `src/pages/admin/shopping/ShoppingItemDialog.tsx`: dialog de criar/editar item (título obrigatório, categoria obrigatória via select, quantidade, unidade, link do fornecedor, descrição). Verificação: `npm run build`.
- [x] `src/pages/admin/shopping/ShoppingItemRow.tsx`: linha do item com checkbox de comprado (alterna `pending`/`purchased` via `setShoppingItemStatus`, com update otimista e reversão no catch), título riscado quando comprado, quantidade+unidade, link do fornecedor como ícone externo quando presente, ações editar/excluir com `ConfirmDeleteDialog`. Verificação: `npm run build && npm run lint`.
- [x] Registrar a rota `/shopping-list` em `src/routes.tsx` e o item "Lista de Compras" em `NAV_PRODUTIVIDADE.items` (`src/components/app-sidebar.tsx`). Verificação: `npm run build` e navegação manual pelo menu.
- [x] Verificação fim a fim automatizada (substitui a manual, ver Notas): `src/pages/admin/shopping/__tests__/ShoppingList.flow.test.tsx` dirige a página contra um backend falso em memória que imita o schema (inclusive o cascade) — cria duas categorias, cria itens em cada uma, marca um como comprado e desmarca, edita um item, exclui uma categoria com itens (conferindo o aviso de cascata) e remonta a página refazendo os fetches, conferindo que tudo persistiu. Verificação: `npm test`.
- [x] **Migration aplicada no banco remoto** (2026-08-18, confirmada de novo em 2026-08-23): o usuário rodou `supabase db push` e `npx supabase migration list` mostra `20260816130000_shopping_list` com `local` == `remote`. `/shopping-list` já tem tabela pra ler. Verificação: a saída do `migration list` (leitura, não escrita — esta sessão nunca roda `db push`); o comportamento do módulo continua provado pelos 55 testes citados acima, incluindo o fluxo fim a fim. **O teste de fumaça na conta real não foi executado por esta sessão** — sem acesso ao banco remoto e com navegador proibido neste fluxo, ele continua sendo passo do usuário e está escrito em `## Notas` como pendência explícita. O que fecha a feature aqui é a cobertura automatizada mais a confirmação do push; não uma verificação visual que ninguém viu passar.

### Reabertura 2026-08-18 — item sem categoria

- [x] Migration `supabase/migrations/20260818140000_shopping_item_optional_category.sql`:
      `alter table public.shopping_item alter column shopping_category_id drop not null` +
      `comment on column` explicando que nulo significa "sem categoria". Nada mais — o FK e o
      `on delete cascade` ficam como estão. Verificação: harness de Postgres descartável nos moldes
      de `supabase/tests/medication/run.sh`, provando que um `insert` sem
      `shopping_category_id` passa, que o `on delete cascade` continua apagando os itens da
      categoria excluída, e que as 4 policies RLS seguem valendo para o item sem categoria.
      `supabase db push` é passo do usuário, nunca desta sessão.
- [x] `src/types/shopping.ts`: `ShoppingItem.shopping_category_id` vira `string | null` (flui
      sozinho para `ShoppingItemCreateRequest`/`UpdateRequest`, que são `Omit<...>`). Verificação:
      `npm run build` — o `tsc` aponta cada ponto do código que assumia categoria obrigatória; usar
      essa lista como roteiro das tarefas seguintes.
- [x] `src/domain/shopping/filters.ts`: `groupItemsByCategory` passa a devolver, **por último**, um
      grupo sintético "Sem categoria" com os itens de `shopping_category_id` nulo, e só quando há
      algum. `countPendingByCategory` ganha a contagem desse grupo. O comportamento de "item de
      categoria inexistente é ignorado" (item apontando para id que não veio na lista) **não** muda
      — é caso diferente de nulo. Verificação: `npm run build`.
- [x] Testes em `src/domain/shopping/__tests__/filters.test.ts`: grupo sintético só aparece com
      item nulo; vem por último; itens categorizados não vazam para ele; o teste existente "item de
      categoria inexistente é ignorado" continua valendo; `countPendingByCategory` conta os sem
      categoria; `filterCategoriesByProject` não introduz o grupo (item sem categoria não tem
      projeto). Verificação: `npm test`.
- [x] `src/pages/admin/shopping/ShoppingItemDialog.tsx`: campo "Categoria" deixa de ser obrigatório
      — `FormLabel` sem `required`, opção "Sem categoria" com valor sentinela (`"__none__"`,
      traduzido para `null` no payload), `canSave` passa a exigir só o título, e o "Novo item" do
      cabeçalho abre sem categoria pré-selecionada. Verificação: `npm run build && npm run lint`.
- [x] Atualizar `src/pages/admin/shopping/__tests__/ShoppingItemDialog.test.tsx`: o teste "sem
      categoria pré-selecionada, usa a primeira da lista" vira "sem categoria pré-selecionada,
      nasce sem categoria" (payload com `shopping_category_id: null`); casos novos — escolher uma
      categoria e salvar; editar um item sem categoria atribuindo uma; editar um item categorizado
      voltando para "Sem categoria". Verificação: `npm test`.
- [x] `src/pages/admin/shopping/ShoppingList.tsx`: remover o `disabled={categories.length === 0}` do
      botão "Novo item" e reescrever o caminho de zero categorias — `EmptyState` só quando não há
      **nem categoria nem item**, agora com as duas ações ("Nova categoria" e "Novo item"); havendo
      itens sem categoria, a lista renderiza normalmente com o grupo "Sem categoria". A seção
      sintética não tem ações de editar/excluir categoria nem "Adicionar item em…". Verificação:
      `npm run build && npm run lint`.
- [x] Atualizar `src/pages/admin/shopping/__tests__/ShoppingList.test.tsx`: o teste "sem categoria
      nenhuma, mostra o estado vazio e desabilita 'Novo item'" passa a exigir o botão **habilitado**
      e as duas ações no `EmptyState`; casos novos — item sem categoria aparece na seção "Sem
      categoria", a seção não tem botão de editar/excluir, e com `?project=p1` a seção some.
      Verificação: `npm test`.
- [x] `ShoppingItemRow`/`createTaskFromShoppingItem`: conferir o caminho "criar tarefa" a partir de
      um item sem categoria — `buildTaskDraftFromItem` já trata categoria ausente (a descrição cai
      para "Lista de Compras") e `createTaskFromShoppingItem` já guarda com `if (item.shopping_category_id)`.
      Verificação: caso novo em `src/api/shopping/__tests__/shopping-task-link.test.ts` provando que
      item sem categoria vira tarefa sem quebrar, e `src/domain/shopping/__tests__/taskLink.test.ts`
      continua verde.
- [x] Fluxo fim a fim em `src/pages/admin/shopping/__tests__/ShoppingList.flow.test.tsx` (backend
      falso em memória, mesmo arquivo de sempre): numa lista **vazia**, criar um item direto pelo
      cabeçalho sem criar categoria nenhuma; ele aparece em "Sem categoria"; marcá-lo como comprado;
      criar depois uma categoria e mover o item para ela pela edição; a seção "Sem categoria" some;
      remontar a página conferindo a persistência. É a prova literal do pedido. Verificação:
      `npm test`.
- [x] Passada final: `npm run build`, `npm run lint` e a suíte completa
      (`npx vitest run --testTimeout=30000 --hookTimeout=30000 --maxWorkers=4`). Registrar em Notas
      qualquer teste alheio ajustado.
- [x] ~~**Aguarda o usuário**: aplicar
      `supabase/migrations/20260818140000_shopping_item_optional_category.sql` no banco remoto
      (`supabase db push`)~~ — **dispensada em 2026-09-25: o efeito já está no banco.** O branch
      `feat/orb` levou a mesma mudança sob outro nome
      (`20260819090000_shopping_item_optional_category.sql`) e ela **já foi aplicada**. Conferido na
      fonte, não por suposição: `select is_nullable from information_schema.columns where
      table_name='shopping_item' and column_name='shopping_category_id'` devolve **`YES`** no banco
      real. Nenhum push é necessário; ver a nota de 2026-09-25 sobre a duplicata a reconciliar.

## Prompts

- 2026-08-16 — "- ADICIONAR MÓDULO DE LISTA DE COMPRAS. EU CONTROLO EM UMA OUTRA ETAPA DENTRO DE PRODUTIVIDADE. POORÉM CONSIGO CRIAR UMA TAREFA A PARTIR DE UM ITEM NA LISTA DE COMPRAS, PARA ME COMPROMETER A COMPRÁ-LO EM UMA TAREFA DESIGNADA / - ESSA TAREFA JÁ DEVE TER O ÍCONE VINCULADO / - DENTRO DA LISTA DE COMPRAS EU POSSO CRIAR CATEGORIAS, QUE AGRUPAM OS ITENS A SEREM COMPRADOS / - POSSO CRIAR UMA CATEGORIA RELACIONADA A UM PROJETO, DE MODO QUE POSSO VER OS ITENS, POR CATEGORIAS, DE UM PROJETO EM ESPECÍFICO"

- 2026-08-18 — "- deve ser possível criar item de compras sem criar categoria"

## Notas

- **Reaberta em 2026-08-18** (de `done/` para `in-progress/`, conforme o item 2 do `CLAUDE.md`): o
  usuário pediu "deve ser possível criar item de compras sem criar categoria", que é uma revisão
  direta de duas decisões **desta** feature — "categoria obrigatória via select" no dialog e o
  `not null` do FK na migration original. Encaixou aqui em vez de virar `NNN` novo porque todos os
  arquivos envolvidos (`shopping_item`, `filters.ts`, `ShoppingItemDialog`, `ShoppingList`) são os
  que esta feature criou. As tarefas novas estão no bloco "Reabertura 2026-08-18"; as decisões
  antigas ficam onde estão, e a revisão está registrada logo acima delas — não apagar histórico.
- **Recorte do prompt-mãe que esta feature cumpre**: "ADICIONAR MÓDULO DE LISTA DE COMPRAS ... DENTRO DE PRODUTIVIDADE" + "DENTRO DA LISTA DE COMPRAS EU POSSO CRIAR CATEGORIAS, QUE AGRUPAM OS ITENS A SEREM COMPRADOS". O critério de fechamento (item 8 do `CLAUDE.md`) é esse recorte, não o prompt inteiro — "criar tarefa a partir do item" fecha na 051 e "categoria relacionada a um projeto" fecha na 052.
- Ordem de implementação: **050 → 051 → 052**. A 051 depende das tabelas e da página desta feature; a 052 depende da tabela `shopping_category` e da página agrupada. As 051 e 052 são independentes entre si e poderiam ser feitas em qualquer ordem depois desta.
- **Migration verificada sem `supabase db push`** (2026-08-16): `db push` aplica no banco remoto e
  só o usuário autoriza, então a validação foi feita num Postgres 16 descartável em Docker, com
  stubs de `auth.users`/`auth.uid()`/`enforce_app_access`. Assertivas que passaram: as duas tabelas
  criadas com RLS ligada e 4 policies cada (todas com `auth.uid()`), os 3 índices, `comment on
  table` nas duas, `trg_enforce_app_access` nas duas, `wipe_own_data` citando ambas, `status`
  default `pending`, `check` rejeitando `'crossed'` e `on delete cascade` apagando os itens ao
  excluir a categoria. **A migration continua pendente de `supabase db push` pelo usuário no banco
  remoto.**
- **Verificação manual virou teste** (2026-08-16, desvio próprio): a última tarefa pedia um passo a
  passo manual no navegador; navegador está fora deste fluxo, então ela foi reescrita como
  `ShoppingList.flow.test.tsx` (mesmo roteiro, backend falso em memória com cascade). O que o teste
  não cobre — que o Postgres real aceita as queries — depende da migration aplicada e virou a
  tarefa final, explicitamente aguardando o usuário.
- **Rota verificada sem navegador**: `src/routes.tsx` passou a exportar `appRoutes` para que
  `shopping-navigation.test.tsx` resolva a URL `/shopping-list` com `matchRoutes` contra a árvore
  real, monte o elemento casado (renderiza o `<h1>Lista de Compras</h1>`) e confira o link da
  sidebar (`href="/shopping-list"`, ativo no grupo Produtividade). Isso adiciona 1 warning de
  `react-refresh/only-export-components` em `routes.tsx` (o projeto já convivia com 12 warnings,
  `npm run lint` segue com 0 erros).
- **Suíte completa (2026-08-16): 782 testes passando, 2 falhando** — as 2 falhas são pré-existentes
  e alheias a esta feature (`src/lib/__tests__/currency.test.ts` espera "—" e `src/lib/currency.ts`
  devolve "·" desde o commit que padronizou as datas; nenhum arquivo de moeda/data foi tocado
  aqui). Os 55 testes novos da Lista de Compras (domínio, API, 4 componentes, navegação e fluxo fim
  a fim) passam.
- Cada migration pertence a exatamente uma feature: `20260816130000_shopping_list.sql` é desta; a 051 cria a sua e a 052 a dela, com timestamps distintos (migrations nunca compartilham timestamp — ver `docs/stack.md` e as Notas de `docs/features/done/002-vinculo-tarefa-recorrencia-financeira.md`).
- **PENDÊNCIA DO USUÁRIO — teste de fumaça pós-push (2026-08-23).** A migration foi aplicada (o
  usuário rodou `supabase db push` e confirmou). O que **esta sessão não executou e não viu passar**,
  porque depende da conta real: abrir `/shopping-list` logado, criar uma categoria, criar um item
  dentro dela, marcar como comprado, desmarcar, editar o item e excluir a categoria conferindo o
  aviso de cascata ("N itens dela também serão excluídos") e que os itens somem junto. Roteiro
  idêntico ao de `ShoppingList.flow.test.tsx`, que já passa contra o backend falso — o que falta
  confirmar é só que o Postgres real aceita as mesmas queries. Se quiser conferir pelo SQL editor:
  `select to_regclass('public.shopping_category'), to_regclass('public.shopping_item');` (as duas
  não-nulas) e `select count(*) from pg_policies where schemaname='public' and tablename in
  ('shopping_category','shopping_item');` = **8**.
- **A feature foi para `done/` sem esse teste de fumaça, de propósito**: ele é conferência de
  ambiente do usuário, não implementação faltando. A pendência fica escrita acima em vez de virar
  um `- [ ]` eterno que ninguém desta esteira consegue marcar.
- **Fechamento (2026-08-18) — a migration foi aplicada pelo usuário e a feature foi para `done/`.**
  A confirmação veio de `npx supabase migration list` (`20260816130000` com `local` == `remote`),
  **não** de teste manual: a skill `next` proíbe navegador e esta sessão nunca roda `supabase db
  push` (é passo do usuário, aplica em produção).
- **Passo remanescente, do usuário, fora do código:** o teste de fumaça na conta real — abrir
  `/shopping-list`, criar uma categoria, criar um item nela, marcar como comprado. Não ficou como
  tarefa em aberto porque não há código a escrever: o roteiro inteiro já está coberto por
  `ShoppingList.flow.test.tsx` contra backend falso, e o que faltava (a tabela existir no banco
  real) está provado pelo `migration list`.
- **Checagem de satisfação refeita no fechamento (2026-08-18).** Recorte do `prompt:` → artefato:
  *"ADICIONAR MÓDULO DE LISTA DE COMPRAS ... DENTRO DE PRODUTIVIDADE"* → `shopping-navigation.test.tsx`
  (a URL `/shopping-list` resolve contra `appRoutes` de verdade e o link vive no grupo Produtividade
  da sidebar); *"DENTRO DA LISTA DE COMPRAS EU POSSO CRIAR CATEGORIAS, QUE AGRUPAM OS ITENS"* →
  `filters.test.ts` (`groupItemsByCategory`/`countPendingByCategory`), `ShoppingList.test.tsx` e o
  fluxo fim a fim `ShoppingList.flow.test.tsx` (criar duas categorias, itens em cada, comprar,
  desmarcar, editar, excluir categoria com cascata e remontar a página conferindo a persistência);
  schema/RLS/cascade → Postgres 16 descartável (nota acima) e agora aplicados no remoto. Suíte
  completa reexecutada com `npx vitest run --testTimeout=30000 --hookTimeout=30000 --maxWorkers=4`
  (o `npm test` puro é instável nesta máquina, com timeouts de 5 s em arquivos alheios):
  **161 arquivos, 1427 testes, 0 falhando** — as 2 falhas de `currency.test.ts` que as Notas antigas
  citam foram corrigidas no commit `eb47042`.
- **Reabertura 2026-08-18 — implementação (esta rodada).** Nenhum teste alheio precisou de ajuste:
  a suíte inteira passou sem tocar em nada fora de `shopping`. Desvios próprios, sem pedido do
  usuário, registrados aqui:
  - `groupItemsByCategory` ganhou um **terceiro parâmetro opcional** (`{ includeUncategorized }`)
    em vez de a página pré-filtrar os itens nulos. A regra "item sem categoria não pertence a
    projeto nenhum" é irmã de "categoria sem projeto não aparece em filtro de projeto nenhum", que
    já morava em `filterCategoriesByProject` — as duas ficam no domínio, testáveis sem React.
  - O grupo sintético é `{ category: { id: UNCATEGORIZED_GROUP_ID, name: "Sem categoria" },
    synthetic: true }`. O `synthetic: true` é o que a página lê para não desenhar editar/excluir/
    "Adicionar item em…"; o id sentinela (`"__uncategorized__"`) é também a chave que
    `countPendingByCategory` usa, então o cabeçalho lê a contagem pelo mesmo caminho das
    categorias reais.
  - O `EmptyState` da página mudou de título: **"Nenhuma categoria ainda" → "Sua lista está
    vazia"**, com as duas ações. O texto antigo descrevia a condição antiga
    (`categories.length === 0`); a condição agora é "nem categoria nem item", e manter o título
    velho mentiria para quem tem itens sem categoria. Dois testes que casavam o texto antigo foram
    atualizados (`ShoppingList.test.tsx`, `ShoppingList.flow.test.tsx`).
- **Migration da reabertura verificada sem `supabase db push`** (2026-08-18): harness novo em
  `supabase/tests/shopping_item_optional_category/`, nos moldes de `supabase/tests/event_task_link/`
  — Postgres 16 descartável em Docker, com a **própria migration da 050** como estado pré (não um
  stub à mão) e um item categorizado gravado antes do `alter`. Assertivas que passaram, na ordem em
  que o `run.sh` as executa: (1) controle positivo — antes, a coluna era `NOT NULL` e o insert sem
  categoria estourava `not_null_violation`; (2) depois, `is_nullable = 'YES'`, o item sem categoria
  entra, a linha legada sobrevive, o FK segue com `on delete cascade` (e segue barrando categoria
  inexistente), o `check` de status continua recusando `'crossed'`, os dois índices e a trigger
  `trg_enforce_app_access` continuam de pé e o `comment on column` documenta o novo significado do
  nulo — tudo isso **duas vezes**, com a migration reaplicada no meio (idempotência); (3) RLS — o
  dono vê/categoriza/descategoriza/apaga o próprio item sem categoria, outro usuário não o vê nem o
  alcança por update/delete, forjar `user_id` é barrado pelo `with check`, e `wipe_own_data` leva o
  item sem categoria junto sem tocar no de outro usuário. **A migration continua pendente de
  `supabase db push` pelo usuário no banco remoto** — é a última tarefa em aberto.
- **Jev indisponível nesta rodada**: `~/.claude/skills/jev/bin/jev ask task-verified` devolveu
  `JEV INDISPONÍVEL — TYPESAFE_API_KEY ausente no ambiente` (exit 3) com o fallback "vale a regra
  escrita da skill `next`". Os portões `task-verified` e `feature-satisfied` valeram pela regra
  escrita, como a própria skill manda.
- **Suíte completa (2026-08-18, reabertura): 162 arquivos, 1467 testes, 0 falhando**
  (`npx vitest run --testTimeout=30000 --hookTimeout=30000 --maxWorkers=4`). `npm run build` e
  `npm run lint` passaram (lint com 0 erros e 18 warnings de `react-refresh/only-export-components`,
  todos pré-existentes e nenhum em arquivo de `shopping`).
- **`## Como testar` não existia neste arquivo** (feature anterior ao campo) e foi escrita agora, na
  reabertura, cobrindo a feature inteira — núcleo da 050 e o item sem categoria.

## Como testar

Roteiro para **outra pessoa** avaliar o que foi entregue. Chrome/automação de navegador não entra
na implementação nem na verificação deste projeto: a parte automatizada abaixo é a prova, e a parte
manual é o teste de fumaça do usuário na conta real.

### 1. Pré-requisitos

- Node instalado e `npm install` já rodado na raiz do repositório.
- **Docker rodando** — só para o harness de Postgres (`supabase/tests/.../run.sh`). Sem Docker,
  pule o último comando da seção 2; os demais não dependem dele.
- **Migration pendente**: `supabase/migrations/20260818140000_shopping_item_optional_category.sql`
  ainda **não** foi aplicada no banco remoto. A verificação manual (seção 3) só funciona depois de
  o usuário rodar `supabase db push` — é a última tarefa em aberto desta feature. Até lá, criar um
  item sem categoria pela tela falha na inserção (a UI já libera, o banco ainda recusa).
- Para a parte manual: estar logado no app com uma conta com acesso liberado (gate Pro), em
  `/shopping-list`.

### 2. Verificação automatizada

Rode da raiz do repositório, um comando por linha:

```
npm run build
npm run lint
npx vitest run src/domain/shopping/__tests__/filters.test.ts
npx vitest run src/pages/admin/shopping/__tests__/ShoppingItemDialog.test.tsx
npx vitest run src/pages/admin/shopping/__tests__/ShoppingList.test.tsx
npx vitest run src/pages/admin/shopping/__tests__/ShoppingList.flow.test.tsx
npx vitest run src/api/shopping/__tests__/shopping-task-link.test.ts
npx vitest run --testTimeout=30000 --hookTimeout=30000 --maxWorkers=4
bash supabase/tests/shopping_item_optional_category/run.sh
```

O que "passou" significa em cada um:

1. `npm run build` — `tsc -b && vite build` sem erro. Prova que `ShoppingItem.shopping_category_id`
   virou `string | null` sem deixar nenhum ponto do código assumindo categoria obrigatória.
2. `npm run lint` — **0 erros**. Os 18 warnings de `react-refresh/only-export-components` são
   pré-existentes e nenhum está em arquivo de `shopping`.
3. `filters.test.ts` — **27 testes**. Cobre o grupo sintético "Sem categoria": só aparece com item
   nulo, vem por último, itens categorizados não vazam para ele, "item de categoria inexistente"
   continua sendo ignorado (é caso diferente de nulo), `includeUncategorized: false` o suprime, e
   `countPendingByCategory` conta os nulos sob a chave do grupo.
4. `ShoppingItemDialog.test.tsx` — **10 testes**. "Novo item" sem `defaultCategoryId` nasce com
   `shopping_category_id: null`; dá para escolher categoria antes de salvar; editar item sem
   categoria atribuindo uma manda o id; editar item categorizado escolhendo "Sem categoria" manda
   `null`.
5. `ShoppingList.test.tsx` — **22 testes**. Estado vazio só sem categoria **e** sem item, com as
   duas ações e "Novo item" habilitado; a seção "Sem categoria" aparece por último e sem botões de
   editar/excluir/adicionar; some com `?project=p1`; o "Novo item" do cabeçalho abre o dialog em
   "Sem categoria".
6. `ShoppingList.flow.test.tsx` — **2 testes** contra um backend falso em memória que imita o
   schema (inclusive o cascade). O segundo é a prova literal do pedido: lista vazia → item pelo
   cabeçalho sem categoria nenhuma → aparece em "Sem categoria" → comprado → categoria criada
   depois → item movido pela edição → a seção some → remonta a página e tudo persistiu.
7. `shopping-task-link.test.ts` — **18 testes**, incluindo "item SEM categoria vira tarefa sem
   consultar `shopping_category`" (descrição cai para "Lista de Compras", sem `undefined`).
8. Suíte completa — **162 arquivos, 1467 testes, 0 falhando**. (`npm test` puro é instável nesta
   máquina, com timeouts de 5 s em arquivos alheios; use a linha com os timeouts.)
9. `run.sh` do harness — imprime, no fim,
   `OK: 20260818140000_shopping_item_optional_category.sql validada em Postgres 16.` e sai com 0.
   Antes disso imprime `NOTICE` de `OK` para o controle pré-migration, para o de schema (duas
   vezes, a migration é reaplicada) e para o de RLS. Qualquer `FALHOU: …` aborta com exit ≠ 0.

### 3. Verificação manual, passo a passo

**Só depois de `supabase db push`.** Todos os passos em `/shopping-list`, logado.

1. Com a lista completamente vazia (nenhuma categoria, nenhum item): a tela mostra "Sua lista está
   vazia" com dois botões, "Nova categoria" e "Novo item". Esperado: **os dois clicáveis** — o
   "Novo item" não pode estar cinza/desabilitado.
2. Clique em "Novo item" (o do cabeçalho). Esperado: o dialog abre com o campo **Categoria** exibindo
   "Sem categoria" e marcado como "(opcional)" — não pré-selecionando nenhuma categoria existente.
3. Digite só o título ("Pilha AA") e salve. Esperado: toast "Item salvo!" e o item aparece numa
   seção chamada **Sem categoria**, no fim da lista, com o texto "Itens anotados sem categoria.
   Edite um item para movê-lo para uma categoria." e o badge "1 pendente".
4. Na seção "Sem categoria", confira que **não existem** os botões de editar categoria, excluir
   categoria nem "Adicionar item em…" — só as ações do próprio item (comprar, criar tarefa, editar,
   excluir).
5. Marque o checkbox do item. Esperado: o título fica riscado, o badge da seção vira "0 pendentes",
   e o item **continua na lista**.
6. Crie uma categoria ("Casa") pelo botão "Nova categoria". Esperado: a seção "Casa" aparece antes
   de "Sem categoria" — o grupo sintético é sempre o último.
7. Clique em editar no item "Pilha AA", troque Categoria de "Sem categoria" para "Casa" e salve.
   Esperado: o item passa para a seção "Casa" e a seção "Sem categoria" **desaparece** (ela nunca
   aparece vazia).
8. Edite o item de novo e escolha "Sem categoria". Esperado: o item volta para a seção sintética,
   que reaparece no fim.
9. Recarregue a página (F5). Esperado: o item continua onde estava — o estado veio do banco, não da
   tela.

### 4. Casos de borda e caminhos negativos

- **Filtro de projeto ativo** (`/shopping-list?project=<id>` ou o select "Filtrar por projeto"):
  a seção "Sem categoria" **não aparece**, mesmo havendo itens sem categoria. O vínculo com projeto
  é da categoria (feature 052), então item sem categoria não pertence a projeto nenhum. Esperado:
  só as categorias daquele projeto.
- **Projeto sem categoria nenhuma vinculada**: continua mostrando "Nenhuma categoria neste projeto"
  (esse estado vazio não mudou), e não o "Sua lista está vazia".
- **Título em branco**: o botão "Criar item"/"Salvar alterações" fica desabilitado. Categoria vazia
  **não** bloqueia mais — só o título prende.
- **Criar tarefa a partir de um item sem categoria** (botão "Criar tarefa para X"): funciona. A
  tarefa nasce "Comprar X", com o ícone de compras, e a descrição diz só "Lista de Compras" (sem
  nome de categoria e sem `undefined`).
- **Excluir uma categoria com itens**: o aviso de cascata continua igual ("N itens dela também serão
  excluídos") e os itens dela somem junto. Itens **sem** categoria não são afetados por exclusão de
  categoria nenhuma.
- **Item de outro usuário**: invisível e inalcançável — as 4 policies valem igual para o item sem
  categoria (provado em `04_assert_rls.sql`).

### 5. Sinais de que quebrou

- Toast vermelho "Não foi possível salvar o item." ao criar item sem categoria, com mensagem de
  `null value in column "shopping_category_id" violates not-null constraint`: a **migration não foi
  aplicada** no banco remoto. Não é bug de código — é a tarefa em aberto.
- Botão "Novo item" cinza com a lista vazia: o `disabled={categories.length === 0}` voltou.
- Item sem categoria **sumindo** da tela (gravou mas não aparece): `groupItemsByCategory` deixou de
  montar o grupo sintético, ou a página está passando `includeUncategorized: false` sem filtro de
  projeto ativo.
- Seção "Sem categoria" aparecendo **vazia**, ou aparecendo **com filtro de projeto ativo**: as duas
  são regressões explícitas — o grupo só existe com pelo menos um item nulo e nunca sob filtro.
- Seção "Sem categoria" com botão de excluir/editar categoria: o `synthetic` deixou de ser lido pela
  página; clicar levaria a um `delete` num id que não existe em `shopping_category`.
- "Novo item" do cabeçalho abrindo já com a primeira categoria selecionada: voltou o chute
  silencioso que arquiva o item no lugar errado.
- Contagem de pendentes da seção "Sem categoria" sempre em 0: `countPendingByCategory` deixou de
  usar `UNCATEGORIZED_GROUP_ID` como chave dos itens nulos.

- 2026-09-25 — **A migration desta feature virou duplicata, e isso precisa ser reconciliado no
  merge.** O branch `feat/orb` implementou a mesma mudança sob outro nome e outro timestamp:

  | branch | arquivo | estado no banco |
  |---|---|---|
  | `worktree-pipeline-agenda` (este) | `20260818140000_shopping_item_optional_category.sql` | nunca aplicada |
  | `feat/orb` | `20260819090000_shopping_item_optional_category.sql` | **aplicada** |

  O efeito no banco é o mesmo e está confirmado por consulta (`is_nullable = YES`), então a feature
  está satisfeita — mas ao integrar os dois branches vão coexistir duas migrations `drop not null`
  sobre a mesma coluna. As duas são idempotentes (`alter column ... drop not null` não falha em
  coluna já nullable), então não quebram; o problema é de bookkeeping: a deste worktree tem
  timestamp **anterior** a 16 migrations já aplicadas no remoto, e o CLI a veria como "pendente do
  passado" — exatamente o bug que a CLAUDE.md registra. **Na integração, apagar a daqui e ficar com
  a do `feat/orb`** é o caminho limpo; é decisão do usuário, não da esteira, por isso fica escrito
  aqui em vez de executado.
