---
prompt: |
  - adicionar duração também na tela de edição de tarefa
  - o forms de edição de tarefas, ao clicar pela agenda nõa é o mesmo. unifique esses componentes
    para não gerar esse tipo de fluxo incoerente
---

# 042 — Unificar o form de edição de tarefa entre Lista e Detalhe de Projeto

## Contexto
Investigando o pedido "adicionar duração também na tela de edição de tarefa" descobrimos que a
duração estimada (feature `done/032`) **já existe** no form completo — só que esse form completo
está implementado **duas vezes**, quase idêntico, como JSX inline copiado entre
`src/pages/admin/tasks/TaskList.tsx` (linhas ~965-1111) e `src/pages/admin/tasks/ProjectDetail.tsx`
(linhas ~847-966): mesmas 4 abas (Geral/Data e repetição/Organização/Registros), mesmos campos
(`TaskIconPicker`, `TaskPriorityField`, `TaskMilestoneField`, `TaskRecurrenceField`, `TagCombobox`,
`TaskSubtasksField`, `TaskTimeEntriesField`), mesma lógica de `handleSave`/`emptyTask`/
`addSubtaskToEditing`/`removeExistingSubtask` — ~150 linhas de JSX + ~50 linhas de handlers
duplicadas, com divergência real de só ~20 linhas (o campo "Projeto" via `ProjectPicker`, que só
existe em `TaskList.tsx` porque em `ProjectDetail.tsx` o projeto já é fixo pela rota).

Essa duplicação é a raiz do problema maior reportado depois pelo usuário: existe um **terceiro**
form de edição de tarefa, usado pela Agenda (`CalendarTaskDialog`, dentro de `AgendaGrid.tsx`),
que é uma implementação **à parte e reduzida** (só título/descrição/prazo+horário/prioridade — sem
projeto, ícone, marco, recorrência/duração/início, tags, link externo, subtarefas ou registros de
tempo). Cada feature nova (032 duração, 035 ícone, 036 subtarefas, 037 marco) só tocou o form
"principal" duplicado em `TaskList.tsx`/`ProjectDetail.tsx` — a Agenda ficou pra trás a cada
rodada, e vai continuar ficando enquanto o form principal em si já não for uma fonte única.
Corrigir isso primeiro (esta feature) é pré-requisito pra depois estender à Agenda com risco
menor (feature seguinte `043`) — sem duplicação de base, a Agenda ganha o form completo de graça,
em vez de virar uma terceira cópia divergente.

## Decisões
- Escopo desta feature: só deduplicar `TaskList.tsx` ↔ `ProjectDetail.tsx` (os dois call sites que
  já têm o form completo hoje). A Agenda (`CalendarTaskDialog`) fica para a feature `043` — trocar
  os dois de uma vez por um componente novo é arriscado o suficiente sem também mudar o
  comportamento da Agenda na mesma tacada.
- **Novo componente `TaskFormFields.tsx`** (`src/pages/admin/tasks/`) — recebe o `Tabs`/
  `TabsList`/`TabsContent` das 4 abas (Geral/Data e repetição/Organização/Registros) como um bloco
  só, parametrizado por props (não é dono do `Dialog`/`DialogContent` em volta — isso continua com
  cada call site, já que a classe de largura difere hoje entre `FORM_DIALOG_CONTENT_CLASS_LG`
  (`TaskList.tsx`) e `FORM_DIALOG_CONTENT_CLASS` (`ProjectDetail.tsx`); decidir na implementação se
  vale unificar essa diferença cosmética ou manter via prop `size`).
  - Campo "Projeto" (`ProjectPicker`) só aparece quando `projects`/`onProjectChange` (ou
    equivalente) são passados — ausente em `ProjectDetail.tsx`, presente em `TaskList.tsx`, mesmo
    padrão "presença de prop = campo aparece" já usado em `TaskQuickFields` (feature 033).
  - Aba "Registros" (`TaskTimeEntriesField`) só aparece quando `editing`/`task` não é `null`
    (criação não tem registros ainda) — comportamento atual preservado.
- **Lógica de estado/validação também extraída**, não só o JSX — senão a duplicação real
  (handlers) continua escondida atrás de um componente de UI. Extrair para
  `src/domain/tasks/taskDraft.ts` (ou nome equivalente): `emptyTask(projectId?: string)`
  (já parametrizado hoje só em `ProjectDetail.tsx`; unificar as duas versões numa só função com
  `projectId` opcional), a validação de prazo de subtarefa (`isSubtaskDueDateValid`, já existe
  como função pura — só garantir que os dois call sites chamem a mesma via o componente/hook novo,
  não reimplementem a checagem), e os helpers `addSubtaskToEditing`/`removeExistingSubtask`.
  `handleSave` em si (que decide `createTask` vs `updateTask`, trata `linked_recurring_id`/
  `linked_installment_number`) pode continuar em cada call site — ele já chama funções de API
  específicas de cada tela (ex. `load()` depois de salvar difere entre Lista/Projeto) — mas deve
  reaproveitar a validação/normalização extraída em vez de duplicá-la.
