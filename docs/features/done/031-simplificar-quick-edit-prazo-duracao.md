---
prompt: |
  modal quick edit task está muito grande, simplifique as datas, colocando ícones ao invés dos inputs tão grandes. simplifique a duração colocando um relógio.
---

# 031 — Simplificar quick edit de prazo e duração

## Contexto
O popover de edição rápida de prazo (`TaskDueQuickEdit.tsx`, criado na feature `done/029` e usado
em `TaskListRow`/`TaskList.tsx` e `ProjectDetail.tsx`) cresceu demais desde então: hoje mostra,
empilhados, um label "Prazo", o calendário inteiro (`InlineCalendarPicker`), um campo "Horário"
(`<Input type="time">` de largura total) e — numa sessão anterior não commitada, sem feature
própria — um campo "Duração (minutos)" (`<Input type="number">`, também largura total, texto
livre). O resultado é um popover alto, com dois inputs genéricos empilhados que não comunicam
visualmente o que representam.

`estimated_duration` (minutos, nullable) já existe na `Task` (`src/types/tasks.ts`) e numa
migration ainda não commitada (`supabase/migrations/20260814000000_task_estimated_duration.sql`)
— o campo em si não é escopo desta feature, só a forma como ele é editado no popover rápido.
Pedido do usuário: trocar os inputs grandes por ícones — datas mais compactas, e a duração editada
via algo "tipo relógio" em vez de um número digitado.

## Decisões
- Escopo: só `TaskDueQuickEdit.tsx` (reflete automaticamente em Lista e `ProjectDetail.tsx`, que
  já o usam). O form completo (`TaskRecurrenceField.tsx`, aba "Data e repetição") fica fora desta
  feature — ganha campo de duração só se a feature `031`→`032` (duração aplicada ao Gantt) decidir
  que precisa, reaproveitando o componente criado aqui.
- **Duração**: novo componente `TaskDurationQuickPick.tsx` — trigger com ícone de relógio
  (`Clock`/`Timer` do lucide) mostrando a duração formatada de forma curta (ex. "1h30", "45min") ou
  um placeholder apagado quando `null`; ao clicar, abre um popover com presets comuns (15min, 30min,
  1h, 1h30, 2h, 4h — ajustar lista na implementação) em botões clicáveis, mais um campo numérico
  "Personalizado" para valores fora da lista. Substitui o `<Input type="number">` atual.
- Nova função utilitária `formatDuration(minutes: number): string` (ex. em
  `src/domain/tasks/duration.ts`, testável com Vitest) — formata minutos como "1h30"/"45min"/"2h",
  reaproveitada pelo trigger do `TaskDurationQuickPick` e por qualquer exibição futura da duração
  (ex. Gantt, feature seguinte).
- **Horário**: substituir o `<Input type="time">` de largura total por um controle mais compacto —
  ícone de relógio ao lado de um input de horário estreito (não ocupando a linha inteira), sem
  label "Horário" acima ocupando uma linha própria. Formato exato (input inline vs. trigger próprio
  com popover) fica a critério da implementação, mas o objetivo é eliminar o padrão
  "label em cima + input full-width" que hoje se repete para Horário e Duração.
- Mantém o contrato de `onChange` de `TaskDueQuickEdit` (`{ due_date, due_time, estimated_duration }`)
  — nenhuma mudança de API/handlers em `TaskList.tsx`/`ProjectDetail.tsx`.

## Tarefas
- [x] Criar `src/domain/tasks/duration.ts` com `formatDuration(minutes: number | null): string`
      (retorna string vazia/placeholder para `null`) + teste unitário (Vitest) cobrindo minutos <60,
      horas exatas, horas com minutos e `null`.
- [x] Criar `TaskDurationQuickPick.tsx`: trigger com ícone de relógio + `formatDuration`, popover com
      presets comuns (botões) e um campo "Personalizado" (minutos), chamando `onChange(minutes | null)`.
- [x] Em `TaskDueQuickEdit.tsx`, substituir o `<Input type="number">` de duração por
      `TaskDurationQuickPick`.
- [x] Em `TaskDueQuickEdit.tsx`, refazer o layout do campo "Horário": ícone + input compacto,
      sem label em linha própria / largura total.
- [x] Ajustar `className`/largura do `PopoverContent` de `TaskDueQuickEdit` para o novo layout mais
      enxuto (provavelmente menor que o `min-w-[18.5rem]` atual).
- [x] `npx tsc --noEmit && npm run build && npm run lint && npm test`.
- [x] Substituir o teste manual acima (proibido pela skill `next` atual — exige cobertura
      automatizada, não verificação visual) por testes de componente reais: configurar
      Testing Library + jsdom neste repo (que só tinha testes de lógica pura em ambiente "node")
      e escrever `TaskDurationQuickPick.test.tsx` + `TaskDueQuickEdit.test.tsx` cobrindo trigger
      compacto com ícone, presets de duração, campo "Personalizado" com valor livre, e o formato
      exato do `onChange` (`{ due_date, due_time, estimated_duration }`).

## Prompts

