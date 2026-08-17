---
prompt: |
  when deleting a task that has recurrences, needs to have a option to delete the other ohter, all the ones that are from the recorrencia of that task
---

# 028 — Excluir todas as ocorrências de uma recorrência de tarefa

## Contexto
Hoje, excluir uma tarefa que faz parte de uma recorrência simples (`recurrence_rule` na
tarefa-origem, `recurrence_origin_id` em cada ocorrência materializada — ver
`domain/tasks/recurrence.ts` e `materializeRecurringInstances` em `api/tasks/tasks.ts:12-58`)
só remove aquela linha: `deleteTask(id)` (`api/tasks/tasks.ts:227-235`) é um `DELETE` por `id`,
disparado pelo botão de lixeira dentro de `ConfirmDeleteDialog` — usado por `TaskListRow` e
`KanbanCard`, ambos em `TaskViews.tsx`, chamados a partir de `TaskList.tsx` (`handleDelete`,
linha 501) e `ProjectDetail.tsx` (`handleDelete`, linha 363). Não existe hoje nenhuma opção de
excluir a série inteira — quem quiser remover uma recorrência precisa apagar cada ocorrência uma
por uma. (O arquivo `ProjectKanban.tsx` citado originalmente não existe mais como componente
separado — o Kanban de dentro de um projeto foi incorporado à aba Kanban de `ProjectDetail.tsx`,
que reaproveita o mesmo `KanbanCard`/`ConfirmDeleteDialog`.)

Já existe `findSeriesTasks(allTasks, representative)` (`domain/tasks/agenda.ts:161-165`), usada
hoje só para popular o dialog "Ocorrências de..." (`seriesTask`/`seriesTasks` em `TaskList.tsx`)
— ela devolve todas as ocorrências (passadas e futuras) da mesma série via `seriesKey`, que já
sabe diferenciar três casos: `linked:<linked_recurring_id>` (vínculo a Recorrência Financeira,
feature `done/002`), `simple:<recurrence_origin_id>` (ocorrência de recorrência simples) e
`simple:<id>` (a própria tarefa-origem, quando ela ainda não gerou ocorrências). Essa função é
reaproveitável para montar a lista de ids a excluir em massa — só precisa ser usada com cuidado
para não misturar com o caso vinculado (ver Decisões).

Não há feature em `done/` que cubra "excluir a série inteira" — a mais próxima é `done/002`, mas
ela é sobre o vínculo a Recorrência Financeira (materialização/sync de parcelas), um mecanismo
deliberadamente separado da recorrência simples desta feature; não encaixa.

## Decisões
- **Escopo: só recorrência simples** (`recurrence_rule` e/ou `recurrence_origin_id`, sem
  `linked_recurring_id`). Tarefas vinculadas a uma Recorrência Financeira continuam com exclusão
  única (comportamento atual, sem mudança) — elas têm sync bidirecional próprio com `paid_parcels`
  (`syncLinkedInstallmentFromTask`, `api/tasks/tasks.ts:197-225`) e exclusão em massa dessas linhas
  poderia deixar a Recorrência Financeira com parcelas fantasma; fora do escopo deste pedido, que
  fala especificamente de "recorrência" de tarefa.
- Detectar elegibilidade com um novo helper puro `isSimpleRecurringTask(task)` em
  `domain/tasks/agenda.ts` (ao lado de `isRecurringTask`): `true` quando
  `(!!task.recurrence_rule || !!task.recurrence_origin_id) && !task.linked_recurring_id`. Com
  teste Vitest em `agenda.test.ts`.
- **Não reaproveitar `ConfirmDeleteDialog`** (`src/components/ConfirmDeleteDialog.tsx`) para as
  duas opções — é um componente genérico usado em ~18 outras telas do app; mudar sua API para
  suportar "excluir tudo" vazaria uma necessidade só de Tarefas para todo o resto. Criar um
  componente novo e específico, `TaskDeleteDialog.tsx` (`src/pages/admin/tasks/`), que:
  - Para tarefa não-recorrente ou vinculada (`!isSimpleRecurringTask(task)`): comportamento
    idêntico ao `ConfirmDeleteDialog` de hoje (um botão "Excluir"), sem regressão.
  - Para `isSimpleRecurringTask(task) === true`: mostra duas ações — "Excluir somente esta" (chama
    `onConfirm`, o `deleteTask(id)` de sempre) e "Excluir todas as ocorrências" (chama
    `onConfirmAll`, novo), com o total de ocorrências da série (via `findSeriesTasks`) exibido no
    texto (ex. "Essa tarefa faz parte de uma recorrência com N ocorrências.").
  - Substitui o uso de `ConfirmDeleteDialog` dentro de `TaskListRow` e `KanbanCard`
    (`TaskViews.tsx`) — mesmo trigger (botão de lixeira), mesma posição.
- **Exclusão em massa**: nova função `deleteTasks(ids: string[])` em `api/tasks/tasks.ts`, um
  único `DELETE ... WHERE id IN (...) AND user_id = ...` (mais barato e mais atômico que N
  chamadas de `deleteTask`), exportada por `api/tasks/index.ts` (`export * from "./tasks"` já
  cobre).
- `TaskListRow`/`KanbanCard` ganham uma prop nova `onDeleteAll?: (ids: string[]) => void` (opcional
  — quando ausente, mesmo comportamento de hoje); `TaskList.tsx` e `ProjectDetail.tsx` implementam
  `handleDeleteSeries(ids)` espelhando `handleDelete(id)` (chama `deleteTasks`, toast, `load()`).
