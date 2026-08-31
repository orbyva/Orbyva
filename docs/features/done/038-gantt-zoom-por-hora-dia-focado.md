---
prompt: |
  além de semana/mês/trimestre pra cima, quero também poder descer: uma visão por horário do
  gantt, no nível do dia, pra ver a organização daquele dia específico — tipo uma agenda do dia
  mas em formato gantt (a mesma ideia da grade de horas 00-23 que já existe na Agenda, feature
  034, mas aplicada dentro do próprio Gantt quando eu focar/abrir um dia). Ou seja: o zoom do
  Gantt não para em "dia" — dá pra afundar até "hora" pro dia que eu escolher
---

# 038 — Zoom por horário no Gantt (visão de dia focado)

## Contexto
O Gantt de `/tasks` só desenha barras com granularidade de dia (e, com a feature 037, sobe até
semana/mês/trimestre) — não existe hoje uma forma de "descer" e ver a organização por horário de
um dia específico dentro do Gantt, ao contrário da Agenda, que já tem essa grade de horas 00-23
pronta (`AgendaHourGrid.tsx`, feature `034`). Esta feature reaproveita esse componente existente
embutido no Gantt, em vez de construir uma visualização de horas rival do zero, quando o usuário
foca/abre um dia específico.

## Decisões
- Novo gatilho de "focar num dia" em `GanttChart.tsx` (ex. clique na célula da régua do topo, ou
  um botão dedicado) — habilitado quando o zoom estiver no nível "dia" (feature 037). Mecanismo
  exato de acionamento a confirmar na implementação.
- Ao focar um dia, `GanttChart` renderiza `AgendaHourGrid` (`src/pages/admin/tasks/
  AgendaHourGrid.tsx`) com `days: [diaFocado]`, num contêiner que substitui/sobrepõe o canvas do
  Gantt (modal ou painel), com uma ação explícita pra voltar à visão normal do Gantt.
- `AgendaHourGrid` espera `itemsByDay` (via `groupCalendarItemsByDay`, `src/domain/tasks/
  calendar.ts`), `projectById` e tarefas no formato `Task` completo (`due_time`,
  `linked_recurring_id`, `icon_key` etc.) — `GanttChart` hoje só recebe `GanttTaskInput[]`, uma
  forma reduzida. `GanttChart` passa a receber também os `Task[]` completos (além do
  `GanttTaskInput[]` já usado pras barras), repassados pelos dois call sites (`TaskList.tsx`,
  `ProjectDetail.tsx`), que já têm essa lista completa antes de reduzi-la.
- `GanttChart` não recebe `ProjectEvent[]` hoje (só tarefas) — a grade de horas do dia focado usa
  `groupCalendarItemsByDay(tasks, [])`, sem eventos de projeto, nesta primeira versão.
- `projectById` (mapa `id -> Project`) precisa da entidade `Project` completa (com `color`, usada
  por `TimedEventBlock`/chips) — a confirmar na implementação se a prop `projects` de `GanttChart`
  (hoje `GanttProjectInput[]`, só `id`/`name`) precisa ser trocada pelo `Project[]` completo, ou se
  um mapa à parte é passado só pra esse uso.
- `onOpenTask` do `AgendaHourGrid` abre o mesmo fluxo de edição completa de tarefa já usado no
  restante do Gantt/Lista (não precisa reinventar); `onOpenEvent` fica sem uso real por ora (sem
  eventos nesta versão), mas a prop é obrigatória no componente — passar um handler vazio/no-op ou
  reavaliar a assinatura do componente na implementação.

## Tarefas
- [x] Decidir e implementar o gatilho de "focar num dia" no Gantt (clique na régua ou botão),
      habilitado só quando o zoom estiver no nível "dia".
- [x] `GanttChart` passa a receber os `Task[]` completos (além de `GanttTaskInput[]`) — ajustar
      assinatura do componente e os dois call sites (`TaskList.tsx`, `ProjectDetail.tsx`).
- [x] Construir `itemsByDay` para o dia focado via `groupCalendarItemsByDay(tasks, [])`
      (`calendar.ts`), sem eventos.
- [x] Construir/obter `projectById` a partir dos projetos recebidos por `GanttChart` (ajustar a
      prop `projects` pra `Project[]` completo se necessário, conforme decisão acima).
