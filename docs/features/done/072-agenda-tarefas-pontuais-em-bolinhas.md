---
prompt: |
  - Na visão da agenda, coloque essas tarefas que não tem duração , por exemplo tomar uma tarefa, com uma lista de bolinhas, uma na frente da outra, no prazo marcado, de modo que na visualização de semana/dia ou até mês eu consiga marcar a bolinha, ela fica verde e sabemosq ue a tarefa foi concluída. tipo tarefas pontuais, como trocar lençol, trocar escova, remédios etc
---

# 072 — Agenda: tarefas pontuais como bolinhas marcáveis

## Contexto

Na Agenda, toda tarefa com horário vira um bloco retangular. `getItemTimeRange`
(`src/domain/tasks/calendar.ts:108-130`) trata `estimated_duration` nulo, ausente **ou zero** da
mesma forma: inventa `DEFAULT_ITEM_DURATION_MINUTES = 30` só para o bloco ter altura. O resultado é
que três remédios das 08:00 viram três retângulos de um terço de largura cada, empilhados
lado a lado pelo algoritmo de colunas de `layoutTimedItems` — como se fossem três reuniões
concorrentes. E não existe **nenhuma** forma de concluir uma tarefa direto da grade: `toggleTaskDone`
(`AgendaGrid.tsx:453`) só é alcançável pelo botão redondo dentro do dialog de edição, ou seja, três
cliques para marcar que tomou um comprimido.

O pedido é o desenho certo para esse tipo de tarefa: coisas que acontecem num instante (remédio,
trocar lençol, trocar escova) viram uma fileira de bolinhas no horário marcado, e a bolinha é o
próprio botão de concluir — fica verde e pronto. Vale nas três visões (mês, semana, dia).

Contexto de vizinhança: a 048 (`done/`) declarou fora de escopo "mudar a posição/algoritmo de
layout para agrupar itens" — esta é a primeira feature que deliberadamente **agrupa** itens no
canvas de horas, e por isso a decisão fica escrita aqui. As 066/067 encheram `AgendaGrid`/
`AgendaHourGrid` de alvos de clique absolutos ("novo evento" no dia e no slot de hora); a fileira
de bolinhas não pode roubar nem perder cliques para eles. E `AgendaHourGrid` é reusado pelo
`GanttChart.tsx:669` ("Focar dia"), então toda prop nova precisa ser opcional.

## Decisões

- **"Pontual" é uma propriedade derivada, sem migration**: `isPointTask(task)` (puro, em
  `src/domain/tasks/calendar.ts`) devolve verdadeiro quando `estimated_duration === 0` **ou** quando
  a tarefa é dose de medicação (`is_medication`) sem duração informada. As duas cláusulas existem
  por motivos diferentes e as duas são necessárias:
  - `estimated_duration === 0` é o controle explícito do usuário. A coluna já existe e é nullable;
    hoje `0` é indistinguível de "não informado" só porque o código escolheu assim. Passa a valer:
    **`null` = não sei quanto dura (bloco de 30 min, como hoje)**, **`0` = pontual**. Nenhuma linha
    do banco muda de significado, porque hoje ninguém grava `0` (o `TaskDurationQuickPick` não tem
    esse preset e `formatEstimatedDuration(0)` já devolve `""`).
  - dose de medicação é pontual por natureza e o prompt cita remédio como o exemplo central; as
    doses da 064 nascem sem `estimated_duration`. Cobri-las pela flag evita um `update` em dado de
    produção só para efeito visual — a 064 já escreveu em dado existente uma vez (o backfill de
    medicações da 049) e repetir o gesto por causa de cor de bolinha não se paga.
  - Descartado reusar `is_milestone`: já existe e não precisaria de coluna, mas significa "marco de
    projeto" no Gantt (losango, `gantt.ts:84`), aparece no form como "marco", e "trocar escova" não
    é um marco. Sobrecarregar o campo faria as duas telas mentirem uma sobre a outra.
- **Tarefa pontual sai do algoritmo de colunas.** `getItemTimeRange` passa a devolver
  `durationMinutes: 0`, e `splitTimedItems`/`layoutTimedItems` deixam de recebê-la; no lugar entra
  `groupPointItems(items)` (pura), que agrupa por horário e devolve as fileiras. Sem isso o
  problema volta na hora: N bolinhas no mesmo minuto se "sobrepõem" e voltariam a dividir a largura.
