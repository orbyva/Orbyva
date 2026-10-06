---
prompt: |-
  Pedido original do usuário, verbatim:

  "create a feature for changing the name of a subtask, clicking on it, isso no forms de
  criação/edição de atarefa e também colocar ícone de duração para poder definir o prazo dessa
  subtarefa direto ao criá-la a partir do forms da sua task mãe"

  Desenho já fechado (não reabrir):

  A linha de subtarefa dentro do form da tarefa-mãe (`SortableSubtaskRow`,
  `TaskSubtasksField.tsx:37`) é só leitura: título num `<span truncate>` (`:66`), e as únicas ações
  são arrastar (grip) e remover (`X`). Cumprir esta feature é dar a essa linha **duas** capacidades,
  nos dois modos do form (criação com rascunho local, edição com subtarefa já gravada):

  1. **Renomear clicando no título** — o `<span>` vira alvo clicável que troca por input na própria
     linha. Enter e blur comitam, Esc cancela, título vazio cancela em vez de apagar a linha.
  2. **Prazo/duração pela própria linha** — o ícone pedido é o trigger de `TaskDueQuickEdit`
     (`TaskDueQuickEdit.tsx:30`), que já junta calendário + horário + `TaskDurationQuickPick`
     (presets de duração) no mesmo popover, e é o mesmo controle que a subtarefa já recebe na Lista
     e no Kanban (`SubtaskRowActions.onDueChange`, `TaskViews.tsx:171`). O trigger mostra data +
     hora quando houver e "+ Prazo" quando não; a duração aparece só dentro do popover.

  Em modo criação, a subtarefa nasce hoje sempre sem prazo (`TaskList.tsx:775` e
  `ProjectDetail.tsx:588` mandam só `title` + `sort_order`): o rascunho `string[]` passa a ser
  `SubtaskDraft[]` com prazo/hora/duração/pontual, e esses campos chegam ao `createTask` encadeado.
  Em modo edição, renomear e trocar prazo gravam na hora, como adicionar/remover subtarefa já faz
  desde a 042.

  O limite da 048 continua valendo e continua sendo de `domain`: prazo de subtarefa não passa do
  prazo da mãe (`isSubtaskDueDateValid`, `subtasks.ts:72`). Data inválida escolhida na linha **não é
  gravada** — a linha avisa e o valor volta ao anterior.

  Sem migration (as colunas já existem na `task`), sem popover novo, sem prioridade/ícone/status na
  linha do form, sem prazo colado no input "Adicionar subtarefa", sem mexer na Lista, no Kanban nem
  na Agenda. A prova é por código (Chrome bloqueado): testes de componente e de domínio com asserção
  no que chega em `createTask`/`updateTask`.

  Decisões respondidas pelo usuário no planning (P1–P4, todas "recomendado"):
  P1 — prazo além do da mãe: avisa na linha e não grava aquela data (volta ao valor anterior).
  P2 — renomear comita no Enter **e** no blur, Esc cancela.
  P3 — o trigger na linha mostra só prazo (data + hora, ou "+ Prazo"); duração só dentro do popover.
  P4 — prazo só depois da linha criada; o input "Adicionar subtarefa" fica como está.
commits:
pr:
---

# 249 — Subtarefa renomeável e com prazo na linha do form

## Contexto
Sem dependências.

Trocar o nome de uma subtarefa hoje exige abrir a subtarefa como tarefa completa (feature 036) —
caminho longo para corrigir uma palavra, quando a linha com o nome está ali no form da mãe. E prazo
de subtarefa, que existe como campo próprio desde a 048, só é alcançável fora do form da mãe: na
criação toda subtarefa nasce sem prazo, e para dar data a cada uma é preciso salvar a tarefa, achar
as subtarefas na Lista e editar uma por uma.

A linha da Lista (`TaskListRow`) e o mini-card do Kanban já editam prazo de subtarefa inline pelo
mesmo popover (`SubtaskRowActions.onDueChange`, `TaskViews.tsx:171`) — o form da mãe é o único lugar
que ficou atrás. Esta feature fecha essa diferença e, no caminho, faz o rascunho de subtarefa deixar
de ser uma `string` solta.

É uma feature só: Frentes diferentes do desenho (contrato do rascunho, linha, call sites, testes)
são a fatia vertical de um pedido único, sem bloqueio externo no meio.

