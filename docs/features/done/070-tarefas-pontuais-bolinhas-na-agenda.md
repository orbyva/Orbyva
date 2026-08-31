---
prompt: |
  - Na visão da agenda, coloque essas tarefas que não tem duração , por exemplo tomar uma tarefa, com uma lista de bolinhas, uma na frente da outra, no prazo marcado, de modo que na visualização de semana/dia ou até mês eu consiga marcar a bolinha, ela fica verde e sabemosq ue a tarefa foi concluída. tipo tarefas pontuais, como trocar lençol, trocar escova, remédios etc
---

# 070 — Tarefas pontuais: bolinhas marcáveis na agenda

## Contexto

Tarefa pontual — trocar lençol, trocar escova, tomar remédio — não tem duração: é um instante, e o que importa dela é "fiz ou não fiz". A agenda de hoje não sabe disso. Toda tarefa com horário vira um bloco no canvas de horas, com altura sintética de 30 minutos (`DEFAULT_ITEM_DURATION_MINUTES`) só para não sumir, e tarefa sem horário vai para a faixa "Sem horário" como um chip de largura inteira. Três remédios e uma troca de escova no mesmo dia ocupam a tela como se fossem duas horas de compromisso. E concluir qualquer uma delas custa dois cliques e um diálogo: `openTaskFromChip` abre o formulário completo, e o botão redondo de concluir está dentro dele.

O pedido é um formato de renderização diferente para esse tipo de tarefa — uma fileira de bolinhas no horário marcado, clicáveis, verdes quando concluídas — e ele vale para mês, semana e dia.

## Decisões

- **Tarefa pontual é uma flag nova em `task`: `is_quick boolean not null default false`.** Segue o padrão já estabelecido de flags ortogonais na mesma linha (`is_milestone`, `is_medication`, `is_consultation`), que é como este projeto tipa tarefa.
  - **Descartado — um enum `task_kind`**: as flags de hoje não são mutuamente exclusivas (uma dose é medicação *e* pontual, e a 071 depende disso), então virar enum seria perder informação e migrar quatro colunas sem que ninguém tenha pedido.
  - **Descartado — derivar "pontual" de `estimated_duration is null`**: a maioria das tarefas do banco não tem duração por omissão, não por decisão. Derivar transformaria a agenda inteira em bolinhas de uma vez, sem o usuário pedir.
- **A flag é explícita e mora onde a duração mora.** No formulário unificado (`TaskFormFields`), na mesma aba da data/duração, como um interruptor "Tarefa pontual (sem duração)"; e no `TaskDurationQuickPick` da edição rápida, como uma opção ao lado dos presets de 15/30/60 min. Ligar a flag zera `estimated_duration` — os dois conceitos são mutuamente exclusivos, e deixar os dois preenchidos criaria uma tarefa que é bloco e bolinha ao mesmo tempo.
- **No canvas de horas (semana e dia), pontual não entra no `layoutTimedItems`.** Ela não tem duração para ocupar coluna, e forçá-la no algoritmo de colunas faria três remédios das 8h virarem três colunas estreitas — o oposto de "uma na frente da outra". As pontuais de um mesmo horário são agrupadas num slot e desenhadas como uma **faixa horizontal de bolinhas**, posicionada no `topPercent` daquele horário, com altura fixa pequena, ocupando a largura do dia por cima das colunas de blocos (`z-10`).
  - **Custo assumido**: uma tarefa com duração que comece no mesmo minuto de uma pontual tem a primeira linha do texto coberta pela faixa. É raro, é reversível e é preferível a redesenhar o algoritmo de layout — que continua o mesmo, com a mesma limitação já documentada na 034.
