---
prompt: |
  - Adicionar botão de editar em tasks/projects para editar o projeto (create agent)
---

# 065 — Editar projeto na página de detalhe

## Contexto
`src/pages/admin/tasks/Projects.tsx` (lista `/tasks/projects`) já tem edição completa de
projeto — botão de lápis em cada card abre um dialog com Nome, Descrição, Status, Cor, Labels,
Notas e gestão de Eventos (`openEdit`/dialog em `Projects.tsx:380-394` e `569-690`). O pedido
literal ("botão de editar em tasks/projects") já está feito ali.

A lacuna real está em `src/pages/admin/tasks/ProjectDetail.tsx` (`/tasks/projects/:id`, aberta ao
clicar num projeto): essa página só edita as *tarefas* dentro do projeto (`openEdit(task)` em
`ProjectDetail.tsx:276`+ dialog de tarefa) — não existe nenhum jeito de editar o projeto em si
(nome/cor/status/notas/labels) nem de gerenciar seus eventos a partir dela. Hoje, pra editar o
projeto que você está vendo, precisa voltar pra lista. `ProjectDetail.tsx` nem busca
`ProjectEvent[]` (sem `fetchProjectEvents` no `load()`).

Em vez de duplicar ~150 linhas de dialog (campos + gestão de eventos + estado de rascunho de
evento) entre as duas telas, esta feature extrai esse dialog pra um componente compartilhado
(mesmo padrão da feature 042, que unificou o form de tarefa entre `TaskList.tsx` e
`ProjectDetail.tsx` em `taskDraft.ts`/`TaskFormFields.tsx`) e o reusa nas duas.

Fora de escopo: campo de meta (`goal_id`) no formulário — não existe `GoalPicker` ainda, seria
componente novo do zero; ficou de fora por decisão do usuário ao revisar este plano. Excluir
projeto a partir da página de detalhe também fica fora — o pedido é só editar, e
`ConfirmDeleteDialog` de projeto já existe na lista.

## Decisões
- **Extrair `src/pages/admin/tasks/ProjectFormDialog.tsx`** a partir do dialog inline de
  `Projects.tsx` (linhas 569-690) — mesmos campos (Nome, Descrição, Status, Cor via
  `LabelColorPicker`, Labels via `TagCombobox`, Notas, Eventos quando `editing` não é `null`).
  Estado de rascunho de evento (`eventTitle`/`eventStartsAt`), hoje levantado em `Projects.tsx`
  sem necessidade (só o próprio dialog usa), passa a viver dentro do componente novo.
- **Props do componente**: `open`, `onOpenChange`, `editing: Project | null` (null = modo criação,
  preserva o fluxo de `Projects.tsx`), `form`, `setForm`, `tags`, `onCreateTag`, `events:
  ProjectEvent[]` (já filtrados/ordenados pelo projeto em edição — vazio em modo criação),
  `onSave`, `onAddEvent`, `onDeleteEvent`. Sem estado de saving elevado ao caller — o componente
  gerencia seu próprio `saving` internamente (mesmo padrão de `MedicationQuickCreateDialog.tsx`,
  feature 049).
- **`Projects.tsx` passa a consumir o componente extraído** no lugar do dialog inline — sem
  mudança de comportamento visível, só remoção de duplicação.
- **`ProjectDetail.tsx` ganha busca de eventos do projeto** (`fetchProjectEvents`, filtrado por
  `project_id === id`) no `load()` existente, e um botão "Editar projeto" (ícone `Pen`) nas
  `actions` do `PageShell`, ao lado de "Registros de tempo"/"Nova tarefa" — abre o
  `ProjectFormDialog` já em modo edição (`editing = project`), com `onSave` chamando
  `updateProject` e recarregando (`load()` + fechar dialog), mesmo padrão de toast de
  erro/sucesso das outras mutações da tela.
- **Botão "Editar projeto" só aparece depois do projeto carregado** — já é o comportamento natural
  do gate `loading ? <TableLoadingSkeleton /> : (...)` que envolve o conteúdo da página; o botão
  fica nas `actions` do `PageShell`, fora desse gate, então é condicionado a `project != null`
  diretamente (evita abrir o dialog com `editing: null` sem querer enquanto ainda carrega).
- **Estado de salvando**: botão "Salvar alterações"/"Criar projeto" desabilitado + texto de
  carregamento enquanto a chamada está em voo, erro mostra toast e mantém o dialog aberto (mesmo
  padrão já adotado em `MedicationQuickCreateDialog.tsx`) — comportamento novo tanto pra
  `Projects.tsx` quanto `ProjectDetail.tsx`, já que hoje `Projects.tsx` não tinha esse estado.

## Tarefas
- [x] Criar `src/pages/admin/tasks/ProjectFormDialog.tsx`: mover o `Dialog`/campos/gestão de
  eventos de `Projects.tsx:569-690` pra cá, com as props listadas em Decisões; internalizar
  `eventTitle`/`eventStartsAt` e um estado `saving` (desabilita + texto de carregamento no botão
  de salvar enquanto `onSave` está em voo; erro de `onSave` não deve fechar o dialog — deixe o
  `catch`/toast por conta de quem chama via `onSave`, só resete `saving` no `finally`)