## Decisões
- **Reusar `TaskDueQuickEdit` inteiro** (`TaskDueQuickEdit.tsx:30`), não só `TaskDurationQuickPick`:
  o pedido diz "definir o prazo", e prazo + hora + duração + Pontual já vêm juntos nesse popover —
  é o mesmo controle que a subtarefa recebe na Lista. Nada de popover novo.
- **P3 (resposta do usuário):** o trigger na linha é o padrão do `TaskDueQuickEdit` — data + hora
  quando houver, "+ Prazo" quando não. A duração aparece só dentro do popover: a linha é estreita e
  já carrega grip, título e `X`.
- **P2 (resposta do usuário):** renomear comita no **Enter e no blur**; Esc cancela; título vazio (ou
  igual ao atual) cancela sem chamar nada — blur que descarta perderia texto dentro de um dialog que
  o usuário pode fechar, e vazio nunca significa "apague a subtarefa" (para isso existe o `X`).
- **P1 (resposta do usuário):** prazo além do prazo da mãe **não é gravado** — a linha mostra o aviso
  e o valor volta ao anterior. Mantém o invariante da 048 sem desabilitar o calendário inteiro.
- O aviso é **derivado do valor**, no espírito de `TaskFormFields.tsx:161`: aparece tanto na data
  recusada quanto numa linha que já estava inválida (ex.: o prazo da mãe encurtou depois). A regra
  permanece em `domain` (`isSubtaskDueDateValid`, `subtasks.ts:72`); a linha só exibe.
- **P4 (resposta do usuário):** o prazo entra na linha **depois** de criada; o input "Adicionar
  subtarefa" (`TaskSubtasksField.tsx:131`) fica exatamente como está.
- Renomear/alterar prazo de subtarefa **gravada** dispara a chamada na hora, sem esperar "Salvar
  alterações" — é o contrato que adicionar/remover subtarefa já tem no form desde a 042.
- Rascunho sem `id` continua 100% local até o `createTask` da mãe: nada de criar subtarefa antes de a
  tarefa-mãe existir.
- Nada de prioridade, ícone ou status na linha do form nesta rodada — o pedido é nome + prazo.
- Sem migration: `due_date`, `due_time`, `estimated_duration` e `is_quick` já existem na `task`
  (subtarefa é tarefa completa desde a 036).
- Props novas são **opcionais** em `TaskSubtasksField`, como `onReorder` já é: ausentes, a linha volta
  a ser exatamente a de hoje.

## Tarefas

### Contrato: rascunho com prazo e patch de subtarefa gravada
- [ ] `src/types/tasks.ts:262` — `SubtaskDraft` ganha `due_date?: string | null`,
      `due_time?: string | null`, `estimated_duration?: number | null` e `is_quick?: boolean`, com
      comentário curto dizendo que campo ausente = o comportamento de hoje (subtarefa nasce sem
      prazo) e que é o mesmo pacote que `TaskDueQuickEditValue` (`TaskDueQuickEdit.tsx:14`) carrega.
- [ ] `src/domain/tasks/taskDraft.ts:43` — `SubtaskMutationContext` ganha
      `updateTask: (data: TaskUpdateRequest) => Promise<void>` (assinatura real em
      `src/api/tasks/tasks.ts:280`; `TaskUpdateRequest` em `src/types/tasks.ts:231`).
- [ ] `src/domain/tasks/taskDraft.ts` — função nova `patchExistingSubtask(ctx, subtask, patch:
      Partial<TaskCreateRequest>)` ao lado de `addSubtaskToEditing:53`/`removeExistingSubtask:74`:
      `if (!subtask.id) return` (rascunho é tratado no call site), `await ctx.updateTask({ id:
      subtask.id, ...patch })`, `ctx.onSuccess()`, e `catch` com
      `getErrorMessage(error, "Não foi possível atualizar a subtarefa.")` em `ctx.onError`.
- [ ] `src/domain/tasks/__tests__/taskDraft.test.ts` — três casos para `patchExistingSubtask`:
      rascunho sem `id` não chama `updateTask` nem `onSuccess`; subtarefa com `id` chama
      `updateTask` com `{ id, ...patch }` e depois `onSuccess`; `updateTask` que rejeita cai em
      `onError` com a mensagem acima e **não** chama `onSuccess`.

