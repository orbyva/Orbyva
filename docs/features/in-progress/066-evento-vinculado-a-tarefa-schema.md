---
prompt: |
  - permitir uma visualização única de agenda. em que lá eu veja todas as tarefas, recorrências, e possa criar eventos também relacionados, seja a projetos , seja a tarefas. fica dentro de Produtividade->Agenda
---

# 066 — Evento de agenda vinculado a tarefa (ou avulso): schema, contratos e API

## Contexto
A visualização única de agenda pedida no prompt **já existe**: `/tasks/agenda` (grupo Produtividade,
`src/routes.tsx:152` → `src/pages/admin/tasks/AgendaCalendar.tsx` → `AgendaGrid.tsx` +
`AgendaHourGrid.tsx`, entregue pelas features 023, 034, 043 e 048). Ela carrega num calendário só
tarefas, subtarefas com prazo próprio, ocorrências virtuais de recorrência (`computeVirtualOccurrences`),
parcelas de recorrência financeira (tarefas com `linked_recurring_id`), projetos, tags e eventos de
projeto. O que falta do pedido é a outra metade: **criar eventos ali, relacionados a projetos ou a
tarefas**.

Hoje `public.project_event` (`supabase/migrations/20260806130000_project_notes_status_events.sql`)
tem `project_id uuid not null` e nenhuma coluna de tarefa — ou seja, evento **só** existe preso a um
projeto. Não há como registrar "reunião sobre a tarefa X" nem um compromisso avulso ("dentista"), que
é justamente o tipo de item que faz a agenda valer como calendário único. Também não existe
`updateProjectEvent` na API (`src/api/tasks/projectEvents.ts` só tem fetch/create/delete), então
nenhuma tela consegue editar um evento — só criar e apagar.

Esta feature é a camada de baixo, sem mudança visível ao usuário: migration + tipos + API + regras
puras de domínio, com os consumidores existentes ajustados para o `project_id` que passa a ser
opcional. As features 067 (criar/editar evento pela Agenda) e 068 (dialog de evento compartilhado)
dependem dela.

## Decisões
- **A tabela continua se chamando `project_event`, e o tipo TS continua `ProjectEvent`.** Renomear
  para `event`/`AgendaEvent` seria mais honesto agora que o evento pode não ter projeto, mas custaria
  um `alter table ... rename` (com policies, índices, `wipe_own_data` e ~15 arquivos de código/teste
  atrás) sem entregar nada ao usuário. Fica um comentário no schema e no tipo explicando que o nome é
  histórico.
- **`project_id` vira nullable e entra `task_id uuid references public.task(id) on delete cascade`**,
  com check constraint `project_event_single_link` garantindo que **no máximo um** dos dois esteja
  preenchido (`project_id is null or task_id is null`). Os três estados válidos são: evento de
  projeto (como hoje), evento de tarefa, evento avulso (nenhum dos dois).
- **Vínculo mutuamente exclusivo, projeto derivado**: um evento de tarefa não repete o `project_id` da
  tarefa — o projeto é resolvido em memória (`resolveEventProjectId`, no domínio) a partir da tarefa.
  Evita o estado inconsistente clássico (mover a tarefa de projeto e o evento apontar para o projeto
  antigo).
- **`on delete cascade` no `task_id`**: apagar a tarefa apaga os eventos dela. A alternativa
  (`set null`, virando evento avulso) deixaria lixo órfão na agenda sem contexto. Mesmo tratamento que
  o `project_id` já tem.
- **`wipe_own_data` não muda**: `task` é apagada antes de `project_event` na lista da função, e o
  cascade leva os eventos de tarefa junto. O harness prova isso em vez de assumir.
- **Check `project_event_ends_after_starts`** (`ends_at is null or ends_at > starts_at`): `ends_at`
  existe desde a 006 mas nunca foi preenchido por nenhuma tela, então não há linha legada para
  violar a constraint — é barato colocar agora, antes de a 067 começar a gravar fim de evento.
- **Não há validação em banco de que `task_id` pertence ao mesmo `user_id`.** RLS já impede
  ler/alterar linha de outro usuário; um insert malicioso apontando para tarefa alheia só produziria
  um evento que só o próprio atacante enxerga. Um trigger de coerência seria custo sem ganho real —
  decisão consciente, registrada aqui.
- **Validação de migration em Postgres 16 descartável** (`supabase/tests/event_task_link/`), mesmo
  harness em Docker das features 061/064 — `supabase db push` é do usuário e aplica no banco remoto,
  então nunca é tarefa deste plano.
- **`updateProjectEvent` entra na API agora** (não na 067): é a lacuna que impede qualquer tela de
  editar evento, e pertence à mesma camada de contrato desta feature.

