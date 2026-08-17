---
prompt: |
  reformule e melhore as subtarefas
  - cada subtarefa será uma outra tarefa. é um conceito de parent e son, não somente uma single tarefa etc. sabe melhore isso
---

# 036 — Subtarefas como tarefas completas (parent/child)

## Contexto
No modelo de dados, uma subtarefa já é literalmente uma `Task` com `parent_task_id` apontando pra
tarefa-mãe (usado hoje pelo Gantt — `buildGanttNodes`/`childTasks` em `src/domain/tasks/gantt.ts` —
e pelas visões, que filtram tarefas de topo com `!t.parent_task_id`). O que não acompanhou esse
modelo foi a **edição**: clicar numa subtarefa (`onOpenSubtask` em `TaskListRow`/`KanbanCard`,
`TaskViews.tsx`) abre `SubtaskEditDialog.tsx` — "versão enxuta do dialog de tarefa (Título/
Descrição/Prazo, sem projeto/recorrência/tags/prioridade — subtarefas não usam nenhum desses)",
conforme o próprio comentário do componente. Uma subtarefa hoje não pode ter prioridade, tags, link
externo, registro de tempo (Live) nem suas próprias subtarefas — só título, descrição e prazo
(limitado a não ultrapassar o prazo da tarefa-mãe, `isSubtaskDueDateValid`).

`TaskList.tsx` e `ProjectDetail.tsx` replicam esse padrão de forma idêntica: cada um mantém um
`editingSubtask` separado do `editing` (tarefa de topo) e monta seu próprio `SubtaskEditDialog`
(`TaskList.tsx:921`, `ProjectDetail.tsx:798`), reaproveitando o mesmo form completo (`TaskForm`
inline, abas Geral/Data e repetição/Organização/Registros de tempo) só pra tarefas de topo.

Pedido do usuário: tratar subtarefa como o que ela já é no banco — uma tarefa (conceito
parent/child), não uma entidade reduzida à parte.

## Decisões
- Escopo: só a experiência de **edição** de uma subtarefa existente. As visões de topo continuam
  ocultando subtarefas das listas principais (Lista/Kanban/Gantt/Agenda mostram só tarefas sem
  `parent_task_id`, subtarefas aparecem aninhadas no checklist do pai) — isso não muda, é o
  significado de "subtarefa" no produto.
- Abrir uma subtarefa (`onOpenSubtask`) passa a abrir o **mesmo dialog completo** usado pra tarefas
  de topo (`setEditing(subtask)` + `setFormTab("geral")`), em vez do `SubtaskEditDialog` reduzido —
  em `TaskList.tsx` e `ProjectDetail.tsx`. Isso dá de graça prioridade, tags, link externo, registro
  de tempo e (se a feature `035` já existir) ícone.
- Restrições que precisam sobreviver à migração pro form completo:
  - **Prazo não pode passar do prazo da tarefa-mãe** (`isSubtaskDueDateValid`, hoje só dentro de
    `SubtaskEditDialog`) — mover essa validação pro `handleSave` do form completo, ativada quando
    `form.parent_task_id` está setado (bloqueia salvar com a mesma mensagem de erro).
  - **Sem recorrência própria**: esconder a seção de recorrência dentro de `TaskRecurrenceField`
    (aba "Data e repetição") quando a tarefa em edição é uma subtarefa — mantém só
    `due_date`/`due_time` editáveis ali. Uma subtarefa não tem série independente da mãe.
  - **Sem sub-subtarefas**: esconder `TaskSubtasksField` (aba "Organização") quando
    `editing.parent_task_id` existir — o modelo fica a 2 níveis (parent/child), consistente com o
    Gantt (`buildGanttNodes` já só considera 1 nível de `childTasks` abaixo de um `topLevel`) e com
    o resto da UI, que não foi desenhada pra árvore recursiva.
  - **Projeto herdado, não editável independentemente**: campo "Projeto" (aba "Geral") escondido ou
    somente-leitura quando é subtarefa — decidir esconder vs. mostrar readonly na implementação, mas
    subtarefa não deve poder pertencer a um projeto diferente do pai.
