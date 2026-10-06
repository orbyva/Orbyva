---
prompt: |-
  crie uma feature para adicionar um ícone de notas nas tarefas [print da Lista de tarefas, com o
  ícone de notas posicionado no início do grupo de ações da linha] quero o ícone de notas, expanda
  se tiver mais de uma nota, e vá direto para as notas daquela tarefa já implemente e suba
commits:
  - 5fdebc1 — feat(tasks): ícone de notas na linha da tarefa (255)
pr: "#14 — feat(tasks): ícone de notas na linha da tarefa (255)"
---

# 255 — Ícone de notas na linha da tarefa

## Contexto
A tarefa já pode ter notas vinculadas (`note_link`, feature 056; o atalho de criar/vincular é o
`TaskNoteButtons` da feature 084), mas esse vínculo só é visível **dentro** do formulário da tarefa:
na Lista, no Kanban e na página do projeto não há sinal nenhum de que a tarefa tem nota, e chegar
nela custa abrir a tarefa, abrir o popover e só então clicar. Esta feature traz o vínculo para a
linha: ícone de nota no grupo de ações, um clique até a nota.

## Decisões
- **Sem nota, sem ícone.** Mesma regra do `EntityNotesSection` e do `ExpandSubtasksButton`
  (`count === 0 → null`): um ícone morto em toda tarefa seria ruído num grupo de ações que já tem
  timer, "Imediatamente", editar, excluir e expandir.
- **Uma nota = vai direto.** O botão é um `<Link>` para `/notes/<id>` — sem popover intermediário,
  que é o caso mais comum e o pedido literal ("vá direto para as notas daquela tarefa").
- **Mais de uma = expande.** Popover listando as notas (título + data da última edição), cada uma
  um link. O gatilho mostra a contagem ao lado do ícone, para o clique não ser surpresa.
- **Carregamento em lote pela página**, nunca pela linha: `fetchNotesLinkedToMany("task", ids)` uma
  vez no `load()`, exatamente como `fetchExternalLinksForTasks` da feature 085 — uma consulta por
  linha seria uma ida ao banco por tarefa. A falha dessa consulta cai para "sem ícone" e não derruba
  a lista (fica fora do `Promise.all`, igual aos links externos).
- **Onde aparece:** `TaskListRow` (Lista, página do projeto e as linhas aninhadas de subtarefa) e
  `KanbanCard`. São os dois lugares que já recebem o mapa em lote de links externos; a Agenda e o
  Gantt ficam de fora — lá a tarefa é um bloco de tempo, não uma linha com grupo de ações.
- Componente **apresentacional** (`TaskNotesButton`), recebendo `notes` prontas: assim qualquer
  outra tela pode reusar sem herdar estratégia de carregamento, mesma escolha do `EntityNotesSection`.

## Tarefas
- [x] `src/pages/admin/tasks/TaskNotesButton.tsx` — apresentacional: 0 notas → nada; 1 → `Link`
  direto para `/notes/<id>`; >1 → popover com a lista; variantes `row` (h-8) e `card` (h-7)
- [x] `TaskViews.tsx` — prop `notesByTask` em `TaskListRow` (repassada às linhas aninhadas),
  `CompletedTasksSection` e `KanbanCard`; botão como primeiro item do grupo de ações
- [x] `TaskList.tsx` — estado `notesByTask`, carga em lote no `load()` com degradação em caso de
  erro, repasse para lista, seção "Concluídas" e Kanban
- [x] `ProjectDetail.tsx` — mesma carga em lote e mesmo repasse
- [x] `__tests__/TaskNotesButton.test.tsx` — sem nota não renderiza; com uma nota o link vai direto
  para `/notes/<id>` (sem popover); com duas, o clique expande e cada item leva à sua nota
- [x] `__tests__/TaskList.task-notes.test.tsx` — uma consulta em lote com todos os ids; ícone na
  linha da tarefa que tem nota e ausente na que não tem; falha na consulta não derruba a lista
- [x] Verificação: quebra de propósito nos dois pontos (componente devolvendo `null` sempre →
  5 testes falham; `notesByTask` fora do `TaskListRow` → 2 testes falham), restaurados e verdes;
  `npx tsc --noEmit -p tsconfig.app.json` limpo; `npx eslint` nos arquivos tocados sem erro (só os
  3 avisos de `react-refresh` que o `TaskViews.tsx` já tinha); `npx vitest run` completo:
  358 arquivos / 3989 testes

