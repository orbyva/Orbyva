---
prompt: |
  - SUB-MÓDULO DE VIDA.SAÚDE
    - CONTROLAR MEDICAMENTOS
    - CONSULTAS (VIRAM EVENTOS NO CALENDÁRIO GERAL)
    - E PROGRESSO NO CUIDADO COM O PRÓPRIO CORPO
      - CONTROLE DE NOTIFICAÇÕES PARA ALIMENTAÇÃO
      - CONTROLE DE NOTIFICAÇÕES PARA INGESTÃO DE ÁGUA
      - TUDO NO FUTURO VAI DAR UMA PUSH NOTIFICATION PARA O USUÁRIO
---

# 064 — Controle de medicamentos: múltiplas doses, posologia e adesão

## Contexto
A feature 049 entregou o atalho de medicação: nome, um horário, frequência diária, materialização como tarefas recorrentes, marcação de dose tomada por `completed_at` e o helper `isDoseLate`. Isso cobre "lembrar de tomar", mas não cobre "controlar" no sentido que o prompt pede, e a limitação é estrutural: uma medicação é hoje uma tarefa recorrente com **um único** `due_time`, então "1 comprimido de manhã e 1 à noite" só existe como duas medicações desconexas, sem posologia registrada e sem como responder "tomei quantas das doses deste mês?". Esta feature promove medicação a entidade própria e resolve esses três gaps sobre a base já existente.

## Decisões
- **Medicação vira tabela `medication`; a tarefa continua sendo a dose.** A entidade guarda o tratamento (nome, dose, unidade, instruções, horários, período); cada dose continua sendo uma linha em `task`, agora ligada por `medication_id` + `dose_time`. É exatamente o padrão que `linked_recurring_id` + `linked_installment_number` já estabeleceu para transações recorrentes: entidade de domínio de um lado, tarefas materializadas do outro.
  - **Descartado — manter só a flag `is_medication`**: não há onde pendurar N horários por dia. `recurrence_rule` tem um campo `time` singular, e multiplicá-lo distorceria a recorrência para todo o resto do app, que a compartilha com tarefas comuns. O gap é de modelo, não de UI.
  - **Custo assumido**: existe dado em produção com `is_medication = true` e `recurrence_rule`, que precisa de backfill. Ele está tarefado abaixo e é a razão de esta feature ser a última do sub-módulo.
- **`is_medication` continua existindo e continua sendo a flag de renderização.** `TaskList`, `ProjectDetail` e o calendário já dependem dela; o backfill garante que toda dose ligada a uma `medication` tenha `is_medication = true`. `medication_id` é a fonte da verdade do tratamento; `is_medication` responde "esta tarefa se desenha como dose".
- **Múltiplas doses/dia via `times time[]` na `medication`.** A materialização gera uma tarefa por (data × horário). Descartada uma tabela `medication_schedule` separada: seria uma tabela só para uma lista de horários, sem atributo próprio.
- **Posologia é `dose_amount numeric` + `dose_unit text` + `instructions text`.** Quantidade e unidade separadas porque "2 comprimidos" precisa aparecer no título da dose e ser comparável; `instructions` é texto livre ("em jejum", "não tomar com leite").
- **Adesão é calculada, não armazenada**: percentual de doses concluídas e percentual tomadas no horário, sobre as doses já vencidas de um período, reusando `isDoseLate` de `src/domain/tasks/medication.ts`. Guardar o número exigiria recalcular a cada marcação e ficaria dessincronizado.
- **Estoque fica fora do escopo, e isso é uma decisão, não um adiamento com schema pronto.** Ele exige quantidade em unidades, decremento confiável a cada dose, fluxo de reposição e alerta de "acabando" — e o decremento só é confiável se a marcação de dose for fiel, que é justamente o que esta feature está construindo. Sem pedido explícito do usuário, o valor não paga o custo. Se for pedido, vira feature própria completa, com schema, API e UI juntos.
- **RLS por `user_id` na `medication`**, nas quatro operações.

### Reabertura 2026-08-18 — medicação mora em Vida > Saúde

