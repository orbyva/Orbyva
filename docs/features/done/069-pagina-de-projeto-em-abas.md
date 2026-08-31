---
prompt: |
  - na visualização de um projeto, não coloque as compras ou as notas do projeto dessa maneira, pode ser abas separadas. preciso do espaço para poder visualizar as tarefas
---

# 069 — Página de projeto: compras e notas viram abas

## Contexto

`ProjectDetail.tsx` empilha, na vertical, as abas de tarefa (Kanban / Lista / Gantt) e, logo abaixo delas, a seção "Compras do projeto" e a seção "Notas do projeto". As duas foram postas fora das abas de propósito — está escrito no código e nas Notas da 052 —, com o argumento de que compras e nota não são "uma quarta visão de tarefa". O argumento é bom em teoria e ruim na tela: numa página cujo assunto principal é o quadro de tarefas, elas comem o espaço vertical do quadro e empurram as tarefas para cima do dobrão. O usuário pediu o contrário, explicitamente, e o pedido é a fonte da verdade.

De quebra, hoje as duas seções disparam três requisições (`fetchShoppingCategories`, `fetchShoppingItems`, `fetchNotes`) em **toda** abertura de projeto, mesmo quando ninguém olha para elas.

## Decisões

- **Uma única `TabsList` com cinco abas: Kanban | Lista | Gantt | Compras | Notas.** Descartado empilhar dois grupos de abas (um para visões de tarefa, outro para entidades ligadas): dobra a altura do cabeçalho, que é exatamente o espaço que o pedido quer devolver às tarefas.
- **Isto revoga, por pedido do usuário, a decisão da 052/055 de manter as seções fora das abas.** O comentário no código que justifica a escolha antiga é reescrito para apontar para esta feature — comentário obsoleto que contradiz o código é pior que comentário nenhum.
- **As abas de Compras e Notas mostram contagem** ("Compras (7)", "Notas (2)"), no padrão que `TripDetail` já usa. Sem isso, "sair da tela" vira "deixar de existir": o usuário perde o único sinal de que aquele projeto tem lista de compras. As contagens vêm de duas queries `head: true` com `count: "exact"` no mesmo `Promise.all` que já carrega o projeto — contam sem trazer linha nenhuma.
- **O conteúdo de cada aba só monta quando a aba é aberta** (comportamento padrão do `TabsContent` do Radix). Além do ganho óbvio, é o que torna as três requisições de compras/notas sob demanda em vez de obrigatórias — a página de projeto fica mais leve do que é hoje, não mais pesada.
- **A aba ativa vai para a URL (`?tab=`), com escrita de volta ao trocar de aba**, reusando o idioma que `ShoppingList.tsx` já estabeleceu (`setSearchParams(next, { replace: true })`). Motivos: voltar da Lista de Compras para o projeto deve cair na aba de compras; recarregar não pode jogar o usuário de volta no Kanban; e o pedido "preciso do espaço" implica que o usuário vai viver na aba de tarefa que escolher. Valor inválido ou ausente cai em `kanban` sem quebrar. Descartado `localStorage`: nenhum estado de aba do app usa isso hoje, e a URL é compartilhável.
- **A `TabsList` fica visível desde o primeiro instante**; o `TableLoadingSkeleton` passa a viver dentro do `TabsContent`, não em volta das abas. Hoje a lista inteira de abas some durante o carregamento e reaparece, jogando o conteúdo para baixo — um salto de layout em toda abertura de projeto.
- **`flex-wrap` na `TabsList`** (padrão de `TripDetail`/`Places`): cinco gatilhos não cabem em 360px numa linha só.
- **As seções continuam sendo `ProjectShoppingSection` e `ProjectNotesSection`, sem seu cabeçalho `<h2>` próprio quando dentro da aba** — o nome da aba já é o título, e repetir "Compras do projeto" logo abaixo do gatilho "Compras" gasta a altura que a feature está tentando recuperar. O `<h2>` vira opcional por prop, com o `aria-labelledby` preservado para leitor de tela.
- **Nenhuma extração de componente além do necessário.** `ProjectDetail.tsx` tem quase mil linhas e quebrá-lo em `ProjectKanbanTab`/`ProjectListaTab`/`ProjectGanttTab` é tentador, mas é refactor sem pedido, num arquivo que a 065 acabou de mexer — e mover duas seções para dentro das abas não exige isso.
- **`TaskList.tsx` não é tocado.** Ele tem a própria `TabsList` (lista/kanban/gantt/agenda) e não mostra compras nem notas; o pedido é sobre a página de projeto.

## Tarefas