## Prompts
- 2026-10-06 — "crie uma feature para adicionar um ícone de notas nas tarefas ... quero o ícone de
  notas, expanda se tiver mais de uma nota, e vá direto para as notas daquela tarefa já implemente
  e suba" / "/goal commits e pr na main"

## Notas
- O ícone entrou como **primeiro** item do grupo de ações da linha (antes do Play), que é onde o
  print do pedido o posicionou — é também a leitura natural: "o que esta tarefa tem" antes de "o que
  fazer com ela".
- Com uma nota só, o botão é um `<Link>` de verdade (`asChild`), não um `onClick` com `navigate`:
  assim ganha `href` real — abre em nova aba com ctrl+clique e aparece como link para leitor de tela.
- Entrou também no `KanbanCard`, que não estava no print: ele já recebia o mesmo mapa em lote de
  links externos e tem o mesmo grupo de ações, então deixar de fora criaria uma diferença sem motivo
  entre as duas abas da mesma página. Agenda e Gantt ficaram de fora de propósito (lá a tarefa é
  bloco de tempo, não linha com ações).
- O `TaskNoteButtons` do formulário (feature 084) continua intacto e é outro papel: lá se **cria e
  vincula**; aqui só se **chega**. Por isso o componente novo não reusa aquele — misturar criar com
  navegar no mesmo clique foi o que a 084 já tinha decidido não fazer.
- Suíte completa verde no fim (3989 testes). O `vitest run` completo reportou um
  `ReferenceError: window is not defined` de teardown do tooltip do Radix em
  `TaskDueShortcuts.test.tsx`: é a flakiness conhecida sob carga (o arquivo sozinho passa, 18/18) e
  não tem relação com esta feature — nenhum arquivo dela usa tooltip.

## Como testar

1. **Pré-requisitos** — nenhum de banco: `note` e `note_link` já existem (features 055/056). Logar
   com um usuário que tenha ao menos uma tarefa com nota vinculada; se não tiver, abra uma tarefa,
   use o botão de nota do formulário e crie duas notas a partir dela.
2. **Verificação automatizada**
   - `npx vitest run src/pages/admin/tasks/__tests__/TaskNotesButton.test.tsx` — passa: cobre as
     três situações (nenhuma, uma, várias).
   - `npx vitest run src/pages/admin/tasks/__tests__/TaskList.task-notes.test.tsx` — passa: a Lista
     busca as notas de todas as tarefas numa chamada só e mostra o ícone só em quem tem nota.
   - `npx tsc --noEmit` — sem erro.
3. **Verificação manual**
   1. `npm run dev` → `/tasks`, aba Lista. Na linha de uma tarefa **sem** nota, o grupo de ações
      (direita) não tem ícone de bloco de notas.
   2. Na linha de uma tarefa com **uma** nota vinculada, o primeiro ícone do grupo é o bloco de
      notas. Clicar abre `/notes/<id>` daquela nota — direto, sem passo intermediário.
   3. Numa tarefa com **duas ou mais** notas, o ícone mostra a contagem ao lado. Clicar abre a
      lista; clicar em um título abre aquela nota.
   4. Expandir uma tarefa com subtarefa: a linha aninhada da subtarefa segue a mesma regra.
   5. Aba Kanban: o card da mesma tarefa mostra o ícone no mesmo lugar, com o mesmo comportamento.
   6. `/projects/<id>` (aba de tarefas): idem.
4. **Casos de borda**
   - Tarefa com nota do tipo canvas: aparece na lista como qualquer outra e abre `/notes/<id>`
     (o editor decide o que renderizar).
   - Nota apagada entre a carga e o clique: a página de notas mostra o próprio erro de "não
     encontrada" — a linha não tenta adivinhar.
   - Sem nota nenhuma no usuário: nenhuma linha ganha ícone e nenhuma consulta extra é feita além da
     única em lote.
5. **Sinais de que quebrou**
   - Ícone em **toda** linha, inclusive sem nota → o mapa em lote não está chegando na linha.
   - A lista some ou um toast de erro aparece ao carregar → a consulta de notas voltou para dentro
     do `Promise.all` e deixou de degradar.
   - Rede com uma requisição de notas por tarefa → a carga em lote virou carga por linha.