## Tarefas
- [x] Criar `supabase/migrations/20260817120000_event_task_link.sql`: `alter table
  public.project_event alter column project_id drop not null`; `add column if not exists task_id uuid
  references public.task(id) on delete cascade`; check constraints `project_event_single_link`
  (`project_id is null or task_id is null`) e `project_event_ends_after_starts` (`ends_at is null or
  ends_at > starts_at`), ambas criadas em bloco `do $$ ... exception when duplicate_object then null`
  (padrão de `20260806130000_project_notes_status_events.sql`); índices
  `project_event_task_idx (task_id, starts_at) where task_id is not null` e
  `project_event_user_starts_idx (user_id, starts_at)`; `comment on column` explicando os três
  estados de vínculo e que o nome da tabela é histórico. Sem alterar policies (RLS já é por
  `user_id`) nem `wipe_own_data`
- [x] Criar `supabase/tests/event_task_link/00_stubs.sql` espelhando
  `supabase/tests/task_consultation/00_stubs.sql`: schema/tabela `auth.users`, `auth.uid()`,
  `enforce_app_access`, `gen_random_uuid` e o `public.wipe_own_data` vigente (com `project_event` na
  lista), mais `public.project` e `public.task` no estado pré-migration
- [x] Criar `supabase/tests/event_task_link/01_seed.sql`: dois usuários, um projeto e uma tarefa por
  usuário, e eventos de projeto gravados **antes** da migration (para provar que linha legada
  sobrevive com `project_id` preenchido e `task_id` nulo)
- [x] Criar `supabase/tests/event_task_link/02_assert_schema.sql`: `project_id` passou a ser
  nullable; `task_id` existe, é `uuid` e é nullable; linhas legadas seguem intactas
  (`project_id` preenchido, `task_id` nulo); insert com só `task_id` passa; insert com só
  `project_id` passa; insert sem nenhum dos dois passa (evento avulso); insert com **os dois**
  falha na `project_event_single_link`; insert com `ends_at <= starts_at` falha na
  `project_event_ends_after_starts`; `ends_at` nulo continua aceito
- [x] Criar `supabase/tests/event_task_link/03_assert_rls.sql`: usuário só enxerga/edita/apaga os
  próprios eventos (select/update/delete com `auth.uid()` trocado); `delete from public.task` leva os
  eventos daquela tarefa junto (cascade) sem tocar nos eventos de projeto; `delete from
  public.project` continua levando os eventos de projeto; `wipe_own_data()` do usuário A zera
  eventos de projeto, de tarefa e avulsos de A e não toca em nada de B
- [x] Criar `supabase/tests/event_task_link/run.sh` copiando a estrutura de
  `supabase/tests/task_consultation/run.sh` (container `orbyva-event-task-link-pg`, espera por query
  real em vez de `pg_isready`, migration aplicada duas vezes para provar idempotência, `03_assert_rls`
  por último porque termina chamando `wipe_own_data`)
- [x] Rodar `bash supabase/tests/event_task_link/run.sh` e corrigir a migration até sair
  "OK: 20260817120000_event_task_link.sql validada em Postgres 16."
- [x] Em `src/types/tasks.ts`: `ProjectEvent.project_id` vira `string | null`, entra
  `task_id: string | null`, com comentário citando a check constraint (no máximo um vínculo) e o fato
  de o projeto de um evento de tarefa ser derivado, nunca copiado
- [x] Em `src/api/tasks/projectEvents.ts`: adicionar `updateProjectEvent(event:
  ProjectEventUpdateRequest)` (`Partial<ProjectEventCreateRequest> & { id: string }`, exportado de
  `src/types/tasks.ts`) filtrando por `id` + `user_id` e devolvendo a linha atualizada, mesmo padrão
  de `updateTask`/`updateProject`; garantir que `createProjectEvent` aceita `project_id: null` e
  `task_id` (o spread atual já serve — só o tipo muda)
- [x] Criar `src/domain/tasks/events.ts` (regras puras, sem I/O) com: `EventLinkKind = "project" |
  "task" | "none"`; `eventLinkKind(event)`; `resolveEventProjectId(event, taskById)` (projeto do
  evento, ou o projeto da tarefa vinculada, ou `null`); `isEventLinkValid(event)` (espelha a check
  constraint em TS, para a UI barrar antes do banco); e exportar o módulo em
  `src/domain/tasks/index.ts`
- [x] Criar `src/domain/tasks/__tests__/events.test.ts` cobrindo os três `eventLinkKind`;
  `resolveEventProjectId` com evento de projeto, evento de tarefa cujo projeto existe, evento de
  tarefa **sem** projeto (tarefa solta → `null`), evento de tarefa cuja tarefa não está no mapa
  (→ `null`, sem lançar) e evento avulso; e `isEventLinkValid` recusando o par preenchido
