---
prompt: |-
  create a feature for changing the name of a subtask, clicking on it, isso no forms de criação/edição de atarefa e também colocar ícone de duração para poder definir o prazo dessa subtarefa direto ao criá-la a partir do forms da sua task mãe
---

# 247 — Subtarefa renomeável e com prazo na própria linha do form

## Contexto
- A linha de subtarefa no form da mãe é só leitura: `TaskSubtasksField.tsx:66` renderiza o título num `<span truncate>`, e as únicas ações são arrastar e remover.
- Trocar o nome de uma subtarefa hoje exige abrir a subtarefa como tarefa completa (feature 036) — caminho longo para corrigir uma palavra.
- Prazo/duração de subtarefa já existem como campo próprio desde a 048, mas só são alcançáveis fora do form da mãe: na criação a subtarefa nasce sempre sem prazo (`TaskList.tsx:775`, `ProjectDetail.tsx:588` só mandam `title` + `sort_order`).
- A linha da Lista e o mini-card do Kanban já editam prazo de subtarefa inline (`SubtaskRowActions.onDueChange`, `TaskViews.tsx:171`) — o form da mãe é o único lugar que ficou atrás.

## Definições
- Linha de subtarefa: `SortableSubtaskRow` em `TaskSubtasksField.tsx:37`, usada pelos dois modos do form (criação com rascunho, edição com subtarefa gravada).
- Renomear: trocar `title` da subtarefa pela própria linha, sem abrir outro dialog.
- Prazo na linha: `due_date` + `due_time` + `estimated_duration` + `is_quick`, o pacote que `TaskDueQuickEditValue` (`TaskDueQuickEdit.tsx:14`) já carrega.
- Fora: Kanban/Lista (já têm o mesmo par inline), sub-subtarefa, recorrência de subtarefa, prioridade/ícone na linha do form.

## Estrutura
- Frente A — título clicável na linha.
  - `TaskSubtasksField.tsx:66` — `<span>` estático → alvo clicável que troca por `<Input>` controlado; Enter/blur comita, Esc cancela, título vazio cancela em vez de apagar a linha.
  - `TaskSubtasksField.tsx:82` — props ganham `onRename(subtask, index, title)`; `onRename` ausente mantém a linha só leitura (mesma convenção opcional de `onReorder`).
- Frente B — ícone de prazo/duração na linha.
  - `TaskSubtasksField.tsx:37` — linha ganha, antes do `X`, o trigger de `TaskDueQuickEdit.tsx:30`, que já é ícone + texto ("+ Prazo" sem prazo) e abre calendário + horário + `TaskDurationQuickPick.tsx:29` no mesmo popover.
  - Nova prop `onDueChange(subtask, index, next: TaskDueQuickEditValue)`; sem ela, nada de prazo na linha.
  - Limite da 048: `isSubtaskDueDateValid` (`subtasks.ts:72`) contra o `form.due_date` da mãe — aviso derivado do valor na própria linha, no espírito de `TaskFormFields.tsx:161`.
- Frente C — rascunho deixa de ser string.
  - `types/tasks.ts:262` — `SubtaskDraft` ganha `due_date`, `due_time`, `estimated_duration`, `is_quick` (opcionais, ausentes = como hoje).
  - `TaskList.tsx:187` (`useState<string[]>`) e `ProjectDetail.tsx:180` (`newTaskSubtasks`) → `SubtaskDraft[]`; o `.map((title) => ({ title }))` dos call sites (`TaskList.tsx:1438`, `ProjectDetail.tsx:1155`) desaparece.
  - `TaskList.tsx:775` e `ProjectDetail.tsx:588` — o `createTask` encadeado passa os campos novos junto do `title`.
- Frente D — modo edição grava na hora.
  - `domain/tasks/taskDraft.ts:43` — `SubtaskMutationContext` ganha `updateTask`; função nova `patchExistingSubtask(ctx, subtask, patch)` ao lado de `addSubtaskToEditing:53`/`removeExistingSubtask:74`, com o mesmo guard de `subtask.id` ausente e `onSuccess: load`.
  - Call sites que passam subtarefa real pro form: `TaskList.tsx:1435`, `ProjectDetail.tsx:1152`, `AgendaGrid.tsx:1054` — os três recebem os dois callbacks novos.
  - `AgendaGrid` só abre o form em edição; para ele a Frente C é inerte.
- Frente E — prova por código (Chrome bloqueado).
  - Teste de componente em `__tests__/TaskFormFields.*`: criação → renomear rascunho + escolher prazo → `createTask` da subtarefa chega com `title` novo e `due_date`; edição → renomear/escolher prazo chama `updateTask` com o id da subtarefa.
  - Teste de domínio: `patchExistingSubtask` no-op sem `id`, e prazo além do da mãe reprovado por `isSubtaskDueDateValid`.

## Decisões
- Reusar `TaskDueQuickEdit` inteiro em vez de pendurar só `TaskDurationQuickPick`: o pedido diz "definir o prazo", e prazo+hora+duração já vêm juntos nesse popover (é o mesmo que a subtarefa recebe na Lista).
- Renomear/alterar prazo de subtarefa **gravada** dispara a chamada na hora, sem esperar "Salvar alterações" — é o contrato que adicionar/remover subtarefa já tem no form desde a 042.
- Rascunho sem `id` continua 100% local até o `createTask` da mãe; nada de criar subtarefa antes da tarefa existir.
- Invariante da 048 continua sendo de `domain`: a linha só exibe o aviso, a regra permanece em `isSubtaskDueDateValid`.
- Nada de prioridade, ícone ou status na linha do form nesta rodada — o pedido é nome + prazo.

## Perguntas em aberto
### P1 — Prazo além do prazo da mãe na linha: avisar, ou impedir a escolha?
- Recomendada: avisar na linha e não gravar aquela data (a escolha volta ao valor anterior) — mantém o invariante da 048 sem travar o calendário inteiro.
- **Resposta:recomendado**

### P2 — Renomear comita no blur, ou só no Enter?
- Recomendada: Enter e blur comitam, Esc cancela — blur sem comitar perde texto digitado dentro de um dialog que o usuário pode fechar.
- **Resposta:recomendado**

### P3 — A linha mostra duração junto do prazo, ou só o prazo?
- Recomendada: o trigger padrão de `TaskDueQuickEdit` (data + hora quando houver, "+ Prazo" quando não), com a duração visível só dentro do popover — a linha é estreita e já carrega grip, título e `X`.
- **Resposta:recomendado**

### P4 — O "Adicionar subtarefa" do form passa a aceitar prazo na criação da linha, ou só depois de criada?
- Recomendada: só depois de criada — a linha nasce e o ícone de prazo fica nela; campo de prazo colado no input de adicionar engordaria o bloco sem necessidade.
- **Resposta:recomendado**
## Prompts
(vazio até haver iteração nova)
