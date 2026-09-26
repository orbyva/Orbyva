---
prompt: |
  - permitir uma visualização única de agenda. em que lá eu veja todas as tarefas, recorrências, e possa criar eventos também relacionados, seja a projetos , seja a tarefas. fica dentro de Produtividade->Agenda
---

## Conflito

**Situação.** Terceira da leva de evento↔tarefa (depois de `02` e `03`): faz o evento vinculado
aparecer **fora** da Agenda — no card e na tela do projeto, e no dialog do evento com um "Ir para a
tarefa" que abre o form dela.

**Por que não entrou no merge.** Mesma razão das outras duas: depende de `project_event.task_id`, que
não existe no modelo da `master`. Além disso, este arquivo estava em `done/` sob o número **068**, que
na `master` já pertence a `068-notas-editor-de-escrita-sofisticado.md` — dois arquivos com o mesmo
`NNN` quebram a sequência única que a esteira exige.

O código está no commit `939e869`.

### P1 — Entra na mesma leva da `02`/`03`, ou fica para depois?
**Resposta:**

# 068 — Um form de evento só: projeto reusa o dialog e o evento de tarefa aparece fora da Agenda

## Contexto
Com a 066 (schema/API) e a 067 (criar/editar evento na Agenda), passam a existir duas maneiras
diferentes de mexer em evento: o `EventFormDialog` completo da Agenda (título, início, fim, vínculo,
edição) e o mini-form inline dentro de `ProjectFormDialog.tsx` (só título + `datetime-local`, sem
fim, sem edição, `ends_at: null` fixo em `Projects.tsx:393` e `ProjectDetail.tsx:360`). Duas UIs para
a mesma entidade é o mesmo problema que as features 042/065 resolveram para tarefa e projeto —
consertar aqui é barato porque o componente compartilhado já nasceu preparado (`lockedLink`).

Há também um buraco de visibilidade criado pela 067: evento vinculado a uma **tarefa** aparece na
Agenda, mas some de toda tela de projeto — `Projects.tsx` agrupa por `project_id` (`eventsByProject`)
e `ProjectDetail.tsx` filtra por `e.project_id === id`, e um evento de tarefa tem `project_id` nulo
por decisão da 066 (projeto derivado). O usuário que marcou "reunião sobre a tarefa X" não vê nada no
projeto ao qual a tarefa pertence, e "próximo evento" no card do projeto passa a mentir por omissão.

Depende da 067. Fora de escopo: um botão "Agendar evento" dentro do form de tarefa
(`TaskFormFields.tsx`) — exigiria plumbing de eventos nas três telas que usam o form
(`TaskList`/`ProjectDetail`/`AgendaGrid`) e o pedido do prompt já está atendido pela Agenda; fica
registrado aqui como candidato futuro.

## Decisões
- **`ProjectFormDialog.tsx` passa a usar `EventFormDialog`** com `lockedLink={{ kind: "project", id:
  editing.id }}`: a lista de eventos do projeto ganha um botão de editar (lápis, `ICON_EDIT_BUTTON_CLASS`)
  além do excluir que já tem, e o "+" abre o dialog em modo criação. Some o estado local
  `eventTitle`/`eventStartsAt` e o par de `Input`s inline.
- **A prop `onAddEvent({ title, startsAt })` vira `onSaveEvent(draft)`** carregando o rascunho
  completo (título, `starts_at`, `ends_at`, e o `id` quando é edição), e entra `onUpdateEvent` ou um
  único handler que decide por presença de `id` — decisão: **um handler só**, `onSaveEvent`, para não
  multiplicar props. `Projects.tsx` e `ProjectDetail.tsx` implementam chamando
  `createProjectEvent`/`updateProjectEvent` conforme o caso, com o mesmo toast de erro de hoje.
- **Evento de tarefa passa a contar como evento do projeto da tarefa** nas telas de projeto, via
  `resolveEventProjectId` (066) em vez de comparar `project_id` cru: `eventsByProject` em
  `Projects.tsx` e o filtro do `load()` em `ProjectDetail.tsx`. É a mesma regra que a 067 aplicou ao
  filtro da Agenda — uma função só, três chamadores.
- **Evento herdado é somente leitura na tela do projeto**: na lista do `ProjectFormDialog`, evento
  cujo vínculo real é uma tarefa aparece com o título da tarefa como legenda e sem lápis/lixeira —
  editar ali daria a impressão de que ele pertence ao projeto, e mudar o projeto do evento é
  justamente o que a 066 decidiu não permitir. Quem edita é a Agenda.
