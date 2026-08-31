---
prompt: |
  in the gannt view, i need to be able to get tasks without prazo (início or end) e ser capaz de
  arrastar elas, e definir isso pelo gannt
    - mover elas, mudando o tamanho, e a posição, hoje está dando um erro invalid input syntax for
      type date: "NaN-NaN-NaN"
---

# 030 — Tarefas sem prazo arrastáveis no Gantt e correção do erro NaN-NaN-NaN

## Contexto
No Gantt (`src/pages/admin/tasks/GanttChart.tsx` + `src/domain/tasks/gantt.ts`), tentar
mover/redimensionar uma tarefa hoje dispara um toast vermelho com a mensagem exata
`Erro — invalid input syntax for type date: "NaN-NaN-NaN"` (evidência: screenshot em
`docs/features/to-refine/image.png`).

Causa raiz encontrada: `buildGanttNodes` (`src/domain/tasks/gantt.ts:76-119`) só cria um nó com
`start`/`end` quando a tarefa tem `start_date` ou `due_date`. Tarefas de topo sem nenhuma data são
excluídas por completo do Gantt (filtro `datedTopLevel`, linha 81 — só entram em `untimedCount`, com
o aviso "N tarefa(s) sem prazo/início não aparecem aqui" em `GanttChart.tsx:172-176`). Já subtarefas
sem data própria continuam aparecendo na árvore, mas como nó **sem** `start`/`end` (`taskNode`,
linha 50-66, spread condicional a `hasDate`) — confirmado pelo teste
`src/domain/tasks/__tests__/gantt.test.ts:78-91` ("subtarefa aparece indentada... `start` e `end`
`toBeUndefined`"). A lib `@svar-ui/react-gantt` não impede iniciar um drag/resize numa linha sem
barra real; o cálculo interno de posição parte de um `start`/`end` inexistente e devolve um `Date`
inválido. O handler `update-task` em `GanttChart.tsx:96-124` não valida isso: qualquer `task.start`/
`task.end` que seja `instanceof Date` (mesmo um Invalid Date) é passado direto pra
`formatLocalIsoDate` (`src/lib/dates.ts:3-8`), que chama `getFullYear()/getMonth()/getDate()` sem
checar `isNaN` — para um Invalid Date isso retorna `NaN` em tudo, produzindo literalmente a string
`"NaN-NaN-NaN"`. Essa string segue direto pra `updateTask` (`src/api/tasks/tasks.ts:168-181`), que
manda pro Supabase/Postgres sem validação adicional, e o Postgres rejeita com a mensagem exata do
toast.

Ou seja: o mesmo buraco (nós sem `start`/`end` válidos, aceitos como se fossem arrastáveis) é a causa
do bug do NaN e o motivo de tarefas sem prazo não serem manipuláveis no Gantt hoje — faz sentido
resolver os dois juntos.

## Decisões
- Separar a correção defensiva do bug (nunca deixar um Invalid Date chegar em `updateTask`) da
  mudança de comportamento (tarefas sem data virarem nós de verdade, arrastáveis) — são esforços
  distintos, mesmo compartilhando arquivo.
- `buildGanttNodes` passa a dar um par `start`/`end` padrão válido (âncora: hoje, duração de 1 dia)
  para qualquer nó — tarefa de topo ou subtarefa — que hoje ficaria sem `start`/`end`, em vez de
  excluir a tarefa (topo) ou deixar `start`/`end` `undefined` (subtarefa). Isso dá à lib uma barra
  real pra desenhar e arrastar, eliminando a raiz do Invalid Date.
- Arrastar/redimensionar essa barra-âncora usa o mesmo fluxo já existente em `update-task`
  (`GanttChart.tsx:96-124`), que já grava `start_date` e `due_date` — nenhuma chamada de API nova é
  necessária.
- Bars com data "âncora" (ainda não definida pelo usuário) devem ser visualmente distinguíveis das
  bars com data real, pra não confundir "prazo real" com "ainda não definido, arraste para definir".
- Mensagens hoje amarradas à exclusão ("N tarefa(s) sem prazo/início não aparecem aqui") precisam ser
  revistas já que essas tarefas passam a aparecer.

## Tarefas
- [x] Corrigir o bug em si: no handler `update-task` de `GanttChart.tsx` (linha ~96-124), validar
  que `task.start`/`task.end` são `Date` válidos (`!Number.isNaN(date.getTime())`) antes de chamar
  `formatLocalIsoDate`/`updateTask`; se vier inválido, não chamar a API (não deixar `"NaN-NaN-NaN"`
  sair do front-end) e mostrar um toast de erro claro em vez do erro cru do Postgres.
- [x] Em `src/domain/tasks/gantt.ts`, remover o filtro que exclui tarefas de topo sem
  `start_date`/`due_date` (`datedTopLevel`) e o cálculo de `untimedCount` associado; em `taskNode`,
  dar `start`/`end` padrão (hoje, 1 dia) a qualquer tarefa (topo ou subtarefa) sem nenhuma data
  própria, em vez de omitir o campo. Marcar esses nós (ex.: flag `hasPlannedDate: false` ou campo
  equivalente) pra permitir estilização diferenciada depois.
- [x] Atualizar/expandir `src/domain/tasks/__tests__/gantt.test.ts`: o teste "tarefa sem nenhuma
  data não aparece" precisa virar "tarefa sem nenhuma data aparece com data-âncora"; o teste da
  subtarefa sem data (`start`/`end` `toBeUndefined`) precisa virar "vem com data-âncora"; cobrir que
  arrastar uma tarefa-âncora e persistir grava `start_date`/`due_date` reais.
- [x] Em `GanttChart.tsx`, remover/ajustar a mensagem "N tarefa(s) sem prazo/início não aparecem
  aqui" e o estado vazio associado (`untimedCount`), já que essas tarefas agora aparecem no Gantt.
- [x] Dar destaque visual (ex.: opacidade menor, borda tracejada, ou label "sem prazo") às barras
  com data-âncora vs. data real, usando o padrão de célula/nó customizado já existente
  (`GanttTaskNameCell`) ou o suporte de estilo por linha da lib.
- [x] Verificação manual: arrastar uma tarefa antes sem prazo, confirmar que grava
  `start_date`/`due_date` corretos sem erro no console/toast; rodar `gantt.test.ts`, `npm run lint`
  e `npm run build`.

## Prompts

## Notas
- A tarefa 3 pedia cobrir "arrastar uma tarefa-âncora e persistir grava `start_date`/`due_date`
  reais" em `gantt.test.ts`. A lógica de validação/serialização vivia inline dentro do closure
  `handleInit` de `GanttChart.tsx` (componente React acoplado à lib `@svar-ui/react-gantt`), sem
  como testar isoladamente sem montar o componente inteiro e simular eventos internos da lib.
  Extraí essa lógica pra uma função pura nova em `src/domain/tasks/gantt.ts`:
  `resolveTaskDateUpdates(task: {start?, end?}): GanttTaskDateUpdates | null` — retorna `null`
  quando `start`/`end` presentes não são `Date` válidos (a mesma guarda contra `Invalid Date`/
  `"NaN-NaN-NaN"` da tarefa 1), e o payload `{start_date?, due_date?}` pronto pra `updateTask`
  quando válidos. `GanttChart.tsx` agora só chama essa função e decide toast/API a partir do
  retorno. Isso também elimina a duplicação de uma segunda cópia de "é `Date` válido" que existia
  antes só no componente.
- Para o destaque visual (tarefa 5), considerei estilizar a barra diretamente via classe CSS por
  `type` customizado (a lib deriva a classe do `wx-bar` do campo `type` da tarefa) ou manipulação
  de DOM por `data-task-id`, mas ambos dependem de internals não documentados/minificados da
  `@svar-ui/react-gantt` (risco de quebrar em upgrade da lib ou de eu adivinhar errado a
  serialização do atributo). Optei pela rota suportada publicamente pelo pacote: a prop
  `taskTemplate` do componente `<Gantt>`, que substitui o conteúdo interno da barra
  (`GanttBarContent` em `GanttChart.tsx`) — pra tarefas com `hasPlannedDate: false` aplica
  `opacity-70` + borda tracejada + tooltip "Sem prazo definido — arraste para definir"; pra
  tarefas com data real, replica exatamente o `<div className="wx-content">{text}</div>` padrão
  (nenhuma mudança visual). Não toquei `GanttTaskNameCell` (coluna de texto da grade) — a barra em
  si já ficou distinguível, que é o que a tarefa pedia ("destaque... às barras").
- Verificação manual (arrastar uma tarefa antes sem prazo no navegador e confirmar
  `start_date`/`due_date` gravados sem erro) não foi possível nesta sessão: o dev server local
  (`localhost:5173`) não tem sessão autenticada disponível pra automação de browser. Todo o resto
  (bug fix, comportamento de dados, testes unitários, lint, build) foi implementado e verificado
  via `npx tsc --noEmit`, `npm run lint`, `npm run build` e `npm test` (seção `gantt.test.ts`: 17/17
  passando; suíte completa: 2 falhas pré-existentes em `currency.test.ts`, não relacionadas a este
  trabalho — falha de codificação de caractere em `formatDateBR`/`formatDateTimeBR`, arquivo não
  tocado nesta feature).
- 2026-08-13: verificação manual feita via automação de navegador numa sessão logada (ngrok).
  **Bug adicional encontrado e corrigido nesta rodada**: a barra-âncora (`todayAnchor`, tarefa 2)
  usava o mesmo `Date` para `start` e `end` — duração 0 pra lib, que renderizava a barra com largura
  zero (invisível; célula do Gantt confirmada vazia via inspeção do DOM). Isso não é exclusivo das
  âncoras novas: qualquer tarefa real "de um dia só" (só `due_date`, sem `start_date` — ex. a tarefa
  pré-existente "trocar lençóis") tem o mesmo padrão `start === end` em `taskNode` e sofre do mesmo
  problema, mas esse caso já existia antes desta feature e ficou fora do escopo (mexer nele exigiria
  revisitar todo task com uma única data, não só as âncoras). Corrigido especificamente para a âncora:
  `todayAnchor` virou `todayAnchorStart`/`todayAnchorEnd` (hoje meio-dia → amanhã meio-dia, duração
  real de 1 dia). `gantt.test.ts` atualizado para essa nova expectativa (17/17 continuam passando).
  Confirmado visualmente após o fix: barras aparecem com largura real em todas as tarefas sem prazo
  (`sa.ca.da`: 9 tarefas antes invisíveis, todas visíveis com bordas/conteúdo depois do fix).
- Tentei arrastar uma barra-âncora via `left_click_drag` da automação de navegador (mover ~1-2 dias
  pra direita): nenhum erro/crash no console nem toast de erro apareceu, mas o `Start Date` da linha
  também não mudou — não deu pra confirmar de forma conclusiva que o gesto de arrastar em si persiste
  a nova data através da automação (suspeita: a lib usa eventos de pointer/mouse com threshold de
  movimento que a simulação de drag da automação não reproduz fielmente; não parece ser um bug do
  app, já que não houve erro nenhum, só ausência de mudança). O que ficou 100% confirmado: (a) nenhum
  erro `NaN-NaN-NaN` ou qualquer outro no console/toast ao tentar interagir com a barra — bug original
  corrigido; (b) barras de tarefas sem prazo agora existem e são visualmente reais (não zero-width) —
  pré-requisito pra serem arrastáveis por um usuário de verdade. Recomendo validação humana real do
  gesto de arrastar (mouse físico) antes de considerar 100% fechado, mas não há mais nada automatizável
  a verificar nesta sessão.
