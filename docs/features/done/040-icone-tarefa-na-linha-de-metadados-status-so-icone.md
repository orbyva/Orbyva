---
prompt: |
  - essa adiçõa de ícone não está legal, coloque um +i abaixo, na seção de acesso rápido
  - remova o texto A fazer/Fazendo etc deixe somente o ícone
---

# 040 — Ícone da tarefa na linha de metadados + status só com ícone na Lista

## Contexto
`TaskQuickFields` (`src/pages/admin/tasks/TaskQuickFields.tsx`, feature `done/033`) monta os campos
de edição rápida (ícone, prioridade, prazo, projeto) reaproveitados por `TaskListRow` e
`KanbanCard` (`src/pages/admin/tasks/TaskViews.tsx`). Hoje `quickFields.icon` é renderizado na
**linha do título**, antes da flag de prioridade e do texto da tarefa (`TaskListRow` linha ~301,
`KanbanCard` linha ~621) — o botão `TaskIconPicker`/badge `TaskIconBadge` (feature `done/035`)
fica espremido ali, competindo visualmente com o título. O usuário achou essa posição ruim e pediu
pra mover o controle pra baixo, junto com os outros controles de "acesso rápido" — a linha de
metadados abaixo do título (`TaskListRow` linha ~312-350: Select de status, `quickFields.project`,
badge de recorrência, `quickFields.due`, tags), onde já vivem `due`/`project`.

Separadamente, o Select de status em `TaskListRow` (linha ~313-338) ainda mostra o ícone
(`STATUS_ICONS`, adicionado na feature `done/033`) **e** o texto (`STATUS_LABELS`, ex. "A fazer"/
"Fazendo"/"Concluída") tanto no trigger fechado (`SelectValue`, linha 318-323) quanto em cada opção
da lista (`SelectItem`, linha 326-336). O `KanbanCard` já resolveu isso na própria feature 033 (seu
indicador de status, linha ~661-668, é só o ícone com `title`/`aria-label` pra acessibilidade,
sem texto visível) — só a Lista ficou pra trás nesse padrão, e o usuário pediu pra igualar.

## Decisões
- **Ícone da tarefa**: mover `quickFields.icon` da linha do título pra dentro da linha de
  metadados, em ambos `TaskListRow` e `KanbanCard` (as duas views compartilham `TaskQuickFields`
  e devem manter paridade visual, mesmo princípio já seguido pela feature `033`). Posição
  recomendada: primeiro item da linha de metadados, antes do Select de status/indicador — mas
  ajustar na implementação se ficar visualmente melhor em outra ordem.
- Trigger mais compacto para o estado "sem ícone definido": hoje `TaskIconPicker` mostra o texto
  "+ Ícone" (`TaskIconPicker.tsx` linha 77) — trocar por algo mais enxuto que caiba na linha de
  metadados (que usa badges pequenos, `text-[10px]`/`h-5`, ex. em `TaskDueQuickEdit`/
  `TaskDurationQuickPick`), no espírito do "+i" pedido: um ícone genérico de "adicionar ícone"
  (ex. `Smile`/`Sparkles`/`ImagePlus` do lucide) sem o texto "Ícone" por extenso, ou um texto bem
  curto tipo "+ícone" minúsculo — decidir na implementação o que fica visualmente consistente com
  os outros triggers da linha (`ProjectBadgeButton`, `TaskDueQuickEdit`). Manter `aria-label`
  descritivo ("Definir ícone"/"Trocar ícone", já existe) já que o texto visível vai encolher.
  Quando a tarefa já tem ícone definido, o trigger continua mostrando o ícone escolhido (sem
  mudança aí, só o estado vazio fica mais compacto).
- **Status só com ícone na Lista** (`TaskListRow`): remover `STATUS_LABELS[task.status]` do
  `SelectValue` do trigger fechado (linha ~318-323) — deixar só `StatusIcon`, igual ao padrão já
  usado no `KanbanCard`. Adicionar `title`/`aria-label` com o label completo no próprio
  `SelectTrigger`, pro estado ficar acessível sem o texto visível (mesmo padrão do indicador de
  status do `KanbanCard`, que já usa `title`/`aria-label`).
- **Manter o texto nas opções da lista aberta** (`SelectContent`/`SelectItem`, linha ~326-336):
  ali o usuário precisa do label pra saber qual status está escolhendo — remover o texto só do
  trigger fechado, não da lista de opções ao abrir o `Select`.
- Escopo: só `TaskListRow` e `KanbanCard` (as duas views que renderizam `TaskQuickFields`).
  `GanttChart.tsx` (feature `done/039`) usa `TaskQuickFields` dentro de um popover de ações
  rápidas, não como badge fixo no card — fora de escopo, mesma lógica de "onde já é compacto por
  natureza, não precisa mudar".

## Tarefas
- [x] Em `TaskIconPicker.tsx`, trocar o texto do trigger vazio ("+ Ícone") por uma versão
      compacta (ícone genérico + texto curto ou só ícone, decidir o que fica consistente com os
      outros triggers da linha de metadados), mantendo `aria-label` descritivo.
- [x] Em `TaskListRow` (`TaskViews.tsx`), mover `{quickFields.icon}` da linha do título (perto de
      `{quickFields.priority}` e do `<p>` do título) pra dentro da `<div>` de metadados (onde
      vivem o Select de status, `quickFields.project`, `quickFields.due`).
- [x] Em `KanbanCard` (`TaskViews.tsx`), mover `{quickFields.icon}` da linha do título pra dentro
      da linha de metadados (mesma paridade visual com a Lista), na mesma posição relativa
      escolhida na tarefa anterior.
- [x] Em `TaskListRow`, remover `STATUS_LABELS[task.status]` do `SelectValue` (deixar só
      `StatusIcon`), adicionar `title`/`aria-label` com o label completo no `SelectTrigger`
      pra manter acessibilidade — sem tocar nos `SelectItem` da lista aberta (continuam com
      ícone + texto).
- [x] Testes de componente (Testing Library/jsdom, seguir o padrão de
      `src/pages/admin/tasks/__tests__/TaskViews.test.tsx`): confirmar que o trigger de ícone
      aparece na linha de metadados (não mais grudado no título) em `TaskListRow`/`KanbanCard`;
      confirmar que o `SelectTrigger` de status na Lista não renderiza mais o texto do label
      (mas o `aria-label`/`title` continua presente) e que abrir a lista de opções ainda mostra
      texto + ícone em cada `SelectItem`.
- [x] `npx tsc -p tsconfig.app.json --noEmit && npm run build && npm run lint && npm test`.

## Prompts

## Notas
- `npm test` roda a suíte inteira: 653 passando, 2 falhando em `src/lib/__tests__/currency.test.ts`
  (`formatDateBR`/`formatDateTimeBR` esperando "—" e recebendo "·"). Pré-existente e sem relação
  com esta feature — `src/lib/currency.ts` e o teste não foram tocados nesta sessão, não constavam
  no `git status` inicial, e a causa parece ser divergência de encoding/locale do ambiente na
  comparação do caractere em-dash, não um bug de lógica introduzido aqui.
