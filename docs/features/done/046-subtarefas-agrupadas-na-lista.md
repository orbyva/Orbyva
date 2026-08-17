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

# 046 — Subtarefas como linhas agrupadas na Lista

## Contexto
A feature `done/036` tratou só a **edição** de subtarefa (abrir o form completo, com prioridade/
tags/ícone/registro de tempo), mas deixou a **exibição** explicitamente de fora: "As visões de
topo continuam ocultando subtarefas das listas principais... isso não muda, é o significado de
'subtarefa' no produto" (`036`, seção Decisões). O pedido original ("cada subtarefa será uma outra
tarefa... conceito de parent e son") era ambíguo o suficiente pra ler só como paridade de edição —
o usuário esclareceu depois que também queria paridade de **exibição**: subtarefa como
linha/card próprio, sempre agrupada visualmente sob o pai, no mesmo espírito do que o Gantt já faz
hoje (`buildGanttNodes`, `src/domain/tasks/gantt.ts:176-228` — nó-filho com `parent`/`open`,
renderizado pela lib como linha indentada e expansível, com barra própria).

Hoje, na Lista (`TaskListRow`, `src/pages/admin/tasks/TaskViews.tsx`), uma subtarefa nunca vira
linha própria — o filtro `visibleTasks` (`TaskViews.tsx:209-213`) exclui qualquer tarefa com
`parent_task_id`, e ela só aparece dentro de `SubtaskChecklist` (`TaskViews.tsx:101-151`, lista de
`<input type="checkbox">` com título/prazo em texto pequeno, sem prioridade/ícone/projeto/quick
actions), atrás de um botão de expandir/recolher (`ExpandSubtasksButton`, `TaskViews.tsx:153-174`,
recolhido por padrão).

Esta feature troca `SubtaskChecklist` por linhas reais (reaproveitando `TaskListRow`) na Lista.
Kanban e Agenda ficam para features separadas (`047`/`048`) — plataformas de renderização
diferentes o bastante (drag-and-drop por coluna de status no Kanban, grade de horário na Agenda)
pra não caber tudo numa feature só.

## Decisões
- `SubtaskChecklist` é substituído por `TaskListRow` recursivo: quando uma tarefa de topo está
  expandida (`ExpandSubtasksButton`, comportamento de expandir/recolher preservado — continua
  recolhido por padrão, não é "sempre visível", só "sempre agrupada quando visível", já que uma
  tarefa com muitas subtarefas não deve poluir a lista por padrão), renderiza uma `TaskListRow`
  completa por subtarefa, indentada (padding-left visualmente distinto, ex. `pl-8`/borda lateral),
  com os mesmos quick actions que uma linha de topo já tem hoje (ícone, prioridade, prazo, projeto
  — este último provavelmente omitido/read-only já que subtarefa herda o projeto do pai, mesma
  regra da `036`).
- **Sem recursão além de 1 nível**: `TaskListRow` renderizada como subtarefa não recebe seu próprio
  `ExpandSubtasksButton`/checklist — consistente com o modelo de 2 níveis já estabelecido pela
  `036` (subtarefa não tem sub-subtarefa). Passar uma prop nova, ex. `isNested?: boolean`, que
  desliga a renderização do botão de expandir subtarefas na própria linha.
- Quick actions de uma subtarefa continuam chamando os mesmos handlers já existentes
  (`handlePriorityChange`/`handleDueChange`/`handleIconChange`, etc.) — nenhuma API nova, só nova
  posição de renderização.
- Clicar no título da linha da subtarefa abre o mesmo form completo de edição já implementado pela
  `036` (`onOpenSubtask`/`openEdit`) — sem mudança nesse fluxo, só na representação visual da linha
  em si.
- O botão "Concluir tarefa" (círculo à esquerda) na linha da subtarefa continua funcionando
  (`onToggleDone`) exatamente como numa tarefa de topo — substitui o `<input type="checkbox">` do
  checklist antigo, mesma ação por trás.
- Adicionar subtarefa (input "+ subtarefa" já existente em algum lugar do fluxo — confirmar na
  implementação onde vive hoje, provavelmente vinculado ao antigo checklist) precisa continuar
  funcionando com a nova estrutura — não é escopo remover essa ação, só trocar como a lista
  resultante é exibida.
- `ProjectDetail.tsx` reaproveita o mesmo `TaskListRow`/lógica — replicar lá também (mesma tela
  que já espelha `TaskList.tsx` na aba Lista).

