---
prompt: |
  - o medicamento está meio bugado, está marcado como encerrado, sendo que não coloquei limite
---

# 096 — Tratamento marcado como encerrado sem o usuário ter posto limite

## Contexto

Bug em dado de produção, relatado em 2026-08-23, no mesmo dia em que o usuário rodou
`supabase db push` com todas as migrations pendentes das features `064`, `070`, `071` e `074` — e no
mesmo dia em que a `075` (encerrar tratamento pelo dialog de excluir dose) foi para o código. Um
tratamento aparece como **Encerrado** em `/life/health/medications` sem que o usuário tenha definido
término.

O que a leitura do código já estabelece, e que muda o alvo da investigação:

- **O badge "Encerrado" é uma leitura pura de `medication.active`.** Único lugar que o renderiza:
  `src/pages/admin/health/MedicationList.tsx:218-222`, `{medication.active ? null : <Badge
  variant="secondary">Encerrado</Badge>}`. Não existe função de status derivado, não existe predicado
  sobre `ended_on`. **Não é bug de exibição do badge** — se ele apareceu, `active` está `false` no
  banco.
- **Nenhuma migration escreve `active = false` nem `ended_on` em linha existente.** O único SQL que
  toca essas colunas é o `insert` do backfill `20260816233000_medication_backfill.sql`, que grava
  `active` com o literal `true`. `20260819110000_medication_dose_quick.sql` só escreve
  `task.is_quick`/`task.icon_key`. `20260820100000_task_dedupe_doses_e_ocorrencias.sql` só apaga
  linhas de `task`. `enforce_app_access` devolve `new` sem alterar. **O `db push` não pode ter
  encerrado o tratamento.**
