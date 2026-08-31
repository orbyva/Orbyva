---
prompt: |
  - i'm unable to delete a task with recorrence. i have the task SEMTRI, that is my medications, but i'm unable to delete it. when a task is related to a recorrence. make a forms with the possibility to delete all the items![alt text](image.png) they are duplicated
---

# 074 — Doses/ocorrências duplicadas na agenda: diagnóstico e correção

## Contexto

O usuário reporta duas coisas no mesmo prompt: (a) a tarefa "SEMTRI" (a medicação dele) aparece
**duplicada** e (b) ele **não consegue apagá-la**. Esta feature trata só (a); o (b) é a feature
`075`, que depende do diagnóstico daqui.

A evidência é visual — é a imagem que veio junto do prompt (o `![alt text](image.png)` do `prompt:`
acima aponta pro caminho antigo, em `to-refine/`, e continua ali só porque o frontmatter é verbatim):

![Visão de mês da agenda com duas bolinhas de comprimido em quase toda célula de dia](../assets/074-doses-duplicadas-na-agenda.png)

Ela mostra a visão de **mês** da agenda com **duas bolinhas de comprimido em quase toda célula de
dia** — 18, 19, 20, 21…, inclusive dias futuros. No dia 17 aparece só uma. As dos dias 17/18/19
estão com o anel verde/âmbar de "dose tomada" da feature `071`.

O arquivo mora em `docs/features/assets/074-doses-duplicadas-na-agenda.png` — pasta nova, criada no
refino porque o repo não tinha convenção para imagem de feature (a `done/030` chegou a apontar para
`docs/features/to-refine/image.png`, que é efêmero e já foi sobrescrito desde então). Fica **fora**
de `todo/`/`in-progress/`/`done/` de propósito: o link relativo `../assets/…` continua funcionando
quando este arquivo mudar de pasta ao longo do fluxo.

Ler o código deu três mecanismos plausíveis e independentes para isso. **Nenhum está confirmado
contra os dados reais do usuário** — o banco remoto tem 14 features em `in-progress/` com migration
pendente de `supabase db push`, então nem dá pra assumir qual schema está de fato aplicado. Por isso
a primeira metade das tarefas é diagnóstico, não conserto.

Mecanismos candidatos, todos reais no código de hoje:

1. **Origem de medicação virando ocorrência virtual (duplicação de *renderização*, não de linha).**
   `materializeRecurringInstances` (`src/api/tasks/tasks.ts:27-38`) exclui de propósito séries com
   `medication_id` — o comentário no código e o `comment on column` da migration
   (`supabase/migrations/20260816230000_medication.sql:89-92`) dizem explicitamente que os dois
   caminhos juntos duplicariam doses. **Mas `computeVirtualOccurrences`
   (`src/domain/tasks/recurrence.ts:229-254`) não tem esse filtro**: ele seleciona
   `!!t.recurrence_rule && !t.recurrence_origin_id && !!t.due_date`, sem `!t.medication_id` — o tipo
   de entrada `RecurringSeriesSource` (`:215-220`) nem carrega `medication_id`. Uma medicação que
   veio pelo backfill 049→064 (`20260816233000_medication_backfill.sql:14-17` **preserva**
   `recurrence_rule` na origem) é justamente uma linha com `recurrence_rule` **e** `medication_id`.
   Ela vira ocorrência virtual por dia na agenda (`AgendaGrid.tsx:312-330`), herda `is_quick` e
   `icon_key: 'pill'` pelo spread `...origin`, e o dedupe da virtual
   (`t.recurrence_origin_id === origin.id`) nunca casa com as doses reais, que nascem com
   `recurrence_origin_id: null`. Resultado: dose real + ocorrência virtual = **duas bolinhas de
   comprimido idênticas no mesmo dia**. Este é o candidato que melhor explica a imagem.
2. **`updateMedication` não reconcilia doses já materializadas (duplicação de *linha*).**
   `src/api/health/medications.ts:108-127` é um `UPDATE` seco na linha de `medication`. Mudar
   `times` (ex. 08:00 → 09:00), `interval_days`, `started_on` ou `ended_on` deixa todas as doses
   antigas de pé e a próxima `fetchTasks` materializa um conjunto novo no horário novo — duas linhas
   reais por dia, para sempre. (Lembrando que `times` com dois horários são duas doses por dia **por
   projeto**, `src/types/tasks.ts:137-140` — pode ser que não haja bug nenhum e sim configuração.)
