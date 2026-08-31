---
prompt: |
  a duração não está sendo aplicada ao gannt, preciso que a partir da duração, prazo, data de início  ele consig aprever e ajustar. a duração sempre é de menor preferência, então ajuste para que eu consiga tanto mover quando controlar 100%$ pelo gannt. Não somente a nível de dias mas também semanas/meses
---

# 032 — Duração aplicada ao Gantt (previsão e ajuste de datas)

## Contexto
`estimated_duration` (minutos, nullable) já existe em `Task` (`src/types/tasks.ts`) e numa migration
ainda não commitada (`supabase/migrations/20260814000000_task_estimated_duration.sql`), mas hoje é
só um número guardado — nada em `src/domain/tasks/gantt.ts` ou `GanttChart.tsx` o lê. O Gantt
(feature `done/030`) calcula a barra de cada tarefa só a partir de `start_date`/`due_date`
(`taskNode()`): com as duas datas, usa ambas; com só uma, usa a mesma data pros dois lados (barra de
1 dia); sem nenhuma, usa uma "âncora" de hoje (`todayAnchorStart/End`, `hasPlannedDate: false`).
Arrastar uma barra (`GanttChart.tsx`, handler `update-task`) só persiste `start_date`/`due_date`
(`resolveTaskDateUpdates`), nunca `estimated_duration`.

Pedido do usuário: a partir de duração + prazo + data de início, o Gantt deve conseguir prever a
data que falta e permitir ajustar 100% arrastando (mover a barra inteira, ou redimensionar uma
ponta) — em qualquer zoom (dias/semanas/meses). Duração é sempre o sinal de **menor prioridade**:
nunca deve sobrescrever duas datas explícitas já definidas pelo usuário.

## Decisões
- Nova função `resolveTaskSchedule({ start_date, due_date, estimated_duration })` (em
  `src/domain/tasks/gantt.ts` ou um novo `src/domain/tasks/duration.ts`, ao lado de `formatDuration`
  se a feature `031` já existir) que decide `start_date`/`due_date` efetivos pra montar a barra:
  - Duas datas presentes → usa as duas, ignora `estimated_duration` (prioridade mínima, nunca
    sobrescreve datas explícitas).
  - Só `start_date` + duração → `due_date` calculado = `start_date` + `dias(duração)`.
  - Só `due_date` + duração → `start_date` calculado = `due_date` − `dias(duração)`.
  - Nenhuma data + duração → âncora de hoje com `dias(duração)` de largura (em vez do 1 dia fixo
    atual), mesmo espírito de "arraste para confirmar" da `done/030`.
  - Nenhuma data, sem duração → comportamento atual (âncora de 1 dia).
  - `dias(duração)` = minutos convertidos pra dias inteiros arredondando pra cima, mínimo 1
    (`Math.max(1, Math.ceil(minutos / (24 * 60)))`) — o Gantt trabalha em granularidade de dia
    (`isoToLocalDate` já ignora hora), então duração menor que 1 dia sempre vira barra de 1 dia.
  - `hasPlannedDate` continua refletindo só se `start_date`/`due_date` **reais** existem no banco
    (independente de duração) — uma barra só-com-duração continua com o estilo tracejado de
    "não confirmada", já que nenhuma data foi de fato definida pelo usuário.
- `taskNode()`/`buildGanttNodes()` passam a usar `resolveTaskSchedule` no lugar do cálculo atual de
  `hasDate ? ... : todayAnchor...`.
- **Arrastar no Gantt** (`GanttChart.tsx`, handler `update-task`): hoje só recebe `{ start, end }`
  do evento e não distingue mover (as duas pontas deslocam igual, duração não muda) de redimensionar
  (só uma ponta muda, duração muda). Usar a prop `tasks` (dados originais, já disponíveis em
  `GanttChart`) pra buscar a tarefa pelo `id` e comparar com o `start`/`end` novos:
  - Se só `end` mudou (start igual ao original) → recalcular `estimated_duration` a partir da nova
    diferença `end - start` (em minutos, `dias * 24 * 60`) e persistir `due_date` + `estimated_duration`.
  - Se só `start` mudou (end igual) → mesma lógica, recalculando duração e persistindo `start_date`
    + `estimated_duration`.
  - Se ambos mudaram pelo mesmo delta (mover) → duração inalterada, persiste só `start_date` +
    `due_date` (comportamento atual).
  - Qualquer outro caso (ex. os dois mudaram por deltas diferentes) → recalcula duração também, pra
    não deixar o valor salvo dessincronizado da barra exibida.