- `SubtaskEditDialog.tsx` e `SubtaskEditPayload` ficam obsoletos e são removidos, junto das
  referências em `TaskList.tsx`/`ProjectDetail.tsx` (`editingSubtask`, imports).
- `SubtaskChecklist` (`TaskViews.tsx`) não muda visualmente — só o destino do clique em cada linha.

## Tarefas
- [x] Em `TaskList.tsx`: trocar `onOpenSubtask={(subtask) => setEditingSubtask(subtask)}` (3
      ocorrências) por abrir o form completo (`setEditing(subtask)`, `setFormTab("geral")`, e
      qualquer outro estado que `handleEdit`/equivalente já popule pra tarefas de topo).
- [x] Repetir a mesma troca em `ProjectDetail.tsx` (3 ocorrências de `onOpenSubtask`).
- [x] No `handleSave` do form completo (`TaskList.tsx` e `ProjectDetail.tsx`), validar
      `isSubtaskDueDateValid(form.due_date, parentTask.due_date)` quando `form.parent_task_id`
      estiver presente (buscar a tarefa-mãe em `tasks`/`allTasks` pelo id), bloqueando o save com
      mensagem de erro equivalente à que `SubtaskEditDialog` mostrava.
- [x] Em `TaskRecurrenceField.tsx`, esconder a seção de recorrência quando a tarefa em edição tem
      `parent_task_id` (prop nova, ex. `isSubtask?: boolean`, passada por quem monta o form).
- [x] Esconder `TaskSubtasksField` (aba "Organização") quando `editing?.parent_task_id` existir, em
      `TaskList.tsx` e `ProjectDetail.tsx`.
- [x] Esconder ou tornar readonly o campo "Projeto" (aba "Geral") quando `editing?.parent_task_id`
      existir, nos dois arquivos.
- [x] Remover `SubtaskEditDialog.tsx`, `SubtaskEditPayload` e as referências/estado
      (`editingSubtask`, imports) em `TaskList.tsx` e `ProjectDetail.tsx`.
- [x] `npx tsc --noEmit && npm run build && npm run lint`.
- [x] Teste de componente (Testing Library/jsdom) provando o comportamento real de editar uma
      subtarefa, no lugar do item "Teste manual" original (a skill `next` proíbe Chrome/browser
      automation sem exceção e exige cobertura automatizada real): subtarefa abre o mesmo form
      completo (não o `SubtaskEditDialog` removido); `isSubtaskDueDateValid` bloqueia salvar com
      prazo além do prazo da mãe (toast de erro + troca pra aba "Data e repetição");
      `TaskRecurrenceField` em modo subtarefa mostra só Prazo/Horário (sem seletor de recorrência
      nem Início/Duração); `TaskSubtasksField` some da aba Organização ao editar uma subtarefa; e
      o campo Projeto vira somente-leitura "Herdado da tarefa principal" em `TaskList.tsx` ao
      editar uma subtarefa.

## Prompts

## Notas
- `SubtaskEditDialog.tsx` não tinha campo Projeto (subtarefas herdam do pai por definição, o
  formulário nunca ofereceu escolha). Em `TaskList.tsx` (única tela cujo form tem seletor de
  Projeto — `ProjectDetail.tsx` não tem, porque lá toda tarefa já pertence ao projeto da página),
  quando `editing?.parent_task_id` existe, o campo vira um bloco somente-leitura mostrando o nome/
  cor do projeto herdado + rótulo "Herdado da tarefa principal", em vez de escondido — decisão da
  tarefa deixava as duas opções em aberto; optei por readonly porque comunica melhor por que o
  campo não está editável do que simplesmente omiti-lo.
- `TaskRecurrenceField` ganhou `isSubtask`/`parentDueDate` opcionais com um `return` antecipado
  (só Prazo + Horário, com `maxDate` do DatePicker travado no prazo da mãe) em vez de remendar a
  árvore de condicionais existente (`mode !== "linked"`, `mode === "simple"`, `mode === "linked"`)
  — mais simples de ler e impossível de vazar recorrência por engano numa combinação de estados
  não prevista.