- **A bolinha é o botão de concluir, e é a única ação dela.** Clique alterna `todo`/`done` chamando
  o `toggleTaskDone` que já existe em `AgendaGrid` (otimista, com reversão e toast no catch),
  passado para o `AgendaHourGrid` como prop **opcional** `onToggleTaskDone` (o Gantt não a passa e
  as bolinhas ficam só de leitura lá). Descartado clique abrir o form: seria trocar o gesto de um
  clique que o prompt pede por outro caminho para o mesmo dialog que já existe.
- **Para abrir a tarefa a partir da fileira**, a fileira termina num rótulo "N pontuais" que abre o
  dialog de dia já existente (`dayModalKey`), de onde o form abre como hoje. Zero UI nova para uma
  necessidade secundária.
- **Verde vem do token `--success`**, não de `bg-green-500`. Concluída: `bg-success border-success`
  com um `Check`; pendente: anel vazado `border-muted-foreground/40` com `hover:border-primary`. O
  precedente exato no repo é `HabitWeekStrip.tsx:22-27` — a mesma ideia de "fileira de células que
  ficam verdes". `STATUS_DOT_CLASS.done` (`AgendaGrid.tsx:105-109`) migra de `bg-green-500` para
  `bg-success` no mesmo passo, para não existirem dois verdes de "feito" na mesma tela.
- **Bolinha nunca fica dentro de um `<button>`.** `TaskChip` e `TimedTaskBlock` são botões inteiros;
  botão dentro de botão é HTML inválido e o clique se perde. A fileira é uma estrutura irmã, nunca
  um filho do chip.
- **Ocorrência virtual (recorrência futura ainda não materializada) tem bolinha desabilitada**,
  vazada e com `opacity-60`, com tooltip explicando. É a mesma regra que `TaskChip` e
  `TimedTaskBlock` já aplicam a `isVirtualTask`. Descartado materializar a ocorrência no clique:
  criaria linha no banco por passar o mouse errado, num gesto que o usuário espera ser trivial.
- **Pontual sem `due_time` também vira bolinha**, na faixa "Sem horário" (`UntimedStrip`) na
  semana/dia e na fileira do dia no mês — "trocar lençol" raramente tem hora marcada, e sem isso o
  exemplo principal do prompt ficaria de fora.
- **No mês, a fileira de bolinhas não conta contra `MONTH_MAX_CHIPS_PER_DAY = 3`**: ela é uma linha
  só, acima dos chips. Efeito colateral bem-vindo — um dia com 4 remédios deixa de gastar os 3
  chips e ainda mostra as tarefas de verdade.
- **A duração pontual passa a ser escolhível**: `TaskDurationQuickPick` ganha a opção "Pontual"
  (grava `0`) e `formatEstimatedDuration(0)` passa a devolver "Pontual" em vez de `""`. Sem isso a
  primeira cláusula do `isPointTask` seria inalcançável pela UI.
- **Fora de escopo**: arrastar bolinha para outro horário, editar a tarefa pela bolinha, refletir
  pontualidade no Gantt (lá o conceito já é `is_milestone`) e qualquer mudança em evento
  (`project_event` tem `starts_at`/`ends_at` reais e nunca é pontual).

## Tarefas

- [x] `src/domain/tasks/calendar.ts`: criar `isPointTask(task)` (pura) conforme a Decisão e
      `groupPointItems(items)`, que separa os itens pontuais dos demais e devolve
      `{ startMinutes: number | null, items: CalendarItem[] }[]` ordenado por horário (`null` =
      sem horário, primeiro). Verificação: `npm run build`.
- [x] Testes em `src/domain/tasks/__tests__/calendar.test.ts` para as duas funções: `estimated_duration`
      `0` é pontual; `null`/`undefined` **não** é; dose de medicação sem duração é; dose de medicação
      com duração informada não é; evento nunca é; agrupamento junta 3 tarefas das 08:00 numa fileira
      só e separa a das 09:00; itens sem horário caem no grupo `null`. Verificação: `npm test`.