- **O ponto de entrada de medicação sai de Produtividade > Tarefas e passa a ser Vida > Saúde.**
  Revisa a decisão da 049 ("o atalho vive só em `TaskList.tsx`"): o botão "Nova medicação" ao lado
  de "Nova tarefa" põe um assunto de saúde no meio da tela de trabalho, e desde a 060/064 existe um
  lugar próprio (`/life/health` e `/life/health/medications`) que já tem o CTA "Cadastrar
  medicação". Hoje há três entradas para o mesmo dialog e a mais visível é a errada.
- **A sidebar ganha "Saúde" dentro do grupo Vida** (`NAV_VIDA` em `src/components/app-sidebar.tsx`),
  apontando para `/life/health`. É o buraco real: a 060 declarou Saúde "um hub de primeiro nível
  dentro de Vida", mas só criou o card em `HOME_MODULES` — chegar em medicações exige passar pelo
  dashboard. `isNavItemActive` já casa `/life/health/medications` pelo prefixo, então o item fica
  ativo nas duas telas sem código extra.
- **Os dois botões de `TaskList.tsx` (cabeçalho e `EmptyState`) são removidos, não escondidos.** Um
  atalho que sobrevive "por precaução" é uma quarta entrada para manter. Quem estiver acostumado com
  ele encontra o caminho novo pela sidebar, que é justamente o que passa a existir.
- **`MedicationQuickCreateDialog.tsx` muda de pasta**, de `src/pages/admin/tasks/` para
  `src/pages/admin/health/`, junto de `MedicationList.tsx`. Move mecânico (3 importadores + o
  arquivo de teste); ele não tem mais nada a ver com o módulo de tarefas depois que a 064 o
  reescreveu para criar uma `medication`.
- **"Integrar a criação de um remédio com as tarefas" já é o modelo desta feature, e a tarefa nova é
  torná-lo visível, não reconstruí-lo.** `createMedicationWithDoses` já cria o tratamento e
  materializa as doses como linhas de `task` (`medication_id` + `dose_time`), e `fetchTasks` já as
  injeta na Lista, no Kanban e na Agenda. O que falta é o retorno na tela: ao salvar, dizer quantas
  doses foram criadas e oferecer "Ver na agenda". Sem isso o usuário cadastra um remédio e não tem
  como saber que ele virou tarefa — que é exatamente o que o pedido chama de "com as tarefas, que
  vão identificar".
- **Descartado criar uma rota nova para o cadastro** (`/life/health/medications/new`): o dialog já
  existe, funciona e é chamado de dois lugares dentro de Saúde. Trocá-lo por página é retrabalho
  sem pedido.
- **Descartado mover `is_medication`/`isDoseLate`/o dialog "Ocorrências de…"** para fora de
  `src/domain/tasks` e de `TaskList`/`ProjectDetail`: dose **é** tarefa, e essa exibição é
  comportamento de tarefa. O que muda de módulo é o cadastro do tratamento, não a dose.