- Verificação: `npx tsc -p tsconfig.app.json --noEmit` limpo, `npm run build` ok, `npm run lint`
  0 erros (37 warnings pré-existentes, nenhum nos arquivos tocados). `npm test`: 529 passam, 2
  falham em `src/lib/__tests__/currency.test.ts` (`formatDateBR`/`formatDateTimeBR` esperam "—"
  mas o código retorna "·" para data nula) — bug pré-existente em `src/lib/currency.ts`, arquivo
  não tocado por esta feature (`git diff` confirma) e não relacionado a subtarefas; não corrigido
  aqui para não expandir escopo, sinalizando para o usuário decidir se abre uma tarefa/feature à
  parte.
- Sem testes de componente novos: o repo não tem infraestrutura de teste de componente (vitest
  roda em `environment: "node"`, `include` só pega `*.test.ts`, sem `@testing-library/react`
  instalado) — confirmado que as features 029-035 (quick-edit, ícones) já implementadas neste
  mesmo diff também não têm testes de componente, então segui a mesma convenção do projeto em vez
  de introduzir infraestrutura nova fora do escopo pedido. `isSubtaskDueDateValid` (a única lógica
  pura nova/reutilizada) já tem cobertura completa em `src/domain/tasks/__tests__/subtasks.test.ts`.
- Retomada da feature: a nota acima ficou desatualizada — a infra de teste de componente
  (`@testing-library/react`, jsdom via `environmentMatchGlobs`, `src/test/setup-jsdom.ts`) foi
  adicionada numa sessão posterior, e a skill `next` passou a proibir Chrome/browser automation
  sem exceção. A última tarefa ("Teste manual") foi reescrita para
  `src/pages/admin/tasks/__tests__/TaskList.subtask-edit.test.tsx` (9 testes): renderiza
  `TaskList` de verdade (mock só de `@/api/tasks`, `@/api/recurring`, `@/hooks/useDimensions`,
  `@/hooks/use-toast`), abre uma subtarefa pelo checklist (`SubtaskChecklist`/`onOpenSubtask`) e
  prova cada restrição da lista de Decisões: dialog completo (abas Geral/Data e repetição/
  Organização/Registros de tempo, não o `SubtaskEditDialog` removido), `isSubtaskDueDateValid`
  bloqueando `handleSave` (toast "Erro" + `aria-selected` na aba "Data e repetição", `updateTask`
  não chamado) com um contraste salvando prazo válido (`updateTask` chamado), `TaskRecurrenceField`
  isSubtask (só Prazo/Horário, sem "Esta tarefa se repete?"/Início/Duração) com contraste no modo
  tarefa de topo, `TaskSubtasksField` ausente da aba Organização (com contraste presente numa
  tarefa de topo), e o bloco "Herdado da tarefa principal" substituindo o `ProjectPicker`/listbox
  "Projeto" (com contraste do `ProjectPicker` normal numa tarefa de topo).
- Ao escrever esse teste, a checagem de satisfação (releitura da tarefa "Esconder
  `TaskSubtasksField` ... em `TaskList.tsx` e `ProjectDetail.tsx`", já marcada `[x]`) encontrou um
  bug real: `ProjectDetail.tsx` nunca ganhou o guard `!editing?.parent_task_id` ao redor de
  `TaskSubtasksField` (só `TaskList.tsx` tinha) — editar uma subtarefa em `ProjectDetail.tsx`
  continuava oferecendo sub-subtarefas, violando a decisão "modelo fica a 2 níveis". Corrigido
  (`src/pages/admin/tasks/ProjectDetail.tsx`, aba Organização) e coberto por
  `src/pages/admin/tasks/__tests__/ProjectDetail.subtask-edit.test.tsx` (5 testes, o primeiro é a
  regressão em si — confirmado que falha sem o guard revertendo o arquivo momentaneamente e
  rodando a suíte antes de reaplicar a correção). Os outros 4 testes desse arquivo replicam, pra
  `ProjectDetail.tsx`, as mesmas restrições já cobertas em `TaskList.tsx` (dialog completo,
  `isSubtaskDueDateValid`, `TaskRecurrenceField` isSubtask) — únicas que fazem sentido lá, já que
  `ProjectDetail.tsx` não tem campo Projeto pra testar "Herdado".