- Tipo `TaskFormTab` (hoje declarado duas vezes, `TaskList.tsx:136` e `ProjectDetail.tsx:127`)
  move para um lugar compartilhado (`TaskFormFields.tsx` ou `src/types/tasks.ts`), exportado e
  importado nos dois call sites em vez de redeclarado.
- Sem mudança de comportamento visível para o usuário nesta feature — é um refactor de
  deduplicação. Qualquer diferença de comportamento hoje existente entre `TaskList.tsx` e
  `ProjectDetail.tsx` (ex. campo Projeto ausente/presente) precisa ser preservada via prop, não
  eliminada silenciosamente.

## Tarefas
- [x] Criar `src/domain/tasks/taskDraft.ts` com `emptyTask(projectId?: string | null)` unificado
      (substituindo as duas versões locais) + testes unitários (Vitest) cobrindo com e sem
      `projectId`.
- [x] Mover `addSubtaskToEditing`/`removeExistingSubtask` (hoje duplicados em `TaskList.tsx` e
      `ProjectDetail.tsx`) para `src/domain/tasks/taskDraft.ts` como funções puras que recebem o
      draft atual e devolvem o novo, com testes unitários.
- [x] Mover o tipo `TaskFormTab` pra um lugar compartilhado (`src/pages/admin/tasks/TaskFormFields.tsx`
      ou `src/types/tasks.ts`) e atualizar os dois imports.
- [x] Criar `src/pages/admin/tasks/TaskFormFields.tsx`: extrair a aba "Geral" (título, descrição,
      ícone, prioridade, marco, e o campo Projeto condicional) do JSX hoje duplicado em
      `TaskList.tsx`/`ProjectDetail.tsx`.
- [x] Extrair a aba "Data e repetição" (`TaskRecurrenceField`, já é um componente — só mover o
      `TabsContent` que a envolve) para `TaskFormFields.tsx`.
- [x] Extrair a aba "Organização" (`TagCombobox`, link externo, `TaskSubtasksField` condicional)
      para `TaskFormFields.tsx`.
- [x] Extrair a aba "Registros" (`TaskTimeEntriesField`, condicional a `editing`/`task` não nulo)
      para `TaskFormFields.tsx`.
- [x] Montar `TabsList`/navegação de abas dentro de `TaskFormFields.tsx`, recebendo `formTab`/
      `onFormTabChange` por prop (estado continua vivendo no call site, já que abrir uma subtarefa
      precisa resetar a aba pra "geral" a partir de fora).
- [x] Atualizar `TaskList.tsx`: substituir o JSX das 4 abas por `<TaskFormFields ... />` dentro do
      `Dialog`/`DialogContent` existente, usando `emptyTask`/`addSubtaskToEditing`/
      `removeExistingSubtask` importados de `taskDraft.ts`. Remover o código morto que sobrar.
- [x] Atualizar `ProjectDetail.tsx`: mesma substituição, sem passar as props de Projeto (mantendo
      o campo ausente, comportamento atual).
- [x] Testes de componente para `TaskFormFields.tsx` (Testing Library/jsdom, seguir padrão de
      `src/pages/admin/tasks/__tests__/`): renderiza as 4 abas, campo Projeto aparece só quando as
      props correspondentes são passadas, aba Registros aparece só em edição, navegação entre abas
      funciona.
- [x] Rodar (e, se necessário, ajustar) as suítes existentes que já cobrem o dialog completo via
      `TaskList.tsx`/`ProjectDetail.tsx` (`TaskList.subtask-edit.test.tsx`,
      `ProjectDetail.subtask-edit.test.tsx`, e outros testes que abrem o form) — confirmar que
      continuam passando sem alteração de comportamento observável.
- [x] `npx tsc -p tsconfig.app.json --noEmit && npm run build && npm run lint && npm test`.

## Prompts

## Notas
- `removeExistingSubtask` em `taskDraft.ts` originalmente tinha o parâmetro tipado como
  `{ id?: string }` — mais estreito que o shape real (`SubtaskDraft = { id?: string; title: string }`)
  usado pelos dois call sites, o que quebrava `npx tsc` no teste (`title` como propriedade
  excedente). Consertado ajustando o parâmetro pra aceitar `SubtaskDraft` de verdade. Aproveitei
  pra mover `SubtaskDraft` de `TaskSubtasksField.tsx` (camada de UI) para `src/types/tasks.ts`
  (camada de tipos compartilhados) — `taskDraft.ts` é domínio e não deveria importar de
  `src/pages/admin/tasks/`; `TaskSubtasksField.tsx` re-exporta o tipo pra não quebrar quem já
  importava de lá.
- `npm test` roda com 2 falhas pré-existentes e não relacionadas em
  `src/lib/__tests__/currency.test.ts` (`formatDateBR`/`formatDateTimeBR` esperam "—" mas
  `src/lib/currency.ts` retorna "·" — bug já commitado em `HEAD`, confirmado via
  `git show HEAD:src/lib/currency.ts`, nenhum arquivo desta feature toca `currency.ts`). Fora do
  escopo desta feature; não corrigido aqui.