## Tarefas
- [x] Criar a migration `supabase/migrations/20260816230000_medication.sql`: tabela `public.medication` (`id uuid pk default gen_random_uuid()`, `user_id uuid not null references auth.users(id) on delete cascade`, `name text not null`, `dose_amount numeric`, `dose_unit text`, `instructions text`, `times time[] not null`, `interval_days int not null default 1`, `started_on date not null`, `ended_on date`, `active boolean not null default true`, `created_at timestamptz not null default now()`), com `enable row level security` e as quatro políticas por `user_id = auth.uid()`; e, em `public.task`, as colunas `medication_id uuid references public.medication(id) on delete set null` e `dose_time time`, com índice em (`medication_id`, `due_date`)
- [x] Criar a migration `supabase/migrations/20260816233000_medication_backfill.sql`: para cada task origem com `is_medication = true` e `recurrence_rule not null`, inserir uma `medication` (`name` = `title`, `times` = array com o `time` da regra, `interval_days` = `interval` da regra, `started_on` = `due_date` da origem, `user_id` = o da task) e gravar `medication_id` e `dose_time` na origem e em todas as ocorrências com aquele `recurrence_origin_id`. A migration deve ser idempotente (não recriar `medication` para task que já tenha `medication_id`)
- [x] Adicionar a `src/types/health.ts` o tipo `Medication` e, em `src/types/tasks.ts`, os campos `medication_id?: string | null` e `dose_time?: string | null` em `Task`
- [x] Criar `src/domain/health/medication.ts` (puro): `computeMissingDoses(medication, existingDoses, today)` — dado o tratamento e as doses já materializadas, retorna os pares (data, horário) faltantes até hoje, respeitando `interval_days`, `started_on`, `ended_on` e `active`; e `formatDoseTitle(medication)` — "Losartana 2 comprimidos"
- [x] Criar `src/domain/health/adherence.ts` (puro): `computeAdherence(doses, now)` retornando `{ total, taken, onTime, late, missed, takenRate, onTimeRate }`, considerando apenas doses já vencidas e reusando `isDoseLate` de `src/domain/tasks/medication.ts`
- [x] Criar testes Vitest para os dois módulos acima: `computeMissingDoses` com múltiplos horários por dia, com `interval_days > 1`, com `ended_on` no passado e com tratamento inativo; `computeAdherence` com dose no horário, atrasada, não tomada e ainda não vencida
- [x] Criar `src/api/health/medications.ts` com `createMedication`, `updateMedication`, `deactivateMedication`, `fetchMedications` e `materializeMedicationDoses(medication)` — este último inserindo em `task` as doses de `computeMissingDoses` com `is_medication: true`, `medication_id`, `dose_time`, `due_date`, `due_time` e título de `formatDoseTitle`
- [x] Chamar `materializeMedicationDoses` no mesmo ponto do fluxo em que `materializeRecurringInstances` e `materializeLinkedInstances` já são chamadas em `src/api/tasks/tasks.ts`, para que as doses apareçam no calendário sem tela nova
- [x] Ajustar `materializeRecurringInstances` para **não** materializar séries cuja origem tenha `medication_id` preenchido, evitando que os dois caminhos gerem doses em duplicidade
- [x] Reescrever `src/pages/admin/tasks/MedicationQuickCreateDialog.tsx` para criar uma `medication`: nome, quantidade + unidade, instruções, lista de horários (adicionar/remover, mínimo um), "a cada N dias", data de início e término opcional
- [x] Criar `src/pages/admin/health/MedicationList.tsx`: tratamentos ativos com posologia, horários, adesão dos últimos 30 dias e ações de editar e encerrar; `EmptyState` quando não houver nenhum; `ConfirmDeleteDialog` ao encerrar
- [x] Registrar a rota `/life/health/medications` em `src/routes.tsx` e ligar a seção "Medicações" do `HealthDashboard.tsx` (da 060) a ela, mostrando no dashboard a próxima dose e a adesão do período
- [x] `npm run build` — passa; `npm run check:bundle` também (nenhum chunk estourou orçamento)
- [x] `npm run lint` — 0 erros (13 warnings de `react-refresh/only-export-components`, todos pré-existentes)
- [x] `npm run test` — 1309 passando, 2 falhando. As 2 são as pré-existentes e alheias de `src/lib/__tests__/currency.test.ts` (mesma falha já registrada nas Notas da 049), confirmadas rodando o arquivo isolado. A cobertura foi bem além do previsto na tarefa: além dos dois módulos puros, `src/api/__tests__/health.medications.test.ts` (CRUD, encerrar sem apagar, migration ausente), `src/api/__tests__/tasks.medication-materialization.test.ts` (doses por (data × horário) e **ausência de dupla materialização**), `src/api/__tests__/health.test.ts` (adesão do resumo), `MedicationQuickCreateDialog.test.tsx`, `MedicationList.test.tsx`, `HealthDashboard.medications.test.tsx` e `health-navigation.test.tsx` (rota nova)
- [x] Verificação do fluxo novo — substituída por cobertura automatizada, porque a skill `next` proíbe Chrome como rede de segurança (mesmo caminho da última tarefa da 049). Cada item da verificação manual tem um artefato:
  - *dois horários → duas doses por dia*: `tasks.medication-materialization.test.ts` → "gera duas doses por dia quando o tratamento tem dois horários" (assert nas 4 linhas realmente inseridas, `2026-08-15 08:00` … `2026-08-16 20:00`) + `medication.test.ts` → "gera uma dose por (data × horário)"
  - *`interval_days = 2` → espaçamento*: `tasks.medication-materialization.test.ts` → "respeita interval_days" (`12`, `14`, `16`, não os dias intermediários)
  - *dose no horário vs. atrasada > 60 min → adesão reflete as duas*: `adherence.test.ts` (4 cenários isolados) + `MedicationList.test.tsx` → "adesão dos últimos 30 dias sai das doses" (a tela mostra "Adesão 30 dias: 67% (2 de 3) · 33% no horário")
  - *encerrar para de gerar doses sem apagar histórico*: `health.medications.test.ts` → "encerra sem apagar" (`active` false, `ended_on` hoje, zero deletes, `completed_at` da dose antiga intacto) + `tasks.medication-materialization.test.ts` → "tratamento encerrado não gera dose nova"
