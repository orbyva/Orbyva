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

# 047 — Subtarefas como cards agrupados no Kanban

## Contexto
Continuação de `046` (mesmo pedido do usuário, escopo Kanban). Hoje `KanbanCard`
(`src/pages/admin/tasks/TaskViews.tsx`) recebe uma prop `subtasks` e renderiza um checklist inline
sempre visível dentro do próprio card (`TaskViews.tsx:694-733`, `<ul>` de checkboxes + badge de
contagem "`{doneSubtasks}/{subtasks.length} subtarefas`" + input "Adicionar subtarefa"). Isso vira
cards reais por subtarefa, no espírito acordado com o usuário ("linha/card próprio, sempre
agrupado").

**Tensão de design que 046/Lista não tem**: o Kanban agrupa cards por **coluna de status**
(`STATUSES.map`, `TaskList.tsx:818-871`, `SortableContext`/`DndContext` via `@dnd-kit`). Uma
subtarefa é uma `Task` completa com seu próprio `status` — se ela puder ter status diferente do
pai, "sempre agrupada sob o pai" (pedido explícito do usuário) e "cada card mora na coluna do seu
status" (como todo card de topo funciona hoje) são incompatíveis ao mesmo tempo. Resolvendo aqui
pra não deixar ambíguo pro implementador: **subtarefas continuam agrupadas dentro do card do pai,
na coluna do pai** — não viram cards soltos, independentes, espalhados pela própria coluna de
status. O status da subtarefa continua existindo e sendo editável (badge/indicador de status no
mini-card, igual ao resto do app), só não determina em qual coluna ela aparece. Isso é consistente
com o Gantt (nó-filho sempre aninhado sob o pai na árvore, independente de qualquer outro atributo)
e com a decisão que o usuário já confirmou ("sempre agrupado").

## Decisões
- **Cards de subtarefa NÃO são arrastáveis entre colunas** (fora de escopo — vide tensão acima).
  Ficam sempre dentro do card do pai, na coluna onde o pai está. Se o usuário quiser reordenar/
  mover subtarefas entre status no futuro, isso é um pedido novo a avaliar depois — registrar como
  decisão consciente, não esquecimento.
- Dentro do card do pai, cada subtarefa vira um **mini-card próprio** (não mais uma linha de
  checkbox): reaproveitar a mesma composição de `TaskQuickFields`/indicador de status
  (`STATUS_ICONS`) já usada no card de topo, num layout mais compacto (largura total do card do
  pai, sem o `GripVertical` de arrastar — subtarefa não é sortable). Botão "Concluir"/toggle de
  status continua funcionando (`onToggleSubtask`/`toggleDone`, já existente).
- Quick actions (prioridade/prazo/ícone) na subtarefa: incluir os mesmos que a linha da Lista
  ganhou na `046`, já que o padrão agora é "subtarefa = tarefa completa visualmente" — sem campo
  Projeto (herdado do pai, mesma regra da `036`).
- Clicar no título/corpo do mini-card de subtarefa abre o form completo de edição
  (`onOpenSubtask`), igual já funciona hoje.
- "Adicionar subtarefa" (input + botão já existente no card) continua funcionando, só reposicionado
  visualmente se necessário pro novo layout de mini-cards.
- `SubtaskChecklist` (`TaskViews.tsx:101-151`) deixa de ser usado em `KanbanCard` — se a feature
  `046` já rodou e removeu o componente por completo (ninguém mais usando), nada a fazer aqui; se
  `046` ainda não rodou ou deixou o componente por precaução, remover agora se este for o último
  uso confirmado por grep.
- Sem mudança na estrutura de `DndContext`/`SortableContext` de nível de coluna — só cards de topo
  continuam sortable, exatamente como hoje.

## Tarefas
- [x] Criar (ou adaptar de `TaskQuickFields`/um novo componente compacto) a renderização de
      mini-card de subtarefa dentro de `KanbanCard`: status (indicador clicável, sem mudar coluna),
      ícone, prioridade, título (clicável, abre form completo), prazo — sem `GripVertical`/sortable.
- [x] Substituir o `<ul>` de checkboxes (`TaskViews.tsx:694-733`) pela lista de mini-cards de
      subtarefa dentro de `KanbanCard`, mantendo o badge de contagem "X/Y subtarefas" acima.
- [x] Confirmar que "Adicionar subtarefa" (input/botão já existente no card) continua funcionando
      com o novo layout — ajustar posição se necessário.
- [x] Se `SubtaskChecklist` não tiver mais nenhum uso no código (confirmar via grep, considerando
      o estado da feature `046`), remover o componente morto.
- [x] Teste de componente (Testing Library/jsdom): `KanbanCard` com subtarefas renderiza um
      mini-card por subtarefa (não checkboxes); mini-card de subtarefa não tem handle de arrastar;
      clicar no mini-card abre o form completo de edição da subtarefa; toggle de status da
      subtarefa funciona sem mover o card de subtarefa pra fora do card do pai.
- [x] `npx tsc -p tsconfig.app.json --noEmit && npm run build && npm run lint && npm test`.

## Prompts

## Notas
- `SubtaskChecklist` já não existia mais no código (removido pela feature `046`) — confirmado via
  `grep -rn "SubtaskChecklist" src/`, sem nenhuma ocorrência fora de docs históricos. Tarefa de
  remoção virou um no-op, sem necessidade de mudança.
- `KanbanCard` ganhou um novo componente interno `KanbanSubtaskCard` (`TaskViews.tsx`), e uma nova
  prop opcional `subtaskActions?: SubtaskRowActions` (mesma interface que `TaskListRow` já usa
  desde a `046`) — passada agora pelos dois call sites (`TaskList.tsx` e `ProjectDetail.tsx`, que
  já tinham o objeto `subtaskActions` montado pra Lista, só não repassavam pro Kanban). O toggle
  binário concluir/reabrir continua via `onToggleSubtask` (prop já existente, botão redondo no
  mini-card); o Select de status (todo/doing/done, mesmo padrão `STATUS_ICONS` de `TaskListRow`)
  é a peça nova, condicionada à presença de `subtaskActions` (ausência = cai pro indicador
  somente-leitura, mesma regra "ausência = sem regressão" do resto do arquivo).
- Corrigido `src/pages/admin/tasks/__tests__/ProjectDetail.subtask-edit.test.tsx` (não fazia parte
  do escopo original, mas quebrou como efeito colateral direto): o helper `openSubtaskFromChecklist`
  clicava num `<button>` que envolvia o título da subtarefa — essa é exatamente a estrutura do
  checklist antigo que esta feature substitui por mini-cards (`<div onClick>` clicável, título em
  texto normal). Ajustado pra `screen.getByText(subtaskTitle)`, que é como o próprio `onOpenSubtask`
  é testado no restante do arquivo (`TaskViews.test.tsx`). Os 5 testes desse arquivo (feature 036,
  edição de subtarefa via Kanban) voltaram a passar sem alterar o comportamento coberto, só a forma
  de disparar o clique.
- `npm test` tem 2 falhas pré-existentes, não relacionadas a esta feature nem tocadas por ela:
  `src/lib/__tests__/currency.test.ts` (`formatDateBR`/`formatDateTimeBR` — mismatch de caractere
  `—` vs `·`, provavelmente encoding do ambiente). `src/lib/currency.ts` não faz parte do diff desta
  sessão nem do estado inicial do `git status`; fora de escopo, não mexido.