- **"Ir para a tarefa" no dialog de evento da Agenda**: quando o evento tem `task_id`, o
  `EventFormDialog` mostra o título da tarefa e um botão que fecha o dialog de evento e abre o form
  da tarefa na própria Agenda (`openTaskFromChip`, que já existe) — navegar para outra tela quebraria
  o contexto do calendário. Se a tarefa não estiver na lista carregada (ex.: filtro), cai para um
  `Link` para `/tasks` em vez de um botão morto.
- **Tarefa apagada não deixa evento órfão** (cascade da 066): não há estado "evento apontando para
  tarefa inexistente" para tratar na UI além do fallback acima, que cobre o caso transitório de lista
  desatualizada.

## Tarefas
- [x] Trocar as props de evento de `ProjectFormDialog.tsx`: `onAddEvent` sai, entram
  `onSaveEvent(draft: { id?: string; title: string; starts_at: string; ends_at: string | null })` e
  `tasks: Task[]` (para o `EventFormDialog` resolver o título da tarefa vinculada); `onDeleteEvent`
  continua
- [x] Substituir o mini-form inline de `ProjectFormDialog.tsx` (linhas ~183-206) pelo
  `EventFormDialog` com `lockedLink` no projeto em edição: botão "+" abre em modo criação, lápis em
  cada evento abre em modo edição, remover o estado `eventTitle`/`eventStartsAt`
- [x] Em `ProjectFormDialog.tsx`, marcar na lista os eventos herdados (vínculo por tarefa): legenda
  "via <título da tarefa>" e sem os botões de editar/excluir
- [x] Em `Projects.tsx`: `eventsByProject` e `nextEventFor` passam a usar `resolveEventProjectId`
  (com o mapa `taskById` montado a partir das tarefas já carregadas); `handleAddEvent` vira
  `handleSaveEvent` chamando `createProjectEvent` ou `updateProjectEvent` conforme houver `id`,
  preservando o `ends_at` do rascunho em vez do `null` fixo
- [x] Em `ProjectDetail.tsx`: o filtro `eventList.filter((e) => e.project_id === id)` passa a usar
  `resolveEventProjectId`; `handleAddProjectEvent` vira `handleSaveProjectEvent` (create/update,
  `ends_at` do rascunho), mantendo os toasts existentes
- [x] Em `EventFormDialog.tsx`: quando `editing?.task_id` existir, mostrar o título da tarefa e o
  botão "Ir para a tarefa" disparando a prop nova `onOpenTask?(taskId)`; sem a prop ou sem a tarefa
  carregada, renderizar um `Link` para `/tasks`
- [x] Em `AgendaGrid.tsx`: passar `onOpenTask` para o `EventFormDialog`, fechando o dialog de evento
  e chamando `openTaskFromChip` com a tarefa correspondente
- [x] Atualizar `src/pages/admin/tasks/__tests__/ProjectFormDialog.test.tsx`: adicionar evento agora
  chama `onSaveEvent` sem `id` (com `ends_at` quando preenchido); editar um evento existente chama
  `onSaveEvent` com o `id`; evento herdado de tarefa aparece com a legenda e sem os botões de
  editar/excluir; excluir continua chamando `onDeleteEvent`
- [x] Atualizar `src/pages/admin/tasks/__tests__/ProjectDetail.edit-project.test.tsx` para o novo
  fluxo (o caso "adicionar um evento chama createProjectEvent com o project_id correto" passa pelo
  `EventFormDialog`) e acrescentar um caso: evento vinculado a uma tarefa do projeto aparece na lista
  de eventos da tela de projeto
- [x] Acrescentar em `src/pages/admin/tasks/__tests__/AgendaGrid.events.test.tsx` (criado na 067) o
  caso "Ir para a tarefa": abrir um evento com `task_id`, clicar no botão, e o form da tarefa abrir
  com o título dela
- [x] `npm run build`, `npm run lint` e `npm test` — sem erros novos e sem regressão nas suítes de
  `Projects`, `ProjectDetail`, `ProjectFormDialog` e Agenda
- [x] Reler o `prompt:` do frontmatter e confirmar o pedido completo: agenda única em
  Produtividade → Agenda mostrando tarefas e recorrências (já entregue pelas 023/034/043/048) e
  criação de eventos ligados a projeto **e** a tarefa (066+067+068); registrar em Notas o que ficou
  fora e por quê

## Prompts

## Notas
- As duas primeiras tarefas saíram no mesmo commit e já levaram junto a parte de `Projects.tsx`/
  `ProjectDetail.tsx` que só renomeia o handler (`handleSaveEvent`/`handleSaveProjectEvent`, com
  create/update e o `ends_at` do rascunho): trocar a prop `onAddEvent` por `onSaveEvent` quebra o
  `tsc` nos dois call sites, então não havia como verificar a primeira tarefa isolada. O que ficou
  para as tarefas 4 e 5 é o que elas têm de próprio — `resolveEventProjectId` no agrupamento/filtro.