- [x] Verificação de RLS — substituída pelo harness `supabase/tests/medication/` (Postgres 16 descartável em Docker, `bash supabase/tests/medication/run.sh`), que roda as assertivas **como `authenticated`** com `auth.uid()` setado: o dono vê só os próprios tratamentos, `update`/`delete` alheios alcançam 0 linhas, `insert` com `user_id` de outro é barrado pelo `with check`, e um controle negativo confirma que os zeros vieram da policy (como superusuário as linhas aparecem). Mais forte que o SQL editor: os 11 controles negativos provam que as assertivas acusam sabotagem, inclusive uma policy `using (true)`
- [x] **Migrations aplicadas no banco remoto** (2026-08-18): o usuário rodou `supabase db push` e `npx supabase migration list` mostra `20260816230000_medication` e `20260816233000_medication_backfill` com `local` == `remote` — as duas últimas da fila, aplicadas na ordem dos timestamps. A tabela `medication`, as colunas `task.medication_id`/`task.dose_time` e o backfill existem no banco real. Verificação: a saída do `migration list` (leitura — esta sessão nunca roda `db push`); o comportamento do backfill, que é o ponto de risco desta feature, já estava provado em Postgres 16 por `bash supabase/tests/medication/run.sh`, que **aplica o backfill duas vezes** e exige as mesmas contagens absolutas, com dois controles negativos dedicados à idempotência (o 10 cria uma duplicata à mão e exige que as assertivas acusem; o 11 remove o guard `medication_id is null` e exige que a insert duplique). A ausência de dupla materialização no app está em `tasks.medication-materialization.test.ts`, com controle negativo manual registrado nas Notas. A conferência do resultado do backfill **no dado real** continua sendo passo do usuário, e mudou de forma agora que o push já aconteceu — o roteiro pós-fato está nas Notas.

### Reabertura 2026-08-18 — medicação mora em Vida > Saúde

- [ ] `src/components/app-sidebar.tsx`: acrescentar `{ title: "Saúde", url: "/life/health" }` a
      `NAV_VIDA.items`, na posição correspondente à do card em `HOME_MODULES` (logo depois de
      "Hábitos", que é a ordem que `health-navigation.test.tsx` já assere). Verificação:
      `npm run build && npm run lint`.
- [ ] Teste de navegação em `src/pages/admin/life/__tests__/health-navigation.test.tsx` (arquivo já
      existe): o link "Saúde" está no grupo Vida da sidebar com `href="/life/health"`, resolve em
      `matchRoutes(appRoutes, "/life/health")`, e fica ativo também em
      `/life/health/medications` (prefixo). Copiar o formato de `shopping-navigation.test.tsx`.
      Verificação: `npm test`.