- [x] `getItemTimeRange` passa a devolver `durationMinutes: 0` para tarefa pontual com horário (em
      vez do default de 30), preservando **exatamente** o comportamento atual para os demais casos.
      Verificação: os testes existentes "tarefa com due_time sem estimated_duration usa a duração
      default" e "tarefa sem due_time não entra na grade" continuam passando, mais um caso novo para
      o pontual.
- [x] `splitTimedItems`/`layoutTimedItems` deixam de receber itens pontuais (filtro na entrada do
      `AgendaHourGrid`, não dentro das funções puras, que continuam genéricas). Verificação: teste
      provando que 3 pontuais no mesmo horário **não** dividem a largura da coluna do dia.
- [x] Criar `src/pages/admin/tasks/PointTaskDots.tsx`: fileira de bolinhas com `role="group"`, cada
      bolinha um `<button>` com `aria-pressed`, `aria-label` `"Concluir: <título> (HH:mm)"` /
      `"Reabrir: …"`, tooltip com título + horário, e as classes de `--success` da Decisão.
      Recebe `items`, `onToggle?` e `onOverflowClick?`. Verificação: `npm run build && npm run lint`.
- [x] Estados da bolinha no mesmo componente: pendente (vazada), concluída (verde com `Check`),
      virtual (vazada, `disabled`, `opacity-60`, tooltip "ocorrência futura"), e sem `onToggle`
      (somente leitura, sem `hover`, usado pelo Gantt). Verificação: testes em
      `src/pages/admin/tasks/__tests__/PointTaskDots.test.tsx` cobrindo os quatro.
- [x] Overflow: acima de 8 bolinhas na fileira, mostrar 8 + botão "+N", que chama `onOverflowClick`.
      Verificação: teste com 12 itens — 8 bolinhas e o rótulo "+4", e o clique dispara o handler.
- [x] Teclado e foco: `Enter`/`Espaço` alternam, `Tab` percorre as bolinhas na ordem do horário, e o
      foco não é perdido depois do toggle (a lista re-renderiza). Verificação: testes de teclado no
      mesmo arquivo.
- [x] `AgendaHourGrid.tsx`: aceitar `onToggleTaskDone?` (opcional — `GanttChart.tsx:669` não passa)
      e renderizar, para cada dia, as fileiras de `groupPointItems` posicionadas por
      `topPercent` do horário, com altura fixa, acima da camada dos blocos e **abaixo** de nada que
      roube clique dos alvos de "novo slot" das 066/067. Verificação: `npm run build`; teste
      conferindo que clicar numa bolinha **não** abre o dialog de criar evento.
- [x] `AgendaHourGrid.tsx`: pontuais sem horário entram na `UntimedStrip` como bolinhas (e não como
      `TaskChip`). Verificação: caso novo em `AgendaHourGrid.test.tsx`.
- [x] `AgendaGrid.tsx` (visão mês): antes dos chips da célula do dia, renderizar uma linha única de
      bolinhas com os pontuais daquele dia; os pontuais saem da contagem de
      `MONTH_MAX_CHIPS_PER_DAY`. O overflow da fileira abre o dialog de dia (`dayModalKey`).
      Verificação: teste no `AgendaGrid.test.tsx` — dia com 4 remédios + 3 tarefas comuns mostra 4
      bolinhas e os 3 chips, sem "+N mais" indevido.
- [x] Ligar `toggleTaskDone` (já existente em `AgendaGrid.tsx:453`) às bolinhas do mês e passar como
      `onToggleTaskDone` para o `AgendaHourGrid`. Verificação: `npm run build && npm run lint`.
- [x] Teste do gesto ponta a ponta em `src/pages/admin/tasks/__tests__/AgendaGrid.point-tasks.test.tsx`:
      clicar numa bolinha pinta de verde **antes** da resposta da API (update otimista), chama
      `updateTask({ id, status: "done" })`, e clicar de novo volta para `todo`; falha da API reverte
      a cor e mostra toast destrutivo. Lembrar de replicar em todos os `AgendaGrid*.test.tsx` os
      mocks de `@/api/tasks` se algum import novo entrar (footgun registrado nas Notas das 065/066/067).
      Verificação: `npm test`.
- [x] Migrar `STATUS_DOT_CLASS.done` de `bg-green-500` para `bg-success` em `AgendaGrid.tsx`.
      Verificação: `npm run build`; `AgendaGrid.test.tsx` e `AgendaGrid.consultation.test.tsx`
      seguem passando.
