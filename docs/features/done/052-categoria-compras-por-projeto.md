---
prompt: |
  - ADICIONAR MÓDULO DE LISTA DE COMPRAS. EU CONTROLO EM UMA OUTRA ETAPA DENTRO DE PRODUTIVIDADE. POORÉM CONSIGO CRIAR UMA TAREFA A PARTIR DE UM ITEM NA LISTA DE COMPRAS, PARA ME COMPROMETER A COMPRÁ-LO EM UMA TAREFA DESIGNADA
    - ESSA TAREFA JÁ DEVE TER O ÍCONE VINCULADO
    - DENTRO DA LISTA DE COMPRAS EU POSSO CRIAR CATEGORIAS, QUE AGRUPAM OS ITENS A SEREM COMPRADOS
      - POSSO CRIAR UMA CATEGORIA RELACIONADA A UM PROJETO, DE MODO QUE POSSO VER OS ITENS, POR CATEGORIAS, DE UM PROJETO EM ESPECÍFICO
---

# 052 — Categoria de compras vinculada a Projeto

## Contexto

Alguns projetos exigem compras ("obra da casa", "setup do estúdio"). Esta feature permite marcar uma categoria de compras como pertencente a um projeto e, a partir disso, ver **os itens de um projeto específico, ainda agrupados por categoria** — tanto filtrando na própria Lista de Compras quanto entrando pela página do projeto.

Depende da 050 (tabela `shopping_category` e página agrupada). Independente da 051.

## Decisões

- **`shopping_category.project_id uuid references public.project(id) on delete set null`**, nullable. Categoria sem projeto é uma categoria comum da casa ("Mercado"); com projeto, é uma categoria daquele projeto. Descartado tornar obrigatório: a maior parte das compras do usuário não pertence a projeto nenhum, e obrigar a escolher um projeto quebraria o fluxo da 050.
- **`on delete set null`, não `cascade`.** Apagar o projeto não pode apagar a lista de compras dele — as coisas que o usuário precisa comprar continuam existindo no mundo real. A categoria simplesmente deixa de estar vinculada e volta a aparecer entre as categorias sem projeto. É a mesma escolha já feita para `task.project_id` (`supabase/migrations/20260805130000_task_project_delete_set_null.sql`).
- **O vínculo é da categoria, nunca do item.** O item herda o projeto pela categoria em que está. Descartado permitir `project_id` também no item: criaria o caso "item de projeto A dentro de categoria de projeto B", sem resposta boa para em qual projeto ele aparece.
- **Filtro por projeto na Lista de Compras preserva o agrupamento por categoria.** Ao escolher um projeto no filtro, a página continua sendo a mesma lista agrupada — só passa a mostrar apenas as categorias daquele projeto. É a leitura literal do pedido ("ver os itens, por categorias, de um projeto em específico"); descartado exibir os itens do projeto numa lista plana, que perderia exatamente o agrupamento pedido.
- **Ponto de entrada também em `src/pages/admin/tasks/ProjectDetail.tsx`**: uma seção "Compras do projeto" que reusa o mesmo componente de lista agrupada da 050, restrito às categorias daquele projeto, com link para a Lista de Compras já filtrada. Descartado duplicar a UI de lista dentro da página de projeto: seria uma segunda implementação do mesmo agrupamento para manter em sincronia.
- **O filtro entra na URL (`/shopping-list?project=<id>`)**, para que o link vindo da página do projeto abra a lista já filtrada e o estado sobreviva ao refresh. Descartado guardar o filtro só em `useState`: o link a partir do projeto é o principal caminho de entrada e precisa carregar já filtrado.
- **Categoria com projeto mostra o nome do projeto no cabeçalho**, na lista não filtrada, para o usuário saber de onde ela vem sem abrir o formulário.

## Tarefas