- [ ] Mover `src/pages/admin/tasks/MedicationQuickCreateDialog.tsx` para
      `src/pages/admin/health/MedicationQuickCreateDialog.tsx` (`git mv`) e atualizar os
      importadores (`HealthDashboard.tsx`, `MedicationList.tsx` e, por ora, `TaskList.tsx`) e o
      caminho do teste `MedicationQuickCreateDialog.test.tsx`. Verificação: `npm run build && npm run lint`;
      os 11 testes do dialog passam no caminho novo.
- [ ] Remover o atalho "Nova medicação" de `src/pages/admin/tasks/TaskList.tsx`: os dois botões
      (cabeçalho e ação do `EmptyState`), o `useState` `medicationDialogOpen`, o render do dialog e
      os imports que ficarem órfãos (inclusive o ícone `Pill`). Verificação:
      `npm run build && npm run lint` — sem import não usado.
- [ ] Atualizar `src/pages/admin/tasks/__tests__/TaskList.medication.test.tsx`: os 3 casos do
      `describe("TaskList — atalho Nova medicação")` deixam de existir e viram o oposto — a tela de
      Tarefas **não** oferece mais o atalho (nem no cabeçalho, nem no `EmptyState`). Os arquivos
      `TaskList.medication-occurrences.test.tsx` e `ProjectDetail.medication-occurrences.test.tsx`
      não mudam: a exibição de dose continua sendo comportamento de tarefa. Verificação: `npm test`.
- [ ] `src/pages/admin/health/MedicationList.tsx`: garantir que a tela é autossuficiente como
      destino do fluxo — botão "Nova medicação" no cabeçalho **e** no `EmptyState`, abrindo o
      dialog movido. Verificação: casos novos em `MedicationList.test.tsx` (botão no cabeçalho abre
      o dialog; lista vazia oferece a mesma ação).
- [ ] Retorno visível da integração com tarefas: `MedicationQuickCreateDialog`, ao salvar com
      sucesso, mostra um `toast` dizendo quantas doses foram criadas e, quando houver ao menos uma,
      uma ação "Ver na agenda" que navega para `/tasks/agenda`. O número vem do retorno de
      `createMedicationWithDoses` (ajustar a função para devolver as doses inseridas, se ainda não
      devolver). Verificação: teste no dialog conferindo a mensagem com a contagem certa para um
      tratamento de 2 horários, e a ausência da ação quando nenhuma dose venceu ainda.
- [ ] `src/pages/admin/health/MedicationList.tsx`: em cada tratamento, link "Ver doses na agenda"
      apontando para `/tasks/agenda`, e a próxima dose exibida com data e horário — é o vínculo
      remédio→tarefa aparecendo onde o remédio é gerenciado. Verificação: casos novos em
      `MedicationList.test.tsx`.
- [ ] Passada final: `npm run build`, `npm run lint` e a suíte completa
      (`npx vitest run --testTimeout=30000 --hookTimeout=30000 --maxWorkers=4`). Registrar em Notas
      qualquer teste alheio ajustado pelo move de arquivo.
- [ ] Checagem de satisfação do bullet de 2026-08-18, sem navegador: "adicione na seção vida->saúde"
      → `health-navigation.test.tsx` (item na sidebar, rota resolve, ativo no filho) + a ausência do
      atalho em `TaskList.medication.test.tsx`; "integração da criação de um remédio para tomar, com
      as tarefas, que vão identificar" → o toast com a contagem de doses e a ação "Ver na agenda"
      (`MedicationQuickCreateDialog.test.tsx`) somados aos testes já existentes de materialização
      (`tasks.medication-materialization.test.ts`), que provam que a dose nasce como `task`. Faltou
      algo? Abrir tarefa nova aqui em vez de fechar.

