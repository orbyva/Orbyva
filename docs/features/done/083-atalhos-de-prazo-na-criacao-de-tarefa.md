---
prompt: |
  - ao criar uma tarefa, colocar também no 'prazo' um botão auxiliar para 'hoje', 'esta semana', 'este mês' e aí sim o botão do calen´dario para poder selecionar a data em específico
---

# 083 — Atalhos de prazo (Hoje / Esta semana / Este mês) na criação de tarefa

## Contexto

Hoje, no form de criar/editar tarefa, o prazo só tem **um** caminho: o `DatePicker`
(`src/components/DatePicker.tsx`) renderizado por `TaskRecurrenceField.tsx` (`:341` no ramo normal,
`:280` no ramo `isSubtask`). Para pôr uma tarefa "para hoje" — o caso mais comum — são no mínimo
dois cliques: abrir o popover e clicar em "Hoje" no rodapé do `InlineCalendarPicker`
(`DatePicker.tsx:143-151`). Para "até o fim da semana" ou "até o fim do mês" não há atalho nenhum:
o usuário precisa contar os dias no calendário e acertar o dia certo na mão.

O app **já tem** a definição canônica desses três prazos, e ela está em uso na própria lista de
tarefas: `bucketForDueDate` (`src/domain/tasks/agenda.ts:52`) classifica cada tarefa em
`today` / `this_week` (até o **sábado**, porque `endOfWeekIso` usa `6 - getDay()` e o calendário
abre a semana no domingo, `weekStartsOn={0}`) / `this_month` (até o **último dia do mês**,
`endOfMonthIso`), e `AGENDA_BUCKET_LABELS` já dá os rótulos "Hoje", "Esta semana" e "Este mês" —
exatamente as três palavras do pedido. Ou seja: os atalhos não precisam inventar semântica nova;
eles são o inverso de uma função que já existe, e cada botão passa a significar literalmente "cai
nesta caixa da lista".

Esta feature foi conferida contra a skill `form-design`: 3 opções (≤5) mandam **botões visíveis**,
nunca opções escondidas atrás de um clique — o teste da CXL com 354 usuários mede ~2,5s de
diferença. É a crítica exata do estado atual, onde "Hoje" existe só **dentro** do popover.

## Decisões

- **Relação com a `080` (painel denso): independentes, sem bloqueio, com um ponto de costura
  registrado nos dois arquivos.** A `080` reordena e adensa o formulário e move a "Data limite" de
  `TaskRecurrenceField` para o **bloco 3** do painel (Projeto + operadores de tempo); esta feature
  muda **o que o campo de prazo oferece**, não onde ele fica. O atalho nasce como um componente
  autocontido (`TaskDueShortcuts`) plugado onde o campo Prazo estiver **no momento da
  implementação**: hoje `TaskRecurrenceField`; se a `080` entrar antes, direto no bloco 3. Para o
  refactor da `080` não apagar o atalho sem perceber, a `080` recebe uma Decisão + uma tarefa
  dizendo que o bloco 3 carrega o `TaskDueShortcuts` junto com a "Data limite".
  - **Descartado — virar tarefas dentro da `080`**: a `080` é reorganização de layout, sem campo
    novo e sem mudança de comportamento ("Sem campo novo e sem campo removido", nas Decisões dela);
    esta feature é comportamento (semântica de data, estado ativo, regra pura testável). Misturar as
    duas faria a `080` — já com 22 tarefas — carregar risco funcional dentro de um refactor visual.
- **"Esta semana" = fim da semana (sábado). "Este mês" = último dia do mês.** Não é "+7 dias" nem
  "+30 dias": é a mesma fronteira que `bucketForDueDate` já usa para montar as caixas da lista, e é
  o que faz o botão "Esta semana" pôr a tarefa dentro do bloco "Esta semana". A regra pura vira
  `dueDateForShortcut(shortcut, todayIso)` no **mesmo arquivo** (`src/domain/tasks/agenda.ts`), com
  `endOfWeekIso`/`endOfMonthIso` (hoje privadas) exportadas — duas definições de "fim da semana" em
  arquivos diferentes é como essa coerência se perde na próxima sessão.
- **Bordas de calendário, decididas explicitamente**:
  - **Hoje é sábado** → "Esta semana" resolve para o próprio dia, igual a "Hoje". Os dois botões
    ficam ativos ao mesmo tempo (é a verdade: resolvem para a mesma data). Não desabilitar, não
    esconder — botão que some sem explicação é pior que botão redundante.
  - **Hoje é o último dia do mês** → "Este mês" resolve para hoje. Mesmo tratamento.
  - **Hoje é sábado E último dia do mês** → os três coincidem; nada quebra, os três ficam ativos.
  - **Domingo** → "Esta semana" resolve para o sábado seguinte (6 dias à frente), não para "daqui a
    uma semana".
  - O atalho **nunca** produz data no passado: `dueDateForShortcut` só devolve `>= todayIso`.