- [x] `TaskDurationQuickPick.tsx`: opção "Pontual" gravando `estimated_duration = 0`, e
      `formatEstimatedDuration(0)` (`src/domain/tasks/duration.ts`) passando a devolver "Pontual".
      Verificação: caso novo em `duration.test.ts` + teste do quick pick escolhendo "Pontual".
- [x] Corrigir `AgendaGrid.openTaskFromChip` (`:414-437`), que hoje **não** copia
      `estimated_duration`, `is_medication` nem `is_consultation` para o form: sem isso, editar uma
      tarefa pontual pela Agenda apagaria a pontualidade dela. Verificação: teste abrindo o form a
      partir de uma tarefa pontual e conferindo que salvar sem mexer em nada mantém
      `estimated_duration: 0`.
- [x] `src/api/health/medications.ts`: doses novas passam a nascer com `estimated_duration: 0`
      explícito, para que a segunda cláusula do `isPointTask` seja só rede de segurança das doses
      antigas. Verificação: `tasks.medication-materialization.test.ts` assere o campo nas linhas
      inseridas.
- [x] Passada final: `npm run build`, `npm run lint`, `npm run check:bundle` e a suíte completa
      (`npx vitest run --testTimeout=30000 --hookTimeout=30000 --maxWorkers=4`), registrando em
      Notas qualquer teste alheio ajustado.
- [x] Checagem de satisfação do `prompt:`, artefato por trecho, sem navegador: "tarefas que não têm
      duração … lista de bolinhas, uma na frente da outra" → `calendar.test.ts` (`groupPointItems`)
      + `PointTaskDots.test.tsx`; "no prazo marcado" → o posicionamento por `topPercent` testado em
      `AgendaHourGrid.test.tsx`; "na visualização de semana/dia ou até mês" → um teste por visão;
      "eu consiga marcar a bolinha, ela fica verde" → `AgendaGrid.point-tasks.test.tsx`; "remédios"
      → o caso de dose de medicação em `calendar.test.ts`; "trocar lençol/escova" (sem horário) →
      o caso da `UntimedStrip`. Faltou algo? Tarefa nova aqui, não fechar.

## Prompts

- 2026-08-18 — "- Na visão da agenda, coloque essas tarefas que não tem duração , por exemplo tomar uma tarefa, com uma lista de bolinhas, uma na frente da outra, no prazo marcado, de modo que na visualização de semana/dia ou até mês eu consiga marcar a bolinha, ela fica verde e sabemosq ue a tarefa foi concluída. tipo tarefas pontuais, como trocar lençol, trocar escova, remédios etc"

## Notas
- A dose de medicação passou a ser pontual **de fato** na tela, e isso mudou um teste alheio:
  `AgendaGrid.consultation.test.tsx` (feature 061) afirmava que "Losartana" era um chip com ponto de
  status. Agora ela é bolinha. O caso foi reescrito preservando o que a 061 cobre (medicação não
  ganha o marcador de consulta) e afirmando a realidade nova: `getByRole("button", { name:
  "Concluir: Losartana" })` existe e `queryByText("Losartana")` não — o título virou `aria-label`.
- Desvio do texto de `## Tarefas` (não pedido pelo usuário), a favor do que a seção `## Decisões`
  declara: o rótulo final da fileira **não** aparece só no overflow. Com `onOverflowClick` presente
  (visão Mês) ele existe sempre — "+N" quando sobrou gente de fora, "N pontuais" quando todas
  couberam. Sem isso a bolinha seria um beco sem saída: ela só conclui, e uma tarefa pontual criada
  com título/horário errado não teria nenhum caminho para o form na Agenda. Nas grades de hora e no
  Gantt (sem handler) o rótulo continua só informando o excedente.
- A correção de `openTaskFromChip` era mais necessária do que o planning supôs, e por outro motivo:
  `updateTask` só grava as colunas presentes no payload, então a ausência de `estimated_duration` não
  apagava nada no banco por si. O caminho real de perda é `TaskRecurrenceField`, que devolve
  `estimated_duration` junto com as datas no seu `onChange` — mexer na data de uma tarefa pontual
  escrevia `estimated_duration: undefined` no form e no estado local. Copiar o campo na abertura do
  form fecha os dois casos.

