---
prompt: |
  - adicionar duração também na tela de edição de tarefa
  - o forms de edição de tarefas, ao clicar pela agenda nõa é o mesmo. unifique esses componentes
    para não gerar esse tipo de fluxo incoerente
---

# 043 — Agenda usa o form unificado de edição de tarefa

## Contexto
A Agenda (`src/pages/admin/tasks/AgendaGrid.tsx`, usada na aba "Agenda" de `TaskList.tsx` e na
rota standalone `/tasks/agenda`) tem hoje seu próprio dialog de editar tarefa —
`CalendarTaskDialog` (`AgendaGrid.tsx:514-624`) — completamente à parte do form principal
(feature `042`). Ele só edita título, descrição, prazo+horário e prioridade; a própria UI admite a
limitação com um texto fixo apontando pra Lista: "Recorrência, tags, subtarefas e projeto: edite
em Tarefas" (`AgendaGrid.tsx:614-620`). Faltam especificamente: Projeto, Ícone (feature `035`),
Marco (`037`), Recorrência/Duração estimada/Início (`029`/`031`/`032`), Tags, Link externo,
Subtarefas (`036`) e Registros de tempo — exatamente os campos que a `042` unifica num só
`TaskFormFields.tsx` reaproveitado por Lista e Detalhe de Projeto.

O motivo real da divergência não é só UI: a Agenda hoje busca só `tasks`/`projects`/`events`
(`fetchTasks`/`fetchProjects`/`fetchProjectEvents`, independentes do estado de `TaskList`/
`ProjectDetail`) — não carrega `tags`, recorrências financeiras vinculáveis (`recurrings`) nem
`dimensions`, os dados que `TaskFormFields` precisa pras abas "Data e repetição"/"Organização".
Depende de `042` estar pronta (o componente/lógica compartilhada existir) antes de fazer sentido
plugar a Agenda nele — daí a feature separada.

## Decisões
- Depende de `042` (`TaskFormFields.tsx` + `src/domain/tasks/taskDraft.ts`) já estar em `done/`.
  Se `042` ainda não tiver sido implementada quando esta feature for pega, é bloqueante — reportar
  como decisão pendente em vez de tentar duplicar a extração aqui.
- `AgendaGrid.tsx` passa a buscar `tags` (`fetchTags`), `recurrings` (recorrências financeiras
  vinculáveis) e `dimensions` (via `useDimensions`, mesmo hook usado em `TaskList.tsx`/
  `ProjectDetail.tsx`) ao montar — mais 2-3 requests que hoje não existem ali. Seguir o mesmo
  padrão de carregamento em paralelo (`Promise.all` ou equivalente) já usado pro `load()` inicial
  da Agenda, pra não adicionar waterfalls novos.
- `CalendarTaskDialog` é substituído por `TaskFormFields` dentro do `Dialog` da Agenda — mesma
  estrutura de abas que Lista/Detalhe de Projeto já têm. A Agenda tem a lista completa de
  `projects` carregada (já busca isso hoje) — o campo Projeto aparece normalmente (mesmo caso de
  `TaskList.tsx`, não o de `ProjectDetail.tsx`).
- `TaskSubtasksField` depende de um mapa de subtarefas por tarefa-mãe — a Agenda já busca `tasks`
  completo (`fetchTasks`), então dá pra construir esse mapa localmente, mesmo padrão de
  `TaskList.tsx`/`ProjectDetail.tsx`.
- Remover o aviso fixo "Recorrência, tags, subtarefas e projeto: edite em Tarefas" — deixa de ser
  verdade depois desta feature.
- Salvar continua via `updateTask`/`createTask` com payload parcial (`saveTaskEdit`,
  `AgendaGrid.tsx:284-306`, já usa PATCH parcial hoje — só passa a incluir os campos novos que o
  form completo edita, sem regressão nos que já funcionavam).
- Fora de escopo: mudar o que acontece ao criar uma tarefa nova diretamente pela Agenda, se esse
  fluxo não existir hoje (confirmar na implementação se `CalendarTaskDialog` só edita tarefas
  existentes ou também cria — ajustar a Decisão se for o caso).

## Tarefas
- [x] Confirmar que `docs/features/done/042-unificar-form-edicao-tarefa-lista-projeto.md` está em
      `done/` antes de começar; se não estiver, parar e reportar como bloqueio (não implementar
      `042` de novo aqui).
- [x] Em `AgendaGrid.tsx`, adicionar o carregamento de `tags`/`recurrings`/`dimensions` ao efeito
      de montagem existente (paralelo aos fetches já feitos), guardando em estado próprio.
- [x] Construir localmente o mapa de subtarefas por tarefa-mãe a partir do `tasks` já buscado pela
      Agenda (mesmo padrão usado em `TaskList.tsx`/`ProjectDetail.tsx`), para alimentar
      `TaskSubtasksField`.
- [x] Substituir `CalendarTaskDialog` (`AgendaGrid.tsx:514-624`) por `Dialog` + `TaskFormFields`,
      usando `emptyTask`/`addSubtaskToEditing`/`removeExistingSubtask` de
      `src/domain/tasks/taskDraft.ts` (feature `042`), com o campo Projeto habilitado (Agenda tem
      `projects` completo).
- [x] Atualizar `saveTaskEdit`/handler de salvar da Agenda para montar o payload completo (todos
      os campos do form unificado), preservando o PATCH parcial existente.
- [x] Remover o texto fixo "Recorrência, tags, subtarefas e projeto: edite em Tarefas" e qualquer
      lógica associada que só existia por causa da limitação antiga.
- [x] Atualizar/estender `AgendaGrid.test.tsx` (e criar testes novos se necessário) cobrindo: abrir
      uma tarefa pela Agenda mostra as 4 abas completas (não só os 4 campos antigos), o campo
      Projeto aparece, salvar persiste um campo de cada aba nova (ex. ícone, marco, duração, tag),
      e criar/editar subtarefa a partir da Agenda funciona com a mesma validação de prazo já usada
      em Lista/Detalhe de Projeto.
- [x] `npx tsc -p tsconfig.app.json --noEmit && npm run build && npm run lint && npm test`.

## Prompts

## Notas
- A validação `isSubtaskDueDateValid` (bloquear salvar se `form.parent_task_id` estiver setado e o
  prazo passar do prazo da tarefa-mãe) foi reaproveitada em `handleSaveTaskEdit` exatamente como em
  `TaskList.tsx`/`ProjectDetail.tsx` — mas hoje é código morto na prática dentro da Agenda: a grade
  (`filteredTasks`) já excluía subtarefas antes desta feature (`!t.parent_task_id`), então nenhuma
  subtarefa aparece como chip pra ser aberta diretamente com `form.parent_task_id` setado. Mantido
  mesmo assim por consistência com as outras duas telas e porque não é regressão (comportamento de
  filtro da Agenda não mudou nesta feature) — se um dia a Agenda passar a permitir abrir subtarefas
  diretamente, a validação já está pronta. Testado o que É alcançável pela Agenda hoje: criar e
  remover subtarefa a partir do form da tarefa-mãe (`AgendaGrid.test.tsx`).
- `CalendarTaskDialog` (componente à parte, ~110 linhas) foi removido inteiro — a Agenda agora
  monta o `Dialog`/`TaskFormFields` inline no corpo de `AgendaGrid`, mesmo padrão de
  `TaskList.tsx`/`ProjectDetail.tsx`.
- `npm test` roda com 2 falhas pré-existentes e não relacionadas em `src/lib/__tests__/currency.test.ts`
  (mesmo bug já documentado nas Notas da feature `042`, não tocado por esta feature).