3. **Corrida entre `fetchTasks` concorrentes.** `fetchTasks` é uma leitura que escreve: um
   `select *` seguido de até três passes de `insert`, com dedupe **só em memória** e **nenhuma
   constraint de unicidade no banco** (os índices `task_recurrence_origin_idx` e
   `task_medication_due_idx` são não-únicos; a única unique index do módulo é
   `task_time_entry_one_running_idx`). Seis telas chamam `fetchTasks()`; `TaskList.tsx` monta
   `AgendaGrid` dentro da aba "agenda" (`TaskList.tsx:927-929`) com a aba inicial vinda de `?view=`,
   então abrir `/tasks?view=agenda` dispara **duas** `fetchTasks()` simultâneas. E o app roda em
   `<StrictMode>` (`src/main.tsx:69`), que duplica efeitos em dev. Duas leituras concorrentes leem o
   mesmo "antes", calculam o mesmo `missing` e inserem as duas — linhas duplicadas que nada limpa.

## Decisões

- **Diagnóstico antes de conserto.** As três correções abaixo são bugs reais lendo o código e valem
  por si, mas qual delas explica a tela do usuário só o dado responde. As tarefas de levantamento
  vêm primeiro e o resultado é registrado em `## Notas` — sem isso a feature pode "consertar" e o
  usuário continuar vendo duas bolinhas.
- **As queries de levantamento são só de leitura e quem roda é o usuário** (não há Supabase local;
  `supabase db push` e qualquer escrita no banco remoto precisam de confirmação — regra do projeto).
  A feature entrega o roteiro pronto pra colar.
- **Correção 1 — `computeVirtualOccurrences` passa a ignorar origens de medicação.**
  `RecurringSeriesSource` ganha `medication_id?: string | null` e o filtro ganha `!t.medication_id`,
  espelhando `materializeRecurringInstances`. É a mesma regra, escrita duas vezes hoje e só aplicada
  numa delas. Quem gera dose futura na agenda é `computeVirtualDoses` (feature `071`), que já existe
  e já deduplica por `medication_id`.
- **Correção 2 — reconciliar doses ao editar um tratamento.** `updateMedication` passa a apagar as
  doses **futuras e não concluídas** que deixaram de bater com a nova configuração, deixando a
  materialização recriar as certas. **Doses passadas e doses já concluídas nunca são tocadas** — elas
  são o histórico de adesão da `064`, e apagá-las falsificaria a métrica. A decisão de o que apagar
  fica numa função pura testável, não no meio da chamada de API.
- **Correção 3 — unicidade no banco + insert tolerante a corrida.** Duas índices únicos parciais
  novos em `task`:
  - `(medication_id, due_date, dose_time) where medication_id is not null` — é literalmente a chave
    que o `comment on column` da `064` diz ser "a chave que impede materializar a mesma dose duas
    vezes", hoje só uma convenção de aplicação;
  - `(recurrence_origin_id, due_date) where recurrence_origin_id is not null and linked_recurring_id
    is null` — uma ocorrência por (série, dia) na recorrência simples. As séries vinculadas a
    Recorrência Financeira ficam de fora porque a chave delas é `linked_installment_number`, e duas
    parcelas podem cair no mesmo `due_date`.
  Os `insert` das três materializações passam a usar `upsert` com `ignoreDuplicates` sobre esses
  índices, para que uma corrida vire no-op em vez de erro na tela.
- **A migration de unicidade precisa limpar antes de criar o índice** — se já houver duplicata no
  banco do usuário, o `create unique index` falha. A limpeza mantém, para cada chave, **a linha
  concluída** (tem `completed_at`); havendo empate, a mais antiga por `created_at`. Nunca escolher
  arbitrariamente: apagar a dose concluída e manter a pendente perderia histórico.