### Linha da subtarefa: renomear clicando no título
- [ ] `src/pages/admin/tasks/TaskSubtasksField.tsx:37` — `SortableSubtaskRow` recebe
      `onRename?: (title: string) => void` e estado local `renaming: boolean`. Com `onRename`
      presente, o `<span className="min-w-0 flex-1 truncate">` de `:66` vira
      `<button type="button" className="min-w-0 flex-1 truncate text-left hover:underline">` com
      `aria-label={`Renomear ${title}`}`, que liga `renaming`. Sem `onRename`, continua `<span>`.
- [ ] Mesmo arquivo — em `renaming`, a linha renderiza `<Input>` controlado no lugar do título:
      `defaultValue`/`value` = título atual, `autoFocus`, `className="h-6 flex-1 text-xs"`,
      `aria-label="Nome da subtarefa"`. Enter comita (`e.preventDefault()` antes, como o input de
      adicionar faz em `:120`), Esc cancela, `onBlur` comita. `e.stopPropagation()` no `onKeyDown`
      para a tecla não vazar pro `Dialog` em volta (Esc fecharia o form inteiro).
- [ ] Mesmo arquivo — comitar: `const next = value.trim()`; se `!next` ou `next === title`, sai de
      `renaming` **sem** chamar `onRename` (vazio não apaga a linha — para isso existe o `X`);
      senão `onRename(next)` e sai de `renaming`.
- [ ] `src/pages/admin/tasks/TaskSubtasksField.tsx:82` — `TaskSubtasksField` ganha
      `onRename?: (subtask: SubtaskDraft, index: number, title: string) => void` e repassa por linha
      no `map` de `:126` (`onRename={onRename && ((title) => onRename(s, i, title))}`), mantendo a
      convenção de prop opcional que `onReorder` já usa.
- [ ] Conferir que o clique no título não dispara arraste nem fecha nada: os listeners do dnd-kit
      estão só no grip (`:57-64`), e o `<li>` não tem `onClick`. Se a leitura confirmar, registrar
      em `## Notas` que foi avaliado e nada precisou mudar.

### Linha da subtarefa: prazo e duração pelo ícone
- [ ] `src/pages/admin/tasks/TaskSubtasksField.tsx` — `SortableSubtaskRow` ganha
      `due?: { dueDate: string | null; dueTime: string | null; estimatedDuration: number | null;
      isQuick: boolean }` e `onDueChange?: (next: TaskDueQuickEditValue) => void`; com `onDueChange`
      presente, renderiza `<TaskDueQuickEdit>` (`TaskDueQuickEdit.tsx:30`) **entre** o título e o
      botão `X`, dentro de um wrapper `shrink-0 text-xs text-muted-foreground`.
- [ ] Mesmo arquivo — `TaskSubtasksField` ganha
      `onDueChange?: (subtask: SubtaskDraft, index: number, next: TaskDueQuickEditValue) => void` e
      `parentDueDate?: string | null`, repassando ambos por linha no `map` de `:126` (os valores de
      `due` vêm dos campos novos de `SubtaskDraft`).
- [ ] Mesmo arquivo — guard da 048 antes de repassar: em `handleDueChange(subtask, index, next)`,
      se `!isSubtaskDueDateValid(next.due_date, parentDueDate ?? null)` (`subtasks.ts:72`), **não**
      chamar `onDueChange` e marcar o índice como recusado em estado local
      (`const [rejected, setRejected] = useState<number | null>(null)`); caso válido, limpar
      `rejected` e chamar `onDueChange`.
- [ ] Mesmo arquivo — aviso na linha: `<p className="text-[11px] text-destructive">` abaixo da linha
      quando `rejected === i` **ou** quando o valor atual já viola a regra (aviso derivado), com a
      mensagem no texto de `TaskFormFields.tsx:161`:
      `O prazo não pode passar de ${formatDateBR(parentDueDate)}, prazo da tarefa principal.`
      (`formatDateBR` vem de `@/lib/currency`, como no form).
- [ ] Mesmo arquivo — limpar `rejected` quando a linha mudar de identidade (remoção/reordenação) para
      o aviso não migrar para a subtarefa vizinha: zerar em `onRemove` e no `handleDragEnd` de `:106`.