- **O único escritor de `active = false` no sistema inteiro é `deactivateMedication`**
  (`src/api/health/medications.ts:197-217`), e ele faz uma segunda coisa que ninguém pediu:
  `ended_on: current?.ended_on ?? formatLocalIsoDate(new Date())`. Ou seja, **encerrar fabrica uma
  data de término**. É literalmente a frase do usuário ("não coloquei limite") produzida pelo
  código. O comentário da própria coluna diz outra coisa (`src/types/health.ts:63`: "Fim programado
  (`YYYY-MM-DD`); `null` = tratamento contínuo"), então a escrita viola o contrato documentado da
  coluna.
- **O backfill pode ter criado o tratamento já com `ended_on`**: ele copia
  `nullif(rule ->> 'until', '')::date` da `recurrence_rule` da tarefa-origem da 049. Isso não acende
  o badge (`active` continua `true`), mas imprime "Término: dd/mm/aaaa" e faz o tratamento parar de
  gerar dose — o mesmo "meio bugado" pela outra porta.
- **Encerrar é porta de mão única.** `MedicationList.tsx:268` só mostra a ação "Encerrar" quando
  `active` é `true`, e `MedicationQuickCreateDialog` nunca manda `active` no payload
  (`:109-118`). Não existe "Reativar" em lugar nenhum do app. Um encerramento acidental hoje é
  irreversível pela interface.

Feature nova em vez de tarefas na `064`/`075` porque o trabalho começa por um **diagnóstico contra o
banco de produção** que atravessa as duas (a `064` é o modelo e o backfill; a `075` é o botão que
encerra) e termina possivelmente numa migration de reparo que não pertence a nenhuma das duas.

## Decisões

- **Diagnóstico antes de qualquer correção de dado, com hipóteses falsificáveis e queries de
  leitura.** O roteiro fica em `## Notas` e **quem roda é o usuário** — esta esteira nunca teve
  acesso ao banco remoto. A `074` já pagou o preço de pular esse passo: a nota dela registra que os
  números de "antes" nunca foram tirados e por isso o efeito do `delete` não é mais demonstrável.
  Não repetir.
- **As correções de código que não dependem do diagnóstico entram de qualquer jeito.** Três delas são
  erradas independentemente do que a query devolver: fabricar `ended_on` ao encerrar, não ter como
  reativar, e a ação destrutiva ser a primária do dialog. Amarrá-las ao resultado da query só
  atrasaria conserto certo.
- **`deactivateMedication` para de escrever `ended_on`.** `active = false` já basta para parar tudo:
  `computeMissingDoses` devolve `[]` (`src/domain/health/medication.ts:96`), `nextDoseSlot` devolve
  `null` (`:306`) e `computeStaleDoses` marca toda dose futura pendente como stale (`:181-184`).
  `ended_on` volta a significar só o que a coluna diz que significa: fim **programado pelo usuário**.
  O teste `src/api/__tests__/health.medications.test.ts:283-306` fixa o comportamento antigo e é
  parte da mudança, não um dano colateral.
  - **Descartado — coluna nova `stopped_on`** para guardar "quando eu parei". Ninguém pediu, e a
    informação já é recuperável: `select max(due_date) from task where medication_id = ...` dá o
    último dia em que o tratamento gerou dose. Schema novo para um dado derivável não paga.
- **Encerrar passa a ser reversível: `reactivateMedication(id)`.** Grava `active = true` e **limpa
  `ended_on` quando ele está no passado**, mantendo-o quando está no futuro (fim programado que
  ainda não chegou continua valendo). Sem limpar o `ended_on` passado, reativar não geraria dose
  nenhuma — `computeMissingDoses` colapsa a janela em `ended_on` (`medication.ts:105-107`) — e o
  usuário veria o botão "funcionar" sem nada acontecer, que é pior que não ter botão.
- **As doses voltam sozinhas depois de reativar, e isso precisa estar dito na confirmação.**
  `materializeAllMedicationDoses` recalcula desde `started_on` na próxima `fetchTasks`. O que **não**
  volta é dose já concluída que tenha sido apagada com "incluir as doses já tomadas" marcado — a
  adesão daquele período fica perdida. O diálogo de reativar diz isso em uma linha.
- **"Uso contínuo" vira estado afirmativo no formulário.** Hoje "sem limite" é o campo `Término`
  vazio (`MedicationQuickCreateDialog.tsx:273-285`) — não há nada na tela que confirme ao usuário
  que o tratamento é contínuo, e é exatamente essa ausência que deixa o modelo mental dele divergir
  do banco sem aviso. Passa a ser uma escolha explícita entre "Uso contínuo" e "Termina em
  <data>", com "Uso contínuo" pré-selecionado quando `ended_on` é nulo. O que vai para o banco
  continua sendo `ended_on: null` — é mudança de interface, não de schema.
- **No dialog de excluir dose, a ação destrutiva deixa de ser a primária.**
  `TaskDeleteDialog.tsx:161-170` põe "Encerrar o tratamento e apagar as doses futuras" como primeiro
  botão, largura total e vermelho, enquanto "Apagar só esta dose" é o terceiro, em contorno. A
  ordem passa a ser: "Apagar só esta dose" (primária) → "Apagar todas as doses deste tratamento" →
  "Encerrar o tratamento e apagar as doses futuras" (última, ainda em vermelho, porque é destrutiva
  mesmo). A hierarquia de hoje é a explicação mais provável de um encerramento não intencional, e
  inverter a ordem custa nada. O texto dos botões não muda.
- **A lista de tratamentos passa a dizer que um tratamento encerrado pode voltar**, com o botão
  "Reativar" no lugar de "Encerrar". O badge "Encerrado" continua igual — ele está certo; o que
  faltava era a saída.
- **Reparo de dado é tarefa separada da correção de código e é decidido pelo diagnóstico**:
  - Se o estrago for **um tratamento** (o esperado): o reparo é clicar em "Reativar" e, se houver
    `ended_on` indevido, limpar o campo Término e salvar. Sem migration. Escrever uma migration com
    um uuid chumbado para reparar uma linha é pior que a UI: não é reversível, não é testável contra
    o dado real e some do histórico do usuário.
  - Se o diagnóstico mostrar estrago **amplo** (vários tratamentos com `ended_on` vindo do `until`
    do backfill, ou vários `active = false` inesperados): aí sim migration de reparo, **dirigida por
    lista explícita de ids confirmados pelo usuário**, validada em Postgres 16 descartável antes de
    qualquer `push`. Um `update` cego por padrão de dado apagaria também os términos que o usuário
    de fato programou.
  - Em qualquer dos dois casos, **esta esteira não roda `supabase db push`** — a tarefa fica
    bloqueada aguardando o usuário, como manda o `CLAUDE.md`.
- **O horizonte de materialização entra no escopo como bug próprio.** `computeMissingDoses`
  (`src/domain/health/medication.ts:113-128`) limita o laço por **número de iterações**
  (`MAX_DAYS = 400`), mas avança o cursor toda iteração, inclusive nas datas cujas doses já existem.
  O alcance máximo do gerador é `started_on + 399 × interval_days`, **para sempre** — um tratamento
  diário começado há mais de 400 dias nunca mais materializa dose. E o comentário em `:38-43` afirma
  o contrário ("o que sobrar entra na carga seguinte"), então quem ler o código é ativamente
  enganado. Não acende o badge, mas produz exatamente a sensação de "medicamento meio bugado":
  Agenda desenhando dose virtual pontilhada que nunca vira real (`computeVirtualDoses` calcula a
  próxima por salto aritmético, `:253-262`). Entra aqui porque foi achado no diagnóstico deste bug e
  porque é barato consertar.
- **Fora de escopo**: tabela de auditoria de quem/quando encerrou (não pedido, e o `max(due_date)`
  das doses já responde na prática); notificação de tratamento perto do fim; e qualquer mudança no
  cálculo de adesão.

## Tarefas

- [x] Escrever em `## Notas` deste arquivo o **roteiro de diagnóstico** (só `select`, nada escreve),
      com as quatro consultas e o que cada resultado confirma ou refuta: (Q1) inventário
      `id, name, active, started_on, ended_on, interval_days, created_at` + contagem de doses totais,
      futuras pendentes e `max(due_date)` por tratamento; (Q2) discriminante H1×H4 — para o
      tratamento encerrado, `count(*)` de doses com `due_date >= current_date` e
      `completed_at is null` (0 ⇒ veio de `endMedicationAndDeleteFutureDoses`, >0 ⇒ veio do botão
      "Encerrar" da lista); (Q3) H2 — `join` de `medication` com a tarefa-origem
      (`recurrence_rule is not null and recurrence_origin_id is null`) comparando `m.ended_on` com
      `t.recurrence_rule ->> 'until'`; (Q4) H3 — `current_date - started_on` contra
      `400 * interval_days` e o `max(due_date)` real. Verificação: leitura + a tarefa de prova abaixo
- [x] Provar que as quatro consultas **discriminam** (não é query que sempre passa): estender o
      harness `supabase/tests/medication/` com um roteiro que semeia os quatro cenários (encerrado
      com futuras apagadas, encerrado com futuras vivas, `ended_on` igual ao `until` da origem,
      tratamento antigo além do alcance do gerador) e afirma que cada consulta acusa **só** o
      cenário dela — no molde dos controles negativos que o `run.sh` de lá já usa. Verificação:
      `bash supabase/tests/medication/run.sh`
- [ ] **AGUARDA O USUÁRIO — rodar o roteiro de diagnóstico** no SQL Editor do Supabase e colar o
      resultado em `## Notas` → "Resultado do diagnóstico". As quatro consultas estão prontas e
      coláveis em `## Notas` → "Roteiro de diagnóstico", cada uma com a tabela de leitura do que
      confirma e do que refuta. **Só `select`, nada escreve.** Nada de reparo de dado acontece
      antes disso. Verificação: os quatro resultados registrados no arquivo, com a hipótese
      confirmada escrita por extenso
- [x] `src/api/health/medications.ts`: `deactivateMedication` para de escrever `ended_on` — o
      `update` passa a levar só `active: false`, e o `select` prévio de `ended_on` (que só existia
      para o `??`) sai junto. Atualizar o docblock da função, que descreve o comportamento antigo.
      Verificação: `npm run build && npm run lint`
- [x] Reescrever `src/api/__tests__/health.medications.test.ts:283-306` ("encerra sem apagar"): a
      afirmação `ended_on = hoje` vira **`ended_on` não é enviado no payload**, e um caso novo prova
      que um tratamento com `ended_on` programado pelo usuário mantém a data ao ser encerrado.
      Verificação: `npm test src/api`
- [x] `src/api/health/medications.ts`: `reactivateMedication(id)` — lê `ended_on`, grava
      `active: true` e `ended_on: null` **só quando a data está no passado** (comparação contra
      `formatLocalIsoDate(new Date())`), filtrando por `user_id` nas duas consultas. ~~Exportar no
      barrel `src/api/health/index.ts`~~ — `index.ts` não é barrel; ver `## Notas`.
      Verificação: `npm run build`
- [x] Testes de `reactivateMedication` em `src/api/__tests__/health.medications.test.ts` (Supabase
      falso): `ended_on` no passado é limpo; `ended_on` no futuro é preservado; `ended_on` nulo
      permanece nulo; o `update` filtra por `id` **e** `user_id`; erro de leitura não chega a
      escrever. Verificação: `npm test src/api`
- [x] `src/pages/admin/health/MedicationList.tsx`: quando `active === false`, no lugar de nenhuma
      ação aparece **"Reativar"** com `ConfirmDeleteDialog` (mesmo componente das outras
      confirmações da tela), cujo texto diz em uma linha que as doses do período voltam a ser
      geradas e que doses já apagadas com "incluir as doses já tomadas" não voltam. Estado de
      carregamento por linha, no molde do `endingId` que já existe. Verificação:
      `npm run build && npm run lint`
- [x] Estender `src/pages/admin/health/__tests__/MedicationList.test.tsx`: tratamento inativo mostra
      "Reativar" e não mostra "Encerrar"; confirmar chama `reactivateMedication` com o id certo e
      recarrega a lista; erro na chamada mostra toast e **não** remove o badge "Encerrado"; o
      tratamento ativo continua mostrando "Encerrar" e não "Reativar". Verificação:
      `npm test src/pages/admin/health`
- [x] `src/pages/admin/health/MedicationQuickCreateDialog.tsx`: o campo `Término` vira escolha
      explícita entre **"Uso contínuo"** (padrão quando `medication?.ended_on` é nulo) e **"Termina
      em"** com o `<input type="date">` habilitado só nessa opção. Trocar para "Uso contínuo" limpa
      a data. O payload continua `ended_on: endedOn || null`. Verificação:
      `npm run build && npm run lint`
- [x] Estados e bordas do campo novo: escolher "Termina em" sem preencher a data **não** salva
      (mensagem `role="alert"` no campo, sem `alert()`); data de término anterior a `started_on` é
      barrada com mensagem própria; editar um tratamento que já tem `ended_on` abre em "Termina em"
      com a data preenchida. Verificação: `npm run build && npm run lint`
- [x] Estender `src/pages/admin/health/__tests__/MedicationQuickCreateDialog.test.tsx`: criar com
      "Uso contínuo" manda `ended_on: null`; criar com "Termina em" manda a data; alternar de
      "Termina em" para "Uso contínuo" limpa a data no payload; término antes do início não chama a
      API e mostra o erro. Verificação: `npm test src/pages/admin/health`
- [x] `src/pages/admin/tasks/TaskDeleteDialog.tsx` (variante `isDose`, `:132-190`): inverter a ordem
      dos três `AlertDialogAction` — "Apagar só esta dose" passa a primeira e recebe o estilo
      primário; "Apagar todas as doses deste tratamento" fica no meio; "Encerrar o tratamento e
      apagar as doses futuras" vai para o fim, mantendo o vermelho `bg-destructive`. Rótulos
      inalterados. Verificação: `npm run build && npm run lint`
- [x] Teste do dialog em `src/pages/admin/tasks/__tests__/` (estender o arquivo que já cobre
      `TaskDeleteDialog`; se não houver, criar `TaskDeleteDialog.dose-order.test.tsx`): na variante
      de dose, a **ordem** dos botões no DOM é a nova e o primeiro é "Apagar só esta dose"; clicar
      nele chama `onConfirm` e **não** `onConfirmScoped`; clicar no de encerrar chama
      `onConfirmScoped({ mode: "end-treatment" })`; o aviso de que a dose volta enquanto o
      tratamento estiver ativo continua visível. Verificação: `npm test src/pages/admin/tasks`
- [x] `src/domain/health/medication.ts`: corrigir o horizonte de `computeMissingDoses` — o laço passa
      a ser limitado **por data** (parar quando `date > limit`) com o cursor começando no primeiro
      dia da cadência que ainda interessa, calculado por salto aritmético a partir de `started_on`
      como `computeVirtualDoses` já faz (`:253-262`), mantendo `MAX_DAYS` só como trava de segurança
      contra laço infinito. Corrigir o comentário `:38-43`, que hoje descreve comportamento que o
      código não tem. Verificação: `npm run build`
- [x] Testar o horizonte em `src/domain/health/__tests__/medication.test.ts`: tratamento diário
      começado há 500 dias gera a dose de **hoje** (regressão do bug); tratamento com
      `interval_days = 3` começado há 2 anos gera a dose do dia certo da cadência e não o de véspera;
      tratamento com todas as doses já materializadas devolve lista vazia sem estourar; a trava de
      segurança não é atingida em nenhum dos casos. Verificação: `npm test src/domain/health`
- [ ] **CONDICIONAL — só se o diagnóstico apontar estrago amplo.** Escrever
      `supabase/migrations/<timestamp>_medication_repair_encerramento.sql` com a lista **explícita**
      de ids confirmados pelo usuário: `update public.medication set active = true, ended_on = null
      where id in (...)` (e/ou só `ended_on = null`, conforme a hipótese confirmada), com `comment`
      no topo dizendo qual query gerou a lista e em que data. Timestamp único — conferir
      `ls supabase/migrations/` antes de nomear. **Não rodar `supabase db push`.** Verificação:
      leitura + a validação em Postgres abaixo
- [ ] **CONDICIONAL — validar a migration de reparo** em Postgres 16 descartável, no molde de
      `supabase/tests/medication/run.sh`: semear tratamentos dentro e fora da lista de ids e afirmar
      que só os listados mudam, que reaplicar é no-op, que um tratamento com término **legitimamente
      programado** e fora da lista sai intacto, e que RLS continua de pé. Verificação:
      `bash supabase/tests/medication_repair/run.sh`
- [ ] **BLOQUEADA — reparo do dado em produção.** Caminho A (esperado): o usuário abre
      `/life/health/medications` e clica em **"Reativar"** no tratamento afetado — o "Término"
      fabricado é limpo pela própria ação, porque `reactivateMedication` apaga `ended_on` quando
      ele é igual ou anterior a hoje. Só sobra passo manual se o Q3 apontar um `ended_on` no
      **futuro** herdado do `until` do backfill (H2): aí é "Editar" → "Uso contínuo" → "Salvar".
      Caminho B (estrago amplo): o usuário roda `supabase db push` com a migration de reparo.
      Nos dois casos, conferir depois: (1) o badge "Encerrado" sumiu; (2)
      `select count(*) from task where medication_id = '<id>' and due_date = current_date` devolve
      uma linha por horário do tratamento; (3) a linha "Próxima dose" voltou a aparecer no card.
      Registrar o resultado em `## Notas`
- [x] `npm run build && npm run lint && npm test && npm run check:bundle` limpos, com a contagem de
      testes registrada aqui — **218 arquivos / 2299 testes / 0 falhas** (base era 2270: +29 novos,
      nenhuma regressão), lint com 0 erros, `Bundle budget OK`. Reexecutar se a migration
      condicional acima chegar a existir

## Prompts

## Notas

### Estado (2026-08-23) — código pronto, dado esperando o usuário

As correções de código estão todas dentro e verificadas. O que falta é **só** o que precisa do
banco de produção, que esta esteira não acessa: rodar o roteiro de diagnóstico e reparar a linha.

| Requisito do `prompt:` | Artefato que prova | Onde |
|---|---|---|
| Parar de marcar como encerrado sem o usuário pôr limite | `deactivateMedication` não envia `ended_on`, afirmado sobre o **payload exato** e não sobre a linha | `health.medications.test.ts` → "encerra sem apagar e sem inventar término: só active vai no payload" |
| — o término programado pelo usuário continua valendo | Tratamento com `ended_on` mantém a data ao ser encerrado | idem → "tratamento com término programado pelo usuário mantém a data ao ser encerrado" |
| Desfazer o encerramento que já aconteceu | `reactivateMedication` + botão "Reativar" na lista, com a confirmação dizendo o que volta e o que não volta | `health.medications.test.ts` (7 casos) e `MedicationList.test.tsx` → "reativar confirma, chama reactivateMedication…" |
| Não repetir o encerramento acidental | Ordem dos botões do dialog de dose invertida e **presa** por teste de ordem no DOM + classe do botão | `TaskDeleteDialog.test.tsx` → "a ordem cresce em alcance: a destrutiva é a última, não a primeira" |
| "Não coloquei limite" virar estado visível | "Uso contínuo" pré-selecionado, com validação própria do "Termina em" | `MedicationQuickCreateDialog.test.tsx` (8 casos novos) |
| Tratamento "meio bugado" que para de gerar dose | Horizonte de `computeMissingDoses` ancorado no fim; 500 dias de tratamento voltam a gerar a dose de hoje | `medication.test.ts` → "tratamento diário começado há 500 dias ainda gera a dose de HOJE" |
| Descobrir **qual** hipótese causou o estrago | Roteiro Q1–Q4 pronto, com a prova de que discrimina H1–H4 | `supabase/tests/medication/06_assert_diagnostico.sql` |

**O que falta, e só o usuário pode fazer:** rodar as quatro consultas no SQL Editor e colar o
resultado aqui. Sem isso não dá para saber se o reparo é um clique em "Reativar" (o esperado) ou
uma migration — e reparar dado de produção no chute é o que a decisão desta feature proíbe.

Suíte completa nesta rodada: **218 arquivos / 2299 testes / 0 falhas** (base 2270, +29),
`npm run lint` com 0 erros, `npm run build` e `npm run check:bundle` limpos.

### Reverificação (2026-08-31) — nada regrediu, o bloqueio continua sendo só o dado

Nova passada da esteira sobre este arquivo. Não havia tarefa de código pendente: as quatro `- [ ]`
que sobram são todas de banco de produção (uma aguardando o usuário, duas condicionais ao
resultado dela, uma bloqueada no reparo). Nenhuma linha de código foi alterada nesta passada.

O que foi reconferido, porque o branch andou bastante (features de produtividade) desde 2026-08-23:

- As cinco mudanças de código da feature continuam no lugar: `deactivateMedication` manda só
  `{ active: false }` (`medications.ts:212-217`), `reactivateMedication` existe com a limpeza
  condicional de `ended_on` (`:241-263`), "Reativar" está na lista (`MedicationList.tsx:313-322`),
  "Uso contínuo"/"Termina em" no formulário (`MedicationQuickCreateDialog.tsx:344-356`) e a ordem
  invertida no dialog de dose (`TaskDeleteDialog.tsx:178-185`), com o `firstStep`/`totalSteps` do
  horizonte em `medication.ts:138-147`.
- Testes dos cinco arquivos da feature: **120 testes / 0 falhas**
  (`health.medications.test.ts`, `medication.test.ts`, `MedicationList.test.tsx`,
  `MedicationQuickCreateDialog.test.tsx`, `TaskDeleteDialog.test.tsx`).
- `bash supabase/tests/medication/run.sh` verde de ponta a ponta em Postgres 16 descartável:
  `OK Q1 … OK Q2 … OK Q3 … OK Q4`, os 5 controles negativos do diagnóstico e os 11 do backfill,
  mais as assertivas de RLS. A prova de que o roteiro discrimina H1–H4 continua de pé.
- Nenhuma migration nova da 096 foi escrita (a condicional depende do diagnóstico). As pendentes no
  repositório seguem sendo `20260823100000`, `20260823110000` e `20260823120000`, de outras features.

Também foi checado se a esteira teria como rodar o diagnóstico sozinha, para não deixar a feature
parada por uma premissa velha: **não teria**. O `.env` só tem `VITE_SUPABASE_ANON_KEY` (sem
`service_role`) e o `supabase/.temp/pooler-url` não carrega senha. Sem credencial de leitura do
banco, e sendo o roteiro um conjunto de agregações/`join` que o PostgREST não expressa, o passo
continua sendo do usuário no SQL Editor, como a decisão desta feature já previa.

### Confirmação independente do diagnóstico do refino (2026-08-23)

Antes de construir em cima, cada afirmação do `## Contexto` foi reconferida no código. Todas se
sustentam:

- Badge só lê `active` — `MedicationList.tsx:220-222`. Não há status derivado de `ended_on` em
  lugar nenhum.
- Escritores de `medication` no app inteiro: `.from("medication")` aparece **só** em
  `src/api/health/medications.ts` (linhas 43, 71, 150, 167, 201, 209). Nenhuma Edge Function em
  `supabase/functions/` menciona `medication`. Dos dois `update`, o de `updateMedication` (:150)
  levaria `active` se o chamador mandasse — e o único chamador,
  `MedicationQuickCreateDialog.tsx:121`, monta um payload literal que não tem o campo. Sobra
  `deactivateMedication` (:209) como único escritor de `active = false`.
- Nenhuma migration escreve `active`/`ended_on` em linha existente: `grep -riE "update
  +(public\.)?medication" supabase/migrations/` não devolve nada, e o único `insert` que grava as
  colunas é o backfill (`20260816233000:53`), com o literal `true` para `active`.
- `medication` **não tem `updated_at`** (`20260816230000:20-36`) — não existe carimbo de quando a
  linha virou. O que sobra como marca temporal é o próprio `ended_on`: como
  `deactivateMedication` grava `formatLocalIsoDate(new Date())` quando ele é nulo, `ended_on`
  acaba sendo **a data do dia em que o tratamento foi encerrado**. É o que o Q2 usa de desempate.
- Escopo real de `end-treatment`: `resolveDeleteScope` devolve `onlyFuture: true` +
  `includeCompleted: false` (`taskDelete.ts:124-138`) e `taskRows.ts:115` traduz `onlyFuture` em
  `gte("due_date", hoje)`. Ou seja, apaga toda dose **pendente de hoje em diante, inclusive a de
  hoje**, e preserva as já tomadas. É essa assimetria que o Q2 explora.
- `computeMissingDoses` visita as datas `started_on + k × interval_days` para `k = 0..399`
  (`medication.ts:117-128`) — o cursor avança em **toda** iteração, inclusive nas datas cuja dose
  já existe. Alcance máximo `started_on + 399 × interval_days`, para sempre. O comentário de
  `:37-43` ("o que sobrar entra na carga seguinte, porque as doses já criadas saem de
  `existingDoses`") descreve um comportamento que o código não tem.

Divergência achada no plano: a tarefa de `reactivateMedication` manda "exportar no barrel
`src/api/health/index.ts`". Esse arquivo **não é um barrel** — não tem `export * from
"./medications"`, é um módulo próprio (`loadHealthSummary`, `fetchHealthMetrics`, …), e todos os
consumidores já importam de `@/api/health/medications` direto. Reexportar ali criaria um segundo
caminho para a mesma função sem ninguém pedindo. A função é exportada de `medications.ts`, como as
outras.

### Sobre a H1: se ela se confirmar, o bug é nosso — e a hierarquia já era defeito de qualquer jeito

Dois fatos, sem suavizar:

1. **O botão que a H1 acusa entrou no código no mesmo dia do relato.** `git log` do
   `TaskDeleteDialog.tsx`: o commit `9d08971` (2026-08-23, +174 linhas) é o que trouxe a variante
   de dose com `end-treatment`. O usuário relatou o tratamento encerrado em 2026-08-23. Não é
   prova — é a coincidência que o Q2 existe para resolver —, mas é a hipótese mais bem posicionada
   das quatro.
2. **A hierarquia estava errada independentemente do que o Q2 devolver.** A feature 075 pôs
   "Encerrar o tratamento e apagar as doses futuras" como **primeiro** botão, largura total e
   vermelho, com "Apagar só esta dose" em terceiro e em contorno. Vestir de recomendada a ação de
   maior alcance e, na época, **irreversível** (não havia "Reativar" em lugar nenhum do app) é um
   defeito de design nosso, não um erro do usuário. Foi corrigido aqui e preso por teste de ordem.

Se o Q2 confirmar H1, isso é uma **regressão introduzida pela 075** e deve ser registrado como tal
na `## Notas` da 075 também, não só aqui.

### Roteiro de diagnóstico — rodar no SQL Editor do Supabase

**Só `select`. Nada aqui escreve.** Rodar na ordem, colar cada resultado abaixo. Q1 dá o
inventário e diz **quais** tratamentos investigar; Q2–Q4 são os discriminantes das hipóteses.

**As quatro hipóteses:**

| | Hipótese | Acende o badge "Encerrado"? | Assinatura no dado |
|---|---|---|---|
| **H1** | Encerramento acidental pelo `TaskDeleteDialog` da 075 — o botão vermelho, primário e de largura total "Encerrar o tratamento e apagar as doses futuras". Chama `endMedicationAndDeleteFutureDoses`: `deactivateMedication` **+** `delete` das doses pendentes de hoje em diante. | Sim | `active = false` **e** nenhuma dose pendente com `due_date >= current_date` |
| **H2** | `ended_on` herdado do `until` da `recurrence_rule` da tarefa-origem da 049, pelo backfill `20260816233000`. | **Não** (`active` continua `true`) | `m.ended_on = (origem.recurrence_rule ->> 'until')::date` |
| **H3** | Horizonte do gerador: `computeMissingDoses` nunca passa de `started_on + 399 × interval_days`. O tratamento continua ativo e simplesmente para de materializar dose. | **Não** | `current_date - started_on > 399 × interval_days` |
| **H4** | Encerramento pelo botão "Encerrar" da própria lista de tratamentos — `deactivateMedication` sozinho, sem apagar dose nenhuma. | Sim | `active = false` **e** dose pendente com `due_date >= current_date` ainda de pé |

H1 e H4 explicam o badge; H2 e H3 explicam "parou de gerar dose" / "apareceu um Término que eu não
pus" sem badge. Não são exclusivas: um mesmo tratamento pode ter H2 (término herdado) **e** H4
(encerrado depois).

#### Q1 — inventário (roda sempre, primeiro)

```sql
-- Q1 — todos os tratamentos + o que cada um materializou.
select
  m.id,
  m.name,
  m.active,
  m.started_on,
  m.ended_on,
  m.interval_days,
  m.times,
  m.created_at,
  count(t.id)                                                        as doses_total,
  count(t.id) filter (
    where t.due_date >= current_date and t.completed_at is null
  )                                                                  as pendentes_hoje_ou_depois,
  max(t.due_date)                                                    as ultima_dose
from public.medication m
left join public.task t on t.medication_id = m.id
group by m.id
order by m.active, m.created_at;
```

**O que ler:** a linha com `active = false` é a do bug relatado — anote o `id` dela para os Q2–Q4.
Se `ended_on` for exatamente a data do dia do encerramento, é `deactivateMedication` que a
fabricou (H1 ou H4). Se `ultima_dose` for muito anterior a `current_date` num tratamento com
`active = true`, olhe o Q4 (H3).

#### Q2 — discriminante H1 × H4

```sql
-- Q2 — para cada tratamento encerrado: o `delete` de "end-treatment" passou por aqui?
with alvo as (
  select m.* from public.medication m where m.active = false
)
select
  a.id,
  a.name,
  a.ended_on,
  coalesce(array_length(a.times, 1), 0)                              as horarios_por_dia,
  (select count(*) from public.task t
     where t.medication_id = a.id
       and t.due_date >= current_date
       and t.completed_at is null)                                   as pendentes_hoje_ou_depois,
  (select count(*) from public.task t
     where t.medication_id = a.id
       and t.due_date >= current_date)                               as doses_hoje_ou_depois,
  (select max(t.due_date) from public.task t
     where t.medication_id = a.id)                                   as ultimo_dia,
  (select count(*) from public.task t
     where t.medication_id = a.id
       and t.due_date = (select max(t2.due_date) from public.task t2
                          where t2.medication_id = a.id))            as doses_no_ultimo_dia
from alvo a;
```

**O que ler, nesta ordem:**

1. `pendentes_hoje_ou_depois > 0` ⇒ **H4 confirmada, H1 refutada.** O `delete` de `end-treatment`
   não passou por aqui: ele apagaria exatamente essas linhas. Foi o botão "Encerrar" da lista.
2. `pendentes_hoje_ou_depois = 0` **e** `doses_no_ultimo_dia < horarios_por_dia` ⇒ **H1
   confirmada.** Um dia que perdeu parte dos horários e manteve os outros só acontece por um
   `delete` que filtra por `completed_at is null` — a materialização cria o dia inteiro ou não
   cria nada.
3. `pendentes_hoje_ou_depois = 0`, `doses_no_ultimo_dia = horarios_por_dia` **e**
   `ultimo_dia < ended_on` ⇒ **H1 provável**: no dia do encerramento havia dose a apagar (o
   tratamento é diário, ou a cadência caía nesse dia) e ela sumiu por inteiro.
4. `pendentes_hoje_ou_depois = 0`, `doses_no_ultimo_dia = horarios_por_dia` **e**
   `ultimo_dia = ended_on` com `interval_days > 1` ⇒ **H4 provável**: nada foi apagado, o
   tratamento simplesmente não tinha dose de hoje em diante porque a próxima data da cadência
   ainda não chegou quando o `active` virou.

O caso 3 e o caso 4 são os únicos em que o dado sozinho não fecha, e nos dois o desempate final é
a lembrança do usuário: "cliquei em Excluir numa dose no calendário" (H1) ou "cliquei em Encerrar
na tela de Medicações" (H4).

#### Q3 — H2 (`ended_on` veio do backfill)

```sql
-- Q3 — o `ended_on` é o `until` da recorrência-origem da 049?
select
  m.id,
  m.name,
  m.ended_on,
  t.id                                                    as origem_task_id,
  t.recurrence_rule ->> 'until'                           as until_da_origem,
  (m.ended_on is not distinct from
     nullif(t.recurrence_rule ->> 'until', '')::date)     as ended_on_veio_do_until
from public.medication m
join public.task t
  on t.medication_id = m.id
 and t.recurrence_rule is not null
 and t.recurrence_origin_id is null;
```

**O que ler:** `ended_on_veio_do_until = true` com `ended_on not null` ⇒ **H2 confirmada** para
aquele tratamento: o término foi herdado do backfill, não posto pelo usuário. Query sem nenhuma
linha ⇒ **H2 refutada de vez** — o tratamento não veio da 049, foi criado direto pela 064, e o
backfill não tem como tê-lo tocado. `ended_on_veio_do_until = false` com `ended_on not null` ⇒ o
término tem outra origem (o formulário, ou `deactivateMedication`).

#### Q4 — H3 (horizonte do gerador)

```sql
-- Q4 — o tratamento passou do alcance de `computeMissingDoses` (started_on + 399 x interval_days)?
select
  m.id,
  m.name,
  m.active,
  m.started_on,
  m.interval_days,
  (current_date - m.started_on)                                      as dias_desde_o_inicio,
  399 * m.interval_days                                              as alcance_em_dias,
  m.started_on + (399 * m.interval_days)                             as ultimo_dia_alcancavel,
  (select max(t.due_date) from public.task t
     where t.medication_id = m.id)                                   as ultima_dose_real,
  ((current_date - m.started_on) > 399 * m.interval_days)            as fora_do_alcance
from public.medication m
order by fora_do_alcance desc, m.started_on;
```

**O que ler:** `fora_do_alcance = true` ⇒ **H3 confirmada** para aquele tratamento, e
`ultima_dose_real` deve bater com `ultimo_dia_alcancavel` (ou ser anterior, se ele também tiver
`ended_on`). `fora_do_alcance = false` em todas as linhas ⇒ **H3 refutada como causa do relato**,
e o conserto do horizonte segue sendo feito assim mesmo: é bug real, só não é *este* bug.

#### Prova de que as quatro consultas discriminam

`supabase/tests/medication/06_assert_diagnostico.sql`, rodado por
`bash supabase/tests/medication/run.sh` num Postgres 16 descartável. As quatro consultas entram lá
como **views verbatim** (mesmo texto do roteiro acima) sobre quatro tratamentos semeados — um por
hipótese, com datas relativas a `current_date` para o teste não apodrecer.

O que a prova mostra, além de "a consulta roda":

- **Sensibilidade e especificidade separadas.** Cada consulta é obrigada a acusar o cenário dela
  **e** a deixar os outros três em paz. Q3 não vê os três sem tarefa-origem; Q4 não marca nenhum
  dos três dentro do alcance; Q2 não pega os dois `active = true`.
- **S1 (H1) e S2 (H4) são idênticos** — mesmo `started_on`, mesmo `ended_on`, mesmas 20 doses
  passadas — e diferem em **uma linha**: a dose pendente das 20:00 de hoje, que o `delete` de
  `end-treatment` levou em S1 e que em S2 continua de pé. O Q2 dá vereditos opostos para os dois,
  então ele discrimina por causa dessa linha, não por causa de nada do tratamento.
- **Cinco controles negativos viram o veredito.** Devolver a dose pendente a S1 tira a leitura de
  H1; apagar as de hoje de S2 tira a de H4; mexer no `until` de S3 desliga o Q3; tirar o vínculo da
  origem faz S3 sumir do Q3; aproximar o `started_on` de S4 desliga o Q4. Nenhuma das quatro é
  consulta que sempre passa.
- **O CN-2 é o mais importante**: ele prova que, no caso em que o dado não fecha, o Q2 cai na
  **leitura 3 (ambígua)** do roteiro em vez de gritar H1 com confiança falsa.
- Toda leitura de linha usa `into strict`. Sem isso, uma consulta sem resultado deixaria o record
  nulo e `null <> 0` faria a assertiva passar vazia — o modo de falhar mais provável num arquivo
  de assertivas.

Saída: `OK Q1 … OK Q2 … OK Q3 … OK Q4 … OK: 5 controles negativos viraram o veredito e o estado
real foi restaurado`, com os 11 controles negativos e as assertivas de RLS da 064 continuando a
passar no mesmo run.

#### Resultado do diagnóstico (preencher depois de rodar contra produção)

_(aguardando o usuário)_

### Desvios do plano, com o porquê

- **`reactivateMedication` limpa `ended_on` quando ele é igual a hoje, não só quando é anterior.**
  A decisão dizia "no passado" / "no futuro", e hoje não é nenhum dos dois. Mas `ended_on = hoje` é
  **exatamente** o valor que o `deactivateMedication` antigo gravava, então é o estado da linha que
  esta feature existe para consertar — e mantê-lo devolveria um tratamento que gera as doses de
  hoje e morre de novo amanhã. Isso é o mesmo "botão que parece funcionar e não faz nada" que a
  própria decisão usa como justificativa para limpar o término passado, só que com um dia de
  atraso. Coberto por um teste próprio.
- **O duplo de Supabase de `health.medications.test.ts` aplicava o `update` cedo demais.** O
  `eq()` do duplo escrevia o patch nas linhas **a cada cláusula**, em vez de depois de todos os
  filtros. Efeito: `update ... eq(id) ... eq(user_id)` já tinha escrito no tratamento de outro
  dono antes de o segundo filtro rodar, e qualquer assertiva de escopo por `user_id` neste arquivo
  passava sem significar nada. Corrigido para aplicar em `then`/`single`/`maybeSingle` — semântica
  real de `update ... where`. Achado ao escrever o teste de escopo de `reactivateMedication`, que
  falhava contra código correto.
- **`store.updates` novo no duplo.** Sem ele não dá para afirmar "`ended_on` não é enviado no
  payload": gravar `ended_on: null` sobre uma coluna que já era nula deixa a linha idêntica a não
  gravar nada, e a diferença entre as duas coisas é o bug inteiro.
- **`ConfirmDeleteDialog` ganhou `destructive` e `loadingLabel` (opcionais, default = hoje).** O
  plano mandava reusar o componente para o "Reativar", e ele chumbava `bg-destructive` no botão de
  confirmar e "Excluindo..." no estado de carregamento. Vestir de vermelho a ação que **desfaz** o
  estrago, e ainda escrever "Excluindo..." enquanto ela roda, seria a mesma inversão de hierarquia
  que esta feature está consertando no `TaskDeleteDialog` — e o rótulo seria factualmente falso.
  Os 27 chamadores existentes não mudam: os dois parâmetros têm default no comportamento antigo.
- **"Duração" ficou um radio group, não um `Select`.** O plano não escolhia o widget. A skill
  `form-design` do repo é explícita — "2 opções binárias → toggle switch ou radio; dropdown é o
  padrão mais abusado" — e aqui a regra bate com o objetivo: o ponto da mudança é o usuário **ver**
  que o tratamento é contínuo, e um radio group mostra a opção escolhida e a alternativa ao mesmo
  tempo. Efeito colateral bom: o teste existente `getByRole("combobox")` (singular, para a
  Frequência) continua valendo, o que um segundo `Select` teria quebrado.
- **`Início` e `Duração` saíram do `grid-cols-2`.** Mesma skill, regra 3 (coluna única; duas
  colunas só para pares inseparáveis). "Termina em" virou um controle de duas partes (rádio +
  data) e não cabia mais meia-linha ao lado de "Início". As duas datas ganharam
  `sm:max-w-[14rem]`, pela regra de largura proporcional ao dado.
- **Validação no `blur` e no save, não a cada tecla** (regra 8 da mesma skill): uma data pela
  metade não é erro do usuário, é uma data pela metade.

### O horizonte de `computeMissingDoses` — o que mudou de verdade

O plano dizia "limitar o laço por data, com o cursor começando no primeiro dia da cadência que
ainda interessa". Na prática isso quer dizer **ancorar a janela no fim, não no começo**:

- Antes: visitava as datas `started_on + k × interval_days` para `k = 0..399`, sempre, avançando o
  cursor mesmo nas datas cuja dose já existia. Alcance máximo `started_on + 399 × interval_days`,
  **para sempre**.
- Agora: `totalSteps = floor(dias(start → limit) / interval)` e a varredura começa em
  `firstStep = max(0, totalSteps - MAX_DAYS + 1)`, parando quando `date > limit`. A janela sempre
  **termina** em `limit` (hoje, ou o fim programado) e tem no máximo `MAX_DAYS` datas.

Consequência assumida e escrita no código: um tratamento mais velho que 400 passos de cadência não
materializa retroativamente o próprio começo. É a troca certa — são doses de mais de um ano atrás,
que ninguém vai marcar como tomadas e que não entram na adesão (janela de 30 dias) — e o que não
podia faltar, a dose de **hoje**, agora sai sempre.

`MAX_DAYS` virou trava contra laço infinito de verdade: o laço tem `MAX_DAYS + 1` iterações
disponíveis e o `firstStep` garante que a saída seja sempre o `date > limit`.

**Prova de que os testes novos são regressão, não decoração:** com `firstStep` forçado a `0` (o
comportamento antigo), 3 dos casos novos falham — inclusive "tratamento diário começado há 500 dias
ainda gera a dose de HOJE". Arquivo restaurado byte a byte depois da checagem (`diff` limpo).