- [x] Migration `supabase/migrations/20260816150000_shopping_category_project.sql`: `alter table public.shopping_category add column if not exists project_id uuid references public.project(id) on delete set null`; índice `shopping_category_project_idx on public.shopping_category (project_id)`; `comment on column`. Verificação: `supabase db push` só após confirmação do usuário.
- [x] `src/types/shopping.ts`: acrescentar `project_id?: string | null` a `ShoppingCategory` e ao `ShoppingCategoryCreateRequest`. Verificação: `npm run build`.
- [x] `src/pages/admin/shopping/ShoppingCategoryDialog.tsx`: campo "Projeto" (opcional, com opção "Nenhum") reusando o `ProjectPicker` de `src/pages/admin/tasks/ProjectPicker.tsx`. Verificação: `npm run build && npm run lint`.
- [x] `src/domain/shopping/filters.ts`: `filterCategoriesByProject(categories, projectId)` — pura, retorna todas as categorias quando `projectId` é nulo. Verificação: `npm run build`.
- [x] `src/domain/shopping/__tests__/filters.test.ts`: testes Vitest de `filterCategoriesByProject` (sem filtro devolve tudo; com filtro devolve só as do projeto; categoria sem projeto não aparece em filtro nenhum). Verificação: `npm test`.
- [x] `src/api/shopping/categories.ts`: `fetchShoppingCategories({ projectId })` aceitando o filtro opcional no `select`. Verificação: `npm run build`.
- [x] `src/pages/admin/shopping/ShoppingList.tsx`: seletor "Projeto" no cabeçalho da página, sincronizado com o query param `?project=<id>` (ler no mount, escrever ao trocar); com filtro ativo, a lista continua agrupada por categoria e mostra o nome do projeto no cabeçalho da página. Verificação: `tsc -b` e `eslint` limpos; `ShoppingList.test.tsx` passa renderizando em `MemoryRouter` com `initialEntries={["/shopping-list?project=p1"]}`, provando que a URL já abre filtrada; o agrupamento é preservado porque o filtro só encurta a lista de categorias passada a `groupItemsByCategory`.
- [x] `src/pages/admin/shopping/ShoppingList.tsx`: no cabeçalho de cada categoria vinculada, exibir o nome do projeto quando a lista **não** está filtrada. Verificação: 2 testes novos em `ShoppingList.test.tsx` — sem filtro, a seção "Mercado" (vinculada) mostra "Obra da casa" e a seção "Escritório" (sem projeto) não; com `?project=p1`, o nome sai da seção e fica só no cabeçalho da página. 17 testes do arquivo passando.
- [x] `src/pages/admin/tasks/ProjectDetail.tsx`: seção "Compras do projeto" com as categorias daquele projeto e seus itens (mesmo componente de lista agrupada da 050), `EmptyState` quando não há nenhuma, e link "Ver na Lista de Compras" apontando para `/shopping-list?project=<id>`. Verificação: `tsc -b` e `eslint` limpos; 4 testes em `src/pages/admin/shopping/__tests__/ProjectShoppingSection.test.tsx` — o recorte por projeto é pedido ao backend (`fetchShoppingCategories({ projectId })`, não filtragem no cliente), itens de categoria alheia não aparecem, contagem de pendentes por categoria confere, `EmptyState` sem categoria vinculada, `href` do link é `/shopping-list?project=p42`, e erro de carregamento vira toast destrutivo sem derrubar a página do projeto.
- [x] Verificação do pedido literal ("ver os itens, por categorias, de um projeto em específico") — feita **por teste, não no navegador** (a skill `next` proíbe browser): `src/pages/admin/shopping/__tests__/ShoppingList.project-filter.flow.test.tsx`, 6 testes contra um backend falso em memória que imita o schema, inclusive o `on delete set null` do projeto. Cobre o roteiro inteiro: duas categorias em projetos diferentes e uma sem projeto, com itens em cada; filtrar mostra **só** as categorias do projeto, **ainda como seções agrupadas** (não uma lista achatada); abrir `/shopping-list?project=p1` direto na URL já carrega filtrado; categoria sem projeto não aparece em filtro nenhum; a seção da página do projeto mostra o mesmo conteúdo; e excluir o projeto preserva categoria e itens, que voltam a aparecer entre as sem projeto e somem do filtro daquele projeto. Suíte completa: 859 passando, 2 falhando (as duas pré-existentes de `currency.test.ts`, alheias). `npm run build` e `npm run lint` limpos (0 erros, 13 warnings pré-existentes).
      Roteiro original, mantido como referência do que foi coberto: criar duas categorias em projetos diferentes e uma sem projeto, com itens em cada; filtrar a Lista de Compras por um projeto e confirmar que aparecem **só** as categorias dele, ainda agrupadas, com seus itens; abrir `/shopping-list?project=<id>` direto na URL e confirmar que já carrega filtrado; abrir a página do projeto e confirmar a seção "Compras do projeto" com o mesmo conteúdo; excluir o projeto e confirmar que a categoria sobrevive, sem vínculo, entre as categorias sem projeto.