## Tarefas
- [x] Adicionar prop `isNested?: boolean` a `TaskListRow` (`TaskViews.tsx`) — quando `true`, não
      renderiza `ExpandSubtasksButton`/checklist próprio, e aplica indentação/estilo visual de
      linha aninhada (ex. `pl-8`, borda lateral esquerda sutil).
- [x] Em `TaskListRow` (linha de topo), trocar a renderização condicional de `SubtaskChecklist`
      (quando `expanded && subtasks.length > 0`) por uma lista de `TaskListRow` (uma por
      subtarefa, com `isNested`), passando os mesmos handlers de quick actions já recebidos pela
      linha de topo (adaptados pro `task.id` de cada subtarefa).
- [x] Confirmar onde vive hoje a ação "adicionar subtarefa" (input + botão, ligado ao antigo
      checklist) e portar pro novo layout de linhas agrupadas, sem perder a funcionalidade.
      (Confirmado: a antiga `SubtaskChecklist`, só na Lista, nunca teve o input de adicionar —
      ele sempre viveu em `TaskSubtasksField`, dentro do form completo de edição/criação
      renderizado por `TaskFormFields.tsx`, e continua lá inalterado. Não havia nada pra portar;
      a ação continua funcionando, só a exibição das subtarefas já existentes mudou.)
- [x] Remover `SubtaskChecklist` (`TaskViews.tsx:101-151`) se não sobrar nenhum uso depois da
      troca (confirmar via grep antes de apagar — pode ainda ser usado em `KanbanCard` até a
      feature `047` rodar; se for o caso, deixar o componente e só parar de usá-lo em
      `TaskListRow`). (`SubtaskChecklist` como componente exportado foi removido; `KanbanCard`
      mantém sua própria lista com `<input type="checkbox">` inline, própria pra feature `047`
      trocar depois — confirmado via grep que não há mais nenhum uso do nome `SubtaskChecklist`
      no código.)
- [x] Replicar a mesma troca em `ProjectDetail.tsx` (aba Lista).
- [x] Teste de componente (Testing Library/jsdom, seguir padrão de
      `src/pages/admin/tasks/__tests__/TaskViews.test.tsx`): expandir uma tarefa com subtarefas
      renderiza uma `TaskListRow` por subtarefa (não mais checkboxes); a linha da subtarefa não
      tem seu próprio botão de expandir; os quick actions da linha de subtarefa chamam os
      handlers certos com o `task.id` da subtarefa; clicar no título abre o form completo de
      edição da subtarefa.
- [x] `npx tsc -p tsconfig.app.json --noEmit && npm run build && npm run lint && npm test`.

## Prompts

## Notas
- Retomada após queda de conexão: o refactor de produção (`TaskViews.tsx`, `TaskList.tsx`,
  `ProjectDetail.tsx`) já estava pronto e `tsc` limpo; faltavam só 2 testes do describe "feature
  046" quebrados. Causa raiz de ambos era o teste, não o código: (1) o teste "renderiza uma
  TaskListRow por subtarefa" contava `getAllByRole("button", { name: "Concluir tarefa" })`
  esperando 2, mas a linha de topo (não concluída) também tem o seu — total real é 3; (2) o teste
  "não tem seu próprio botão de expandir" buscava só o label "Expandir subtarefas", mas como a
  linha de topo é renderizada com `expanded: true` no teste, seu próprio botão mostra "Recolher
  subtarefas" — `getAllByRole` não achava nada com o label esperado e lançava. Corrigido para
  escopar a asserção de "sem botão de expandir" à linha aninhada (`within(subtaskRow)`) em vez de
  depender do label exato do botão da linha de topo.
- Também troquei a linha morta (`deleteButtons = ...; void deleteButtons;`) no teste de quick
  actions por asserções reais: agora ele abre o `TaskDeleteDialog` da linha da subtarefa e
  confirma exclusão (prova `onDelete` chamado com a subtarefa) e troca o status pelo Select
  inline (prova `onStatusChange` chamado com a subtarefa) — antes esses dois handlers do
  `subtaskActions` (`onDelete`/`onStatusChange`, que são obrigatórios na interface) não tinham
  nenhuma cobertura real, só os opcionais (`onPriorityChange`/`onIconChange`).
- Confirmado (não era tarefa nova, só verificação): a ação "adicionar subtarefa" nunca esteve
  dentro da antiga `SubtaskChecklist` — sempre viveu em `TaskSubtasksField`/`TaskFormFields.tsx`
  (o form completo de criação/edição), que essa feature não tocou. Por isso a tarefa de "portar"
  não exigiu nenhuma mudança de código, só a confirmação via grep/leitura do diff.