- **No mês, a fileira de bolinhas fica no topo da célula do dia, antes dos chips, e não conta para `MONTH_MAX_CHIPS_PER_DAY`.** Bolinha é compacta; fazê-la competir com o limite de 3 chips esconderia tarefas normais para caber um remédio.
- **Na faixa "Sem horário", pontual também vira bolinha** — agrupada numa fileira única, não uma por linha. Uma tarefa pontual sem horário continua sendo pontual.
- **Clicar na bolinha alterna concluída/pendente direto, sem abrir diálogo.** É o pedido literal ("eu consiga marcar a bolinha, ela fica verde"). Atualização otimista com reversão em caso de erro, reusando exatamente o `toggleTaskDone` que o `AgendaGrid` já tem para o diálogo — o mesmo caminho, o mesmo `updateTask`, o mesmo toast de falha.
- **A bolinha usa o ícone da tarefa** (`icon_key`/`icon_url`, feature 035) quando houver, senão um círculo liso; concluída, fica preenchida de verde (`STATUS_DOT_CLASS.done`, que já existe e já é `bg-green-500`) com o ícone em contraste. É o "utilizando o ícone" do prompt irmão (item 4, feature 071), e é o que faz uma fileira de bolinhas ser legível sem texto.
- **Abrir/editar uma tarefa pontual continua possível, por dois caminhos**: o `+N` no fim da fileira (quando passa do limite de bolinhas visíveis) e o **número do dia**, que passa a ser clicável em semana e dia, abrindo o modal do dia que hoje só existe no mês. O modal lista tudo com os chips normais, que abrem o diálogo de sempre. Descartado sobrecarregar o clique da bolinha (duplo clique, `Alt+clique`): afordância escondida num alvo de 20px.
- **Ocorrência virtual (`virtual:`) vira bolinha tracejada e não clicável**, com o mesmo `title` explicativo que o `TaskChip` já usa. A regra de que não se conclui o que ainda não existe não muda aqui.
- **Acessibilidade não é acabamento**: cada bolinha é um `<button>` com `aria-pressed`, `aria-label` "Concluir «título» às HH:mm" / "Reabrir «título» às HH:mm", alvo de toque de no mínimo 24px (área clicável maior que o desenho) e navegável por teclado na ordem do horário.
- **`is_quick` se propaga para as ocorrências materializadas de uma série recorrente**, junto de `is_medication`/`is_consultation` em `materializeRecurringInstances`. Sem isso, "trocar lençol toda semana" — que é literalmente o exemplo do prompt — seria bolinha só na origem e bloco em todas as repetições.

## Tarefas