- 2026-09-25 — **Passada final.** Suíte completa: **179 arquivos, 1754 testes, 0 falhando**
  (`npx vitest run --testTimeout=30000 --hookTimeout=30000 --maxWorkers=4`). `npm run build` sem
  erro, `npm run lint` com **0 erros** (18 warnings `react-refresh/only-export-components`,
  pré-existentes, nenhuma em arquivo desta feature), `npm run check:bundle` → `Bundle budget OK.`

  **Nenhum teste alheio precisou de ajuste.** É o resultado esperado aqui, e vale dizer por quê: a
  pontualidade é **derivada** de colunas que já existiam (`estimated_duration`, `is_medication`), não
  um campo novo — nenhum mock de API ficou incompleto e nenhum fixture teve de ganhar propriedade.
  Os dois arquivos de Agenda que já existiam (`AgendaGrid.test.tsx`,
  `AgendaGrid.consultation.test.tsx`) passam intactos, o que também é a prova de que a fileira de
  bolinhas não roubou clique dos blocos de evento e de tarefa comum.

- 2026-09-25 — **Checagem de satisfação do `prompt:`**, trecho por trecho → artefato que prova.
  Todos rodados nesta data; **118 testes** nos 7 arquivos, todos passando. Nenhum navegador.

  | trecho do pedido, verbatim | artefato | o que ele prova |
  |---|---|---|
  | "tarefas que não tem duração" | `calendar.test.ts` — `isPointTask` | `0` é pontual, `null` **não** é (tarefa sem duração informada continua bloco comum), dose sem duração é |
  | "com uma lista de bolinhas, uma na frente da outra" | `calendar.test.ts` — `groupPointItems` + `PointTaskDots.test.tsx` | 3 tarefas das 08:00 numa fileira só; 09:00 em fileira separada |
  | "no prazo marcado" | `AgendaHourGrid.test.tsx` | posicionamento por `topPercent` (06:00 → `top` 25%) e "3 pontuais no mesmo horário NÃO dividem a largura da coluna" |
  | "na visualização de semana/dia ou até mês" | `AgendaGrid.point-tasks.test.tsx` | um caso por visão — Mês, Semana e Dia marcando |
  | "eu consiga marcar a bolinha, ela fica verde" | `AgendaGrid.point-tasks.test.tsx` | verde **antes** da resposta da API, `updateTask({ status: "done" })`, reversão + toast na falha |
  | "remédios" | `calendar.test.ts` + `tasks.medication-materialization.test.ts` | dose de medicação nasce pontual (`estimated_duration: 0`) |
  | "trocar lençol, trocar escova" (sem horário) | `AgendaGrid.point-tasks.test.tsx` — caso da `UntimedStrip` | pontual sem horário aparece na faixa do dia, não às 00:00 |
  | "sabemos que a tarefa foi concluída" | `PointTaskDots.test.tsx` | os quatro estados da bolinha, o rótulo "N pontuais", overflow "+4", e teclado (`Enter`/`Espaço`, ordem do `Tab`) |

  **Nada ficou faltando, e nenhuma tarefa nova foi aberta.** Um ponto que o prompt não pediu e ficou
  de fora de propósito: marcar a bolinha conclui a **tarefa**, não uma ocorrência isolada de uma
  série — recorrência tem vocabulário próprio (009) e mexer nisso aqui seria outra feature.


## Como testar

### 1. Pré-requisitos

- **Nenhuma migration nova.** A feature não mexe em schema: ela deriva a pontualidade de colunas que
  já existem (`task.estimated_duration`, nullable desde
  `supabase/migrations/20260814000000_task_estimated_duration.sql`, e `task.is_medication`).
  Confirmado por consulta ao banco remoto em 25/09 (`information_schema.columns`). A trava da 066
  (`20260817120000_event_task_link.sql` não aplicada) **não** afeta nada aqui.