- [x] `src/pages/admin/tasks/ProjectDetail.tsx`: o tipo do estado `view` passa a incluir `"compras"` e `"notas"`, e a `TabsList` ganha os dois gatilhos com `flex-wrap`. Verificação: `npm run build && npm run lint`
- [x] `src/pages/admin/tasks/ProjectDetail.tsx`: mover `<ProjectShoppingSection>` e `<ProjectNotesSection>` para dentro de `TabsContent value="compras"` e `value="notas"`, apagando as duas renderizações de fora das abas e reescrevendo os comentários que justificavam a posição antiga (apontando para esta feature). Verificação: `npm run build && npm run lint`
- [x] `ProjectShoppingSection` e `ProjectNotesSection`: prop `showHeading?: boolean` (padrão `true`, para não mudar nenhum outro consumidor); com `false`, o `<h2>` some e a `<section>` recebe `aria-label` em vez de `aria-labelledby`. Verificação: `npm run build`; testes existentes das duas seções continuam passando
- [x] `src/pages/admin/tasks/ProjectDetail.tsx`: mover o `TableLoadingSkeleton` para dentro dos `TabsContent`, deixando a `TabsList` visível durante o carregamento. Verificação: teste de que os gatilhos das abas existem no primeiro render, antes de qualquer `await`
- [x] `src/api/shopping/items.ts` (ou `categories.ts`) e `src/api/notes/notes.ts`: funções de contagem por projeto usando `select("id", { count: "exact", head: true })` — sem trazer linhas. Verificação: `npm run build`; teste conferindo que o `head: true` foi usado (não é uma busca disfarçada de contagem)
- [x] `src/pages/admin/tasks/ProjectDetail.tsx`: carregar as duas contagens no `Promise.all` do `load()` e exibi-las nos gatilhos ("Compras (7)"); contagem zero não mostra número, e falha na contagem não derruba a página nem esconde a aba (cai para sem número). Verificação: `npm run build && npm run lint`
- [x] `src/pages/admin/tasks/ProjectDetail.tsx`: sincronizar a aba com `?tab=` — ler no mount, escrever com `setSearchParams(..., { replace: true })` ao trocar, cair em `kanban` para valor inválido. Verificação: `npm run build && npm run lint`
- [x] `src/pages/admin/shopping/ProjectShoppingSection.tsx`: o link "Ver na Lista de Compras" continua indo para `/shopping-list?project=<id>`; conferir (e ajustar, se preciso) que voltar pelo botão do navegador devolve a aba "Compras", não o Kanban. Verificação: teste de navegação
- [x] `src/pages/admin/tasks/__tests__/ProjectDetail.tabs.test.tsx` (arquivo novo): as cinco abas aparecem; abrir `/tasks/projects/p1?tab=notas` já carrega na aba de notas; `?tab=foo` cai no Kanban; trocar de aba escreve na URL; **as requisições de compras e notas não acontecem enquanto a aba não é aberta** (é o ganho de carga, e é o que uma regressão futura mais provavelmente desfaz); as contagens saem nos gatilhos. Verificação: `npm test src/pages/admin/tasks`
- [x] Conferir que os testes existentes que dependiam das seções fora das abas continuam válidos — `ProjectShoppingSection.test.tsx`, `ProjectNotesSection.test.tsx`, `ProjectDetail.medication-occurrences.test.tsx` e os de navegação —, ajustando quem procurava as seções sem clicar na aba. Verificação: `npm test`
- [x] `npm run build`, `npm run lint` e `npm test` limpos, com a contagem registrada — build OK, lint 0 erros (78 warnings de `react-refresh`, todas pré-existentes), `npm test` **171 arquivos / 1634 testes passando**, `npm run check:bundle` OK (`MarkdownPreview` em 124.0 KB de 160.0 KB)
- [x] Verificação do pedido literal ("preciso do espaço para poder visualizar as tarefas"), por teste e não no navegador: com o projeto carregado na aba Kanban, nem a seção de compras nem a de notas estão no documento — o quadro é o único conteúdo abaixo das abas

## Prompts

- 2026-08-19 — "- na visualização de um projeto, não coloque as compras ou as notas do projeto dessa maneira, pode ser abas separadas. preciso do espaço para poder visualizar as tarefas"

## Notas

- **Relação com a 052 e a 055**: as duas permanecem em `in-progress/` e não são editadas; o que muda aqui é uma decisão de layout delas, e a razão da mudança é o prompt de 2026-08-19 registrado acima. O conteúdo das seções não muda — continuam somente-leitura, com o link para a tela completa.
- Nenhum teste existente precisou ser ajustado: `ProjectShoppingSection.test.tsx`,
  `ProjectNotesSection.test.tsx` e o fluxo `ShoppingList.project-filter.flow.test.tsx` já
  renderavam as seções direto (sem passar pela página do projeto), e os testes de `ProjectDetail`
  (edição de projeto, ocorrências de medicação/consulta, subtarefas) nunca olhavam para elas. Os
  dois arquivos de seção só ganharam casos novos para o `showHeading`.
- **A contagem da aba "Compras" é de categorias, não de itens** (`countShoppingCategoriesByProject`).
  As Decisões dão o exemplo "Compras (7)" sem dizer a unidade; contar itens do projeto exigiria ou
  um embed `shopping_category!inner(project_id)` — sintaxe que este repo nunca usou e que não dá
  para verificar sem banco real — ou uma segunda query trazendo os ids das categorias, o que a
  própria tarefa proíbe ("não é uma busca disfarçada de contagem"). Categoria também é a unidade
  que a aba lista (cada categoria com seus itens) e a que o estado vazio nomeia ("Nenhuma
  categoria de compras neste projeto"), então o número bate com o que se vê ao abrir a aba.
- Encosta na 065 (edição de projeto na página de detalhe), que mexeu no cabeçalho do `ProjectDetail` — nada em conflito, mas convém implementar com a 065 já mergeada.
