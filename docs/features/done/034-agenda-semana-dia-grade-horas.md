---
prompt: |
  melhore a visualização de agenda semana e dia, adicione as horas. tipo no de dia, mostre todas as horas, e não somente os eventos. e aí encaixe o evento no canva das hroas. mesma ideia para sexta feira
---

# 034 — Grade de horas nas visões Semana e Dia da Agenda

## Contexto
`AgendaGrid.tsx` (`/tasks/agenda` e a aba Agenda de `TaskList.tsx`) tem três modos
(`CalendarViewMode`: `month`/`week`/`day`). Hoje mês e semana usam a mesma grade CSS de 7 colunas
(`grid-cols-7`, `TaskViews`-like chips por dia, `TaskChip`/`EventChip`), só variando a altura mínima
da célula; a visão dia é uma lista plana (`DayViewItemRow`) ordenada por horário
(`groupCalendarItemsByDay`, `src/domain/tasks/calendar.ts`, já ordena cada dia por
`due_time`/`starts_at` — tarefas sem horário vão por último), mas sem nenhuma noção visual de
"linha do tempo": só a lista, sem mostrar as horas do dia nem posicionar os itens proporcionalmente
a que hora ocorrem.

Pedido do usuário: nas visões Semana e Dia, mostrar as 24 horas do dia como uma grade/canvas (não só
os eventos que existem), e encaixar cada tarefa/evento na posição correspondente ao seu horário —
"mesma ideia para sexta feira" não faz sentido literal (não há tratamento hoje específico de sexta);
interpretado como "a mesma ideia [de grade de horas] pra semana inteira", já que o pedido é
"agenda semana **e** dia".

`Task.estimated_duration` (minutos) já existe (`src/types/tasks.ts`, migration não commitada
`20260814000000_task_estimated_duration.sql`) — dá pra usar como altura do bloco da tarefa no
canvas; `ProjectEvent.ends_at` (opcional) cobre o mesmo papel pra eventos. Mês fica fora do escopo
("agenda semana e dia") — continua com a grade de chips atual.

## Decisões
- Escopo: só os modos `week` e `day` de `AgendaGrid.tsx`. `month` inalterado.
- Novo componente `AgendaHourGrid.tsx` (ou seção dentro de `AgendaGrid.tsx`, decidir por tamanho na
  implementação): grade de 00:00–23:00 (rótulos de hora numa coluna fixa à esquerda) × N colunas de
  dia (1 para `day`, 7 para `week`), scrollável verticalmente, com auto-scroll pra hora atual (ou
  ~7h se for muito cedo/tarde) ao montar/trocar `focusDate`.
- Itens **com horário** (`due_time` definido, ou evento — sempre tem `starts_at`) são posicionados
  de forma absoluta dentro da coluna do dia: `top` proporcional ao horário de início, `height`
  proporcional à duração (`estimated_duration` da tarefa, ou `ends_at - starts_at` do evento;
  default curto — ex. 30min — quando não há duração/`ends_at`).
- Itens **sem horário** (tarefa com `due_date` mas sem `due_time`) continuam fora do canvas de
  horas: uma faixa "Sem horário" acima da grade (mesmo texto/estilo de chip que hoje), já que não
  fazem sentido posicionados numa linha do tempo.
- Sobreposição (dois itens no mesmo dia com horários que se cruzam): tratar de forma simples —
  dividir a largura da coluna entre os itens sobrepostos daquele intervalo (lado a lado), sem
  reimplementar um algoritmo de layout completo tipo Google Calendar; documentar a limitação se o
  caso ficar complexo demais pra cobrir 100% na implementação.
- Reaproveitar `groupCalendarItemsByDay`/`computeWeekDays` já existentes — só adicionar a separação
  timed/untimed e o cálculo de posição/altura em `src/domain/tasks/calendar.ts` (funções puras,
  testáveis).
- Clique num item do canvas continua abrindo os mesmos dialogs de hoje (`openTaskFromChip`/
  `openEventFromChip`, `CalendarTaskDialog`) — sem mudança de comportamento de edição.

## Tarefas
- [x] Em `src/domain/tasks/calendar.ts`: adicionar helper(s) puros pra (a) separar itens de um dia
      em "com horário" vs. "sem horário", e (b) calcular posição/altura (ex. em % ou minutos desde
      meia-noite) de um item com horário a partir de `due_time`/`estimated_duration` ou
      `starts_at`/`ends_at`.
- [x] Testes unitários (Vitest) desses helpers: item com duração definida, sem duração (default),
      evento com `ends_at`, evento sem `ends_at`, item sem horário (não entra na grade).
- [x] Criar `AgendaHourGrid.tsx`: colunas de hora (rótulos 00–23) × N dias, itens posicionados de
      forma absoluta via os helpers acima.
- [x] Resolver sobreposição: itens com horários cruzados no mesmo dia dividem a largura da coluna
      lado a lado.
- [x] Auto-scroll da grade pra hora atual (ou ~7h) ao montar/trocar `focusDate`.
- [x] Adicionar faixa "Sem horário" acima da grade, reaproveitando o estilo de chip atual
      (`TaskChip`/`EventChip`), pros itens sem `due_time`.