- Zoom (dias/semanas/meses): a lib (`@svar-ui/react-gantt`, prop `zoom`) já escala a régua a partir
  das datas reais de `start`/`end` — corrigir as datas em `resolveTaskSchedule` deve refletir
  corretamente em qualquer zoom sem lógica extra por nível; confirmar isso no teste manual em vez de
  assumir.
- Consistência com o form completo: adicionar o campo "Duração" (reaproveitando
  `TaskDurationQuickPick` da feature `031`, se já implementada — senão um `<Input type="number">`
  simples por enquanto) em `TaskRecurrenceField.tsx` (aba "Data e repetição"), já que agora a
  duração afeta o cálculo de datas no Gantt e o usuário precisa poder defini-la sem passar pelo
  quick-edit da Lista.

## Tarefas
- [x] Criar `resolveTaskSchedule({ start_date, due_date, estimated_duration })` com a lógica de
      prioridade acima, incluindo o arredondamento de minutos → dias (mínimo 1).
- [x] Testes unitários de `resolveTaskSchedule` (Vitest): duas datas presentes ignora duração; só
      início + duração; só prazo + duração; nenhuma data + duração (âncora com largura da duração);
      nenhuma data nem duração (âncora de 1 dia, comportamento atual preservado).
- [x] Atualizar `taskNode()`/`buildGanttNodes()` em `gantt.ts` para usar `resolveTaskSchedule`,
      mantendo `hasPlannedDate` fiel só a `start_date`/`due_date` reais.
- [x] Atualizar `src/domain/tasks/__tests__/gantt.test.ts` para cobrir os novos casos de barra
      derivada de duração (e ajustar os testes existentes que assumiam o comportamento antigo).
- [x] Em `GanttChart.tsx`, no handler `api.on("update-task")`: buscar a tarefa original via prop
      `tasks` pelo `id`, comparar `start`/`end` antigos vs. novos pra decidir se é "mover" (duração
      preservada) ou "redimensionar" (duração recalculada), persistindo `estimated_duration` junto
      com `start_date`/`due_date` quando aplicável.
- [x] Adicionar campo "Duração" em `TaskRecurrenceField.tsx` (aba "Data e repetição"), ligado a
      `form.estimated_duration`.
- [x] `npx tsc --noEmit && npm run build && npm run lint && npm test`.
- [x] Testes automatizados cobrindo (a)-(c) do teste manual original com lógica pura, já que Chrome
      está bloqueado neste fluxo: `resolveTaskScheduleUpdate` (extraída como função pura exportada
      de `gantt.ts`, e agora de fato usada por `GanttChart.tsx` — ver Notas) ganhou testes em
      `gantt.test.ts` cobrindo (a) agenda efetiva com só prazo+duração como base do redimensionamento,
      (b) mover a barra inteira preserva a duração, (c) redimensionar só uma borda (esquerda ou
      direita) recalcula a duração persistida, mais o caso de segurança "as duas pontas mudam por
      deltas diferentes". (d) não ganhou teste nosso — ver justificativa em Notas.

## Prompts

## Notas
- `resolveTaskSchedule` foi implementada em `src/domain/tasks/duration.ts` (ao lado de
  `formatEstimatedDuration` da feature 031), não em `gantt.ts` — reaproveita o `addDaysToIso`/
  `diffDaysIso` que também viraram necessários pro handler de drag do Gantt. `gantt.ts` importa
  `resolveTaskSchedule` direto de `./duration` (não via barrel `@/domain/tasks/index.ts`) pra evitar
  qualquer risco de import circular.