- [x] Criar `supabase/migrations/20260819100000_task_is_quick.sql`: `alter table public.task add column if not exists is_quick boolean not null default false` + `comment on column` ("tarefa pontual: instante sem duração, desenhada como bolinha marcável na agenda"). Verificação: aplicar em Postgres 16 descartável em Docker (mesmo método das features anteriores) — coluna existe com o default certo, linhas existentes ficam `false`, RLS de `task` intocada
- [x] `src/types/tasks.ts`: `is_quick?: boolean` em `Task`; `src/domain/tasks/taskDraft.ts`: `emptyTask()` semeia `is_quick: false`. Verificação: `npm run build`
- [x] `src/api/tasks/tasks.ts`: propagar `is_quick` da origem para as ocorrências em `materializeRecurringInstances`, ao lado de `is_medication` e `is_consultation`. Verificação: teste novo em `src/api/__tests__/tasks.recurring-materialization.test.ts` — série pontual gera ocorrências pontuais
- [x] `src/domain/tasks/calendar.ts`: `splitAgendaItems(items)` → `{ timed, quick, untimed }`, onde `quick` são as tarefas com `is_quick` (com ou sem `due_time`); `splitTimedItems` continua exportada e com o mesmo comportamento para quem ainda a usa. Verificação: `npm run build`
- [x] `src/domain/tasks/calendar.ts`: `groupQuickItemsBySlot(quickItems)` → `{ startMinutes, topPercent, items }[]`, agrupando por horário normalizado (`HH:mm`, tolerando o `HH:mm:ss` do Postgres), ordenado por horário, com as sem horário num grupo próprio. Verificação: `npm run build`
- [x] `src/domain/tasks/__tests__/calendar.test.ts`: testes novos — pontual com horário sai de `timed` e entra em `quick`; pontual sem horário não vai para `untimed`; `08:00` e `08:00:00` caem no mesmo slot; `topPercent` do slot bate com o de `computeItemPosition`; ordem dos slots; tarefa pontual **com** `estimated_duration` preenchido (dado inconsistente vindo do banco) continua tratada como pontual. Verificação: `npm test src/domain/tasks`
- [x] Criar `src/pages/admin/tasks/QuickTaskDot.tsx`: o botão-bolinha (ícone da tarefa ou círculo; verde quando `done`; tracejado e desabilitado quando virtual; `aria-pressed`; alvo de toque ≥ 24px; `title` com "HH:mm · título"). Verificação: `npm run build && npm run lint`
- [x] `src/pages/admin/tasks/__tests__/QuickTaskDot.test.tsx`: rótulos de concluir/reabrir; verde só quando `done`; ícone customizado (`icon_url`) e preset (`icon_key`) aparecem; bolinha virtual não dispara o `onToggle`; navegação por teclado (Enter e Espaço). Verificação: `npm test src/pages/admin/tasks`
- [x] Criar `src/pages/admin/tasks/QuickTaskDotRow.tsx`: a fileira de um slot — bolinhas lado a lado com quebra de linha, limite de visíveis e botão `+N` quando estourar. Verificação: `npm run build && npm run lint`
- [x] `src/pages/admin/tasks/AgendaHourGrid.tsx`: usar `splitAgendaItems` + `groupQuickItemsBySlot`; renderizar cada slot como fileira absoluta em `topPercent`, com `z-10` sobre as colunas de blocos; pontual sem horário vira fileira dentro da faixa "Sem horário", no lugar dos chips de largura inteira. Verificação: `npm run build && npm run lint`
- [x] `src/pages/admin/tasks/AgendaHourGrid.tsx`: cabeçalho do dia (o número) vira botão que chama `onOpenDay(dayKey)`, com `aria-label` "Ver tudo do dia N". Verificação: `npm run build && npm run lint`
- [x] `src/pages/admin/tasks/AgendaGrid.tsx`: passar `onToggleQuick` (reusando `toggleTaskDone`) e `onOpenDay` (setando `dayModalKey`, hoje só usado no mês) para o `AgendaHourGrid`. Verificação: `npm run build && npm run lint`
- [x] `src/pages/admin/tasks/AgendaGrid.tsx`: no mês, renderizar a fileira de bolinhas no topo da célula do dia, antes dos chips, sem consumir o `MONTH_MAX_CHIPS_PER_DAY`; o `+N mais` do dia continua contando só os chips. Verificação: `npm run build && npm run lint`
- [x] `src/pages/admin/tasks/__tests__/AgendaHourGrid.test.tsx`: testes novos — pontual com horário vira bolinha e **não** vira bloco; duas pontuais no mesmo horário ficam na mesma fileira; a fileira está no `top` do horário; pontual sem horário vira bolinha na faixa "Sem horário"; clicar na bolinha chama `onToggleQuick` e não `onOpenTask`; clicar no número do dia chama `onOpenDay`. Verificação: `npm test src/pages/admin/tasks`
- [x] `src/pages/admin/tasks/__tests__/AgendaGrid.quick.test.tsx` (arquivo novo): no mês, a bolinha aparece na célula do dia certo, marcar deixa verde de forma otimista, o `updateTask` é chamado com `status: "done"`, e falha da API reverte a cor e mostra toast; as bolinhas não roubam as 3 vagas de chip do dia. Verificação: `npm test src/pages/admin/tasks`
- [x] `src/pages/admin/tasks/TaskFormFields.tsx`: interruptor "Tarefa pontual (sem duração)" na aba de data/duração, desabilitando e zerando `estimated_duration` quando ligado. Verificação: `npm run build && npm run lint` + teste de que ligar zera a duração e desligar devolve o campo
- [x] `src/pages/admin/tasks/TaskDurationQuickPick.tsx`: opção "Pontual" ao lado dos presets, ligando `is_quick` e limpando a duração; e o inverso ao escolher um preset. Verificação: teste no arquivo de teste existente do quick-edit
- [x] `npm run build`, `npm run lint` e `npm test` limpos, com a contagem registrada — `npm run build` OK (13.8s), `npx tsc --noEmit` sem erro, `npm run lint` com 0 erros (78 warnings de `react-refresh/only-export-components`, todos pré-existentes), `npm run check:bundle` "Bundle budget OK" (maior rota: `MarkdownPreview` 127 KB / 160 KB gzip) e `npx vitest run` **173 arquivos, 1692 testes, 0 falhas**
- [x] Verificação do pedido literal, por teste e não no navegador: um dia com três pontuais (duas às 08:00, uma sem horário) e uma tarefa comum de uma hora — nas três visões (mês, semana, dia) as pontuais aparecem como bolinhas na fileira do horário, a tarefa comum continua bloco, e marcar cada bolinha a deixa verde sem abrir diálogo nenhum
- [x] **Migration aplicada pelo usuário** (2026-08-23): o usuário rodou `supabase db push` e confirmou que `supabase/migrations/20260819100000_task_is_quick.sql` está no banco remoto. A coluna `task.is_quick` existe, então criar tarefa volta a funcionar (o `emptyTask()` já mandava o campo no insert) e as bolinhas passam a ter flag real para ler. **A conferência pós-push NÃO foi executada por esta sessão** — as consultas leem o banco remoto, ao qual esta esteira não tem acesso. Duas ressalvas honestas, registradas em `## Notas`: (a) o `select count(*) from task` "antes" nunca foi anotado, então a comparação antes × depois **não é mais executável** e foi reescrita numa forma que não depende dela; (b) nada disso foi visto passar por esta sessão