- **Estado ativo = a data atual do campo é exatamente a data que o atalho resolve**
  (`due_date === dueDateForShortcut(s, todayIso)`), com `aria-pressed`. Clicar num atalho já ativo é
  no-op — não limpa o prazo (limpar continua sendo o "Limpar" do calendário; atalho que apaga dado
  por engano é perda silenciosa).
  - **Descartado — destacar pelo bucket** (`bucketForDueDate(due_date) === s`): parece mais
    informativo, mas quebra o contrato de `aria-pressed`: com prazo numa quarta-feira, "Esta semana"
    apareceria pressionado e clicar nele **mudaria** a data (quarta → sábado). Botão pressionado que
    muda valor ao ser clicado é exatamente o que o toggle não pode fazer.
- **A data resolvida não fica escondida.** Cada botão leva `aria-label` completo ("Esta semana —
  sábado, 22/08/2026") e `ActionTooltip` com o mesmo texto; e, depois do clique, o próprio
  `DatePicker` ao lado passa a exibir a data em `dd/MM/yyyy` — o feedback existe também no touch,
  onde tooltip não aparece.
- **Layout: label "Prazo" em cima (como já é), e uma linha só com `[Hoje] [Esta semana] [Este mês]`
  seguidos do botão do calendário** — a ordem literal do pedido ("e aí sim o botão do calendário").
  O botão do calendário continua sendo o `DatePicker` atual, com o texto da data (é o display do
  valor, não vira ícone mudo). Abaixo de `sm` a linha quebra (`flex-wrap`) e os alvos vão para
  ≥44px, como a `080` já exige do painel.
- **Widget: botões visíveis, nunca `Select`.** Regra da `form-design` para ≤5 opções, e o mesmo
  padrão visual que `TaskDurationQuickPick` e `TaskPriorityField` já usam no app
  (`Button size="sm"` `h-7 px-2.5 text-xs`, ativo = `variant="secondary"` + `border-primary/40`) —
  não inventar um estilo de chip novo.
- **O atalho escreve o prazo pelo caminho que já existe, não por `onChange` cru.** Em
  `TaskRecurrenceField`, quem muda a data é `selectDueDate` (`:243-249`), que reconstrói a
  `recurrence_rule` quando o modo é "simple". Um atalho que chamasse `onChange({...value, due_date})`
  direto deixaria a regra de recorrência dessincronizada da data — bug real, e é por isso que existe
  teste dedicado a isso na lista de tarefas abaixo.
- **Horário, duração e "tarefa pontual" não são tocados.** Escolher um atalho preserva `due_time`,
  `estimated_duration` e `is_quick` exatamente como estão — o atalho é sobre o dia. (No ramo
  `isSubtask` do `TaskRecurrenceField` só existem Prazo/Horário; vale o mesmo.)
- **Subtarefa: atalho que estoura o prazo da tarefa-mãe fica desabilitado**, com tooltip dizendo o
  porquê ("Passa do prazo da tarefa principal — 20/08/2026"). O `DatePicker` do ramo `isSubtask` já
  recebe `maxDate={parentDueDate}` e bloqueia os dias no calendário; o atalho tem de respeitar o
  mesmo limite, senão vira a única porta para criar um estado que `isSubtaskDueDateValid` rejeita no
  salvamento.
- **`todayIso` é calculado no render, não memoizado com `[]`.** O dialog pode ficar aberto passando
  da meia-noite; `useMemo(..., [])` congelaria "hoje" no dia anterior. É barato (uma formatação de
  data) e o componente já re-renderiza a cada mudança de campo.
- **Fora de escopo: o popover de edição rápida (`TaskDueQuickEdit`).** O pedido é sobre a criação, a
  feature `041` acabou de **encolher** aquele popover de propósito, e o `InlineCalendarPicker`
  compacto de lá já traz "Hoje" no rodapé. Se o usuário pedir os três atalhos lá também, é prompt
  novo — registrar em `## Prompts` e reusar o mesmo componente (ele nasce genérico o bastante).
- **Fora de escopo: input mascarado DD/MM/AAAA.** A `form-design` prefere data digitada a três
  dropdowns; o app não tem três dropdowns — tem calendário. Não é o problema que o pedido descreve.
- **Nada de migration** — é comportamento de tela, nenhum campo novo.

## Tarefas

- [x] `src/domain/tasks/agenda.ts`: exportar `endOfWeekIso` e `endOfMonthIso` (hoje privadas) e
      adicionar `DUE_DATE_SHORTCUTS` (`["today", "this_week", "this_month"]`, tipado como subconjunto
      de `AgendaBucket`) + `DueDateShortcut`. Verificação: `npm run build`
- [x] `src/domain/tasks/agenda.ts`: `dueDateForShortcut(shortcut: DueDateShortcut, todayIso: string):
      string` — `today` → `todayIso`; `this_week` → `endOfWeekIso(todayIso)`; `this_month` →
      `endOfMonthIso(todayIso)`. Exportar em `src/domain/tasks/index.ts`.
      Verificação: `npm run build && npm run lint`
- [x] Testes de `dueDateForShortcut` em `src/domain/tasks/__tests__/agenda.test.ts`: dia de meio de
      semana no meio do mês (os três resultados distintos), **domingo** (semana → sábado seguinte),
      **sábado** (semana → o próprio dia), **último dia do mês** (mês → o próprio dia), **31 de
      dezembro** (mês → 31/12, sem virar ano), e **fevereiro bissexto** (29/02/2028).
      Verificação: `npm test src/domain/tasks`
- [x] Teste de invariante no mesmo arquivo: varrendo todos os dias de um intervalo de ~3 meses,
      `dueDateForShortcut(s, dia) >= dia` sempre, e `bucketForDueDate(dueDateForShortcut(s, dia), dia)`
      é `s` **ou** um bucket mais urgente (nunca `later`/`overdue`) — é o contrato "o atalho põe a
      tarefa na caixa que o botão nomeia". Verificação: `npm test src/domain/tasks`
- [x] Criar `src/pages/admin/tasks/TaskDueShortcuts.tsx`: `role="group"` + `aria-label="Atalhos de
      prazo"`, três `Button` (`h-7 px-2.5 text-xs`) com rótulos vindos de `AGENDA_BUCKET_LABELS`,
      props `value: string | null`, `onSelect: (iso: string) => void`, `maxDate?: string | null`,
      `todayIso?: string` (default `formatLocalIsoDate(new Date())`, calculado no render).
      Verificação: `npm run build && npm run lint`
- [x] `TaskDueShortcuts`: estado ativo por igualdade exata (`value === dueDateForShortcut(...)`) com
      `aria-pressed` + `variant="secondary"`/`border-primary/40`, e clique em atalho já ativo como
      no-op. Verificação: `npm run build && npm run lint`
- [x] `TaskDueShortcuts`: `aria-label` completo por botão ("Esta semana — sábado, 22/08/2026", data
      formatada com `date-fns`/`ptBR`) e `ActionTooltip` com o mesmo texto.
      Verificação: `npm run build && npm run lint`
- [x] `TaskDueShortcuts`: `maxDate` desabilita o atalho cuja data resolvida o ultrapassa, com tooltip
      "Passa do prazo da tarefa principal — dd/MM/yyyy" (o `disabled` precisa continuar focável para
      leitor de tela — usar `aria-disabled` + clique inerte, não só `disabled`).
      Verificação: `npm run build && npm run lint`
- [x] `TaskDueShortcuts`: quebra de linha (`flex-wrap`) e alvo de toque ≥44px abaixo de `sm`,
      alinhado com o que a `080` exige do painel. Verificação: `npm run build && npm run lint`
- [x] Testes de `TaskDueShortcuts` em `src/pages/admin/tasks/__tests__/TaskDueShortcuts.test.tsx`
      (com `vi.setSystemTime`, padrão já usado em `AgendaGrid.*.test.tsx`): os três botões aparecem
      com os rótulos dos buckets; clicar em cada um chama `onSelect` com a ISO esperada.
      Verificação: `npm test src/pages/admin/tasks`
- [x] Testes de estado ativo: `value` igual à data do atalho → `aria-pressed="true"` só nele; `value`
      numa quarta-feira qualquer → **nenhum** botão pressionado; `value = null` → nenhum pressionado;
      num sábado, "Hoje" e "Esta semana" pressionados juntos.
      Verificação: `npm test src/pages/admin/tasks`
- [x] Teste de teclado: os três botões são alcançados por Tab na ordem visual, Enter e Espaço
      disparam `onSelect`, e o foco permanece no botão acionado (não pula para o calendário).
      Verificação: `npm test src/pages/admin/tasks`
- [x] Teste de `maxDate`: com prazo da mãe em 3 dias, "Esta semana"/"Este mês" que ultrapassam ficam
      inertes (não chamam `onSelect`) e anunciam o motivo.
      Verificação: `npm test src/pages/admin/tasks`
- [x] Plugar no **bloco 3 de `TaskFormFields.tsx`** (campo "Data limite", no ponto marcado pelo
      comentário "Costura com a feature 083"): `TaskDueShortcuts` na mesma linha do `DatePicker`,
      **antes** dele, chamando `editor.selectDueDate(iso)` — não `setForm` cru — e com
      `maxDate={parentDueDate}` quando `isSubtask` (o mesmo `parentDueDate` já calculado ali).
      Substitui as duas tarefas antigas "Plugar em `TaskRecurrenceField.tsx`" (ramo normal + ramo
      `isSubtask`), porque a `080` apagou esse componente — ver `## Notas`.
      Verificação: `npm run build && npm run lint`
- [x] Teste em `src/pages/admin/tasks/__tests__/TaskFormFields.test.tsx`: no form de **criação**,
      clicar "Este mês" deixa o campo de prazo com o último dia do mês corrente e o `DatePicker`
      exibindo essa data. Verificação: `npm test src/pages/admin/tasks`
- [x] Teste de preservação: com `due_time` preenchido ("09:30"), duração de 60min e/ou `is_quick`
      ligado, clicar num atalho muda **só** `due_date`. Verificação: `npm test src/pages/admin/tasks`
- [x] Teste de recorrência (o bug que `selectDueDate` evita): com modo "Recorrência simples"
      selecionado, clicar num atalho gera `recurrence_rule` coerente com a data nova (e mantém
      `time` = `due_time`); sem modo simples, `recurrence_rule` continua `null`.
      Verificação: `npm test src/pages/admin/tasks`
- [x] Teste de fim a fim do form: criar uma tarefa só com título + atalho "Hoje" e conferir o payload
      de `createTask` (`due_date` = hoje, `due_time` null, `recurrence_rule` null).
      Verificação: `npm test src/pages/admin/tasks`
- [x] Costura com a `080`: **já cumprida pela própria `080`**, que entrou primeiro. O arquivo dela
      (`docs/features/done/080-...md`) registra o hand-off nas Notas e o código deixou o ponto de
      inserção marcado por comentário no bloco 3. Nada a acrescentar lá — confirmar que o
      comentário de costura foi consumido (virou o `TaskDueShortcuts` de verdade)
- [x] `npx tsc -p tsconfig.app.json --noEmit && npm run build && npm run lint && npm test`, com a
      contagem registrada em `## Notas`
- [x] Verificação do pedido literal: no dialog de **criar tarefa**, o campo Prazo mostra "Hoje",
      "Esta semana" e "Este mês" **antes** do botão de calendário, e o calendário continua abrindo
      para escolher uma data específica

## Prompts

## Notas

- **Duas tarefas reescritas por hand-off da `080` (desvio meu, não pedido do usuário).** A `080`
  entrou antes desta feature e **apagou `TaskRecurrenceField.tsx`** (ver Notas dela em
  `docs/features/done/080-formulario-de-tarefa-em-painel-denso.md`): o formulário virou painel
  denso e a "Data limite" passou a ser montada direto no bloco 3 de `TaskFormFields.tsx`, com o
  ponto de inserção do atalho marcado por comentário no código e o handler correto já exposto
  (`editor.selectDueDate`). Consequências, ambas já previstas nas Decisões acima ("se a `080`
  entrar antes, direto no bloco 3"):
  1. As duas tarefas "Plugar em `TaskRecurrenceField.tsx`" (ramo normal + ramo `isSubtask`) viraram
     **uma** só, no bloco 3 — não há mais dois ramos, o mesmo campo serve tarefa e subtarefa, e o
     `maxDate` sai do `parentDueDate` que o painel já calcula (`TaskFormFields.tsx:99`).
  2. A tarefa "Costura com a `080`" virou no-op: a `080` já está em `done/` e já carrega o
     hand-off. Nada foi editado no arquivo dela (instrução da esteira: mexer só na `083`).
- **Checagem de satisfação, por código** (sem Chrome, como a skill `next` exige) — cada pedaço do
  `prompt:` com o teste que o comprova:
  - "ao criar uma tarefa" → `TaskList.form-panel.test.tsx` › "criar (feature 083): título + atalho
    'Hoje' chega no `createTask` como prazo de hoje" (payload real do salvamento: `due_date` = hoje,
    `due_time` null, `recurrence_rule` null).
  - "colocar **também** no 'prazo'" (soma, não troca) → `TaskFormFields.test.tsx` › "pedido literal:
    os atalhos não substituem o calendário — ele continua abrindo para escolher uma data específica".
  - "um botão auxiliar para 'hoje' / 'esta semana' / 'este mês'" → `TaskDueShortcuts.test.tsx` ›
    "mostra os três atalhos com os rótulos dos buckets da agenda, num group nomeado" + um teste de
    clique por atalho (`onSelect` com 19/08, 22/08 e 31/08 num "hoje" fixo em quarta-feira).
  - "e aí sim o botão do calendário" (ordem) → `TaskFormFields.test.tsx` › "no form de criação, os
    três atalhos aparecem **antes** do botão de calendário" (`compareDocumentPosition`).
  - "para poder selecionar a data em específico" → mesmo teste do pedido literal: abre o popover,
    escolhe o dia 15 na grade e o `due_date` do form termina em `-15`.
  - `## Prompts` está vazia: nenhum pedido novo do usuário chegou durante a implementação, então
    não há requisito extra a rastrear.
- **Contagem final da suíte**: 214 arquivos / 2229 testes (baseline antes da `083`: 213 / 2192 —
  +1 arquivo, `TaskDueShortcuts.test.tsx`, e +37 testes: 10 em `agenda.test.ts`, 18 no componente,
  8 em `TaskFormFields.test.tsx`, 1 em `TaskList.form-panel.test.tsx`).
  `npx tsc -p tsconfig.app.json --noEmit` limpo, `npm run build` OK, `npm run lint` 0 erros
  (81 warnings pré-existentes de `react-refresh/only-export-components`, nenhum nos arquivos desta
  feature), `npm run check:bundle` "Bundle budget OK" (teto de rota 160 KB gzip mantido).
  As duas únicas falhas da rodada cheia foram as intermitências já conhecidas de carga
  (`notaSemSintaxe` e `CanvasEditor`, ambas em `notes/`, nada tocado aqui) e uma terceira,
  `TaskList.form-panel` — as três estouram o `testTimeout` de 5s sob carga total e passam isoladas
  (reexecutadas: 11/11 e 4/4 verdes).
- **O `DatePicker` do prazo perdeu o `w-full`** (`className="w-auto"`). Com os atalhos no mesmo
  contêiner flex, `w-full` fazia o calendário ocupar 100% da linha e ser empurrado para baixo dos
  botões — o oposto da ordem pedida ("e aí sim o botão do calendário"). É o único ajuste de layout
  fora do componente novo; o `flex-wrap` do pai continua quebrando a linha sozinho no mobile.
- **Nome acessível do atalho bloqueado começa pelo rótulo, não pelo motivo.** O plano falava só do
  tooltip ("Passa do prazo da tarefa principal — dd/MM/yyyy"); usar esse texto como `aria-label`
  inteiro apagaria *qual* atalho está inerte para quem usa leitor de tela. Ficou
  `"Esta semana — sábado, 22/08/2026. Passa do prazo da tarefa principal — 21/08/2026"` no
  `aria-label`, e o motivo sozinho no tooltip, como decidido.
- **As cinco tarefas de `TaskDueShortcuts` foram verificadas juntas, não uma a uma.** A versão
  "só estrutura" (tarefa 5, sem estado ativo e sem `maxDate`) **não compila** neste projeto:
  `noUnusedParameters` transforma as props `value` e `maxDate` ainda não usadas em erro TS6133, e a
  verificação da própria tarefa (`npm run build`) falha. Como as tarefas 5–9 são aspectos do mesmo
  componente, elas entraram num arquivo só e passaram por `npm run build` + `npm run lint` (0 erros)
  de uma vez; a prova de comportamento vem dos testes das tarefas 10–13, como o plano já previa.
- **O invariante do plano estava incompleto — a varredura achou um terceiro colapso legítimo.** O
  texto original previa divergência de bucket só "quando o atalho colapsa em hoje (sábado / fim de
  mês)". Rodando os ~150 dias do teste, `2026-12-27` (domingo) falhou: "Este mês" resolve para
  31/12, mas a semana corrente vai até 02/01/2027, então a data cai na caixa **"Esta semana"**, não
  em "Este mês". Não é bug — sempre que o mês acaba **antes** do sábado, "Este mês" aterrissa numa
  caixa mais urgente que a que nomeia (a tarefa aparece mais cedo na lista, nunca mais tarde). O
  invariante foi generalizado para "índice em `AGENDA_BUCKET_ORDER` menor ou igual ao do atalho,
  nunca `later`/`overdue`", e o caso ganhou um teste nomeado próprio.
