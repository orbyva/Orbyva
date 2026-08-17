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
- [ ] Adicionar a `src/types/health.ts` o tipo `Medication` e, em `src/types/tasks.ts`, os campos `medication_id?: string | null` e `dose_time?: string | null` em `Task`
- [ ] Criar `src/domain/health/medication.ts` (puro): `computeMissingDoses(medication, existingDoses, today)` — dado o tratamento e as doses já materializadas, retorna os pares (data, horário) faltantes até hoje, respeitando `interval_days`, `started_on`, `ended_on` e `active`; e `formatDoseTitle(medication)` — "Losartana 2 comprimidos"
- [ ] Criar `src/domain/health/adherence.ts` (puro): `computeAdherence(doses, now)` retornando `{ total, taken, onTime, late, missed, takenRate, onTimeRate }`, considerando apenas doses já vencidas e reusando `isDoseLate` de `src/domain/tasks/medication.ts`
- [ ] Criar testes Vitest para os dois módulos acima: `computeMissingDoses` com múltiplos horários por dia, com `interval_days > 1`, com `ended_on` no passado e com tratamento inativo; `computeAdherence` com dose no horário, atrasada, não tomada e ainda não vencida
- [ ] Criar `src/api/health/medications.ts` com `createMedication`, `updateMedication`, `deactivateMedication`, `fetchMedications` e `materializeMedicationDoses(medication)` — este último inserindo em `task` as doses de `computeMissingDoses` com `is_medication: true`, `medication_id`, `dose_time`, `due_date`, `due_time` e título de `formatDoseTitle`
- [ ] Chamar `materializeMedicationDoses` no mesmo ponto do fluxo em que `materializeRecurringInstances` e `materializeLinkedInstances` já são chamadas em `src/api/tasks/tasks.ts`, para que as doses apareçam no calendário sem tela nova
- [ ] Ajustar `materializeRecurringInstances` para **não** materializar séries cuja origem tenha `medication_id` preenchido, evitando que os dois caminhos gerem doses em duplicidade
- [ ] Reescrever `src/pages/admin/tasks/MedicationQuickCreateDialog.tsx` para criar uma `medication`: nome, quantidade + unidade, instruções, lista de horários (adicionar/remover, mínimo um), "a cada N dias", data de início e término opcional
- [ ] Criar `src/pages/admin/health/MedicationList.tsx`: tratamentos ativos com posologia, horários, adesão dos últimos 30 dias e ações de editar e encerrar; `EmptyState` quando não houver nenhum; `ConfirmDeleteDialog` ao encerrar
- [ ] Registrar a rota `/life/health/medications` em `src/routes.tsx` e ligar a seção "Medicações" do `HealthDashboard.tsx` (da 060) a ela, mostrando no dashboard a próxima dose e a adesão do período
- [ ] `npm run build`
- [ ] `npm run lint`
- [ ] `npm run test` — Vitest cobre apenas `src/domain/health/medication.ts` e `adherence.ts` (funções puras, sem I/O); banco e RLS são verificados manualmente nos passos abaixo
- [ ] Verificação manual do backfill, após confirmar com o usuário e rodar `supabase db push` — **antes**, anotar quantas medicações e quantas doses existem hoje: conferir que cada medicação antiga virou uma linha em `medication` com o horário correto, que as doses antigas ganharam `medication_id`, que nenhuma dose foi duplicada e que o histórico de doses já tomadas continua exibindo "Tomado às HH:mm"
- [ ] Verificação manual do fluxo novo: criar um tratamento com dois horários (08:00 e 20:00) e conferir que aparecem duas doses por dia no calendário; criar um com `interval_days = 2` e conferir o espaçamento; marcar uma dose no horário e outra com mais de 60 minutos de atraso e conferir que a adesão reflete as duas; encerrar um tratamento e conferir que ele para de gerar doses futuras sem apagar o histórico
- [ ] Verificação manual de RLS: no SQL editor do Supabase, autenticado como um usuário, conferir que `select * from medication` só retorna as próprias linhas e que um insert com `user_id` alheio é rejeitado

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
- **Harness de banco: `supabase/tests/medication/`** (mesmo padrão de `health_metric_reminder`, Postgres 16 descartável em Docker, sem tocar no remoto). Prova, entre outras coisas: o backfill aplicado **duas vezes** produz exatamente 3 tratamentos e 5 doses ligadas; as medicações da 049 migram com horário, cadência, `started_on` e `ended_on` corretos; o histórico (`completed_at`) sobrevive; tarefa recorrente comum e medicação avulsa não são tocadas; RLS por `user_id` rodando como `authenticated`; e `wipe_own_data` leva `medication` **depois** de `task` (ordem de FK). Dois controles negativos são específicos da idempotência: o 10 cria uma duplicata à mão e exige que as assertivas acusem, e o 11 reexecuta a insert do backfill **sem** o guard `medication_id is null` e exige que ela duplique — provando que é o guard, e não o conjunto de dados, que segura a segunda execução.
- `supabase db push` aplica no banco remoto (não há Supabase local): confirmar com o usuário antes de rodar, e com atenção redobrada aqui, porque a segunda migration escreve em dados existentes.
- O lembrete de medicação em si é configurado pela 063, via `reminder_preference` com `entity_type = 'medication'`.