- **Nada de `supabase db push` nesta feature** — as migrations são escritas e validadas em Postgres
  16 descartável (mesmo harness `supabase/tests/<nome>/run.sh` das features `061`/`070`/`071`/`073`),
  e a aplicação fica como tarefa "Aguarda o usuário", na fila **depois** das migrations pendentes de
  `064`, `070` e `071`, que criam/marcam as linhas que estas tocam.
- **Fora de escopo**: apagar a série/doses (feature `075`) e qualquer mudança no desenho da bolinha
  (features `070`/`071`).

## Tarefas

- [x] Escrever em `## Notas` o roteiro de diagnóstico (SQL só de leitura) para o usuário rodar, com
      as três queries: (1) `select id, due_date, due_time, dose_time, medication_id, is_medication,
      is_quick, icon_key, recurrence_rule is not null as tem_regra, recurrence_origin_id from task
      where title ilike '%SEMTRI%' order by due_date;` (2) `select due_date, dose_time, medication_id,
      recurrence_origin_id, count(*) from task where title ilike '%SEMTRI%' group by 1,2,3,4 having
      count(*) > 1 order by 1 desc;` (3) `select id, name, times, array_length(times,1) as qtd_horarios,
      interval_days, started_on, ended_on, active from medication where name ilike '%SEMTRI%';`
- [x] Escrever no mesmo roteiro a query que diz **qual schema está de fato aplicado**
      (`select version from supabase_migrations.schema_migrations order by version desc limit 10;`)
      e a de colunas (`select column_name from information_schema.columns where table_name='task'
      and column_name in ('is_quick','medication_id','dose_time');`) — sem isso não dá pra saber se
      a `064`/`070`/`071` já estão no banco do usuário
- [x] Registrar em `## Notas` o resultado do roteiro e **qual dos três mecanismos** (ou qual
      combinação) explica a imagem, antes de escrever qualquer correção. Se nenhum explicar, parar e
      reportar em vez de seguir para as correções
- [x] Teste que reproduz o mecanismo 1, falhando hoje: em
      `src/domain/tasks/__tests__/recurrence.test.ts`, `computeVirtualOccurrences` recebendo uma
      origem com `recurrence_rule` **e** `medication_id` não deve emitir ocorrência nenhuma.
      Verificação: `npm test src/domain/tasks` (vermelho antes da correção)
- [x] Corrigir o mecanismo 1: acrescentar `medication_id?: string | null` a `RecurringSeriesSource`
      e `!t.medication_id` ao filtro de origens de `computeVirtualOccurrences`
      (`src/domain/tasks/recurrence.ts:229-254`). Verificação: o teste acima passa a verde
- [x] Conferir que `AgendaGrid.tsx:312-330` passa objetos que já carregam `medication_id` para
      `computeVirtualOccurrences` (ele passa `Task` completo, mas o tipo estreito escondia o campo) —
      ajustar a chamada/tipagem se necessário. Verificação:
      `npx tsc -p tsconfig.app.json --noEmit`
- [x] Teste de integração do mecanismo 1 no lugar onde o usuário viu:
      `src/pages/admin/tasks/__tests__/AgendaGrid.medication.test.tsx` — um tratamento cuja origem
      tem `recurrence_rule` + `medication_id` e uma dose real no dia produz **uma** bolinha naquele
      dia, não duas. Verificação: `npm test src/pages/admin/tasks`
- [x] Teste que reproduz o mecanismo 3, falhando hoje: em
      `src/api/__tests__/tasks.recurring-materialization.test.ts`, duas `fetchTasks()` em
      `Promise.all` sobre o Supabase falso inserem o mesmo conjunto duas vezes. Verificação:
      `npm test src/api`
- [x] Trocar o `.insert(newRows)` de `materializeRecurringInstances` e `materializeLinkedInstances`
      (`src/api/tasks/tasks.ts:84` e `:160`) por `upsert` com `ignoreDuplicates: true` e o
      `onConflict` do índice novo; idem no `.insert(rows)` de `materializeMedicationDoses`
      (`src/api/health/medications.ts:238`). Verificação: o teste de corrida acima passa a inserir
      um conjunto só
