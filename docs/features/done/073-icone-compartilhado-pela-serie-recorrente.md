---
prompt: |
  - quando adicionado um ícone em uma sequência com repetição, todos devem compartilhar o ícone
---

# 073 — Ícone da tarefa compartilhado por toda a sequência recorrente

## Contexto
O ícone customizado por tarefa (features `done/035` e `done/040`) vive em duas colunas de `task`:
`icon_key` (preset lucide de `TASK_ICON_PRESETS`) e `icon_url` (imagem no bucket `task-icons`),
mutuamente exclusivas. É editado pelo `TaskIconPicker` na linha de metadados da Lista/Kanban, no
popover do Gantt e no form completo, sempre persistindo via `updateTask({ id, icon_key, icon_url })`
(`src/api/tasks/tasks.ts:189`), que atualiza **uma linha só**.

Recorrência no projeto não tem tabela própria: a tarefa-origem guarda `recurrence_rule` e cada
ocorrência é uma linha real de `task` com `recurrence_origin_id = origin.id`, criada sob demanda por
`materializeRecurringInstances` dentro de `fetchTasks` (`src/api/tasks/tasks.ts:19`, só até hoje).
Séries vindas da Recorrência Financeira usam o mesmo campo (`materializeLinkedInstances` grava
`recurrence_origin_id = template.id` **e** `linked_recurring_id`). Na Agenda ainda existem
ocorrências **virtuais** (`computeVirtualOccurrences` + `AgendaGrid.tsx:286`), objetos em memória
criados por spread da origem, nunca persistidos e não clicáveis.

O resultado hoje é inconsistente e visível: a materialização copia só um subconjunto de campos
(`title`, `description`, `tag_ids`, `due_date`, `due_time`, `is_medication`, `is_consultation`) e
**não copia o ícone** — a ocorrência real nasce sem ícone, enquanto a ocorrência virtual do mesmo dia
na Agenda aparece **com** o ícone da origem. E marcar o ícone numa ocorrência não alcança nem a
origem nem as irmãs. O usuário pediu o comportamento óbvio: numa sequência com repetição, todas as
ocorrências compartilham o ícone.

## Decisões
- **O ícone passa a ser propriedade da série, não da ocorrência.** Qualquer alteração — preset,
  upload de imagem ou remoção — feita em qualquer ocorrência ou na origem se aplica à série inteira.
- **Sem dialog "só esta / toda a série"** (diferente da exclusão, feature `done/028` /
  `TaskDeleteDialog.tsx`): o pedido é explícito ("todos devem compartilhar o ícone") e um ícone
  divergente por ocorrência não tem uso — o ícone é justamente o marcador visual que identifica a
  série de relance nas visualizações (feature 035).
- **A propagação é retroativa**: alcança ocorrências passadas e já concluídas, não só as futuras.
  A linha do tempo do `SeriesOccurrencesDialog` e a visão "Concluídas" ficariam com ícones mistos
  para a mesma série se o passado fosse preservado.
- **Escopo da série** = `id = originId OR recurrence_origin_id = originId`, com
  `originId = task.recurrence_origin_id ?? task.id`. Isso cobre de graça tanto a recorrência simples
  quanto as séries vinculadas à Recorrência Financeira (as duas gravam `recurrence_origin_id`), sem
  precisar da lista completa de tarefas no cliente.
- **Doses de medicação ficam de fora** (`medication_id`, `recurrence_origin_id: null`): hoje nem o
  `seriesKey` (`src/domain/tasks/agenda.ts:87`) as agrupa como série; incluí-las exigiria estender a
  noção de série no domínio inteiro, o que é uma feature própria. Registrado aqui para decidir
  depois, se o usuário sentir falta.
- **Ponto único de escrita: dentro de `updateTask`.** É por onde passam todos os editores de ícone
  (quick-edit da Lista/Kanban `handleIconChange`, popover do Gantt, `handleSave` do form completo);
  fazer o fan-out em cada chamador seria triplicar a regra. Fica no mesmo lugar dos side-effects já
  existentes (`syncLinkedInstallmentFromTask`, `syncLinkedShoppingItemFromTask`), **mas com
  tratamento de erro diferente**: aqueles são engolidos em `console.error`, e este não pode ser — a
  propagação **é** o comportamento pedido, então a falha tem que subir e virar toast no chamador.
- **Só dispara quando o payload traz ícone** (`fields.icon_key !== undefined ||
  fields.icon_url !== undefined`), pra não pagar um `select` extra em toda atualização de tarefa
  (arrastar no Gantt, trocar status, editar prazo).
