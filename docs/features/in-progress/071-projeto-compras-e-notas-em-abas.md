---
prompt: |
  - na visualização de um projeto, não coloque as compras ou as notas do projeto dessa maneira, pode ser abas separadas. preciso do espaço para poder visualizar as tarefas
---

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
- [ ] Teste novo `src/pages/admin/tasks/__tests__/ProjectDetail.tabs.test.tsx`: abrir com
      `?tab=lista` já renderiza a Lista; abrir com `?tab=inexistente` cai no Kanban; trocar de aba
      escreve o parâmetro na URL; voltar para Kanban **remove** o parâmetro. Verificação: `npm test`.
- [ ] `ProjectDetail.tsx`: acrescentar os `TabsTrigger` "Compras" e "Notas" depois de "Gantt" e
      mover `<ProjectShoppingSection>` e `<ProjectNotesSection>` para dentro dos `TabsContent`
      correspondentes, removendo as duas renderizações inline e o comentário que justificava mantê-las
      fora. Verificação: `npm run build && npm run lint`.
- [ ] Ajustar o espaçamento das duas seções dentro da aba (remover a margem/borda superior que só
      fazia sentido empilhado) e conferir que o `<h2>` + `aria-labelledby` seguem intactos.
      Verificação: `ProjectShoppingSection.test.tsx` e `ProjectNotesSection.test.tsx` (8 testes)
      passam sem alteração.
- [ ] Estender `ProjectDetail.tabs.test.tsx`: com `?tab=compras`, a seção de compras aparece **e** a
      de notas não está no DOM (prova a montagem preguiçosa); com o Kanban ativo, nenhuma das duas
      é montada — o que também prova que a página do projeto deixou de buscar compras e notas no
      load. Verificação: `npm test`.
- [ ] Conferir que nenhum dos 4 testes existentes de `ProjectDetail` (`edit-project`,
      `consultation-occurrences`, `medication-occurrences`, `subtask-edit`) quebrou: eles não
      mockam `@/api/shopping/*` nem `@/api/notes/notes` e hoje montam as seções de verdade; com a
      mudança elas param de montar. Verificação: rodar os 4 arquivos e registrar em Notas se algum
      mock ficou obsoleto.
- [ ] Atualizar a documentação que a mudança contradiz — **só em `## Notas`, sem acrescentar tarefa
      nenhuma, para que as duas features continuem em `done/`**: em
      `docs/features/done/052-categoria-compras-por-projeto.md`, registrar que a Decisão "a seção
      fica fora das abas" foi revista pela 071 (sem apagar o histórico); em
      `docs/features/done/055-notas-nucleo-markdown.md`, registrar na Nota do "desvio do plano: as
      notas viraram seção, não aba" que a 071 restaurou o plano original. Verificação: leitura — os
      dois arquivos deixam de contradizer o código.
- [ ] Checagem de satisfação do `prompt:` sem navegador: "abas separadas" → `ProjectDetail.tabs.test.tsx`
      mostra as 5 abas e o roteamento por `?tab=`; "preciso do espaço para visualizar as tarefas" →
      o mesmo teste prova que, no Kanban, nem compras nem notas estão no DOM (logo não ocupam
      altura). Se sobrar algo do pedido, abrir tarefa nova aqui.

## Prompts

- 2026-08-18 — "- na visualização de um projeto, não coloque as compras ou as notas do projeto dessa maneira, pode ser abas separadas. preciso do espaço para poder visualizar as tarefas"

## Notas