- [x] Corrigir `createMedicationWithDoses` (`src/api/health/medications.ts:95-106`), que hoje chama
      `materializeMedicationDoses(medication, [], userId)` com `existingDoses` fixo em `[]` — passar
      as doses já existentes (ou depender do `upsert` acima e documentar por quê). Verificação:
      teste em `src/api/__tests__/tasks.medication-materialization.test.ts`
- [x] Criar `computeStaleDoses(medication, existingDoses, today)` em
      `src/domain/health/medication.ts`: puro, devolve os ids das doses **futuras e não concluídas**
      que não batem mais com `times`/`interval_days`/`started_on`/`ended_on`. Verificação:
      `npm run build`
- [x] Testar `computeStaleDoses` em `src/domain/health/__tests__/medication.test.ts`: trocar o
      horário marca as futuras do horário velho; dose passada nunca entra; dose futura **concluída**
      nunca entra; encurtar `ended_on` marca as que caíram fora; tratamento inalterado devolve vazio;
      `dose_time` em `HH:MM:SS` compara igual a `HH:MM` (`normalizeTime`). Verificação:
      `npm test src/domain/health`
- [x] Ligar `computeStaleDoses` em `updateMedication` (`src/api/health/medications.ts:108-127`):
      depois do `UPDATE`, apagar as doses obsoletas via `deleteTasks`. O erro **sobe** (não é
      `console.error` engolido) — deixar dose fantasma é justamente o bug. Verificação: teste novo
      em `src/api/__tests__/tasks.medication-materialization.test.ts`
- [x] Cobrir o caminho de UI da reconciliação: editar o horário de um tratamento por
      `src/pages/admin/health/MedicationQuickCreateDialog.tsx` não deixa a dose do horário antigo no
      calendário. Verificação: `npm test src/pages/admin/health`
- [x] Escrever `supabase/migrations/<timestamp>_task_dedupe_doses_e_ocorrencias.sql`: primeiro o
      `delete` de duplicatas (particionando por `(medication_id, due_date, dose_time)` e por
      `(recurrence_origin_id, due_date)` com `linked_recurring_id is null`, mantendo a linha com
      `completed_at` e, no empate, a de `created_at` mais antigo), depois os dois
      `create unique index if not exists ... where ...`. **Não rodar `supabase db push`.**
- [x] Criar o harness `supabase/tests/task_dedupe_doses/run.sh` no molde de
      `supabase/tests/task_is_quick/`: Postgres 16 descartável, schema como `064`/`070`/`071` deixam,
      seed com duplicata de dose (uma concluída, uma pendente) e duplicata de ocorrência simples,
      aplicar a migration **duas vezes** (idempotência). Verificação: `bash supabase/tests/task_dedupe_doses/run.sh`
- [x] Asserções do harness: sobra uma linha por chave; **a concluída é a que sobrou**; parcelas
      vinculadas (`linked_recurring_id not null`) com duas no mesmo `due_date` **não** são apagadas
      nem barradas pelo índice; RLS de `task` e o trigger `enforce_app_access` continuam de pé; e um
      controle negativo (rodar sem a migration) faz o roteiro acusar. Verificação: o mesmo `run.sh`
- [x] `npx tsc -p tsconfig.app.json --noEmit && npm run build && npm run lint && npm test`, com a
      contagem de testes registrada em `## Notas`
- [x] Verificação do pedido literal, por teste: montar o cenário da imagem (tratamento semanal com
      origem backfilled — `recurrence_rule` + `medication_id` — doses reais até hoje e janela de mês
      aberta) e provar que cada dia tem **uma** bolinha, no passado e no futuro
