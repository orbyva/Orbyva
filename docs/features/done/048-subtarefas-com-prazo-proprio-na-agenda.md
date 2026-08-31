---
prompt: |
  reformule e melhore as subtarefas
  - cada subtarefa será uma outra tarefa. é um conceito de parent e son, não somente uma single tarefa etc. sabe melhore isso
  ---
  what about the sub-tasks being refactor to real tasks, in a way i can create subtasks grouped in
  tasks? this werre demanded, track this and help me understand why is not done
  ---
  (resposta à pergunta de esclarecimento sobre o escopo visual): "Linha/card próprio, sempre
  agrupado" — subtarefa vira uma linha real na Lista e um card real no Kanban, indentado/agrupado
  logo abaixo do pai, substituindo o checklist de checkboxes, mesmo espírito do Gantt hoje; Agenda
  passa a mostrar subtarefa com prazo próprio.
---

# 048 — Subtarefas com prazo próprio aparecem na Agenda

## Contexto
Continuação de `046`/`047` (mesmo pedido do usuário, escopo Agenda). Hoje `AgendaGrid.tsx` filtra
subtarefas por completo, mesmo quando têm `due_date`/`due_time` próprios (`filteredTasks`,
`AgendaGrid.tsx:259-268`, mesmo `!t.parent_task_id` de Lista/Kanban) — uma subtarefa nunca vira
chip/item em nenhum dia da grade (Mês) nem na grade de horas (Semana/Dia, feature `done/034`,
`AgendaHourGrid.tsx`).

**Diferença estrutural do Kanban/Lista**: a Agenda não tem um conceito nativo de "linha/card do pai
com filhos aninhados dentro" — é uma grade de tempo (dias/horas), cada item posicionado pelo seu
próprio `due_date`/horário (`computeItemPosition`/`layoutTimedItems`, `src/domain/tasks/
calendar.ts`). Uma subtarefa pode ter um prazo em dia/hora completamente diferente do prazo do pai
(ou o pai pode nem ter prazo). "Agrupar" aqui não pode significar "aninhar visualmente sob o pai"
(não existe posição única onde os dois caibam juntos) — significa **a subtarefa aparecer como item
próprio no seu horário, com um vínculo visual claro de que pertence a uma tarefa-mãe** (diferente
de simplesmente virar indistinguível de uma tarefa de topo qualquer).

## Decisões
- Remover o filtro `!t.parent_task_id` de `filteredTasks` (`AgendaGrid.tsx:259-268`) — subtarefas
  com `due_date` próprio passam a ser candidatas a aparecer na Agenda (Mês, Semana, Dia), usando o
  mesmo `groupCalendarItemsByDay`/`layoutTimedItems` que tarefas de topo já usam. Subtarefa sem
  `due_date` continua não aparecendo em lugar nenhum da Agenda (nada muda pra ela, mesmo
  comportamento de uma tarefa de topo sem prazo).
- **Indicador visual de vínculo com o pai**: o chip/bloco da subtarefa na Agenda (`TaskChip`/
  `TimedTaskBlock`, `AgendaGrid.tsx`/`AgendaHourGrid.tsx`) ganha um indicador discreto (ex. ícone
  pequeno tipo `CornerDownRight`/`GitBranch` do lucide, ou um prefixo textual curto) + `title`/
  tooltip com o nome da tarefa-mãe — pra não parecer uma tarefa de topo qualquer, sem exigir um
  layout de aninhamento que a grade de tempo não suporta naturalmente.
- Clicar na subtarefa na Agenda abre o mesmo form completo de edição já usado pra tarefas de topo
  (via `TaskFormFields`, feature `043`) — sem tratamento especial adicional, já que subtarefa e
  tarefa de topo compartilham o mesmo componente de edição desde a `036`/`043`.
- Sem mudança na Mês (chip simples) além de deixar de filtrar subtarefas — o indicador visual
  acima se aplica tanto ao chip de Mês quanto ao bloco de Semana/Dia.
- Fora de escopo: mudar a posição/algoritmo de layout pra "puxar" visualmente a subtarefa pra perto
  do bloco do pai quando ambos aparecem no mesmo dia — cada item continua posicionado
  independentemente pelo seu próprio horário; o vínculo é só indicado, não forçado espacialmente.

## Tarefas
- [x] Remover o filtro `!t.parent_task_id` de `filteredTasks` em `AgendaGrid.tsx`, permitindo
      subtarefas com `due_date` próprio entrarem no agrupamento por dia.