## Notas
- `formatDuration` colidia com uma função homônima já existente em `src/domain/tasks/timeTracking.ts`
  (formata segundos decorridos como `HH:MM:SS`, usada via o barrel `@/domain/tasks` em
  `LiveWidget.tsx`/`TimeEntryRow.tsx`/`Live.tsx`). `npm run build` (checagem de tipos via `tsc -b`)
  acusou `TS2308` por ambiguidade no `export *` do barrel. Renomeei a função desta feature para
  `formatEstimatedDuration` (em `duration.ts`, no teste e em `TaskDurationQuickPick.tsx`) — mantém a
  mesma assinatura/comportamento descritos na Decisão, só muda o nome para não colidir.
- Usei `Timer` (não `Clock`) como ícone do trigger de `TaskDurationQuickPick`, e mantive `Clock` no
  campo Horário de `TaskDueQuickEdit` — os dois ficam lado a lado no popover quando há prazo, e usar
  o mesmo ícone nos dois deixaria visualmente ambíguo qual controla o quê.
- `npm test` roda com 2 falhas pré-existentes e não relacionadas em
  `src/lib/__tests__/currency.test.ts` (`formatDateBR`/`formatDateTimeBR` esperando "—" e recebendo
  "·" para data nula) — `git status` confirma que `currency.ts`/`currency.test.ts` não fazem parte do
  diff desta sessão nem desta feature; já estavam quebrados antes. Não mexi neles (fora de escopo).
- Não marquei a tarefa de teste manual: o ambiente deste agente tem acesso a `claude-in-chrome`, mas
  a ferramenta exige confirmação interativa do usuário (`AskUserQuestion`, indisponível para este
  subagente) sempre que há mais de um browser conectado — e há dois. Fiz revisão de código completa
  em vez disso (ver relato da sessão), mas a verificação visual/funcional no navegador real (Lista e
  `ProjectDetail.tsx`) ainda precisa ser feita por alguém com acesso interativo ao browser.
- A skill `next` foi atualizada depois da sessão acima: Chrome/browser automation está bloqueado
  sem exceção e verificação manual não conta como cobertura — reescrevi a última tarefa (era um
  "teste manual") para exigir teste de componente automatizado, e implementei. Este repo não tinha
  nenhum teste de componente até agora (`vitest.config` — na verdade `vite.config.ts`, `test:` —
  estava com `environment: "node"` e `include` só pegava `*.test.ts`), então isso incluiu uma
  mudança pequena de infraestrutura, não só as duas suítes novas:
  - `npm install -D @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom`.
  - `vite.config.ts`: adicionei `environmentMatchGlobs: [["src/**/*.test.tsx", "jsdom"]]` (mantém
    os testes de lógica pura em `"node"`, mais rápido, e só sobe jsdom pros `.test.tsx`),
    `setupFiles: ["./src/test/setup-jsdom.ts"]` e `.test.tsx` no `include`.
  - `src/test/setup-jsdom.ts` (novo): registra `@testing-library/jest-dom` e `cleanup()` só quando
    há `document` real (evita registrar hook de DOM na suíte "node"), e faz stub de
    `ResizeObserver`/Pointer Capture/`scrollIntoView` — jsdom não implementa essas APIs e o Radix
    Popover (usado por `TaskDueQuickEdit`/`TaskDurationQuickPick`) chama todas ao abrir/posicionar
    o conteúdo.
  - Optei por `environmentMatchGlobs` (não `test.projects`, a alternativa recomendada pelo Vitest
    3.2 — a instalada resolveu `3.2.6` embora o `package.json` peça `^3.0.5`) por ser a mudança
    menor: `vitest run` imprime um aviso de depreciação, mas funciona; migrar pra `projects` é uma
    reestruturação maior do config de teste, fora do escopo desta feature — deixo registrado caso
    valha a pena numa limpeza futura.
  - Novos arquivos: `src/pages/admin/tasks/__tests__/TaskDurationQuickPick.test.tsx` (6 testes:
    placeholder "+ Duração", trigger formatado via `formatEstimatedDuration`, presets aplicando
    `onChange(minutes)`, campo "Personalizado" aplicando um valor fora da lista, botão "Aplicar"
    desabilitado sem valor, "Remover duração" chamando `onChange(null)`) e
    `src/pages/admin/tasks/__tests__/TaskDueQuickEdit.test.tsx` (6 testes: trigger "+ Prazo" sem
    prazo, layout compacto — input de horário com `aria-label` mas sem `<label>` "Horário" visível
    em linha própria, sem `<input type="number">` solto — controles ausentes sem prazo definido,
    `onChange` do horário preservando `due_date`/`estimated_duration`, preset de duração e valor
    "Personalizado" preservando `due_date`/`due_time`).
  - `npx tsc -p tsconfig.app.json --noEmit`, `npm run build`, `npm run lint` (0 erros, só os 37
    warnings pré-existentes de `react-refresh`/`react-hooks` em arquivos fora do escopo) e
    `npm test` (543 testes, 541 passando) — os 2 que falham são os mesmos pré-existentes e não
    relacionados de `currency.test.ts` já registrados acima (`formatDateBR`/`formatDateTimeBR`
    esperando "—" e recebendo "·" pra data nula); confirmado de novo que `currency.ts`/
    `currency.test.ts` não fazem parte do diff desta feature.