- `src/pages/admin/tasks/__tests__/Projects.task-events.test.tsx` não estava no plano (que só previa
  testes de `ProjectFormDialog`, `ProjectDetail` e Agenda), mas a verificação é só por código: sem
  ele, a mudança de `eventsByProject` ficaria provada apenas por "compila". Ele prova os dois lados
  — o card mostra o evento da tarefa do projeto, e não mostra avulso nem evento de tarefa de outro
  projeto — e falha de verdade com o `e.project_id` cru no lugar de `resolveEventProjectId`
  (conferido trocando a linha e rodando: 2 dos 3 casos ficam vermelhos).
- As tarefas de teste (8 a 10) foram escritas junto de cada tarefa de código, não no fim: sem
  navegador, o teste é a única prova de que a mudança funciona, então cada commit já saiu com a
  assertiva que o cobre. Elas só foram marcadas quando **todos** os casos listados nelas existiam.
- `EventFormDialog.test.tsx` passou a renderizar o dialog dentro de um `MemoryRouter`: o fallback
  "Ir para a tarefa" é um `Link`, e `react-router` exige contexto. Os quatro casos novos cobrem o
  botão com `onOpenTask`, o link sem a prop, o link com a tarefa fora da lista carregada e o evento
  sem tarefa (nada disso aparece).
- Os dois handlers de `onSaveEvent` re-lançam o erro depois do toast, como o `handleSaveEvent` da
  Agenda (feature 067): é a rejeição de `onSave` que mantém o `EventFormDialog` aberto com o que foi
  digitado; engolir a exceção fecharia o dialog como se tivesse salvado.
- Verificação final desta feature: `npm run build` (exit 0), `npm run lint` (exit 0 — 18 warnings
  `react-refresh/only-export-components`, o mesmo número de antes da 068) e a suíte inteira com
  `npx vitest run --testTimeout=30000 --hookTimeout=30000 --maxWorkers=4` — **161 arquivos / 1427
  testes passando, exit 0** (`npm test` puro segue instável nesta máquina, com timeouts aleatórios
  em arquivos sem relação, como já registrado na 066 e na 067).

### Checagem de satisfação do `prompt:` (trinca 066+067+068)
Item por item do prompt, com o artefato que prova cada um — nenhum "pelo código parece certo":
1. *"visualização única de agenda ... fica dentro de Produtividade→Agenda"* — já existia (023/034/
   043/048): `src/routes.tsx:152` (`/tasks/agenda`) e a aba Agenda dentro de Tarefas
   (`TaskList.tsx` importando `AgendaGrid`). Prova: `AgendaGrid.test.tsx` (visões Mês/Semana/Dia)
   verde na suíte final.
2. *"eu veja todas as tarefas"* — `AgendaGrid.test.tsx` (chip de tarefa abre o form completo;
   subtarefa com prazo próprio aparece no dia certo) e `AgendaHourGrid.test.tsx`.
3. *"e recorrências"* — `src/domain/tasks/__tests__/recurrence.test.ts`
   (`computeVirtualOccurrences`, usada pela `AgendaGrid`) e `AgendaGrid.consultation.test.tsx`
   (ocorrências na grade).
4. *"possa criar eventos ... relacionados a projetos"* — `EventFormDialog.test.tsx` ("escolher
   Projeto manda project_id e deixa task_id nulo"), `AgendaGrid.events.test.tsx` ("salvar chama
   createProjectEvent ... e recarrega a agenda") e `ProjectDetail.edit-project.test.tsx`
   ("adicionar um evento passa pelo EventFormDialog e chama createProjectEvent com o project_id
   correto").
5. *"...seja a tarefas"* — `AgendaGrid.events.test.tsx` ("vincular a uma tarefa manda task_id
   preenchido e project_id null" e "'Ir para a tarefa' ... fecha o evento e abre o form da tarefa"),
   `Projects.task-events.test.tsx` (o card do projeto enxerga o evento da tarefa) e
   `ProjectDetail.edit-project.test.tsx` ("evento vinculado a uma tarefa do projeto aparece na lista
   de eventos da tela").

Ficou de fora, de propósito: o botão "Agendar evento" dentro do form de tarefa
(`TaskFormFields.tsx`) — registrado no Contexto como candidato futuro, porque exigiria plumbing de
eventos nas três telas que usam o form e o pedido já está atendido pela Agenda; e evento recorrente
(fora de escopo desde a 067).

Dependências que **não** são desta feature e continuam com o usuário: aplicar
`supabase/migrations/20260817120000_event_task_link.sql` no banco remoto (`supabase db push`,
tarefa aberta na 066) e o teste manual ponta a ponta no navegador (tarefa aberta na 067). Até o
`db push`, o código está correto e testado mas o banco ainda recusa `task_id`.