- [x] Propagar a nulabilidade de `project_id` nos consumidores até `npm run build` ficar limpo:
  `AgendaGrid.tsx` (`EventChip` recebe `projectColor` já resolvido; filtro de projeto e o dialog de
  detalhe com o `Link` para `/tasks/projects/:id` precisam tratar `project_id` nulo — nesta feature
  basta não quebrar: evento sem projeto usa a cor neutra que já é o fallback e esconde o botão "Ir
  para o projeto"), `AgendaHourGrid.tsx` (`TimedEventBlock`), `Projects.tsx` (`eventsByProject` passa
  a ignorar evento sem `project_id`), `ProjectDetail.tsx` (filtro `e.project_id === id` continua
  correto com `null`) e `ProjectFormDialog.tsx` (só lista eventos já filtrados — conferir tipos)
- [x] `npm run build` e `npm run lint` — sem erros novos
- [x] `npm test` — `events.test.ts` novo passando e nenhuma regressão nos testes de
  `AgendaGrid`/`AgendaHourGrid`/`ProjectFormDialog`/`ProjectDetail` (que mockam `@/api/tasks`: se o
  módulo ganhar `updateProjectEvent`, os mocks `vi.mock("@/api/tasks", ...)` desses arquivos precisam
  da função nova, mesmo problema registrado nas Notas da feature 065)
- [ ] **Aguarda o usuário**: aplicar `supabase/migrations/20260817120000_event_task_link.sql` no banco
  remoto (`supabase db push`) — nunca rodar sem confirmação explícita; as features 067 e 068 só
  funcionam de verdade depois disso

## Prompts

## Notas
- Dois testes que não estavam no plano entraram porque a verificação é só por código (sem navegador),
  e "compila" não prova comportamento: `src/api/tasks/__tests__/projectEvents.test.ts` (duplo do query
  builder, no molde de `updateTask-shopping-sync.test.ts`) prova que `createProjectEvent` grava evento
  de tarefa e avulso e que `updateProjectEvent` filtra por `id` + `user_id`, não manda `updated_at`
  (coluna que `project_event` não tem) e devolve a linha; e
  `src/pages/admin/tasks/__tests__/AgendaGrid.event-link.test.tsx` prova a propagação da nulabilidade
  na UI — evento de tarefa deriva cor/badge/link do projeto **da tarefa**, evento avulso e evento de
  tarefa sem projeto ficam na cor neutra e sem o botão "Ir para o projeto", evento de projeto legado
  inalterado.
- O filtro de projeto da Agenda passou a filtrar evento por projeto **resolvido**
  (`resolveEventProjectId`), não por `e.project_id` cru: sem isso, evento de tarefa some ao filtrar
  pelo projeto da própria tarefa. Evento avulso fica de fora quando há projeto selecionado, o que é o
  comportamento esperado.
- `npm test` (suíte inteira em paralelo) fica instável nesta máquina: a primeira rodada teve 68 falhas,
  todas `Test timed out in 5000ms` em arquivos sem relação com a feature (ex.: `Habits.health-badge`),
  e cada um desses arquivos passa isolado. A suíte foi validada com
  `npx vitest run --testTimeout=30000 --hookTimeout=30000 --maxWorkers=4`: 156 arquivos / 1353 testes
  passando. Sobra um "unhandled error" de teardown (`dispatchEvent` em
  `life/__tests__/HealthDashboard.reminders.test.tsx`, feature 063) que não vem desta feature e não
  reprova nenhum teste.
- Nenhum mock `vi.mock("@/api/tasks", ...)` existente precisou ganhar `updateProjectEvent`: a função
  entrou na API mas ainda não é chamada por tela nenhuma (isso é a 067). O mock do teste novo
  (`AgendaGrid.event-link.test.tsx`) já a declara.
- 2026-09-25 — Conferido por consulta ao banco remoto, não por suposição: a migration
  `20260817120000_event_task_link.sql` aparece em `npx supabase migration list --linked` com coluna
  `remote` **vazia** — ou seja, continua **não aplicada**. A trava desta tarefa é real, não
  bookkeeping desatualizado. A mesma consulta revelou que o remoto tem **16 migrations que este
  worktree não tem** (de `20260819090000` a `20260921110000`, vindas do `feat/orb`): rodar
  `supabase db push` a partir daqui aplicaria migration antiga sobre banco mais novo, que é
  exatamente o bug de bookkeeping do CLI que a CLAUDE.md registra. O push tem de sair de um checkout
  com o histórico de migrations completo, e com confirmação do usuário.