- Caso de borda aceito, sem tratamento especial: excluir "somente esta" quando a tarefa é a
  *origem* da série (tem `recurrence_rule`, não tem `recurrence_origin_id`) já interrompe a
  materialização de ocorrências futuras hoje (`materializeRecurringInstances` precisa da linha de
  origem) — comportamento pré-existente, não uma regressão desta feature; não precisa de aviso
  extra no dialog.

## Tarefas
- [x] `isSimpleRecurringTask(task)` em `domain/tasks/agenda.ts` + teste Vitest em `agenda.test.ts`
- [x] `deleteTasks(ids: string[])` em `api/tasks/tasks.ts` (delete em lote por `IN`, escopado a
      `user_id`)
- [x] Criar `TaskDeleteDialog.tsx`: variante simples (comportamento atual) quando
      `!isSimpleRecurringTask`, variante com "Excluir somente esta" / "Excluir todas as
      ocorrências" (mostrando a contagem via `findSeriesTasks`) quando `isSimpleRecurringTask`
- [x] Trocar `ConfirmDeleteDialog` por `TaskDeleteDialog` em `TaskListRow` e `KanbanCard`
      (`TaskViews.tsx`), passando `task`, `allTasksInSeries` (ou a lista completa de tasks para o
      componente calcular via `findSeriesTasks`) e os dois handlers
- [x] Adicionar `handleDeleteSeries(ids)` em `TaskList.tsx` e ligar em todos os pontos que hoje
      passam `onDelete={handleDelete}`/`onDelete={() => handleDelete(task.id)}` (linhas 671, 712,
      787)
- [x] Adicionar `handleDeleteSeries(ids)` em `ProjectDetail.tsx` e ligar nos mesmos pontos (linhas
      582, 653, 678)
- [x] `npm run build && npm run lint` + Vitest (checks automatizados — ver Notas para o que ainda
      falta)
- [x] Teste manual no navegador (sessão autenticada): criar uma tarefa recorrente (ex. diária),
      abrir o dialog de exclusão numa ocorrência, confirmar que aparece a opção "Excluir todas as
      ocorrências" com a contagem certa, testar as duas opções (uma ocorrência some vs. série
      inteira some), e confirmar que uma tarefa comum (sem recorrência) e uma tarefa vinculada a
      Recorrência Financeira continuam com o dialog de exclusão simples de sempre

## Prompts

## Notas
- `npx tsc --noEmit` sem args usa `tsconfig.json` raiz (`files: []`, projeto composto) e não
  verifica nada sozinho — o check real é `npx tsc --noEmit -p tsconfig.app.json` (ou `npm run
  build`, que roda `tsc -b`). Rodei os dois; sem erros novos.
- `npm run test` tem 2 falhas pré-existentes em `src/lib/__tests__/currency.test.ts`
  (`formatDateBR`/`formatDateTimeBR` esperando "—" e recebendo "·") em arquivos que esta feature
  não tocou — parece um problema de encoding do ambiente de teste, não relacionado a 028. Os 495
  testes restantes (incluindo os 23 de `agenda.test.ts`, com os novos casos de
  `isSimpleRecurringTask`) passam.
- `onDeleteAll` ficou opcional em `TaskListRow`/`KanbanCard`/`CompletedTasksSection` (e em
  `TaskDeleteDialog.onConfirmAll`) em vez de obrigatório: com a prop ausente, o dialog nunca
  mostra "Excluir todas as ocorrências" mesmo se a tarefa for elegível — mantém os componentes
  reutilizáveis em contextos futuros que não queiram oferecer exclusão em massa, sem quebrar o
  contrato existente.
- 2026-08-13: teste manual feito via automação de navegador numa sessão logada (ngrok). Criada uma
  tarefa recorrente diária de teste (5 ocorrências), dialog de exclusão mostrou corretamente "Excluir
  tarefa recorrente" com "Excluir somente esta" / "Excluir todas as ocorrências" / "Cancelar";
  "Excluir todas as ocorrências" apagou a série inteira via `deleteTasks`. Confirmado também que uma
  tarefa comum (sem recorrência) mostra o dialog simples de sempre ("Excluir esta tarefa?").
- **Bug encontrado e corrigido nesta rodada**: o botão "Excluir somente esta" estava com contraste
  quebrado (texto praticamente invisível — cinza claro em fundo claro), tornando-o parecer
  desabilitado embora fosse clicável. Causa: `AlertDialogAction` (`src/components/ui/alert-dialog.tsx`)
  sempre aplica `buttonVariants()` (variante padrão, `text-primary-foreground`) como classe base via
  `cn(buttonVariants(), className)`; o `className` que `TaskDeleteDialog` passa para esse botão
  (`buttonVariants({variant: "outline"})`) sobrescreve o `bg-*` mas não define nenhum `text-*` próprio
  (só `hover:text-accent-foreground`), então o `text-primary-foreground` do variant padrão sobrevivia
  ao merge do `tailwind-merge` — texto claro pensado pra fundo escuro, num botão com fundo claro.
  Corrigido em `TaskDeleteDialog.tsx` adicionando `text-foreground` explícito à className do botão
  "Excluir somente esta". `npx tsc --noEmit`/`npm run lint` confirmados limpos após o fix.
