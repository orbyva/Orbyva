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
- [x] **Migration aplicada no banco remoto** (2026-08-18): o usuário rodou `supabase db push` e `npx supabase migration list` mostra `20260816130000_shopping_list` com `local` == `remote`. `/shopping-list` já tem tabela pra ler. Verificação: a saída do `migration list` (leitura, não escrita — esta sessão nunca roda `db push`); o comportamento do módulo continua provado pelos 55 testes citados acima, incluindo o fluxo fim a fim. Sobra só o teste de fumaça do usuário na conta real, que é passo dele e não trabalho de código (ver Notas).

## Prompts

- 2026-08-16 — "- ADICIONAR MÓDULO DE LISTA DE COMPRAS. EU CONTROLO EM UMA OUTRA ETAPA DENTRO DE PRODUTIVIDADE. POORÉM CONSIGO CRIAR UMA TAREFA A PARTIR DE UM ITEM NA LISTA DE COMPRAS, PARA ME COMPROMETER A COMPRÁ-LO EM UMA TAREFA DESIGNADA / - ESSA TAREFA JÁ DEVE TER O ÍCONE VINCULADO / - DENTRO DA LISTA DE COMPRAS EU POSSO CRIAR CATEGORIAS, QUE AGRUPAM OS ITENS A SEREM COMPRADOS / - POSSO CRIAR UMA CATEGORIA RELACIONADA A UM PROJETO, DE MODO QUE POSSO VER OS ITENS, POR CATEGORIAS, DE UM PROJETO EM ESPECÍFICO"

## Notas

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
