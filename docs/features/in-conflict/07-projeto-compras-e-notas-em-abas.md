---
prompt: |
  - na visualização de um projeto, não coloque as compras ou as notas do projeto dessa maneira, pode ser abas separadas. preciso do espaço para poder visualizar as tarefas
---

## Conflito

**Par na `master`:** `done/069-pagina-de-projeto-em-abas.md`. **Duplicata praticamente completa** — e
neste caso não há nem diferença de desenho para discutir: **a `master` já usa `?tab=` na URL**, que era
a decisão central desta feature (conferido em `ProjectDetail.tsx`: *"A aba ativa mora na URL (`?tab=`),
não em `useState`"*).

Ou seja: mesmo recurso, mesma escolha de arquitetura, feito duas vezes. Não identifiquei nada aqui que
a `master` não tenha.

O texto segue abaixo como registro; o código está no commit `939e869`.

### P1 — Confirma que este arquivo pode ser descartado? (não achei nada a portar; se você souber de algo, diga o quê)
**Resposta:**

# 071 — Página do projeto: Compras e Notas viram abas

## Contexto

`src/pages/admin/tasks/ProjectDetail.tsx` tem hoje três abas — Kanban, Lista, Gantt — e, **abaixo
delas**, empilhadas na mesma coluna, duas seções sempre montadas: `ProjectShoppingSection` (feature
052) e `ProjectNotesSection` (feature 055). As duas juntas empurram as tarefas para cima da dobra:
com uma lista de compras de duas categorias e três notas, o Kanban perde a tela inteira. É
exatamente a queixa do prompt ("preciso do espaço para poder visualizar as tarefas").

Isso não é acidente, é uma decisão escrita que esta feature **reverte**: a 052 registrou nas
Decisões que "a seção fica fora das abas de propósito", e a 055 registrou nas Notas um "desvio do
plano" — o plano original dela **era** uma quarta aba "Notas", abandonada para não contradizer a
052 no mesmo arquivo. O comentário que documenta essa escolha está no próprio `ProjectDetail.tsx`
(linhas ~921-929) e precisa sair junto, senão o código passa a mentir.

Esta feature nasce como arquivo próprio porque a mudança atravessa as duas features (052 e 055) e é
uma decisão de *layout da página de projeto*, não do módulo de compras nem do de notas. Ela também
corrige as Decisões/Notas dos dois arquivos para que a razão antiga não fique contradizendo o
código.

## Decisões

- **Cinco abas: Kanban | Lista | Gantt | Compras | Notas.** As três primeiras continuam sendo
  visões das tarefas; as duas novas são entidades ligadas ao projeto. É a leitura literal do prompt
  ("pode ser abas separadas") e devolve a altura inteira para as tarefas. Descartado colapsar as
  seções num `Accordion` fechado: continuaria ocupando espaço vertical e escondendo o conteúdo
  atrás de dois cliques em vez de um.
- **Compras e Notas ficam depois de Gantt**, não antes, para não mudar o alcance do gesto das abas
  que o usuário já usa todo dia.
- **Aba ativa vai para a URL (`?tab=`)**, seguindo `src/pages/admin/finance/Recurring.tsx` (o único
  padrão de aba-na-URL já existente no repo): `kanban` é o padrão e **omite** o parâmetro; a
  escrita é `{ replace: true }` para não poluir o histórico do navegador. Motivo: sem isso,
  "abrir a nota do projeto" vira sempre dois cliques depois de qualquer refresh, e não dá para
  mandar link direto. `statusView` (Pendentes/Concluídas/Todas) continua em `useState` — não é
  pedido e não é navegação.
- **Valor de `?tab=` desconhecido cai em `kanban`**, silenciosamente. Um projeto compartilhado por
  link com aba renomeada no futuro não pode renderizar tela vazia.
- **Montagem preguiçosa é aceita como ganho, não contornada.** `TabsContent` do Radix desmonta o
  conteúdo inativo, então os `fetch` de compras e notas passam a acontecer só ao abrir a aba (e a
  se repetir a cada volta). Isso alivia o carregamento da página do projeto, que é o objetivo.
  Descartado `forceMount` ou içar os dados para o `ProjectDetail`: traria de volta exatamente o
  custo que a mudança quer eliminar.
- **Sem contador nas abas nesta versão.** Um badge com "3 pendentes" preservaria a visibilidade que
  a decisão antiga da 052 protegia, mas exigiria buscar compras e notas no load da página — de novo
  o custo que acabamos de tirar. O rótulo da aba já é a descoberta. Fica registrado como a primeira
  extensão óbvia se o usuário sentir falta.
- **As seções não são reescritas.** `ProjectShoppingSection` e `ProjectNotesSection` recebem só
  `projectId` e se auto-carregam; entram dentro do `TabsContent` como estão, incluindo seus
  `TableLoadingSkeleton`, `EmptyState` e toasts de erro. Mantêm o `<h2>` e o `aria-labelledby` (a
  a11y do painel não deve depender do rótulo da aba, e é o que os testes já existentes conferem);
  some apenas o espaçamento/borda que os separava do bloco de cima.
- **A dívida documental faz parte do escopo**: o comentário no `ProjectDetail.tsx`, a Decisão da 052
  ("fica fora das abas de propósito") e a Nota de desvio da 055 são atualizados apontando para esta
  feature. Sem isso, a próxima sessão lê a justificativa antiga e "conserta" de volta.

## Tarefas

- [x] `src/pages/admin/tasks/ProjectDetail.tsx`: trocar o `useState` de `view` por leitura/escrita
      do query param `?tab=` com `useSearchParams` (padrão de `Recurring.tsx`), mantendo os três
      valores atuais e caindo em `kanban` para valor desconhecido. Verificação: `npm run build`;
      os 4 testes de `ProjectDetail.*.test.tsx` continuam passando (todos montam a aba padrão).
- [x] Teste novo `src/pages/admin/tasks/__tests__/ProjectDetail.tabs.test.tsx`: abrir com
      `?tab=lista` já renderiza a Lista; abrir com `?tab=inexistente` cai no Kanban; trocar de aba
      escreve o parâmetro na URL; voltar para Kanban **remove** o parâmetro. Verificação: `npm test`.
- [x] `ProjectDetail.tsx`: acrescentar os `TabsTrigger` "Compras" e "Notas" depois de "Gantt" e
      mover `<ProjectShoppingSection>` e `<ProjectNotesSection>` para dentro dos `TabsContent`
      correspondentes, removendo as duas renderizações inline e o comentário que justificava mantê-las
      fora. Verificação: `npm run build && npm run lint`.
- [x] Ajustar o espaçamento das duas seções dentro da aba (remover a margem/borda superior que só
      fazia sentido empilhado) e conferir que o `<h2>` + `aria-labelledby` seguem intactos.
      Verificação: `ProjectShoppingSection.test.tsx` e `ProjectNotesSection.test.tsx` (8 testes)
      passam sem alteração.
- [x] Estender `ProjectDetail.tabs.test.tsx`: com `?tab=compras`, a seção de compras aparece **e** a
      de notas não está no DOM (prova a montagem preguiçosa); com o Kanban ativo, nenhuma das duas
      é montada — o que também prova que a página do projeto deixou de buscar compras e notas no
      load. Verificação: `npm test`.
- [x] Conferir que nenhum dos 4 testes existentes de `ProjectDetail` (`edit-project`,
      `consultation-occurrences`, `medication-occurrences`, `subtask-edit`) quebrou: eles não
      mockam `@/api/shopping/*` nem `@/api/notes/notes` e hoje montam as seções de verdade; com a
      mudança elas param de montar. Verificação: rodar os 4 arquivos e registrar em Notas se algum
      mock ficou obsoleto.
- [x] Atualizar a documentação que a mudança contradiz — **só em `## Notas`, sem acrescentar tarefa
      nenhuma, para que as duas features continuem em `done/`**: em
      `docs/features/done/052-categoria-compras-por-projeto.md`, registrar que a Decisão "a seção
      fica fora das abas" foi revista pela 071 (sem apagar o histórico); em
      `docs/features/done/055-notas-nucleo-markdown.md`, registrar na Nota do "desvio do plano: as
      notas viraram seção, não aba" que a 071 restaurou o plano original. Verificação: leitura — os
      dois arquivos deixam de contradizer o código.
- [x] Checagem de satisfação do `prompt:` sem navegador: "abas separadas" → `ProjectDetail.tabs.test.tsx`
      mostra as 5 abas e o roteamento por `?tab=`; "preciso do espaço para visualizar as tarefas" →
      o mesmo teste prova que, no Kanban, nem compras nem notas estão no DOM (logo não ocupam
      altura). Se sobrar algo do pedido, abrir tarefa nova aqui.

## Prompts

- 2026-08-18 — "- na visualização de um projeto, não coloque as compras ou as notas do projeto dessa maneira, pode ser abas separadas. preciso do espaço para poder visualizar as tarefas"

## Notas

- **Nenhum mock ficou obsoleto nos 4 testes antigos de `ProjectDetail`** (`edit-project`,
  `subtask-edit`, `consultation-occurrences`, `medication-occurrences`). Eles nunca mockaram
  `@/api/shopping/*` nem `@/api/notes/notes`: antes da 071 as duas seções montavam de verdade e
  as chamadas ao Supabase falhavam em silêncio (o `useToast` está mockado nos quatro arquivos).
  Depois da 071 as seções nem montam no Kanban, então os quatro arquivos seguem passando sem
  nenhuma alteração — 17 testes verdes.
- **Não havia margem nem borda superior para remover nas seções.** `ProjectShoppingSection` e
  `ProjectNotesSection` são `<section className="space-y-3">`, sem `border-t`/`pt-*`: o
  espaçamento que as separava do bloco de cima vinha do `space-y-4 sm:space-y-6` do `PageShell`,
  que deixa de se aplicar sozinho quando elas passam a ser filhas de um `TabsContent`. A tarefa de
  espaçamento virou, na prática, o `className="mt-4"` dos dois `TabsContent` novos — o mesmo das
  três abas que já existiam.
- **`TabsList` ganhou `flex h-auto w-full flex-wrap justify-start gap-1`** (desvio do plano, sem
  pedido do usuário): cinco abas não cabem numa linha de telefone e o `PageShell` é
  `overflow-x-hidden`, então sem a quebra de linha a aba "Notas" sairia da tela. É exatamente o
  `TabsList` que `TripDetail`, `Places`, `Car` e `Timeline` já usam por terem muitas abas.
- **A justificativa antiga morava em três lugares, não um.** Além do comentário em
  `ProjectDetail.tsx` (que a tarefa 3 removeu), o docblock de `ProjectNotesSection.tsx` repetia
  "fica **fora** das abas ... deve continuar visível qualquer que seja a aba escolhida". Os dois
  docblocks (`ProjectNotesSection` e `ProjectShoppingSection`) foram reescritos apontando para a
  aba correspondente e para a montagem preguiçosa.
- **Ordem real das abas conferida por teste**, não por leitura: `getAllByRole("tab")` devolve
  `["Kanban","Lista","Gantt","Compras","Notas"]`.
- **Checagem de satisfação (2026-09-25), sem navegador.** Recorte do `prompt:` → artefato que o
  prova:
  - *"não coloque as compras ou as notas do projeto dessa maneira, pode ser abas separadas"* →
    `ProjectDetail.tabs.test.tsx` "as cinco abas aparecem na ordem Kanban | Lista | Gantt |
    Compras | Notas" (`getAllByRole("tab")` devolve exatamente essa lista) mais
    "`?tab=compras` monta só a seção de compras, já filtrada pelo projeto" e "`?tab=notas` monta
    só a seção de notas, já filtrada pelo projeto" — cada uma é uma aba própria, e a outra **não**
    está no DOM.
  - *"preciso do espaço para poder visualizar as tarefas"* → mesmo arquivo, "no Kanban, nem compras
    nem notas estão no DOM — e nenhuma das duas é buscada no load"
    (`queryByRole("heading", { name: "Compras do projeto" })` e o de Notas devolvem `null`;
    `fetchShoppingCategories`, `fetchShoppingItems` e `fetchNotes` com zero chamadas) e
    "sair da aba Compras desmonta a seção — ela deixa de ocupar espaço na tela". Não ocupar altura
    é exatamente não estar no DOM, o que o teste afirma sem navegador.
  - Nada do pedido ficou de fora; nenhuma tarefa nova foi aberta.
- **Suíte inteira na passada final (2026-09-25):** `npm test` → `Test Files 177 passed (177)`,
  `Tests 1706 passed (1706)`. `npm run lint` → `✖ 18 problems (0 errors, 18 warnings)`, todas
  pré-existentes. `npm run build` → `✓ built in 19.88s`. `npm run check:bundle` →
  `Bundle budget OK`.

## Como testar

### 1. Pré-requisitos

- Nenhuma migration nova: a feature é só de layout/roteamento de front.
- `npm install` feito; app subido com `npm run dev` (`http://localhost:5173`).
- Logado com um usuário que tenha **pelo menos um projeto**, e nesse projeto:
  - uma **categoria de compras vinculada ao projeto** com 1-2 itens (módulo Produtividade >
    Lista de Compras > categoria com "Projeto" preenchido — feature 052);
  - pelo menos uma **nota vinculada ao projeto** (feature 055);
  - pelo menos uma tarefa, para o Kanban/Lista não ficarem vazios.
- A tela é `/tasks/projects/<id do projeto>`.

### 2. Verificação automatizada

```
npx vitest run src/pages/admin/tasks/__tests__/ProjectDetail.tabs.test.tsx
```
Passou = **14 testes verdes**: as 5 abas existem na ordem certa, `?tab=` roteia (inclusive valor
inválido caindo no Kanban) e, com o Kanban ativo, nem Compras nem Notas estão no DOM nem chamam
a API.

```
npx vitest run src/pages/admin/tasks/__tests__/ProjectDetail.edit-project.test.tsx src/pages/admin/tasks/__tests__/ProjectDetail.subtask-edit.test.tsx src/pages/admin/tasks/__tests__/ProjectDetail.consultation-occurrences.test.tsx src/pages/admin/tasks/__tests__/ProjectDetail.medication-occurrences.test.tsx
```
Passou = **17 testes verdes** — as quatro telas antigas de `ProjectDetail` continuam íntegras
depois da troca de `useState` por `?tab=`.

```
npx vitest run src/pages/admin/shopping/__tests__/ProjectShoppingSection.test.tsx src/pages/admin/notes/__tests__/ProjectNotesSection.test.tsx
```
Passou = **8 testes verdes** — as duas seções não mudaram de contrato (mesmo `<h2>`, mesmo
`aria-labelledby`) ao irem para dentro da aba.

```
npm test
npm run lint
npm run build
npm run check:bundle
```
Passou = suíte inteira verde (**177 arquivos / 1706 testes** na passada de 2026-09-25), lint com
**0 errors** (18 warnings de `react-refresh`, todas pré-existentes e nenhuma em `ProjectDetail`),
build concluído e `check:bundle` terminando em "Bundle budget OK".

### 3. Verificação manual, passo a passo

1. Abra `/tasks/projects/<id>`. **Esperado:** cinco abas na ordem
   **Kanban | Lista | Gantt | Compras | Notas**; o Kanban está ativo; **abaixo do Kanban não há
   mais** os blocos "Compras do projeto" e "Notas do projeto" — a página termina no conteúdo da
   aba, e as tarefas ocupam a tela.
2. A URL continua `/tasks/projects/<id>`, **sem** `?tab=`.
3. Clique em **Lista**. **Esperado:** a URL vira `/tasks/projects/<id>?tab=lista` e a lista de
   tarefas aparece.
4. Dê **F5** nessa URL. **Esperado:** volta direto na aba Lista (não no Kanban).
5. Clique em **Compras**. **Esperado:** URL `?tab=compras`; aparece "Compras do projeto" com as
   categorias do projeto e o botão "Ver na Lista de Compras".
6. Clique em **Notas**. **Esperado:** URL `?tab=notas`; aparece "Notas do projeto" com a lista de
   notas e o botão "Nova nota". Clicar numa nota abre `/notes/<id>`.
7. Volte para **Kanban**. **Esperado:** o `?tab=` **some** da URL (fica
   `/tasks/projects/<id>`), e Compras/Notas somem da tela.
8. Use o **voltar do navegador** depois de trocar de aba 2-3 vezes. **Esperado:** volta para a
   página anterior à do projeto, não desfaz aba por aba (a escrita é `replace`).

### 4. Casos de borda e caminhos negativos

- `/tasks/projects/<id>?tab=inexistente` → abre no **Kanban**, sem tela em branco e sem erro.
- `/tasks/projects/<id>?tab=lista&foo=bar` → abre na Lista e, ao trocar de aba, `foo=bar`
  **continua** na URL.
- Projeto **sem** categoria de compras vinculada → aba Compras mostra o estado vazio próprio da
  seção ("Nenhuma categoria de compras neste projeto"), não uma tela branca.
- Projeto **sem** nota → aba Notas mostra "Nenhuma nota neste projeto" com o botão "Nova nota".
- Com a aba Kanban ativa, abra o DevTools > Network e recarregue: **não** deve haver requisição
  para `shopping_category`/`shopping_item`/`note` — elas só saem ao abrir a aba correspondente.

### 5. Sinais de que quebrou

- Compras e/ou Notas ainda aparecem empilhadas abaixo das abas (a mudança não subiu).
- A aba ativa volta sempre para Kanban depois de F5 (o `?tab=` não está sendo lido).
- Trocar de aba empilha entradas no histórico (o voltar do navegador percorre abas) — o
  `{ replace: true }` se perdeu.
- Tela branca ao abrir com `?tab=` inválido (o fallback para `kanban` se perdeu).
- Aviso de acessibilidade/teste falhando em `aria-labelledby` — o `<h2>` das seções foi removido
  junto com o espaçamento.
