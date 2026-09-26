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
- [x] **Migrations aplicadas pelo usuário** (2026-08-23): o usuário rodou `supabase db push` e confirmou que `supabase/migrations/20260816230000_medication.sql` e `supabase/migrations/20260816233000_medication_backfill.sql` estão no banco remoto. Esta é a **única** migration desta esteira que escreve em dado existente, e é justamente por isso que o que segue precisa ficar escrito com precisão:
  - **As contagens "antes do push" não foram tiradas, e agora não podem mais ser** — o push já aconteceu, e esta esteira nunca teve acesso ao banco remoto. A conferência original (comparar antes × depois) **não é mais executável como estava escrita**. Ela foi reescrita em `## Notas` numa versão *post-hoc*, que detecta backfill duplicado ou incompleto sem depender de nenhum número anotado previamente.
  - **Nenhuma das 7 conferências foi executada nem vista passar por esta sessão.** As de SQL leem o banco remoto; as 3 últimas são teste de fumaça na interface. As duas coisas estão fora do alcance desta esteira (navegador é proibido pela skill `next`).
  - O que **está** provado, e é o que justifica fechar a feature: o harness `supabase/tests/medication/` roda as duas migrations em Postgres 16 descartável, aplica o backfill **duas vezes** e prova que ele é idempotente (3 tratamentos, 5 doses ligadas, nem uma a mais), que `completed_at` sobrevive, e — nos controles negativos 10 e 11 — que é o guard `medication_id is null` que segura a segunda execução, não o acaso do conjunto de dados

## Prompts
- 2026-08-16 — "- SUB-MÓDULO DE VIDA.SAÚDE
  - CONTROLAR MEDICAMENTOS
  - CONSULTAS (VIRAM EVENTOS NO CALENDÁRIO GERAL)
  - E PROGRESSO NO CUIDADO COM O PRÓPRIO CORPO
    - CONTROLE DE NOTIFICAÇÕES PARA ALIMENTAÇÃO
    - CONTROLE DE NOTIFICAÇÕES PARA INGESTÃO DE ÁGUA
    - TUDO NO FUTURO VAI DAR UMA PUSH NOTIFICATION PARA O USUÁRIO"

## Notas
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
- ~~**A feature fica em `in-progress/`**, não em `done/`: sobra a tarefa "Aguarda o usuário".~~
  **Superado em 2026-08-23**: o usuário rodou o push e confirmou. A feature foi para `done/`; a
  conferência do backfill, que ninguém desta esteira consegue rodar, está logo abaixo.
- **PENDÊNCIA DO USUÁRIO — conferência do backfill, versão post-hoc (2026-08-23).** O roteiro
  original mandava anotar dois `count(*)` **antes** do push e comparar depois. Isso não aconteceu:
  o push foi rodado sem os números de partida, e esta esteira nunca teve acesso ao banco remoto.
  Em vez de fingir que a comparação passou, aqui vai a versão que **funciona sem o "antes"** — cada
  consulta tem um resultado esperado absoluto, não relativo. **Nenhuma delas foi executada por esta
  sessão.**

  ```sql
  -- (1) BACKFILL DUPLICADO? Tem de vir VAZIO.
  --     Mesma pessoa com duas medicações de mesmo nome = a migration rodou duas vezes sem o guard.
  select user_id, name, count(*)
    from public.medication
   group by 1, 2
  having count(*) > 1;

  -- (2) BACKFILL INCOMPLETO? Tem de dar 0.
  --     Toda medicação-origem da 049 (is_medication + recurrence_rule, sem origem própria)
  --     precisa ter ganhado medication_id.
  select count(*) from public.task
   where is_medication
     and recurrence_rule is not null
     and recurrence_origin_id is null
     and medication_id is null;

  -- (3) UMA medicação por origem — os dois números têm de ser IGUAIS.
  select count(*) from public.medication;
  select count(distinct medication_id) from public.task
   where medication_id is not null
     and recurrence_rule is not null
     and recurrence_origin_id is null;

  -- (4) O BACKFILL NÃO PODE TER INSERIDO LINHA NENHUMA em task (ele só faz update).
  --     Toda dose ligada tem de ter vindo de uma medicação que existe: tem de dar 0.
  select count(*) from public.task t
   where t.medication_id is not null
     and not exists (select 1 from public.medication m where m.id = t.medication_id);

  -- (5) O HISTÓRICO SOBREVIVEU: doses concluídas continuam com completed_at.
  --     Tem de dar 0 (nenhuma dose 'done' sem carimbo).
  select count(*) from public.task
   where medication_id is not null and status = 'done' and completed_at is null;

  -- (6) Conferência de olho: cada medicação antiga virou uma linha com o horário certo.
  select name, times, interval_days, started_on, ended_on, active
    from public.medication order by name;
  ```

  E os 3 passos de interface, que continuam valendo:
  1. abrir o dialog "Ocorrências de…" de uma medicação antiga e conferir que as doses já tomadas
     ainda exibem **"Tomado às HH:mm"** (o `completed_at` não pode ter sido tocado);
  2. recarregar `/tasks` e conferir no calendário que **nenhuma dose aparece duplicada** no mesmo
     dia/horário — é o que confirma no dado real o que `tasks.medication-materialization.test.ts`
     prova em teste, e o que a **074** endereça no banco com índice único;
  3. `/life/health/medications` lista os tratamentos migrados com posologia e horários.

  Se (1) trouxer linha ou (2) não der 0, **pare de usar o app e investigue antes de seguir** — é
  backfill duplicado ou incompleto, e ambos falsificam a métrica de adesão.