### Testes de componente da linha
- [ ] Criar `src/pages/admin/tasks/__tests__/TaskSubtasksField.test.tsx` (jsdom, `userEvent`) com os
      casos de renomear: clicar no título abre input; Enter chama `onRename` com o texto novo (e
      `trim`); Esc **não** chama e mantém o título antigo; texto vazio **não** chama; sair do campo
      (blur, `user.tab()`) chama; sem a prop `onRename` o título não é botão.
- [ ] Mesmo arquivo — casos de prazo: sem `onDueChange` não existe trigger "+ Prazo"; com
      `onDueChange`, clicar em "+ Prazo" abre o popover e escolher um dia chama `onDueChange` com
      `due_date` preenchido; a linha com `due_date` mostra a data formatada no trigger (e **não**
      mostra a duração — decisão P3, mesmo com `estimated_duration` preenchido).
- [ ] Mesmo arquivo — casos do limite da 048: com `parentDueDate` no passado em relação à data
      escolhida, `onDueChange` **não** é chamado e o aviso aparece na linha; uma linha que já chega
      com `due_date` além de `parentDueDate` mostra o aviso sem interação nenhuma; sem
      `parentDueDate` (mãe sem prazo) qualquer data é aceita.

### Form unificado e os três call sites
- [ ] `src/pages/admin/tasks/TaskFormFields.tsx:68-70` — `TaskFormFieldsProps` ganha
      `onRenameSubtask?: (subtask: SubtaskDraft, index: number, title: string) => void` e
      `onSubtaskDueChange?: (subtask: SubtaskDraft, index: number, next: TaskDueQuickEditValue) =>
      void`; adicionar ao destructuring de `:110-112`.
- [ ] `src/pages/admin/tasks/TaskFormFields.tsx:429` — o `<TaskSubtasksField>` do bloco 6 passa
      `onRename={onRenameSubtask}`, `onDueChange={onSubtaskDueChange}` e
      `parentDueDate={form.due_date}` (o prazo da tarefa **deste** form; não confundir com o
      `parentDueDate` local de `:120`, que é o prazo da mãe quando o próprio form edita uma
      subtarefa).
- [ ] `src/pages/admin/tasks/TaskList.tsx:187` — `subtaskDrafts` passa de `useState<string[]>` para
      `useState<SubtaskDraft[]>`; `:1438` deixa de mapear (`subtaskDrafts` já é a lista),
      `:1440` cria `{ title }`, `:1443` continua removendo por índice e o `onReorderSubtasks` de
      `:1448` grava `next` inteiro em vez de `next.map((s) => s.title)`.
- [ ] `src/pages/admin/tasks/TaskList.tsx:775` — o `createTask` encadeado do save passa os campos
      novos (`due_date`, `due_time`, `estimated_duration`, `is_quick`) junto de `title`/`sort_order`,
      preservando a exclusão mútua de `is_quick` × `estimated_duration` que o popover já garante.
- [ ] `src/pages/admin/tasks/TaskList.tsx:810` — `subtaskMutationCtx` ganha `updateTask`; funções
      novas `renameSubtask`/`changeSubtaskDue` que, em edição, chamam `patchExistingSubtask` e, em
      criação, atualizam `subtaskDrafts` no índice. Ligar as duas em `:1435` via
      `onRenameSubtask`/`onSubtaskDueChange`.
- [ ] `src/pages/admin/tasks/TaskList.tsx:749` — já existe o guard de prazo da subtarefa **aberta**
      no form; acrescentar, antes do loop de `:775`, o guard equivalente para os rascunhos: se algum
      `subtaskDrafts[i].due_date` violar `isSubtaskDueDateValid` contra `payload.due_date`, abortar o
      save com o mesmo toast de erro (cobre o caso de o prazo da mãe ter encurtado depois de a linha
      receber data).
- [ ] `src/pages/admin/tasks/ProjectDetail.tsx:180` — mesma troca de `newTaskSubtasks` para
      `SubtaskDraft[]` (`:1155` para de mapear, `:1157` cria `{ title }`, o reorder grava `next`).
- [ ] `src/pages/admin/tasks/ProjectDetail.tsx:588` — loop do save manda os campos novos; `:1152`
      liga `onRenameSubtask`/`onSubtaskDueChange` (edição → `patchExistingSubtask`, criação →
      índice); `subtaskMutationCtx` ganha `updateTask`; guard dos rascunhos antes do loop, como no
      `TaskList`.