- [x] Adicionar um indicador visual de "é subtarefa" (ícone + `title`/tooltip com o nome da
      tarefa-mãe) no chip de Mês (`TaskChip`) e no bloco de Semana/Dia (`TimedTaskBlock`/
      `AgendaHourGrid.tsx`) quando `task.parent_task_id` existir — precisa da tarefa-mãe
      disponível (buscar em `tasks`/`fullTasks` já carregado pela Agenda) pra montar o nome no
      tooltip.
- [x] Confirmar que abrir uma subtarefa a partir da Agenda usa o mesmo `TaskFormFields` (feature
      `043`) já usado por tarefas de topo, sem regressão nas restrições de subtarefa (prazo
      limitado ao da mãe, sem recorrência própria, etc., já garantidas pelo form compartilhado).
- [x] Teste de componente/lógica pura (Testing Library/jsdom + `src/domain/tasks/__tests__/
      calendar.test.ts`): uma subtarefa com `due_date` aparece agrupada no dia certo (Mês e
      Semana/Dia); o indicador visual de vínculo com o pai está presente; uma subtarefa sem
      `due_date` continua ausente da Agenda; abrir a subtarefa a partir do chip abre o form
      completo com os campos certos preenchidos.
- [x] `npx tsc -p tsconfig.app.json --noEmit && npm run build && npm run lint && npm test`.

## Prompts

## Notas
- `filteredTasks` (`AgendaGrid.tsx`) perdeu o `!t.parent_task_id`; ganhou o mesmo critério que já
  existia pra recorrência não materializada. Novo `taskById` (Map id→Task, montado a partir de
  `tasks`) alimenta `parentTitleFor()`, usado tanto em `AgendaGrid.tsx` (chip de Mês/modal do dia)
  quanto repassado como prop pra `AgendaHourGrid.tsx` (bloco de Semana/Dia e faixa "Sem horário").
- Indicador visual: ícone `CornerDownRight` (lucide) exportado como `SubtaskLinkIcon` de
  `AgendaGrid.tsx` e reaproveitado em `AgendaHourGrid.tsx` — aparece no chip/bloco só quando
  `task.parent_task_id` existe; tooltip via `title` do `<button>` (`Subtarefa de "<mãe>"`, ou
  `"<título> — Subtarefa de "<mãe>""` no bloco de horas, que já usava `title` pro nome da
  tarefa). Confere com a decisão do doc (ícone tipo `CornerDownRight`/`GitBranch` + tooltip).
- `AgendaHourGridProps` ganhou `taskById: Map<string, Task>` (prop obrigatória, não opcional) —
  isso quebrou o outro consumidor do componente, `GanttChart.tsx` (drill-down "Focar dia"), que já
  tinha um `taskById` local (`fullTasks` indexado) só não repassado; passei o mesmo Map existente,
  sem novo cálculo. Pego pelo `tsc`, não pela minha revisão manual — vale lembrar de sempre buscar
  outros usos de um componente antes de tornar uma prop nova obrigatória.
- Task 3 (mesmo `TaskFormFields` sem regressão) não exigiu mudança de código — `openTaskFromChip`
  já monta o `form` a partir de qualquer `Task` (inclusive subtarefa) do mesmo jeito, e
  `TaskFormFields` já trata `editing?.parent_task_id` desde a 036/043 (projeto "Herdado da tarefa
  principal", sem campo de subtarefas aninhado, prazo limitado). Só precisava de teste provando
  isso a partir do fluxo da Agenda especificamente — adicionado.
- Suíte completa (`npm test`) tem 2 falhas pré-existentes e não relacionadas em
  `src/lib/__tests__/currency.test.ts` (`formatDateBR`/`formatDateTimeBR` retornam `"·"` em vez de
  `"—"` pra data nula — bug real em `src/lib/currency.ts:50`, comparação hardcoded com `"—"` em
  `formatDateTimeBR:62` nunca bate). Confirmado que não é regressão desta feature: `git status`
  mostra `src/lib/currency.ts`/`currency.test.ts` sem qualquer alteração nesta sessão, e a falha
  se reproduz isolada (`npx vitest run src/lib/__tests__/currency.test.ts`) sem tocar em nada de
  Agenda/subtarefas. Fora do escopo do prompt desta feature — não corrigido aqui.