- [x] **Migration aplicada pelo usuário** (2026-08-23): o usuário rodou `supabase db push` e
      confirmou que `supabase/migrations/20260820100000_task_dedupe_doses_e_ocorrencias.sql` está no
      banco remoto, depois das da `064` (`20260816230000`, `20260816233000`), `070`
      (`20260819100000`) e `071` (`20260819110000`) — a ordem do push é a dos timestamps.
      **Ressalva séria, escrita aqui porque não pode ficar só numa nota: esta migration APAGA
      LINHA, e o roteiro de conferência dela era antes × depois.** Os números "antes"
      (`select count(*) from task where medication_id is not null`, a query (2) do diagnóstico e
      `select count(*) from task_time_entry`) **não foram anotados** — o push aconteceu sem eles, e
      esta esteira nunca teve acesso ao banco remoto. Consequência que fica registrada em vez de
      escondida: **não é mais possível provar aritmeticamente que o total de doses caiu exatamente
      pelo número de duplicatas**, nem que nenhum `task_time_entry` foi levado em cascata. O que
      resta é a conferência post-hoc de `## Notas` (que detecta duplicata remanescente, sobrevivência
      do histórico e a existência dos índices únicos) mais o que já estava provado antes do push: o
      harness `supabase/tests/task_dedupe_doses/run.sh`, que prova em Postgres 16 que a linha
      **concluída** é a que sobrevive a cada chave, que parcelas vinculadas não são tocadas e que
      reaplicar é no-op. **Nenhuma das conferências pós-push foi executada nem vista passar por esta
      sessão.**

## Prompts

## Notas

### Roteiro de diagnóstico (só leitura — quem roda é o usuário)

Cole no SQL Editor do Supabase (projeto remoto). **Nenhuma destas queries escreve nada.**

```sql
-- (0) Qual schema está de fato aplicado — sem isto não dá pra saber se 064/070/071 já estão lá.
select version from supabase_migrations.schema_migrations order by version desc limit 10;

-- (0b) As colunas que as três features criaram; o que não aparecer aqui não existe no banco.
select column_name
  from information_schema.columns
 where table_name = 'task'
   and column_name in ('is_quick', 'medication_id', 'dose_time');

-- (1) Todas as linhas da série SEMTRI, como estão hoje.
select id, due_date, due_time, dose_time, medication_id, is_medication, is_quick, icon_key,
       recurrence_rule is not null as tem_regra, recurrence_origin_id
  from task
 where title ilike '%SEMTRI%'
 order by due_date;

-- (2) Duplicação de LINHA (mecanismos 2 e 3). Se vier vazio, a duplicação é só de renderização.
select due_date, dose_time, medication_id, recurrence_origin_id, count(*)
  from task
 where title ilike '%SEMTRI%'
 group by 1, 2, 3, 4
having count(*) > 1
 order by 1 desc;

-- (3) Configuração do tratamento — `qtd_horarios = 2` explicaria duas doses/dia sem bug nenhum.
select id, name, times, array_length(times, 1) as qtd_horarios, interval_days,
       started_on, ended_on, active
  from medication
 where name ilike '%SEMTRI%';
```

Leitura esperada se o mecanismo 1 (confirmado abaixo) for o culpado: **(2) volta vazia**, (3) traz
`qtd_horarios = 1`, e em (1) existe **uma** linha com `tem_regra = true` e `recurrence_origin_id`
nulo — a origem backfillada — junto de uma dose por dia com `tem_regra = false`,
`recurrence_origin_id` nulo e `medication_id` preenchido.

### Diagnóstico — é o mecanismo 1, e só ele

**Desvio do plano (registrado aqui porque não veio de pedido do usuário):** a tarefa previa esperar
o usuário rodar o roteiro acima antes de qualquer correção. O roteiro continua valendo como
confirmação (a tarefa de `supabase db push` no fim já o embute), mas ele **não foi o que fechou o
diagnóstico** — a imagem já contém a assinatura do mecanismo 1, e ela é falsificável. Bloquear a
feature esperando o SQL não traria informação nova, então o diagnóstico foi fechado pela imagem +
código e provado por teste (`AgendaGrid.medication-duplicada.test.tsx`, abaixo).

Cadeia completa, toda ela em código de hoje:

1. `20260816233000_medication_backfill.sql` **preserva** `recurrence_rule` na tarefa-origem da
   medicação da 049 e grava `medication_id` + `dose_time` nela e em todas as ocorrências antigas.
   A origem passa a ser, ao mesmo tempo, uma série recorrente **e** a dose do dia de `started_on`.
2. `20260819110000_medication_dose_quick.sql` (071) faz `update task set is_quick = true,
   icon_key = coalesce(icon_key,'pill') where medication_id is not null` — o filtro é
   `medication_id`, então a **origem** também vira pontual com ícone de comprimido.
