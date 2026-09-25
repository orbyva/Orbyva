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
- [ ] `src/api/health/medications.ts`: doses novas passam a nascer com `estimated_duration: 0`
      explícito, para que a segunda cláusula do `isPointTask` seja só rede de segurança das doses
      antigas. Verificação: `tasks.medication-materialization.test.ts` assere o campo nas linhas
      inseridas.
- [ ] Passada final: `npm run build`, `npm run lint`, `npm run check:bundle` e a suíte completa
      (`npx vitest run --testTimeout=30000 --hookTimeout=30000 --maxWorkers=4`), registrando em
      Notas qualquer teste alheio ajustado.
- [ ] Checagem de satisfação do `prompt:`, artefato por trecho, sem navegador: "tarefas que não têm
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