- `npm install` e `npm run dev`; logar com o usuário de sempre (RLS é por `user_id`).
- Dado necessário, criado pela própria UI em Produtividade → Tarefas:
  - 3 tarefas com **prazo hoje**, **horário 08:00** e duração **"Pontual"** (no form da tarefa, aba
    "Data" → o relógio/`+ Duração` → botão "Pontual"). Ex.: "Losartana", "Vitamina D", "Ômega 3".
  - 1 tarefa com prazo hoje, **sem horário** e duração "Pontual" — ex.: "Trocar lençol".
  - 3 tarefas comuns com prazo hoje e horário 14:00, **sem** duração ("+ Duração" intocado).
  - Opcional, para o caminho da medicação: um tratamento em Vida → Saúde → Medicações com horário
    08:00 — as doses nascem pontuais sozinhas (`estimated_duration: 0`).

### 2. Verificação automatizada

Um comando por linha. "Passou" = exit 0 e nenhum teste vermelho.

```
npx vitest run src/domain/tasks/__tests__/calendar.test.ts
npx vitest run src/pages/admin/tasks/__tests__/PointTaskDots.test.tsx
npx vitest run src/pages/admin/tasks/__tests__/AgendaGrid.point-tasks.test.tsx
npx vitest run src/pages/admin/tasks/__tests__/AgendaHourGrid.test.tsx
npx vitest run src/pages/admin/tasks/__tests__/TaskDurationQuickPick.test.tsx src/domain/tasks/__tests__/duration.test.ts
npx vitest run src/api/__tests__/tasks.medication-materialization.test.ts
npx vitest run src/pages/admin/tasks/__tests__/AgendaGrid.consultation.test.tsx
npm run build
npm run lint
npm run check:bundle
npx vitest run --testTimeout=30000 --hookTimeout=30000 --maxWorkers=4
```

O que cada um significa:

- `calendar.test.ts` — 33 testes; prova `isPointTask` (0 é pontual, `null` não é, dose sem duração é,
  dose com duração não é) e `groupPointItems` (3 tarefas das 08:00 numa fileira só, 09:00 separada,
  sem horário no grupo `null`, evento nunca pontual).
- `PointTaskDots.test.tsx` — 14 testes; os quatro estados da bolinha, o overflow ("+4" com 12 itens),
  o rótulo "N pontuais" sem overflow, e teclado (`Enter`/`Espaço`, ordem do `Tab`, foco preservado).
- `AgendaGrid.point-tasks.test.tsx` — 10 testes; o gesto ponta a ponta: verde **antes** da resposta da
  API, `updateTask({ id, status: "done" })`, reabrir, reversão + toast destrutivo na falha, mês com 4
  remédios + 3 chips sem "+N mais", Semana e Dia marcando também, e salvar uma pontual pelo form sem
  perder `estimated_duration: 0`.
- `AgendaHourGrid.test.tsx` — 30 testes; inclui "3 pontuais no mesmo horário NÃO dividem a largura da
  coluna", o `top` de 25% para as 06:00, e "clicar numa bolinha não dispara `onCreateAt`".
- `TaskDurationQuickPick.test.tsx` + `duration.test.ts` — o preset "Pontual" grava `0` e
  `formatEstimatedDuration(0)` devolve "Pontual".
- `tasks.medication-materialization.test.ts` — as linhas realmente enviadas ao `insert` levam
  `estimated_duration: 0`.
- `AgendaGrid.consultation.test.tsx` — a 061 continua válida com a dose virando bolinha.
- Suíte inteira: **179 arquivos / 1754 testes**. `npm test` puro estoura timeout em arquivos
  aleatórios nesta máquina; use os timeouts explícitos acima.

### 3. Verificação manual, passo a passo

1. Vá em **Produtividade → Agenda** (`/tasks/agenda`), visão **Mês**, no mês de hoje.
   → Na célula de hoje aparece **uma linha de bolinhas vazadas** (uma por tarefa pontual, 4 no
   total contando "Trocar lençol"), acima dos chips, e o rótulo **"4 pontuais"** no fim da linha.
2. Confira que os **3 chips** das tarefas comuns continuam visíveis e que **não** existe "+1 mais".
   → As bolinhas não gastam nenhum dos 3 chips do dia.
3. Clique numa bolinha.
   → Ela fica **verde** com um ✓ **na hora** (antes de qualquer ida ao servidor). Recarregue a
   página (F5): continua verde. Em Tarefas, aquela tarefa está `done`.