3. `materializeRecurringInstances` (`src/api/tasks/tasks.ts:27-38`) pula essa origem
   (`!task.medication_id`), como manda o `comment on column` da 064. Mas
   `computeVirtualOccurrences` (`src/domain/tasks/recurrence.ts:229-236`) **não tem esse filtro**:
   ela só exige `recurrence_rule && !recurrence_origin_id && due_date`. A origem entra.
4. A deduplicação da virtual é `t.recurrence_origin_id === origin.id`. As doses reais nascem em
   `materializeMedicationDoses` com `recurrence_origin_id: null`
   (`src/api/health/medications.ts:228`) — **nunca casam**. Então `computeMissingOccurrences` acha
   "faltando" todo dia entre a origem e o fim da grade visível.
5. `AgendaGrid.tsx:315-329` transforma cada uma num `Task` virtual por `...origin`, herdando
   `is_quick: true` e `icon_key: 'pill'`. Elas caem em `splitAgendaItems` → `quick` →
   `QuickTaskDotRow`, do lado das doses reais.

Resultado: **dose real + ocorrência virtual = duas bolinhas de comprimido por dia**.

Três previsões que a imagem confirma, e que nenhum dos outros dois mecanismos faria:

- **Dia 17 tem uma bolinha só.** É o `due_date` da origem: `computeMissingOccurrences` começa em
  `addOccurrence(origem)`, ou seja no dia 18. E não há dose real concorrente no 17 porque a própria
  origem já é a dose daquele dia (o backfill lhe deu `dose_time`), então `computeMissingDoses` não
  materializa outra.
- **Do 18 em diante são sempre exatamente duas**, incluindo dias futuros — no passado/hoje é
  `dose real + virtual de ocorrência`; no futuro é `virtual de ocorrência + virtual de dose`
  (`computeVirtualDoses`, 071). Duas fontes independentes, uma bolinha cada.
- **A ordem dentro da fileira: a tracejada vem primeiro.** `groupCalendarItemsByDay` ordena por
  `due_time` com `localeCompare`; a virtual usa `recurrence_rule.time` (`"08:00"`, sem segundos) e a
  dose real usa o `due_time` que o Postgres devolve (`"08:00:00"`). `"08:00" < "08:00:00"`. Na
  imagem, nos dias 18 e 19, a bolinha da esquerda é a cinza e a da direita é a verde de "tomada".

Mecanismos 2 e 3 **não** explicam a imagem: os dois produziriam duplicata de **linha**, e linha
duplicada apareceria também no dia 17 e nos dias anteriores ao 17, além de não poder aparecer em
dias futuros (nada materializa depois de hoje). Continuam sendo bugs reais lendo o código — a
`Decisões` já dizia isso — e as correções 2 e 3 seguem no escopo desta feature como blindagem, mas
o que o usuário viu é o mecanismo 1.

### Estado do arquivo

~~Fica em `in-progress/` por causa da tarefa "Aguarda o usuário".~~ **Atualizado em 2026-08-23**: o
usuário rodou `supabase db push` e confirmou, então os índices únicos da correção 3 e a limpeza das
duplicatas de linha estão no banco remoto. A correção do mecanismo 1 (a que explica a imagem) já
valia antes, porque é só cliente. A feature foi para `done/`.

### PENDÊNCIA DO USUÁRIO — conferência pós-push (2026-08-23)

**Nada disto foi executado nem visto passar por esta sessão** — as consultas leem o banco remoto e
o último passo é interface; esta esteira não alcança nenhum dos dois (navegador é proibido pela
skill `next`).

**O que se perdeu, dito com todas as letras:** o roteiro original era antes × depois, e os números
"antes" não foram anotados. Como esta é a **única** migration da esteira que apaga linha, a
verificação aritmética que ela pedia (total de doses caindo exatamente pelo número de duplicatas;
`task_time_entry` intacto) **não é mais reconstituível**. As consultas abaixo são o que ainda dá
para afirmar, e elas cobrem o que importa na prática — se sobrou duplicata, se o histórico
sobreviveu e se os índices que impedem a reincidência estão de pé.