- [x] Trocar a visão `day` de `AgendaGrid.tsx` (hoje `DayViewItemRow` em lista) para usar
      `AgendaHourGrid` com 1 coluna.
- [x] Trocar a visão `week` de `AgendaGrid.tsx` (hoje grade CSS de 7 células) para usar
      `AgendaHourGrid` com 7 colunas.
- [x] Confirmar que `month` continua exatamente como está (nenhuma regressão).
- [x] `npx tsc --noEmit && npm run build && npm run lint && npm test`.
- [x] Testes de componente (Testing Library/jsdom) substituindo o item "Teste manual": dia com
      vários itens em horários diferentes, dia vazio, item sem horário (aparece na faixa "Sem
      horário"), dois itens sobrepostos no mesmo horário, semana inteira com a mesma grade, clique
      num item abre o dialog correto.

## Prompts

## Notas
- `npx tsc --noEmit` (rodado da raiz) não checa nada de verdade: `tsconfig.json` raiz tem
  `"files": []` e só referencia `tsconfig.app.json`/`tsconfig.node.json` via project references —
  sem `-b` ou `-p`, o comando roda mas percorre zero arquivos. Usei `npx tsc -p tsconfig.app.json
  --noEmit` (equivalente ao que `npm run build` faz de fato via `tsc -b`) pra verificação real; foi
  assim que achei o erro de narrowing abaixo. Vale registrar pra quem for confiar em
  `tsc --noEmit` sem `-p`/`-b` neste repo achando que está checando tipos.
- Bug real encontrado: em `AgendaHourGrid.tsx`, o ternário `entry.item.kind === "task" ? ... :
  ...` dentro de `timed.map` narrowava `entry.item` certinho no branch síncrono, mas os
  `onClick={() => onOpenTask(entry.item.task)}` (fecho/closure separado) perdiam o narrowing —
  TS não propaga o refinamento de um *property access* através de uma arrow function aninhada.
  Corrigido desestruturando `const { item } = entry` antes do ternário (binding local, não
  property access — narrowing sobrevive dentro dos closures). `npx tsc --noEmit` da raiz não
  pegou isso (ver nota acima); só apareceu ao rodar `npm run build`/`tsc -p tsconfig.app.json`.
- `npm test` tem 2 falhas pré-existentes e não relacionadas: `src/lib/__tests__/currency.test.ts`
  (`formatDateBR`/`formatDateTimeBR`) espera `"—"` (em travessão) mas recebe `"·"` — parece
  problema de encoding do ambiente de teste, não de lógica; arquivo não tocado por esta feature.
  Não bloqueei a implementação por causa disso (fora do escopo de 034), mas fica registrado pra
  não confundir uma rodada futura de `npm test`.
- Não há infraestrutura de teste de componente (Testing Library) no projeto — só Vitest sobre
  `.ts` puro. Optei por não introduzir essa infra só pra esta feature: toda a lógica nova
  (separação timed/untimed, posição %, sobreposição/colunas) está coberta por testes puros em
  `calendar.ts` (21 testes), que é onde mora o risco real de bug (matemática de posicionamento).
  A composição visual (JSX de `AgendaHourGrid.tsx`) fica coberta pelo teste manual (última tarefa
  da lista), como já é convenção deste repo pra esse tipo de verificação.
- Nota acima ficou obsoleta: a skill `next` foi atualizada em sessão posterior pra proibir
  Chrome/browser automation sem exceção e exigir cobertura automatizada real em vez de teste
  manual. A infra de teste de componente (Testing Library + jsdom) já existia nesta altura
  (`vite.config.ts` `environmentMatchGlobs`/`setupFiles`, `src/test/setup-jsdom.ts` — introduzida
  por outra feature deste mesmo diff, não por esta), então reescrevi a última tarefa: criei
  `src/pages/admin/tasks/__tests__/AgendaHourGrid.test.tsx` (13 testes — grade 00–23, posição de
  item por `due_time`/duração e por `starts_at`/`ends_at` de evento, default de 30min sem duração,
  colunas lado a lado em overlap batendo com `layoutTimedItems`, faixa "Sem horário" aparecendo/
  sumindo, clique chamando `onOpenTask`/`onOpenEvent`) e
  `src/pages/admin/tasks/__tests__/AgendaGrid.test.tsx` (3 testes, API mockada via
  `vi.mock("@/api/tasks")` — prova que a visão Mês não usa `AgendaHourGrid` (sem rótulo "00:00")
  e que trocar pra Semana/Dia troca de fato pra ela). Os testes de posição/overlap comparam contra
  `layoutTimedItems`/`computeItemPosition` chamados com os mesmos dados (não contra valores
  decimais calculados à mão), pra não depender de arredondamento de ponto flutuante e continuar
  provando que o componente usa esses helpers de verdade. `npm test` completo: 570 passando, 2
  falhas pré-existentes não relacionadas em `currency.test.ts` (já documentadas acima).