- [x] **Migration aplicada no banco remoto** (2026-08-18): o usuário rodou `supabase db push` e `npx supabase migration list` mostra `20260816150000_shopping_category_project` com `local` == `remote` (as da 050 e 051 também). `shopping_category.project_id` existe no banco real e o filtro por projeto tem coluna para ler. Verificação: a saída do `migration list` (leitura — esta sessão nunca roda `db push`); o comportamento continua provado pelos 6 testes de `ShoppingList.project-filter.flow.test.tsx` e pelas 8 assertivas em Postgres 16. Sobra só o teste de fumaça do usuário na conta real, passo dele e não trabalho de código (ver Notas).

## Prompts

- 2026-08-16 — "- ADICIONAR MÓDULO DE LISTA DE COMPRAS. EU CONTROLO EM UMA OUTRA ETAPA DENTRO DE PRODUTIVIDADE. POORÉM CONSIGO CRIAR UMA TAREFA A PARTIR DE UM ITEM NA LISTA DE COMPRAS, PARA ME COMPROMETER A COMPRÁ-LO EM UMA TAREFA DESIGNADA / - ESSA TAREFA JÁ DEVE TER O ÍCONE VINCULADO / - DENTRO DA LISTA DE COMPRAS EU POSSO CRIAR CATEGORIAS, QUE AGRUPAM OS ITENS A SEREM COMPRADOS / - POSSO CRIAR UMA CATEGORIA RELACIONADA A UM PROJETO, DE MODO QUE POSSO VER OS ITENS, POR CATEGORIAS, DE UM PROJETO EM ESPECÍFICO"

## Notas

- **Recorte do prompt-mãe que esta feature cumpre**: "POSSO CRIAR UMA CATEGORIA RELACIONADA A UM PROJETO, DE MODO QUE POSSO VER OS ITENS, POR CATEGORIAS, DE UM PROJETO EM ESPECÍFICO". É esse recorte que o item 8 do `CLAUDE.md` deve conferir no fechamento — e a última tarefa da lista é exatamente a verificação dele.
- Ordem de implementação: depende da **050**. Independente da **051** — as duas podem ser feitas em qualquer ordem depois da 050.
- A migration desta feature é `20260816150000_shopping_category_project.sql`, distinta da 050 (`...130000...`) e da 051 (`...140000...`).
- **Migration verificada sem `supabase db push`** (2026-08-16, mesmo método da 050/051): Postgres 16
  descartável em Docker, com stubs de `auth.users`/`auth.uid()`/`enforce_app_access`/`personal_goal`
  e as migrations `20260803121500_tasks_projects.sql`, `20260805130000_task_project_delete_set_null.sql`,
  `20260816130000_shopping_list.sql` e `20260816140000_task_shopping_item_link.sql` aplicadas antes.
  8 assertivas passaram: coluna `project_id` `uuid` nullable; FK → `project(id)` com
  `confdeltype = 'n'` (`on delete set null`); índice `shopping_category_project_idx`;
  `comment on column` presente; RLS de `shopping_category` segue ligada com 4 policies; excluir o
  projeto zera o vínculo e preserva categoria **e** itens; FK rejeita projeto inexistente;
  categoria sem projeto continua válida. Reaplicar a migration é idempotente. **Continua pendente
  de `supabase db push` pelo usuário no banco remoto** (as da 050 e 051 também estão) — daí a
  tarefa final explícita.