- [x] Atualizar `Projects.tsx`: remover o dialog inline e o estado `eventTitle`/`eventStartsAt`,
  renderizar `<ProjectFormDialog>` com os handlers existentes (`handleSave`, `handleAddEvent`,
  `handleDeleteEvent`) — comportamento idêntico ao atual, sem regressão
- [x] Teste de componente `src/pages/admin/tasks/__tests__/ProjectFormDialog.test.tsx`: botão
  desabilitado sem nome; preencher nome + salvar chama `onSave`; modo edição pré-preenche os
  campos a partir de `editing`; seção Eventos só aparece com `editing` não-nulo; adicionar evento
  chama `onAddEvent` com título/data; excluir evento chama `onDeleteEvent`; erro em `onSave`
  mantém o dialog aberto (via `open` continuando `true`) e reabilita o botão
  (`disabled=false`) depois do `finally`
- [x] `ProjectDetail.tsx`: importar `fetchProjectEvents`, `createProjectEvent`,
  `deleteProjectEvent`, `updateProject` de `@/api/tasks`; adicionar estado `projectEvents:
  ProjectEvent[]`; incluir `fetchProjectEvents()` em `Promise.all` do `load()`, filtrar por
  `project_id === id` e salvar em `projectEvents`
- [x] `ProjectDetail.tsx`: adicionar estado `editingProject: boolean` (ou reaproveitar um dialog
  próprio) + `projectForm` (`ProjectCreateRequest`, populado a partir de `project` ao abrir);
  botão "Editar projeto" (`Pen` do lucide-react) nas `actions` do `PageShell`
  (`ProjectDetail.tsx:568-578`), habilitado só quando `project` já carregou; abre o
  `ProjectFormDialog` com `editing={project}`, `events={projectEvents}`
- [x] `ProjectDetail.tsx`: implementar `handleSaveProject` (chama `updateProject({id: project.id,
  ...projectForm})`, toast de sucesso, fecha o dialog, `load()`), `handleAddProjectEvent`
  (`createProjectEvent`, `load()`) e `handleDeleteProjectEvent` (`deleteProjectEvent`, `load()`) —
  mesmo padrão de toast de erro (`getErrorMessage`) das mutações já existentes na tela
- [x] Teste de componente em `src/pages/admin/tasks/__tests__/ProjectDetail.edit-project.test.tsx`:
  clicar em "Editar projeto" abre o dialog pré-preenchido com nome/descrição/status/cor/labels do
  projeto atual; salvar chama `updateProject` com o `id` correto e os campos alterados, e recarrega
  a lista (novo `fetchProjectById`); adicionar um evento chama `createProjectEvent` com
  `project_id` correto; excluir um evento existente chama `deleteProjectEvent`; erro ao salvar
  mostra toast e mantém o dialog aberto
- [x] `npm run build && npm run lint && npm run test` — sem erros novos; testes novos
  (`ProjectFormDialog.test.tsx`, `ProjectDetail.edit-project.test.tsx`) e existentes passando

## Prompts

## Notas
- `Projects.tsx` já duplicava `STATUS_LABELS` e `formatEventDate` (usados tanto no dialog quanto
  no card/kanban de projeto) — em vez de duplicar de novo dentro de `ProjectFormDialog.tsx`,
  ambos passaram a ser exportados de lá e importados em `Projects.tsx` (única fonte de verdade).
- Campos do dialog (`Nome`, `Descrição`, `Status`, `Notas`) ganharam `id`/`htmlFor` explícitos
  (não pedido nas tarefas) — sem isso, `FormLabel` e `Input` não ficam associados via label pra
  testes com `getByLabelText`/leitores de tela; mesmo padrão já usado em
  `MedicationQuickCreateDialog.tsx` (feature 049).
- `load()` de `ProjectDetail.tsx` ganhou uma chamada nova (`fetchProjectEvents`) — os dois testes
  de componente já existentes dessa tela (`ProjectDetail.subtask-edit.test.tsx`,
  `ProjectDetail.medication-occurrences.test.tsx`) mockavam `@/api/tasks` sem essa função, o que
  quebrava `load()` com `TypeError` assim que rodavam. Corrigido adicionando o mock nos dois
  arquivos (e os mocks de `updateProject`/`createProjectEvent`/`deleteProjectEvent`, usados só por
  eles indiretamente via o módulo) — nenhuma mudança de comportamento nesses testes, só
  acompanhando a nova dependência.
- `npm run test` completo tem as mesmas 2 falhas pré-existentes e não relacionadas de
  `src/lib/__tests__/currency.test.ts` já registradas em `docs/features/done/049-atalho-controle-medicacoes.md`
  (`formatDateBR`/`formatDateTimeBR` retornam `"·"` no código-fonte, teste espera `"—"`) — segue
  fora do escopo desta feature.