4. Clique na mesma bolinha de novo.
   → Volta a vazada, e a tarefa volta para `todo`.
5. Clique no rótulo **"4 pontuais"**.
   → Abre o dialog do dia com todos os itens; clicar num deles abre o form completo da tarefa. Salve
   sem mexer em nada e reabra: a duração continua **"Pontual"**.
6. Troque para a visão **Semana**.
   → Na coluna de hoje, na altura das **08:00**, há **uma** fileira com as 3 bolinhas lado a lado —
   não três retângulos de um terço de largura. "Trocar lençol" está na faixa **"Sem horário"**, no
   topo, também como bolinha.
7. Clique numa bolinha na visão Semana.
   → Fica verde. **Não** abre o dialog "Novo evento" (o alvo de criar evento fica embaixo dela).
8. Clique numa área vazia de qualquer hora sem bolinha.
   → Aí sim abre "Novo evento" com a hora pré-preenchida (comportamento da 067, intacto).
9. Troque para a visão **Dia**: mesmo resultado do passo 6/7.
10. Em **Produtividade → Gantt**, preset "Dia", clique em "Focar dia" num dia com pontuais.
    → As bolinhas aparecem, mostrando verde/vazado, mas **não** são clicáveis (só leitura).
11. Teclado, na visão Mês: `Tab` até a primeira bolinha e `Enter`.
    → Alterna, e o **foco permanece na mesma bolinha** (a lista re-renderiza sem perder o foco).
    `Espaço` alterna de volta.

### 4. Casos de borda e caminhos negativos

- **Recorrência futura (ocorrência virtual)**: numa tarefa pontual recorrente, a bolinha da próxima
  ocorrência ainda não criada aparece **vazada, opaca e não clicável**, com tooltip "… — ocorrência
  futura, ainda não criada". Clicar nela não faz nada e **não** cria linha no banco.
- **Mais de 8 pontuais no mesmo dia**: mostra 8 bolinhas + **"+N"**; clicar no "+N" abre o dialog do
  dia com a lista completa.
- **Duração real**: uma tarefa com duração 15/30/60 min continua **bloco retangular**, nunca bolinha.
  Uma tarefa **sem** duração (`+ Duração` intocado) também continua bloco de 30 min — só `0`
  ("Pontual") e dose de medicação sem duração viram bolinha.
- **Dose de medicação com duração informada**: se você abrir a dose e escolher "30min", ela **deixa**
  de ser bolinha e volta a ser bloco. O usuário manda.
- **Falha de rede**: desligue a rede (DevTools → Offline) e clique numa bolinha. Ela pisca verde,
  **volta a vazada** e aparece um toast vermelho "Erro — Não foi possível atualizar a tarefa."
- **Filtro de projeto**: com o filtro em um projeto, só as bolinhas das pontuais daquele projeto
  aparecem; em "Sem projeto", só as pontuais sem projeto.
- **Evento de agenda nunca é bolinha**: um evento às 08:00 continua bloco, mesmo ao lado das
  bolinhas do mesmo horário.

### 5. Sinais de que quebrou

- Três remédios das 08:00 voltando a aparecer como **três retângulos estreitos** lado a lado → o
  filtro de pontuais antes de `layoutTimedItems` saiu do `AgendaHourGrid`.
- Bolinha que **não** muda de cor no clique, ou que só muda depois de um tempo → `toggleTaskDone`
  deixou de estar ligada ao `onToggleTaskDone`, ou o update otimista se perdeu.
- Bolinha que abre o dialog **"Novo evento"** → a fileira caiu para trás da camada dos alvos de
  criação da 067 (ordem no DOM / `pointer-events`).
- Verde diferente do verde de "feito" dos chips na mesma tela → alguém trocou `bg-success` por uma
  cor literal (`bg-green-500`).
- Tarefa pontual que, depois de editada pelo form da Agenda, volta a ser bloco de 30 min →
  `openTaskFromChip` parou de copiar `estimated_duration`.
- Dia do mês que passa a mostrar "+N mais" com menos de 4 tarefas comuns → as bolinhas voltaram a
  contar contra `MONTH_MAX_CHIPS_PER_DAY`.
- Doses de medicação duplicadas no calendário → nada a ver com esta feature, mas confira `dose_time`:
  a feature não toca nesse campo.