- [x] Renderizar `AgendaHourGrid` com `days: [diaFocado]` dentro de um contêiner (modal ou painel
      substituindo o canvas do Gantt) com ação pra voltar à visão normal.
- [x] Ligar `onOpenTask` do `AgendaHourGrid` ao mesmo fluxo de abrir o form completo de tarefa já
      usado no Gantt/Lista; decidir o tratamento de `onOpenEvent` (no-op nesta versão).
- [x] Teste de lógica pura: `groupCalendarItemsByDay` aplicado a um dia focado com tarefas
      com/sem `due_time` produz o agrupamento esperado (reaproveitando testes existentes de
      `calendar.ts` como referência, se já não cobrirem esse caso).
- [x] `npx tsc --noEmit && npm run build && npm run lint`.

## Prompts

## Notas
- Gatilho de foco escolhido: um `<input type="date" aria-label="Focar dia">` na barra de
  ferramentas do Gantt, visível só quando `zoomLevelIndex` está no preset "Dia" (índice resolvido
  por `id === "day"`, não hardcoded) e nenhum dia está focado. Preferido a "clique na célula da
  régua do topo" porque a régua é desenhada inteiramente pela lib `@svar-ui/react-gantt` (mockada
  nos testes por crashar em jsdom via canvas — ver comentário no topo de `GanttChart.test.tsx`);
  um gatilho fora do componente da lib é testável de ponta a ponta sem depender do motor de
  renderização real. Trocar de zoom pra fora de "Dia" enquanto um dia está focado fecha a grade de
  horas automaticamente (`useEffect` que reseta `focusedDay`), pra nunca ficar numa combinação
  visualmente inconsistente (grade de horas com o preset de zoom mostrando "Semana"/"Mês").
- `fullTasks`/`fullProjects` viraram props novas e separadas de `tasks`/`projects` (não uma troca
  de tipo nas existentes), como a Decisão original cogitava. Motivo prático descoberto na
  implementação: `tasks`/`projects` já aceitam os arrays completos (`Task[]`/`Project[]`) de forma
  estruturalmente compatível — `ganttTasks` em `TaskList.tsx`/`ProjectDetail.tsx` já É `Task[]`, só
  passado onde a prop pede `GanttTaskInput[]` (subconjunto). Mudar o *tipo* da prop pra `Task[]`
  quebraria `GanttChart.test.tsx` (fixtures de teste não preenchem os campos obrigatórios extras de
  `Task`, ex. `tag_ids`/`recurrence_rule`/`linked_installment_number`). Duas props novas e opcionais
  (default `[]`) evitam esse acoplamento nos testes existentes; nos dois call sites reais, é
  literalmente a mesma variável passada duas vezes (`tasks={ganttTasks} fullTasks={ganttTasks}`),
  sem custo real de duplicação de dado.
- `ProjectDetail.tsx` não tem uma lista `Project[]` completa em memória (só o `project` singular da
  página) — `fullProjects` recebe `project ? [project] : []`. Suficiente porque o Gantt ali só
  mostra tarefas desse único projeto.
- `onOpenTask` do `AgendaHourGrid` foi ligado à mesma função `openEdit(task: Task)` que
  `TaskList.tsx`/`ProjectDetail.tsx` já usavam pra abrir o dialog completo de edição (não o dialog
  simplificado da Agenda) — é o "fluxo já usado no restante da Lista" que a Decisão pedia.
  `onOpenEvent` ficou como no-op (`noopOpenEvent`), documentado no comentário da prop: sem
  `ProjectEvent[]` nesta versão, a prop é só satisfeita pra bater a assinatura obrigatória do
  componente.
- Desvio pequeno, não pedido: `npm run lint` falhava antes de eu tocar no arquivo por um problema
  pré-existente em `GanttChart.test.tsx` (`_data` não usado em `execMock`, da feature 037) —
  bloqueava o gate de lint desta feature mesmo sem relação com o zoom por hora. Corrigido com um
  `eslint-disable-next-line` pontual (comentado) já que o parâmetro precisa existir só pra tipar
  `toHaveBeenCalledWith`.
- `npm test` (suíte inteira) tem 2 falhas pré-existentes e não relacionadas em
  `src/lib/__tests__/currency.test.ts` (`formatDateBR`/`formatDateTimeBR` esperando "—" e recebendo
  "·") — arquivo fora do domínio de tasks/Gantt, não tocado por nenhuma tarefa desta feature.
  Deixado como está; não é regressão introduzida aqui.