- Precisão sobre `hasPlannedDate` nos casos derivados: quando só `start_date` OU só `due_date` é
  real e a outra ponta vem calculada da duração, `hasPlannedDate` é `true` (a data real que existe
  já foi definida pelo usuário) — só fica `false` quando **nenhuma** das duas é real (âncora de
  hoje). A frase da Decisão ("uma barra só-com-duração continua tracejada") se refere só a esse
  último caso; os testes novos em `gantt.test.ts`/`duration.test.ts` cobrem a distinção.
- Bug real encontrado e corrigido durante a tarefa do handler de drag: `init` do componente
  `Gantt` (`@svar-ui/react-gantt`) só é invocado **uma vez**, na montagem (confirmado lendo o
  código-fonte minificado da lib — o efeito interno só chama nosso callback `init` quando
  `c.current` ainda é 0). Isso significa que o `handleInit` de `GanttChart.tsx`, mesmo sendo um
  `useCallback`, nunca é re-executado quando `tasks` muda — então usar `tasks` direto dentro do
  handler de `update-task` (pra buscar a tarefa original e calcular a duração) capturaria pra
  sempre o array da primeira renderização, ficando cada vez mais desatualizado a cada edição.
  Corrigido com `tasksRef` (`useRef` + `useEffect` que mantém `tasksRef.current` sincronizado) e o
  handler lê `tasksRef.current` em vez de `tasks` direto. Sem isso, a lógica de mover vs.
  redimensionar ficaria errada depois da primeira edição.
- Investigação do código da lib (`node_modules/@svar-ui/react-gantt/dist/index.es.js`) também
  mostrou como ela distingue mover de redimensionar por baixo dos panos: ao redimensionar só a
  borda esquerda ou só a direita, o evento `update-task` chega com **só** `start` ou **só** `end`
  no objeto `task` (não os dois); ao mover a barra inteira, chegam os dois. Isso confirma que a
  lógica implementada (comparar quais campos vieram em `resolveTaskDateUpdates` contra a agenda
  original via `resolveTaskSchedule`) cobre os casos reais da lib, além do caso genérico "os dois
  mudaram por deltas diferentes" pedido na Decisão como rede de segurança.
- `npm test` tem 2 falhas pré-existentes e não relacionadas a esta feature, em
  `src/lib/__tests__/currency.test.ts` (`formatDateBR`/`formatDateTimeBR` esperando `"—"` e
  recebendo `"·"` — parece um problema de encoding do em-dash no arquivo de teste ou na função,
  não tocado por nenhuma tarefa desta feature). Não descontado dos 141 testes de
  `src/domain/tasks/` que passam limpos.
- Retomada desta feature (sessão à parte, depois de duas quedas de infra) encontrou um refactor
  incompleto: `resolveTaskScheduleUpdate` já existia em `gantt.ts` (função pura, exportada) com a
  lógica exata de mover-vs-redimensionar descrita na Decisão, mas `GanttChart.tsx` não a chamava —
  o handler `update-task` reimplementava a mesma lógica inline, duplicada, direto no componente.
  Corrigido: o handler agora chama `resolveTaskScheduleUpdate(original, dateUpdates)` em vez de
  duplicar a comparação de datas/deltas. Isso também é o que tornou (a)-(c) do teste manual
  testáveis com lógica pura, sem precisar montar o componente `GanttChart`/`Gantt` da lib.
- Caso (d) do teste manual original (repetir os zooms de semana/mês) não virou teste automatizado:
  o zoom é renderizado inteiramente por `@svar-ui/react-gantt` (prop `zoom` do componente `Gantt`,
  `GanttChart.tsx`) a partir dos mesmos `start`/`end` que `resolveTaskSchedule`/`buildGanttNodes`
  já calculam e que os testes em `gantt.test.ts` cobrem — não há lógica nossa que decida nada
  diferente por nível de zoom (dia/semana/mês). A régua e o desenho da barra em cada zoom são
  responsabilidade interna da lib, não código deste repositório; um teste nosso simulando o
  rendering da lib só pra "confirmar visualmente" seria artificial (mockaria o próprio
  comportamento que se quer verificar) e está fora do que a skill `next` pede — cobertura de
  comportamento nosso, não de bibliotecas de terceiros.