## Prompts

- 2026-08-19 — "- Na visão da agenda, coloque essas tarefas que não tem duração , por exemplo tomar uma tarefa, com uma lista de bolinhas, uma na frente da outra, no prazo marcado, de modo que na visualização de semana/dia ou até mês eu consiga marcar a bolinha, ela fica verde e sabemosq ue a tarefa foi concluída. tipo tarefas pontuais, como trocar lençol, trocar escova, remédios etc"

## Notas

- **Migration validada sem `supabase db push`** (2026-08-19, mesmo método da 061): harness
  `supabase/tests/task_is_quick/` (`bash supabase/tests/task_is_quick/run.sh` → `OK`) sobe um
  Postgres 16 descartável em Docker com `public.task` no schema que 032/037/049/061 deixaram, aplica
  a migration **duas vezes** (idempotência) e asserta: `is_quick` é `boolean not null default false`;
  as 5 tarefas do seed ficam todas `false` (nenhuma tarefa existente muda de comportamento na
  agenda); tarefa sem `estimated_duration` **não** vira pontual sozinha (a decisão de não derivar);
  `is_milestone`/`is_medication`/`is_consultation`/`estimated_duration` intactas; `comment on column`
  presente; RLS de `task` ligada com as 4 policies e o trigger `enforce_app_access` de pé; e, como
  `authenticated`, que a pontual alheia não é vista/atualizada/apagada, que `is_quick` e
  `is_medication` coexistem na mesma linha (pré-requisito da 071) e que `wipe_own_data` leva as
  pontuais do dono. Dois controles negativos confirmam que as assertivas acusam: sem a migration →
  "task.is_quick deveria ser boolean not null default false"; com RLS desligada → "RLS vazando 1
  tarefa(s) de outro usuário". **Continua pendente de `supabase db push` pelo usuário** — daí a
  última tarefa.