```sql
-- (1) NÃO SOBROU DUPLICATA DE DOSE. Tem de vir VAZIO.
select medication_id, due_date, dose_time, count(*)
  from public.task
 where medication_id is not null
 group by 1, 2, 3
having count(*) > 1;

-- (2) NÃO SOBROU DUPLICATA DE OCORRÊNCIA SIMPLES. Tem de vir VAZIO.
--     (parcelas de Recorrência Financeira ficam de fora de propósito — a chave delas é
--      linked_installment_number, e duas parcelas podem cair no mesmo due_date)
select recurrence_origin_id, due_date, count(*)
  from public.task
 where recurrence_origin_id is not null and linked_recurring_id is null
 group by 1, 2
having count(*) > 1;

-- (3) OS DOIS ÍNDICES ÚNICOS CHEGARAM. Tem de trazer 2 linhas.
select indexname from pg_indexes
 where schemaname = 'public' and tablename = 'task'
   and indexdef ilike '%unique%'
   and (indexdef ilike '%medication_id%' or indexdef ilike '%recurrence_origin_id%');

-- (4) O HISTÓRICO SOBREVIVEU: a regra da migration era manter a linha concluída.
--     Toda dose 'done' tem de continuar com carimbo. Tem de dar 0.
select count(*) from public.task
 where medication_id is not null and status = 'done' and completed_at is null;

-- (5) NENHUM REGISTRO DE TEMPO FICOU ÓRFÃO. Tem de dar 0.
--     (não substitui o count antes × depois, mas pega o estrago que ele pegaria)
select count(*) from public.task_time_entry e
 where not exists (select 1 from public.task t where t.id = e.task_id);
```

Na interface: abrir `/tasks` na visão de **mês** e conferir que cada dia tem **uma** bolinha de
comprimido, não duas — no passado e no futuro. É exatamente a tela da imagem que originou esta
feature, e é o veredito final. Se ainda houver duas por dia, o mecanismo 1 não era o único culpado
e vale reabrir com o roteiro de diagnóstico acima.

Se (1) ou (2) trouxer linha, **pare e investigue antes de seguir usando o app**: significa que a
limpeza não pegou tudo e os índices únicos podem estar barrando escrita nova.

### Verificação final

`npx tsc -p tsconfig.app.json --noEmit` — 0 erro. `npm run lint` — 0 erro, 78 warnings de
`react-refresh/only-export-components` (pré-existentes, os mesmos que a `073` registrou).
`npm run build` + `npm run check:bundle` — OK, teto de rota (160 KB gzip) respeitado.
`npm test` — **180 arquivos / 1799 testes / 0 falhas** (baseline antes desta feature: 179 / 1771).
`bash supabase/tests/task_dedupe_doses/run.sh` — OK, incluindo a reaplicação e o controle negativo.

Duas rodadas da suíte inteira tiveram **um** teste falhando por expiração de `findBy*` sob carga —
uma vez em `src/pages/admin/notes/__tests__/notes-navigation.test.tsx`, que passa sozinho e passou nas
rodadas seguintes. É intermitência de carga (a mesma família do erro pós-teardown conhecido em
`HealthDashboard.reminders.test.tsx`), sem relação com esta feature: nada aqui toca em notas.

### Desvios do plano

- **Diagnóstico fechado por imagem + código + teste, não pelo SQL do usuário.** Ver a seção
  "Diagnóstico" acima. O roteiro continua no arquivo e a conferência dele está embutida na tarefa
  "Aguarda o usuário".
- **`upsert` sem `onConflict`.** A tarefa pedia `upsert` com `ignoreDuplicates: true` **e** o
  `onConflict` do índice novo. Os dois índices são parciais, e `ON CONFLICT (colunas)` não infere
  índice parcial (o Postgres exige o predicado junto, que o parâmetro `on_conflict` do PostgREST não
  emite). Omitir o parâmetro faz o PostgREST gerar `ON CONFLICT DO NOTHING` sem alvo, que cobre
  qualquer constraint. Provado nos dois sentidos em `04_assert_constraints.sql` do harness: com alvo
  nomeado o Postgres devolve 42P10; sem alvo, a duplicata vira no-op e a linha nova continua entrando.