## Prompts
- 2026-08-16 — "- SUB-MÓDULO DE VIDA.SAÚDE
  - CONTROLAR MEDICAMENTOS
  - CONSULTAS (VIRAM EVENTOS NO CALENDÁRIO GERAL)
  - E PROGRESSO NO CUIDADO COM O PRÓPRIO CORPO
    - CONTROLE DE NOTIFICAÇÕES PARA ALIMENTAÇÃO
    - CONTROLE DE NOTIFICAÇÕES PARA INGESTÃO DE ÁGUA
    - TUDO NO FUTURO VAI DAR UMA PUSH NOTIFICATION PARA O USUÁRIO"

- 2026-08-18 — "- ficou meio ruim essa posição da medicação, por isso adicione na seção vida->saúde, de modo que já permite a integração da criação de um remédio apra tomar, com as tarefas, que vão identificar"

## Notas
- **Reaberta em 2026-08-18** (de `done/` para `in-progress/`, conforme o item 2 do `CLAUDE.md`): o
  usuário reclamou da posição do atalho de medicação. Encaixou aqui, e não em `NNN` novo nem na
  049, porque esta feature é a dona atual de todo o código envolvido — ela reescreveu o
  `MedicationQuickCreateDialog`, criou `MedicationList`, a rota `/life/health/medications` e a
  ligação com o `HealthDashboard`. A 049 continua em `done/` e intocada (mesmo critério que as
  Notas dela já registram): o que muda agora é onde o cadastro vive, não o que a 049 entregou.
  A parte "integração ... com as tarefas" não é código novo de modelo — `medication_id` +
  `dose_time` + `materializeAllMedicationDoses` já fazem isso desde esta feature; o que faltava era
  o usuário **ver** que aconteceu, e é isso que as tarefas novas entregam.