- **Rodada final (2026-08-19)**: `npm run build` OK, `npx tsc --noEmit` limpo, `npm run lint` 0 erros
  (78 warnings pré-existentes de `react-refresh`), `npm run check:bundle` OK e `npx vitest run` com
  **173 arquivos / 1692 testes, 0 falhas**. O harness da migration foi re-rodado nesta sessão
  (`bash supabase/tests/task_is_quick/run.sh` → `OK: 20260819100000_task_is_quick.sql validada em
  Postgres 16.`). ~~Único item aberto: a aplicação da migration no banco remoto.~~
  **Superado em 2026-08-23**: o usuário rodou o push e confirmou; a feature foi para `done/`, com o
  pedido do prompt cumprido e provado por teste (ver `AgendaGrid.quick.test.tsx`, describe "o pedido
  literal, nas três visões").
- **PENDÊNCIA DO USUÁRIO — conferência pós-push (2026-08-23).** A migration está aplicada, mas as
  consultas abaixo **não foram executadas nem vistas passar por esta sessão** (elas leem o banco
  remoto). O roteiro original pedia anotar `select count(*) from task` **antes** do push; isso não
  foi feito — o push já aconteceu e esta esteira nunca teve acesso ao banco. A versão abaixo não
  depende do número de partida:

  ```sql
  -- (1) a coluna chegou com o contrato certo
  select column_name, data_type, is_nullable, column_default
    from information_schema.columns
   where table_schema = 'public' and table_name = 'task' and column_name = 'is_quick';
  -- esperado: is_quick | boolean | NO | false

  -- (2) nenhuma tarefa existente mudou de comportamento na agenda.
  --     Tem de dar 0 SE você ainda não criou nenhuma tarefa pontual à mão nem aplicou a
  --     migration da 071 (que marca as doses de medicação como pontuais).
  select count(*) from public.task where is_quick;

  -- (2b) se a 071 já estiver aplicada, o número acima não é mais 0 — use este recorte,
  --      que isola o que a 070 sozinha não podia ter marcado. Tem de dar 0.
  select count(*) from public.task where is_quick and medication_id is null;
  ```

  A migration é um `add column ... default false`, então ela não podia inserir nem apagar linha — é
  por isso que a ausência do `count(*)` de partida não deixa buraco de verdade aqui: a consulta (2)
  já denuncia qualquer tarefa que tenha mudado de comportamento.
- **Pontos de reuso para a 071** (dose de medicação como bolinha): `QuickTaskDot` (a bolinha, já
  desenha `icon_key`/`icon_url` via `TaskIconBadge`), `QuickTaskDotRow` (a fileira, com `label`
  acessível e `+N`), `splitAgendaItems`/`groupQuickItemsBySlot` em `src/domain/tasks/calendar.ts`, a
  flag `is_quick` no `Task`/`emptyTask()`/`materializeRecurringInstances`, e o payload
  `TaskDueQuickEditValue` (`src/pages/admin/tasks/TaskDueQuickEdit.tsx`), que é como a edição rápida
  liga a flag sem duas escritas no banco.
- **Esta feature é a base da 071.** O prompt irmão (item 4 do mesmo texto bruto) pede que a dose de medicação seja "do tipo quick-task, no horário definido, só clicar e ficar verde numa listagem utilizando o ícone" — ou seja, a 071 consome o `is_quick` e a bolinha construídos aqui. Implementar **070 antes da 071**.
- Depende da 034 (`AgendaHourGrid`, `layoutTimedItems`), da 035 (ícone por tarefa, que é o que a bolinha desenha) e da 048 (subtarefa com prazo próprio já aparece na agenda como tarefa comum — subtarefa pontual vira bolinha pelo mesmo caminho, sem código específico).
- `computeVirtualOccurrences` espalha `...origin` ao sintetizar a ocorrência, então `is_quick` viaja de graça para as ocorrências virtuais — é por isso que existe o estado "bolinha tracejada e não clicável" em vez de simplesmente não desenhar nada.
- `is_milestone` (037) e `is_quick` são parecidos no conceito ("um ponto, não um intervalo") e diferentes no propósito: milestone é marco de projeto e só o Gantt o lê; pontual é uma coisa que se faz e só a agenda a lê. Não foram unificados de propósito — unificar mudaria o desenho do Gantt sem pedido.