- **Ocorrências futuras nascem com o ícone**: `materializeRecurringInstances` e
  `materializeLinkedInstances` passam a copiar `icon_key`/`icon_url` da origem/template junto com os
  campos que já copiam. Sem isso, a propagação retroativa seria desfeita pela próxima
  materialização.
- **Ocorrências virtuais** já herdam pelo spread `...origin` — nada a mudar, mas o comportamento
  passa a ser garantido por teste (é o que denuncia se alguém mexer no spread depois).
- **Backfill das ocorrências já materializadas** (criadas antes desta mudança, com ícone `null`
  enquanto a origem tem ícone) via migration de dados nova
  (`supabase/migrations/<timestamp>_task_series_icon_backfill.sql`), copiando o ícone da origem só
  onde a ocorrência ainda não tem nenhum. **Não rodar `supabase db push` sem confirmar com o
  usuário** — regra do projeto, o banco é remoto. Sem colunas novas: o schema não muda.
- **Upload passa a gravar no caminho da origem** (`{userId}/{originId}.{ext}`): o arquivo pertence à
  série, e prender o path a uma ocorrência qualquer significaria que excluir aquela ocorrência
  deixaria as irmãs apontando pro arquivo de uma tarefa que não existe mais. `TaskIconPicker`
  continua recebendo um `taskId`; quem chama passa `task.recurrence_origin_id ?? task.id`.