- **Recorte do prompt-mãe que esta feature cumpre**: o item "CONTROLAR MEDICAMENTOS", na parte que a 049 não cobre — múltiplas doses por dia, posologia e adesão histórica.
- **Relação com a 049**: a 049 permanece em `done/` e não é editada. Ela entregou o que se propôs (o atalho de criação e a marcação de dose); esta feature é a continuação, e por isso o trabalho novo vive aqui, não como reabertura daquele arquivo. O que se reusa dela sem reescrever: a flag `is_medication`, o helper `isDoseLate` e a exibição de "Tomado às HH:mm" no histórico de ocorrências.
- **Depende da 060** (`HealthDashboard`, `src/api/health.ts`, `src/types/health.ts`). Independente de 061, 062 e 063 — mas é a **última** do sub-módulo na ordem de implementação, porque é a única com backfill de dados em produção e convém rodá-la com o resto do sub-módulo já estável.
- **Ponto de maior risco: dupla materialização.** Enquanto `medication_id` e `recurrence_rule` coexistirem numa mesma origem, os dois caminhos podem gerar doses. A tarefa que exclui séries com `medication_id` de `materializeRecurringInstances` é o que impede isso, e a verificação manual do backfill existe justamente para pegar duplicata.
- **Timestamps das migrations mudaram de `20260816120500`/`20260816120600` para `20260816230000`/`20260816233000`** (desvio do plano, decisão técnica). Motivo: migrations rodam em ordem de nome, e `wipe_own_data` é **redefinida por inteiro** a cada migration que acrescenta uma tabela à lista. A última a fazê-lo foi a 063 (`20260816210000_health_metric.sql`). Se a 064 rodasse em `1205xx`, ela seria sobrescrita por `130000` (shopping), `160000` (notas) e `210000` (health_metric), e `medication` sumiria do wipe de conta — dado de saúde ficando para trás ao apagar a conta. Os novos timestamps são posteriores a todos os já usados (`130000`…`220000`) e continuam únicos.
- **Backfill: `recurrence_rule` da origem é preservada, não zerada.** Zerar seria a forma "óbvia" de matar a dupla materialização, mas é destrutiva e irreversível — perde o registro do que a série era. Quem impede a duplicidade é o filtro por `medication_id` em `materializeRecurringInstances`, que é reversível e testado.
- **Backfill carrega `until` da regra para `ended_on`** (não previsto na tarefa): sem isso, um antibiótico com fim programado viraria tratamento contínuo no backfill — perda de informação num passo irreversível.
- **`src/api/health.ts` virou `src/api/health/index.ts`** (desvio do plano, decisão técnica): a tarefa pede `src/api/health/medications.ts`, e um arquivo `health.ts` convivendo com um diretório `health/` resolve por precedência de extensão — funciona, mas é ambíguo pra quem lê. O move é mecânico e nenhum import muda (`@/api/health` continua resolvendo).
- **`materializeMedicationDoses` recebe `(medication, existingDoses, userId, today)`**, não só `medication` como na tarefa: passar as doses já lidas de fora é o que permite chamá-la em laço dentro de `fetchTasks` sem uma query por tratamento — e é a mesma forma de `materializeRecurringInstances`/`materializeLinkedInstances`.
- **Prova da ausência de dupla materialização** (`src/api/__tests__/tasks.medication-materialization.test.ts`): uma origem exatamente como o backfill a deixa (com `recurrence_rule` **e** `medication_id`) gera 2 doses, uma por data, sem `recurrence_origin_id`. Verificado por controle negativo manual: trocando o filtro `!task.medication_id` por `true` em `materializeRecurringInstances`, o teste falha com 4 linhas para 2 datas — cada dia duplicado. Os testes da 061 (`tasks.recurring-materialization.test.ts`) seguem passando, então séries comuns e medicações da 049 ainda não migradas não mudaram de comportamento.
- **`HealthSummary` ganhou `medicationAdherence` e `activeMedicationCount`** (não previsto na tarefa): a seção do dashboard pede a adesão do período, e calculá-la na tela exigiria uma segunda chamada de API depois do `loadHealthSummary` — o resumo já é o ponto único de carga do dashboard.
- **A seção "Próxima dose" do dashboard virou "Medicações"**, como a tarefa pede, com "Ver medicações" apontando para `/life/health/medications`. A próxima dose continua ali dentro, agora com a linha de adesão. Adesão só aparece com `total > 0`: exibir "0%" para quem acabou de cadastrar um tratamento seria uma acusação falsa.
- **Harness de banco: `supabase/tests/medication/`** (mesmo padrão de `health_metric_reminder`, Postgres 16 descartável em Docker, sem tocar no remoto). Prova, entre outras coisas: o backfill aplicado **duas vezes** produz exatamente 3 tratamentos e 5 doses ligadas; as medicações da 049 migram com horário, cadência, `started_on` e `ended_on` corretos; o histórico (`completed_at`) sobrevive; tarefa recorrente comum e medicação avulsa não são tocadas; RLS por `user_id` rodando como `authenticated`; e `wipe_own_data` leva `medication` **depois** de `task` (ordem de FK). Dois controles negativos são específicos da idempotência: o 10 cria uma duplicata à mão e exige que as assertivas acusem, e o 11 reexecuta a insert do backfill **sem** o guard `medication_id is null` e exige que ela duplique — provando que é o guard, e não o conjunto de dados, que segura a segunda execução.
- `supabase db push` aplica no banco remoto (não há Supabase local): confirmar com o usuário antes de rodar, e com atenção redobrada aqui, porque a segunda migration escreve em dados existentes.
- O lembrete de medicação em si é configurado pela 063, via `reminder_preference` com `entity_type = 'medication'`.
- **Checagem de satisfação do `prompt:` (recorte "CONTROLAR MEDICAMENTOS"), com artefato por item** — nenhum via navegador:
  - *múltiplas doses por dia*: `medication` tem `times time[]` (`02_assert_schema.sql` confere o tipo e que dois horários entram); `computeMissingDoses` gera um par por (data × horário) (`medication.test.ts`); a materialização insere as 4 linhas esperadas (`tasks.medication-materialization.test.ts`); o dialog envia `times: ["08:00", "20:00"]` (`MedicationQuickCreateDialog.test.tsx`).
  - *posologia*: `dose_amount`/`dose_unit`/`instructions` no schema (`02_assert_schema.sql`), `formatDoseTitle` → "Losartana 2 comprimidos" (`medication.test.ts`), título gravado na dose (`tasks.medication-materialization.test.ts`), exibição em `MedicationList.test.tsx`.
  - *adesão histórica*: `computeAdherence` cobre no horário/atrasada/perdida/não vencida (`adherence.test.ts`); a tela mostra "Adesão 30 dias: 67% (2 de 3) · 33% no horário" (`MedicationList.test.tsx` e `HealthDashboard.medications.test.tsx`); o resumo a calcula das doses da janela (`health.test.ts`).
  - *sem regressão na 049*: `tasks.recurring-materialization.test.ts` segue verde, e uma medicação da 049 ainda não migrada continua materializando pela recorrência (`tasks.medication-materialization.test.ts`).
  - *suíte completa*: 1309 passando, 2 falhando — as duas pré-existentes de `src/lib/__tests__/currency.test.ts`.