- **Desvio do plano — a seção "Compras do projeto" não reusa o componente de lista da 050.** A
  tarefa dizia "mesmo componente de lista agrupada da 050", mas a 050 nunca extraiu esse
  componente: a lista é renderizada inline dentro de `ShoppingList.tsx`, e a linha reusável
  (`ShoppingItemRow`) exige `onEdit`/`onDelete`/`onStatusChange` — reusá-la arrastaria os dois
  dialogs de edição e a máquina de status inteira para dentro de `ProjectDetail.tsx`. Optei por um
  componente próprio, `ProjectShoppingSection.tsx`, **somente-leitura**, que reusa o que de fato
  importa para não divergir: a função de domínio `groupItemsByCategory`, a mesma que a Lista de
  Compras usa (mesmo critério de agrupamento e mesma ordem, pendentes antes de comprados). Editar,
  excluir e criar tarefa continuam existindo num lugar só — a Lista de Compras —, para onde o link
  da seção leva já filtrado. Extrair um componente de lista compartilhado só se justifica quando
  houver um terceiro lugar que precise dele.
- **A seção fica fora das abas** do `ProjectDetail`, de propósito: as abas (Kanban/Lista/Gantt)
  alternam entre visões das *tarefas* do projeto, e compras não é uma quarta visão de tarefa — é
  outra entidade ligada ao projeto, que deve seguir visível independentemente da aba escolhida.
  - **Revisto pela feature 071 (2026-09-25), a pedido do usuário.** O que essa decisão protegia
    (visibilidade constante) custava a altura da tela: com a seção de compras e a de notas
    empilhadas abaixo das abas, as tarefas saíam da dobra — "preciso do espaço para poder
    visualizar as tarefas". `ProjectShoppingSection` passou a ser a **aba "Compras"**
    (`?tab=compras`), ao lado de "Notas", e só é montada/buscada quando o usuário abre a aba. O
    componente em si não mudou. Ver `docs/features/done/071-projeto-compras-e-notas-em-abas.md`.
- **Fechamento (2026-08-18) — a migration foi aplicada pelo usuário e a feature foi para `done/`.**
  A confirmação veio de `npx supabase migration list` (`20260816150000` com `local` == `remote`),
  **não** de teste manual: a skill `next` proíbe navegador e esta sessão nunca roda `supabase db
  push` (é passo do usuário, aplica em produção).
- **Passo remanescente, do usuário, fora do código:** o teste de fumaça na conta real — criar uma
  categoria vinculada a um projeto, filtrar `/shopping-list?project=<id>` e conferir a seção
  "Compras do projeto" na página do projeto. Não ficou como tarefa em aberto porque não há código
  a escrever: o roteiro inteiro está coberto por `ShoppingList.project-filter.flow.test.tsx` e
  `ProjectShoppingSection.test.tsx`.
- **Checagem de satisfação no fechamento (2026-08-18).** Recorte do `prompt:` → artefato: *"POSSO
  CRIAR UMA CATEGORIA RELACIONADA A UM PROJETO"* → `ShoppingCategoryDialog` com `ProjectPicker` +
  a coluna `project_id` validada em Postgres 16 e agora aplicada no remoto; *"DE MODO QUE POSSO VER
  OS ITENS, POR CATEGORIAS, DE UM PROJETO EM ESPECÍFICO"* → `ShoppingList.project-filter.flow.test.tsx`
  (filtro mostra **só** as categorias do projeto e **ainda como seções agrupadas**, a URL abre
  filtrada, categoria sem projeto some do filtro) e `ProjectShoppingSection.test.tsx` (o recorte
  vem do backend, não do cliente). Suíte completa reexecutada com
  `npx vitest run --testTimeout=30000 --hookTimeout=30000 --maxWorkers=4`: **161 arquivos, 1427
  testes, 0 falhando**.
- **Recuperação de falhas de agente** (2026-08-17): a implementação desta feature sofreu 4 quedas
  de infraestrutura (3 erros de API, 1 watchdog de inatividade). As tarefas de migration, tipos,
  domínio, API e dialog foram entregues por agente; as três últimas (filtro na página, nome do
  projeto no cabeçalho da categoria e seção no `ProjectDetail`) foram concluídas diretamente pelo
  orquestrador. Uma queda deixou o build quebrado (`ShoppingCategoryDialog` passou a exigir a prop
  `projects` antes de `ShoppingList.tsx` passá-la) e outra deixou `ShoppingList.flow.test.tsx`
  quebrando, porque a página passou a usar `useSearchParams` e o teste renderizava sem Router —
  ambos corrigidos.