- **A UI avisa que a edição não é local**: quando a tarefa faz parte de uma série
  (`isRecurringTask`), o popover do `TaskIconPicker` mostra uma linha curta ("Vale para todas as
  ocorrências desta recorrência"). Sem esse aviso, o usuário edita achando que mexeu só naquele dia
  e leva um susto ao ver o passado mudar.

## Tarefas
- [x] Criar o helper puro `resolveSeriesOriginId(task): string | null` em
      `src/domain/tasks/recurrence.ts` (exportar no `src/domain/tasks/index.ts`): devolve
      `recurrence_origin_id ?? id` quando a tarefa é origem (`recurrence_rule`) ou ocorrência
      (`recurrence_origin_id`), e `null` quando não faz parte de série nenhuma.
- [x] Testar `resolveSeriesOriginId` em `src/domain/tasks/__tests__/recurrence.test.ts`: origem,
      ocorrência simples, ocorrência vinculada a Recorrência Financeira, dose de medicação
      (`medication_id`, sem origem → `null`) e tarefa avulsa (`null`).
- [x] Em `materializeRecurringInstances` (`src/api/tasks/tasks.ts`), adicionar
      `icon_key: origin.icon_key ?? null` e `icon_url: origin.icon_url ?? null` ao `newRows.push`.
- [x] Em `materializeLinkedInstances` (mesmo arquivo), copiar `icon_key`/`icon_url` do `template`.
- [x] Estender `src/api/__tests__/tasks.recurring-materialization.test.ts`: ocorrência nasce com o
      `icon_key` da origem, com o `icon_url` da origem quando é imagem, e com ambos `null` quando a
      origem não tem ícone.
- [x] Criar `propagateIconToSeries(taskId, userId, icon)` em `src/api/tasks/tasks.ts`: lê
      `id, recurrence_rule, recurrence_origin_id` da tarefa alvo, resolve `originId` com
      `resolveSeriesOriginId` e, havendo série, faz um `update` de `icon_key`/`icon_url` com
      `.or("id.eq.<originId>,recurrence_origin_id.eq.<originId>").eq("user_id", userId)`.
- [x] Chamar `propagateIconToSeries` dentro de `updateTask`, só quando `fields.icon_key` ou
      `fields.icon_url` vierem no payload, **fora** do `try/catch` silencioso dos syncs (o erro
      precisa subir pro chamador).
- [x] Criar `src/api/__tests__/tasks.series-icon.test.ts` (Supabase falso no molde do teste de
      materialização): editar o ícone de uma ocorrência atualiza origem + todas as irmãs; editar o
      ícone da origem atualiza todas as ocorrências.
- [x] Estender o mesmo teste: remover o ícone (`{ icon_key: null, icon_url: null }`) propaga a
      limpeza pra série; tarefa sem série faz um `update` só (sem fan-out); `updateTask` sem campo
      de ícone no payload não dispara nenhum `select`/`update` extra.
- [x] Migration `supabase/migrations/20260819120000_task_series_icon_backfill.sql`: copiar
      `icon_key`/`icon_url` da origem pras ocorrências (`recurrence_origin_id is not null`) que ainda
      estão com os dois `null`. **Não aplicar (`supabase db push`) sem confirmar com o usuário.**
      Validada em Postgres 16 descartável: `bash supabase/tests/task_series_icon/run.sh`.
- [x] Em `TaskIconPicker.tsx`, adicionar a prop opcional `sharedWithSeries?: boolean` e, quando
      `true`, renderizar no popover a linha "Vale para todas as ocorrências desta recorrência"
      (mesmo estilo `text-[10px] text-muted-foreground` da dica de upload desabilitado).
- [x] Em `TaskQuickFields.tsx`, passar `taskId={task.recurrence_origin_id ?? task.id}` e
      `sharedWithSeries={isRecurringTask(task)}` pro `TaskIconPicker` (Lista, Kanban e popover do
      Gantt herdam de uma vez).
- [x] Em `TaskFormFields.tsx`, aplicar o mesmo `taskId` de origem e o mesmo `sharedWithSeries` no
      campo "Ícone" do form completo.
- [x] Estender `src/pages/admin/tasks/__tests__/TaskIconPicker.test.tsx`: o aviso de série aparece
      só com `sharedWithSeries`, e o upload chama `uploadTaskIcon` com o id recebido (o da origem)
      e não com o da ocorrência.
- [x] Travar a ocorrência virtual com teste (`src/pages/admin/tasks/__tests__/AgendaGrid.test.tsx`
      ou o domínio de `computeVirtualOccurrences`): o preview futuro da Agenda mostra o mesmo ícone
      da origem.
- [x] Conferir o caminho de UI completo: mudar o ícone numa ocorrência pela Lista dispara `load()` e
      todas as ocorrências (Lista, Kanban, Gantt e chips da Agenda) passam a mostrar o ícone novo
      sem reload manual — ajustar se algum desses caminhos não refizer a busca.
- [x] `npx tsc -p tsconfig.app.json --noEmit && npm run build && npm run lint && npm test`
      (+ `npm run check:bundle`): 0 erro de tipo, 0 erro de lint (78 warnings pré-existentes de
      `react-refresh`), build e teto de rota OK, suíte 179 arquivos / 1771 testes / 0 falhas.
- [x] **Migration aplicada pelo usuário** (2026-08-23): o usuário rodou `supabase db push` e
      confirmou que `supabase/migrations/20260819120000_task_series_icon_backfill.sql` está no banco
      remoto, então o passado já materializado também herdou o ícone da origem — que era a única
      parte do pedido que dependia do push. A migration já estava validada em Postgres 16
      descartável (`bash supabase/tests/task_series_icon/run.sh`), inclusive na reaplicação e com
      controle negativo.
      **A conferência pós-push NÃO foi executada por esta sessão**: as consultas leem o banco remoto
      e o passo final é teste de fumaça na interface, e esta esteira não alcança nenhum dos dois.
      Ressalva honesta: os dois `count(*)` "antes" nunca foram anotados, então a comparação
      antes × depois **não é mais executável como estava escrita** — o roteiro foi reescrito em
      `## Notas` numa forma post-hoc, com resultado esperado absoluto. **A consulta central continua
      valendo tal e qual e não depende de nenhum número de partida.**

## Prompts

## Notas
- ~~`supabase db push` aplica no banco remoto: **não foi rodado**.~~ **Superado em 2026-08-23**: o
  usuário rodou o push e confirmou. A migration continua validada em Postgres 16 descartável
  (`bash supabase/tests/task_series_icon/run.sh`, com controle negativo: trocando a migration por
  um `select 1;` o roteiro falha com "6 ocorrência(s) continuam sem ícone") — o que mudou é que
  agora ela também está aplicada no remoto, então o passado já materializado herdou o ícone. A
  feature foi para `done/`.
- **PENDÊNCIA DO USUÁRIO — conferência pós-push (2026-08-23).** A migration está aplicada, mas o que
  segue **não foi executado nem visto passar por esta sessão** (banco remoto e interface). O roteiro
  original pedia dois `count(*)` **antes** do push; eles não foram anotados. A consulta central,
  porém, nunca dependeu deles:

  ```sql
  -- (1) A CONSULTA QUE DECIDE. Tem de dar 0:
  --     nenhuma ocorrência sem ícone cuja origem tenha ícone.
  select count(*)
    from public.task o
    join public.task s on s.id = o.recurrence_origin_id
   where (s.icon_key is not null or s.icon_url is not null)
     and o.icon_key is null and o.icon_url is null;

  -- (2) O BACKFILL NÃO PODE TER APAGADO NEM CRIADO LINHA (ele é só update).
  --     Não há número "antes" para comparar, então o proxy é: nenhuma ocorrência ficou órfã.
  --     Tem de dar 0.
  select count(*) from public.task o
   where o.recurrence_origin_id is not null
     and not exists (select 1 from public.task s where s.id = o.recurrence_origin_id);

  -- (3) O BACKFILL NÃO SOBRESCREVEU ícone escolhido à mão: ele só tocava linhas com os dois
  --     campos nulos. Esta lista mostra as ocorrências que divergem da origem — se houver
  --     alguma, é escolha sua de antes da 073, não estrago da migration.
  select o.id, o.title, o.icon_key as ocorrencia, s.icon_key as origem
    from public.task o join public.task s on s.id = o.recurrence_origin_id
   where o.icon_key is distinct from s.icon_key;
  ```

  Na interface: abrir uma série antiga que tinha ícone só na origem e conferir que a linha do tempo
  do `SeriesOccurrencesDialog` e a visão "Concluídas" mostram o ícone em **todas** as ocorrências.
- Caminho de UI conferido por código: Lista (`TaskList.tsx:574`) e Projeto (`ProjectDetail.tsx:585`)
  já tinham um `handleIconChange` único que faz `updateTask` + `load()`, e é ele que Lista, Kanban,
  Gantt e subtarefas recebem (`TaskViews.tsx`), então nenhuma dessas telas precisou de ajuste —
  `TaskList.series-icon.test.tsx` prova o refetch e o ícone novo na tela sem reload manual.
- Rodada final refeita numa sessão nova (a anterior caiu por erro de API ao iniciar a suíte):
  `npx tsc -p tsconfig.app.json --noEmit`, `npm run build`, `npm run lint` (0 erro, 78 warnings
  pré-existentes de `react-refresh`), `npm run check:bundle` (teto de rota 160 KB gzip) e `npm test`
  — **179 arquivos / 1771 testes / 0 falhas** (baseline antes da feature: 175 / 1742). O único
  ruído é o erro pós-teardown intermitente e pré-existente de
  `HealthDashboard.reminders.test.tsx` (radix + fake timers), sem relação com a 073.
  `bash supabase/tests/task_series_icon/run.sh` também foi reexecutado nesta sessão: OK, inclusive
  na reaplicação da migration.
- Checagem de satisfação (rastreabilidade do `prompt:`; `## Prompts` está vazia — nenhum pedido
  novo do usuário no meio): "todos compartilham o ícone" ← `tasks.series-icon.test.ts` (ocorrência
  → origem + irmãs, origem → ocorrências, série vinculada à Recorrência Financeira, remoção,
  avulsa sem fan-out, dose de medicação fora, payload sem ícone não gera query extra, erro sobe);
  ocorrências futuras ← `tasks.recurring-materialization.test.ts` (preset, imagem e sem ícone, e o
  caso do template vinculado); preview da Agenda ← `AgendaGrid.series-icon.test.tsx`; escopo da
  série ← `resolveSeriesOriginId` em `recurrence.test.ts`; UI ← `TaskIconPicker.test.tsx`,
  `TaskQuickFields.series-icon.test.tsx`, `TaskFormFields.test.tsx` e `TaskList.series-icon.test.tsx`.
  Só o passado já materializado depende do `supabase db push` pendente.
- Falso alarme desta sessão: cheguei a abrir uma tarefa extra achando que a fiação do
  `TaskQuickFields` (Lista/Kanban/Gantt) estava sem teste, e escrevi asserções novas dentro de
  `TaskList.series-icon.test.tsx`. `TaskQuickFields.series-icon.test.tsx` já cobria exatamente isso
  (aviso da série na ocorrência, na origem e na parcela vinculada; ausência do aviso na avulsa;
  upload no id da origem), então a tarefa e as asserções duplicadas foram revertidas — nenhum
  arquivo de teste ficou alterado.
- A cópia de `icon_key`/`icon_url` em `materializeLinkedInstances` não tinha cobertura nenhuma
  (o arquivo de teste só exercitava `materializeRecurringInstances`), então o mesmo teste ganhou um
  caso para a série vinculada à Recorrência Financeira, com `@/api/recurring` mockado.
