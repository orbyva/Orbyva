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
- [ ] `src/domain/shopping/filters.ts`: `filterCategoriesByProject(categories, projectId)` — pura, retorna todas as categorias quando `projectId` é nulo. Verificação: `npm run build`.
- [ ] `src/domain/shopping/__tests__/filters.test.ts`: testes Vitest de `filterCategoriesByProject` (sem filtro devolve tudo; com filtro devolve só as do projeto; categoria sem projeto não aparece em filtro nenhum). Verificação: `npm test`.
- [ ] `src/api/shopping/categories.ts`: `fetchShoppingCategories({ projectId })` aceitando o filtro opcional no `select`. Verificação: `npm run build`.
- [ ] `src/pages/admin/shopping/ShoppingList.tsx`: seletor "Projeto" no cabeçalho da página, sincronizado com o query param `?project=<id>` (ler no mount, escrever ao trocar); com filtro ativo, a lista continua agrupada por categoria e mostra o nome do projeto no cabeçalho da página. Verificação: `npm run build && npm run lint`.
- [ ] `src/pages/admin/shopping/ShoppingList.tsx`: no cabeçalho de cada categoria vinculada, exibir o nome do projeto quando a lista **não** está filtrada. Verificação: `npm run build`.
- [ ] `src/pages/admin/tasks/ProjectDetail.tsx`: seção "Compras do projeto" com as categorias daquele projeto e seus itens (mesmo componente de lista agrupada da 050), `EmptyState` quando não há nenhuma, e link "Ver na Lista de Compras" apontando para `/shopping-list?project=<id>`. Verificação: `npm run build && npm run lint`.
- [ ] Verificação manual do pedido literal ("ver os itens, por categorias, de um projeto em específico"): criar duas categorias em projetos diferentes e uma sem projeto, com itens em cada; filtrar a Lista de Compras por um projeto e confirmar que aparecem **só** as categorias dele, ainda agrupadas, com seus itens; abrir `/shopping-list?project=<id>` direto na URL e confirmar que já carrega filtrado; abrir a página do projeto e confirmar a seção "Compras do projeto" com o mesmo conteúdo; excluir o projeto e confirmar que a categoria sobrevive, sem vínculo, entre as categorias sem projeto.

- [ ] **Aguarda o usuário**: aplicar `supabase/migrations/20260816150000_shopping_category_project.sql` no banco remoto (`supabase db push`), junto com as da 050 e da 051. Até lá `shopping_category.project_id` não existe no banco real e o filtro por projeto falha. Depois de aplicada, um teste de fumaça na conta real fecha a feature.

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