- [ ] `src/pages/admin/tasks/AgendaGrid.tsx:1054` — o `map` de subtarefas passa a levar
      `due_date`/`due_time`/`estimated_duration`/`is_quick` de cada subtarefa, e `:1055` ganha os dois
      callbacks novos (só modo edição: a Agenda abre o form unificado apenas com `editingTask`, então
      o caminho de rascunho não existe aqui).
- [ ] Se os três wirings de `onRenameSubtask`/`onSubtaskDueChange` saírem idênticos byte a byte,
      extrair o par para `src/domain/tasks/taskDraft.ts` (foi o que a 042 fez com add/remove);
      se não saírem, registrar em `## Notas` por que não.

### Prova de ponta a ponta e suíte
- [ ] `src/pages/admin/tasks/__tests__/TaskList.form-panel.test.tsx` (helper `openForm` em `:152`,
      padrão de asserção de payload em `:172`) — caso de **criação**: abrir "Nova tarefa", adicionar
      uma subtarefa, renomeá-la pela linha, dar prazo pelo ícone e salvar; afirmar que o segundo
      `createTask` (o da subtarefa) chega com `parent_task_id` do pai, `title` **novo** e `due_date`
      escolhido.
- [ ] Mesmo arquivo — caso de **edição**: abrir uma tarefa com subtarefa já gravada, renomear pela
      linha e afirmar `updateTask` com `{ id: <id da subtarefa>, title: "<novo>" }`; escolher prazo e
      afirmar `updateTask` com `due_date` (duas chamadas distintas, nada esperando o botão "Salvar
      alterações").
- [ ] Mesmo arquivo — caso negativo: subtarefa recebendo prazo depois do prazo da mãe não gera
      `updateTask` nenhum e deixa o aviso visível na linha.
- [ ] Rodar e deixar verde:
      `npx vitest run src/domain/tasks/__tests__/taskDraft.test.ts src/pages/admin/tasks/__tests__/TaskSubtasksField.test.tsx src/pages/admin/tasks/__tests__/TaskFormFields.test.tsx src/pages/admin/tasks/__tests__/TaskList.form-panel.test.tsx src/pages/admin/tasks/__tests__/TaskList.subtask-edit.test.tsx src/pages/admin/tasks/__tests__/ProjectDetail.subtask-edit.test.tsx`
- [ ] Fechar com `npx tsc -b`, `npm run lint` (ignorar erro vindo de worktree irmão) e `npx vitest run`
      inteiro — `npm test` é flaky sob carga, então repetir uma falha isolada antes de tratá-la como
      regressão.

## Prompts

## Notas

## Como testar

1. **Pré-requisitos**
   - `npm install` feito e `.env` com as chaves do Supabase do projeto (não há Supabase local aqui).
   - `npm run dev` de pé e login feito com o usuário de sempre.
   - Ter em Tarefas uma tarefa de topo **com prazo** (ex.: prazo para daqui a 3 dias) e pelo menos
     uma subtarefa gravada nela. Sem migration nenhuma a rodar.

2. **Verificação automatizada**
   - `npx vitest run src/pages/admin/tasks/__tests__/TaskSubtasksField.test.tsx` — passou = a linha
     renomeia (Enter e blur comitam, Esc/vazio cancelam), o trigger de prazo existe só com o
     callback, e prazo além do da mãe é recusado com aviso.
   - `npx vitest run src/domain/tasks/__tests__/taskDraft.test.ts` — passou = `patchExistingSubtask`
     é no-op em rascunho sem `id`, grava com `{ id, ...patch }` e reporta erro por `onError`.
   - `npx vitest run src/pages/admin/tasks/__tests__/TaskList.form-panel.test.tsx` — passou = o
     `createTask` da subtarefa criada no form chega com o título renomeado e o prazo escolhido, e em
     edição cada mudança virou um `updateTask` próprio.
   - `npx tsc -b` — passou = nenhum call site ficou com o rascunho de subtarefa como `string`.

3. **Verificação manual, passo a passo**
   1. Vá em `/tasks` → "Nova tarefa". Preencha o título, escolha um prazo para a tarefa (ex.: daqui
      a 3 dias) e abra o bloco "Subtarefas". **Esperado:** o bloco abre com o campo "Adicionar
      subtarefa" como hoje, sem campo de prazo ao lado dele.
   2. Digite "comprar tinta" e clique em "Adicionar". **Esperado:** a linha aparece com grip, título,
      um "+ Prazo" e o `X`.
   3. Clique **no título** da linha. **Esperado:** o título vira um input já focado com o texto atual.
   4. Troque para "comprar tinta branca" e aperte Enter. **Esperado:** a linha volta a texto, agora
      com o nome novo; o resto do form não mudou e nada foi salvo ainda.
   5. Clique no título de novo, digite qualquer coisa e aperte **Esc**. **Esperado:** volta o nome
      anterior ("comprar tinta branca") e o dialog do form **não** fecha.
   6. Clique em "+ Prazo" na linha. **Esperado:** abre o popover com calendário, horário e o ícone de
      relógio com os presets de duração (15min, 30min, 1h, …).
   7. Escolha amanhã, ponha horário `09:00` e o preset `1h`; feche o popover. **Esperado:** o trigger
      da linha mostra a data (com a hora), **sem** mostrar "1h" — a duração fica só dentro do popover.
   8. Clique em "Criar tarefa" e abra a tarefa criada na Lista. **Esperado:** a subtarefa aparece
      chamada "comprar tinta branca", com prazo de amanhã 09:00; abrir a subtarefa mostra duração 1h.
   9. Agora **edite** uma tarefa que já tem subtarefa gravada, abra "Subtarefas", renomeie a linha e
      feche o dialog **sem** clicar em "Salvar alterações"; recarregue a página. **Esperado:** o nome
      novo persistiu (em edição a linha grava na hora, como adicionar/remover já fazia).
   10. Na mesma linha, dê um prazo pelo ícone e recarregue. **Esperado:** o prazo persistiu e a
       subtarefa aparece nessa data na Agenda (feature 048).

4. **Casos de borda e caminhos negativos**
   - **Prazo além do da mãe:** na tarefa com prazo em 3 dias, tente dar à subtarefa um prazo de 30
     dias. **Esperado:** a data **não** entra na linha e aparece "O prazo não pode passar de
     dd/mm/aaaa, prazo da tarefa principal."; recarregando, nada mudou no banco.
   - **Mãe sem prazo:** limpe o prazo da tarefa-mãe e dê qualquer data à subtarefa. **Esperado:**
     aceita sem aviso (nada a comparar).
   - **Prazo da mãe encurtado depois:** dê prazo de 3 dias à subtarefa, depois mude o prazo da mãe
     para amanhã. **Esperado:** a linha passa a exibir o aviso; tentar salvar a tarefa nova nesse
     estado mostra toast de erro em vez de gravar subtarefa inválida.
   - **Título vazio:** clique no título, apague tudo e aperte Enter. **Esperado:** volta o nome
     anterior; a subtarefa **não** é removida nem fica sem nome.
   - **Só espaços:** mesmo caso com "   ". **Esperado:** idem (o `trim` cai no caminho de cancelar).
   - **Subtarefa aberta como tarefa:** abra a subtarefa pelo checklist da Lista. **Esperado:** ela
     continua sem a seção "Subtarefas" (sub-subtarefa não existe) e o limite de prazo continua
     acusado no campo de prazo, como antes.
   - **Arrastar depois de renomear:** renomeie uma linha e arraste-a para outra posição. **Esperado:**
     a ordem muda, o nome novo acompanha a linha e nenhum aviso de prazo "pula" para a linha vizinha.

5. **Sinais de que quebrou**
   - Clicar no título abre o input mas Enter não faz nada, ou o nome volta ao antigo ao reabrir o
     form: o comit não chegou em `patchExistingSubtask`/`setSubtaskDrafts`.
   - Apertar Esc fecha o dialog inteiro do form: falta o `stopPropagation` no `onKeyDown` da linha.
   - Subtarefa criada pelo form nasce sem prazo mesmo com data escolhida: o `createTask` encadeado
     (`TaskList.tsx:775`, `ProjectDetail.tsx:588`) ainda está mandando só `title`/`sort_order`.
   - Data inválida entra na linha e some ao recarregar, sem aviso: o guard de `isSubtaskDueDateValid`
     não está no caminho do `onDueChange`.
   - Aviso de prazo aparece numa linha que não é a editada (ou sobra depois de remover uma linha): o
     estado `rejected` não foi limpo na remoção/reordenação.
   - Erro de TypeScript do tipo `string is not assignable to SubtaskDraft` em `TaskList.tsx`/
     `ProjectDetail.tsx`: um dos call sites ficou com o rascunho antigo.