- **A escrita das materializações virou `src/api/tasks/taskRows.ts`.** `insertMaterializedTasks` e
  `deleteTaskRows` moram lá porque `tasks.ts` já importa `medications.ts`; chamar `deleteTasks` de
  dentro de `medications.ts` fecharia um ciclo de import. `deleteTasks` passou a ser um invólucro de
  `deleteTaskRows`, sem mudança de comportamento.
- **Teste da reconciliação em `health.medications.test.ts`, não em
  `tasks.medication-materialization.test.ts`.** A tarefa apontava o segundo arquivo, mas o Supabase
  falso dele só conhece `select`/`insert` em `task`; o do primeiro executa filtros de verdade e já é
  onde vivem os testes de `updateMedication`. O caminho de UI ganhou arquivo próprio
  (`src/pages/admin/health/__tests__/MedicationQuickCreateDialog.reconcile.test.tsx`), com a API
  real contra o Supabase falso.
- **`createMedicationWithDoses` continua passando `existingDoses: []`** — documentado no código em
  vez de "corrigido": o `medication.id` acabou de nascer, então a lista é vazia por construção. O
  que faltava era a prova, agora em `health.medications.test.ts` ("a carga de tarefas seguinte não
  recria as doses que a criação já materializou").

### Cada teste vermelho antes da correção (confirmado invertendo o código)

- `recurrence.test.ts` › "ignora origem de medicação" — sem `!t.medication_id` emitia 14 ocorrências
  virtuais (18/08 a 31/08) para uma origem diária.
- `AgendaGrid.medication.test.tsx` › os 4 testes da 074 — sem o filtro, 3 deles quebram (duas
  bolinhas por dia); o teste semanal do pedido literal também.
- `tasks.recurring-materialization.test.ts` › "duas fetchTasks() concorrentes" — com `.insert` puro
  a segunda chamada estourava `duplicate key value violates unique constraint`.
- `MedicationQuickCreateDialog.reconcile.test.tsx` › "as doses futuras do horário antigo somem" —
  sem `reconcileMedicationDoses` as doses das 08:00 continuavam no calendário.

### Para a feature 075 (apagar série/medicação)

Descobertas daqui que a 075 vai precisar, e que não foram implementadas nesta feature:

- **A medicação backfillada é uma quimera**: a mesma linha é origem de série (`recurrence_rule`,
  `recurrence_origin_id is null`) **e** dose (`medication_id`, `dose_time`), e a série dela tem dois
  tipos de filho — as ocorrências antigas da 049 (`recurrence_origin_id` apontando pra origem, e
  agora também com `medication_id`) e as doses novas da 064 (`recurrence_origin_id is null`, só
  `medication_id`). Um "apagar a série inteira" que olhe só `recurrence_origin_id` deixa as doses
  novas para trás; um que olhe só `medication_id` deixa para trás as ocorrências de antes do
  backfill que por acaso não tenham sido marcadas. O escopo correto é a **união** dos dois:
  `id = origem OR recurrence_origin_id = origem OR medication_id = <med>`. `resolveSeriesOriginId`
  (`src/domain/tasks/recurrence.ts`) hoje devolve a origem só pelo lado da recorrência e diz no
  comentário que doses "caem fora sozinhas" — deixou de ser verdade para as origens backfilladas.
- **Por que ele "não consegue apagar"**: `deleteTask` apaga uma linha só. Apagar a origem de uma
  medicação backfillada dispara `recurrence_origin_id ... on delete cascade` (leva as ocorrências
  antigas) e `medication_id ... on delete set null` **não** é acionado (a FK é para `medication`,
  não para `task`) — ou seja, as doses novas ficam órfãs de série e voltam a ser materializadas na
  carga seguinte, porque o tratamento em `medication` continua ativo. Apagar a tarefa sem encerrar o
  tratamento é, por construção, um apagar que não apaga. O diálogo da 075 precisa oferecer
  "encerrar o tratamento" (`deactivateMedication`) junto de "apagar as doses", senão elas voltam.
- **`computeStaleDoses` já existe** (`src/domain/health/medication.ts`) e a 075 pode reusá-la para
  "apagar só as futuras", com a mesma garantia de não tocar em passado nem em dose tomada.