- ~~**A feature fica em `in-progress/`**, não em `done/`~~: sobrava a tarefa "Aguarda o usuário", porque as duas migrations só valem depois do `supabase db push` no banco remoto — e aqui o push tem um passo a mais que as outras features da esteira, a conferência do resultado do backfill. **Resolvido em 2026-08-18** — ver os itens abaixo.
- **Fechamento (2026-08-18) — as duas migrations foram aplicadas pelo usuário e a feature foi para
  `done/`.** A confirmação veio de `npx supabase migration list` (`20260816230000` e
  `20260816233000` com `local` == `remote`), **não** de teste manual: a skill `next` proíbe
  navegador e esta sessão nunca roda `supabase db push` (é passo do usuário, aplica em produção).
- **Passo remanescente, do usuário, fora do código — e ele mudou de forma, porque o push já
  aconteceu.** O roteiro original começava com duas contagens **antes** do push, que não existem
  mais. O equivalente pós-fato, todo no SQL editor e sem depender do "antes":
  1. `select user_id, name, count(*) from medication group by 1,2 having count(*) > 1` → **zero
     linhas**. É o sinal de backfill duplicado, e vale sozinho: se a migration tivesse rodado duas
     vezes sem o guard, apareceria aqui.
  2. `select count(*) from medication` = `select count(distinct medication_id) from task where
     medication_id is not null and recurrence_origin_id is null` — cada origem virou exatamente uma
     linha de tratamento.
  3. `select count(*) from task where is_medication and medication_id is null and recurrence_rule
     is not null and recurrence_origin_id is null` → **zero**: nenhuma medicação-origem da 049
     ficou de fora do backfill.
  4. `select name, times, interval_days, started_on, ended_on from medication` — horário, cadência
     e período de cada tratamento migrado, inclusive o `until` da regra virando `ended_on`.
  5. No app: o dialog "Ocorrências de..." de uma medicação antiga ainda mostra "Tomado às HH:mm"
     (`completed_at` intocado); `/tasks` não mostra dose duplicada no mesmo dia/horário; e
     `/life/health/medications` lista os tratamentos migrados com posologia.
  Não virou tarefa em aberto porque não há código a escrever: o item 1 (idempotência), o 3
  (cobertura do backfill), o 4 (horário/cadência/período) e o `completed_at` intocado já são
  assertivas de `bash supabase/tests/medication/run.sh` com o backfill aplicado duas vezes, e a
  ausência de dose duplicada no calendário é o que
  `tasks.medication-materialization.test.ts` prova, com controle negativo.
- **Checagem de satisfação reconfirmada no fechamento (2026-08-18):** a rastreabilidade acima do
  recorte "CONTROLAR MEDICAMENTOS" (múltiplas doses/dia, posologia, adesão histórica, sem regressão
  na 049) continua válida, com todos os artefatos citados verdes. Suíte completa reexecutada com
  `npx vitest run --testTimeout=30000 --hookTimeout=30000 --maxWorkers=4` (o `npm test` puro é
  instável nesta máquina, com dezenas de timeouts de 5 s em arquivos alheios): **161 arquivos,
  1427 testes, 0 falhando** — as 2 falhas de `currency.test.ts` citadas acima foram corrigidas no
  commit `eb47042`.
