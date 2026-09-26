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

# 062 — Água e alimentação como hábitos de saúde

## Contexto
O usuário quer acompanhar ingestão de água e alimentação dentro do cuidado com o corpo. O app já tem `habit` + `habit_log` com frequência (`daily`/`weekly`), meta semanal (`target_per_week`), streaks e insights de aderência (`getHabitInsights`). Isso cobre o comportamento "bebi água hoje / comi fruta hoje" sem nenhuma tabela nova. Esta feature marca hábitos como sendo de saúde, cria os atalhos de check-in no Health Dashboard e reaproveita os insights existentes.

## Decisões
- **Água e alimentação são `habit`, não tabela nova.** Ganha streak, heatmap, insights e o loop de check-in que já funcionam. A marcação de "é hábito de saúde" é uma coluna `is_health boolean` em `habit` — uma coluna numa tabela existente, não uma tabela paralela.
  - **Trade-off aceito e explícito**: `habit_log.completed` é booleano, então o registro é "bebi água hoje: sim/não", e não "bebi 1,8 L". Perde-se a quantidade. Para o pedido do usuário — controle e lembrete de hábito — a adesão diária basta.
  - **Descartado nesta feature — tabela de quantidade (litros, gramas, kcal)**: só se justifica junto com a UI que a alimenta (formulário de entrada, histórico, gráfico). Criar o schema agora, sem tela que escreva nele, deixaria uma tabela vazia em produção e funções sem uso. Se o acompanhamento quantitativo for pedido, ele vira uma feature própria e completa — schema, API e UI na mesma entrega.
- **Sem seed automático de hábitos.** O usuário cria os que quiser pelo atalho do dashboard, com sugestões pré-preenchidas ("Beber água", "Comer frutas"). Criar linhas no banco por conta própria no primeiro acesso gera duplicata para quem já tem o hábito e lixo para quem não quer.
- **Lembretes não entram aqui.** O agendamento de lembrete para água e alimentação é modelado na 063, que trata `reminder_preference` para o sub-módulo inteiro.

## Tarefas
- [x] Criar a migration `supabase/migrations/20260816200000_habit_is_health.sql` adicionando `is_health boolean not null default false` em `public.habit` (a tabela já tem RLS por `user_id`; a coluna não altera as políticas) — validada por `supabase/tests/habit_is_health/run.sh`
- [x] Adicionar `is_health?: boolean` ao tipo `Habit` em `src/types/` (arquivo onde `Habit` está declarado hoje) e propagar em `createHabit`/`updateHabit` em `src/api/habits.ts` — coberto por `src/api/__tests__/habits.is-health.test.ts` (5 testes)
- [x] Adicionar `fetchHealthHabitsToday(): Promise<{ habit: Habit; doneToday: boolean }[]>` em `src/api/health.ts`, filtrando `habit.is_health = true` e cruzando com `habit_log` da data de hoje — tipo `HealthHabitToday` em `src/types/health.ts`, coberto por `src/api/__tests__/health.habits.test.ts` (7 testes)
- [x] Adicionar a seção "Hoje" ao `HealthDashboard.tsx` (criado na 060): lista dos hábitos de saúde com contador "X de N concluídos" e um botão de check-in por hábito, que grava em `habit_log` e atualiza a lista sem recarregar a página; erros via `useToast` + `getErrorMessage` — coberto por `src/pages/admin/life/__tests__/HealthDashboard.habits.test.tsx` (6 testes: vazio, contador, marcar, desmarcar, erro com rollback, hábito comum de fora)
- [x] Adicionar ao dashboard o atalho "Novo hábito de saúde", abrindo o formulário de hábito existente já com `is_health: true` e com sugestões de nome ("Beber água", "Comer frutas", "Comer proteína") — `src/pages/admin/habits/HealthHabitQuickCreateDialog.tsx`, coberto por 3 testes novos em `HealthDashboard.habits.test.tsx` (criação com `is_health`, sugestão que só pré-preenche, CTA no header quando já há hábitos)
- [x] Em `src/pages/admin/habits/`, exibir um badge de saúde (dot na cor `--health`) nos hábitos com `is_health = true`, para que o usuário entenda por que eles aparecem nos dois lugares — `components/HealthHabitBadge.tsx` nas visões Hoje e Mês, coberto por `src/pages/admin/habits/__tests__/Habits.health-badge.test.tsx` (4 testes)
- [x] `npm run build` — ok (`tsc -b && vite build`), e `npm run check:bundle` → `Bundle budget OK`
- [x] `npm run lint` — 0 erros (13 warnings pré-existentes de `react-refresh/only-export-components`, nenhum em arquivo desta feature)
- [x] `npm run test` — cobre domínio puro: verificar que `getHabitInsights` (em `src/domain/habits/`) continua correto com hábitos de saúde no conjunto, incluindo streak e taxa do dia — 4 testes novos em `src/domain/habits/__tests__/insights.test.ts`; suíte inteira: 1185 passando, 2 falhando (as pré-existentes de `src/lib/__tests__/currency.test.ts`, alheias à feature)
- [x] Substituir a verificação manual no navegador por cobertura automatizada (a skill `next` proíbe Chrome; verificação visual vira teste): criar pelo atalho → hábito nasce com `is_health` e aparece na seção Hoje (`HealthDashboard.habits.test.tsx`), badge de saúde na página de Hábitos (`Habits.health-badge.test.tsx`), check-in que sobe/desce o contador e grava o `habit_log` do dia, hábito sem `is_health` fora do Health Dashboard (`health.habits.test.ts` + teste de UI)
- [x] **Migration aplicada no banco remoto** (2026-08-18, confirmada de novo em 2026-08-23): o usuário rodou `supabase db push` e `npx supabase migration list` mostra `20260816200000_habit_is_health` com `local` == `remote`. A coluna `habit.is_health` e o índice parcial existem no banco real, então a seção "Hoje" deixa de degradar para vazia e o atalho passa a criar o hábito **com** a flag. Verificação: a saída do `migration list` (leitura — esta sessão nunca roda `db push`); schema, RLS (inclusive `habit_log`, que não tem `user_id` próprio), idempotência e 6 controles negativos já estavam provados em Postgres 16 por `bash supabase/tests/habit_is_health/run.sh`. **A conferência no banco real e o teste de fumaça na conta NÃO foram executados por esta sessão** — estão registrados em `## Notas` como pendência explícita do usuário, com o SQL e os passos exatos.

## Prompts
- 2026-08-16 — "- SUB-MÓDULO DE VIDA.SAÚDE
  - CONTROLAR MEDICAMENTOS
  - CONSULTAS (VIRAM EVENTOS NO CALENDÁRIO GERAL)
  - E PROGRESSO NO CUIDADO COM O PRÓPRIO CORPO
    - CONTROLE DE NOTIFICAÇÕES PARA ALIMENTAÇÃO
    - CONTROLE DE NOTIFICAÇÕES PARA INGESTÃO DE ÁGUA
    - TUDO NO FUTURO VAI DAR UMA PUSH NOTIFICATION PARA O USUÁRIO"

## Notas
- **Recorte do prompt-mãe que esta feature cumpre**: a parte de *acompanhamento* de "CONTROLE ... PARA ALIMENTAÇÃO" e "CONTROLE ... PARA INGESTÃO DE ÁGUA" — o hábito e o check-in diário. A parte de *notificação* desses dois itens é cumprida pela 063 (agendamento do lembrete) e, para push de verdade, pela feature de transporte descrita nas Notas da 063.
- **Depende da 060** (Health Dashboard). Independente da 061 e da 064.
- **`nutrition_log` foi removido do escopo**, junto com `src/api/nutrition.ts` e seus tipos. Motivo registrado nas Decisões: schema sem UI que o alimente é tabela morta em produção. Não é "adiado com schema pronto" — é fora do escopo até existir a feature completa.
- Um hábito de saúde continua sendo um hábito comum: aparece na página de Hábitos, conta nos insights globais e no `HomeBundle`. `is_health` só decide se ele também aparece no Health Dashboard.
- `habit_log` é único por (`habit_id`, `date`) — o check-in do dashboard deve fazer upsert, não insert, para não conflitar com um check-in feito pela página de Hábitos no mesmo dia. **Feito reusando `toggleHabitLog` (`src/api/habits.ts`)**, que já faz update-ou-insert do log do dia e ainda sincroniza a meta vinculada; o dashboard não escreve em `habit_log` por conta própria.
- **Desvio do plano (atalho em vez do form completo)**: o refino falava em "abrir o formulário de hábito existente" com `is_health` ligado, mas esse formulário vive dentro de `Habits.tsx` (estado, metas, cores) e extraí-lo seria refatorar o módulo inteiro por um atalho. Segui o padrão que 049 e 061 já usam neste dashboard: um `HealthHabitQuickCreateDialog` com nome, frequência e as sugestões. O formulário completo continua acessível pelo "Editar" na página de Hábitos.
- **Bug pré-existente encontrado no caminho (fora do escopo da 062)**: o insight `at-risk` de `src/domain/habits/insights.ts` é inalcançável — ele filtra por `streak > 0 && !doneToday`, mas `calculateStreak` conta a partir de hoje, então sem check-in hoje o streak já é 0. Nada a ver com saúde (vale para qualquer hábito); não mexi, só documentei no teste `hábito de saúde sem check-in hoje zera o streak...`.
- **Sugestão só pré-preenche o campo** — clicar em "Beber água" não cria nada; a criação só acontece no botão "Criar hábito". É o "oferecer em vez de semear" da decisão de não ter seed automático, e há teste provando que o clique na sugestão não grava (`store.habits` continua vazio).
- **Desvio do plano (degradação sem a migration)**: até o `db push`, a coluna `is_health` não existe no banco. `fetchHealthHabitsToday` devolve lista vazia quando o erro do Postgres cita a coluna (em vez de derrubar o dashboard, que já mostra dose e consulta desde 060/061), e `createHabit` cai no fallback que já existia — o hábito é criado, mas sem a flag, até a migration ser aplicada.
- **Desvio do plano (timestamp da migration)**: o refino previa `20260816120200`, mas as migrations já commitadas vão até `20260816190000` (061) — um timestamp anterior entraria fora de ordem na fila de pendentes, erro real que a 061 pegou. A migration desta feature é `20260816200000_habit_is_health.sql`.
- **Migration validada sem tocar o banco remoto**: `supabase/tests/habit_is_health/` sobe um Postgres 16 descartável em Docker, aplica a migration duas vezes (idempotência) sobre o schema anterior à 062 e roda assertivas de schema, de RLS (incluindo `habit_log`, que não tem `user_id` próprio) e 6 controles negativos que sabotam o banco e exigem que as assertivas acusem. `bash supabase/tests/habit_is_health/run.sh` → `OK`.
- A migration acrescenta também o índice parcial `habit_user_health_idx on public.habit (user_id) where is_health`, para o dashboard não varrer os hábitos não-saúde.
- **Fechamento (2026-08-18) — a migration foi aplicada pelo usuário e a feature foi para `done/`.**
  A confirmação veio de `npx supabase migration list` (`20260816200000` com `local` == `remote`),
  **não** de teste manual: a skill `next` proíbe navegador e esta sessão nunca roda `supabase db
  push` (é passo do usuário, aplica em produção). Confirmada de novo em 2026-08-23. Com a coluna no
  banco, a degradação defensiva descrita acima (lista vazia, hábito criado sem a flag) deixa de
  acontecer — ela continua no código como rede de segurança, não como estado corrente.
- **PENDÊNCIA DO USUÁRIO — conferência pós-push (2026-08-23).** A migration está aplicada, mas o que
  segue **não foi executado nem visto passar por esta sessão** — o SQL toca o banco remoto e o resto
  é interface, e esta esteira não alcança nenhum dos dois.

  No SQL editor:
  ```sql
  -- a coluna e o índice chegaram
  select column_name, data_type, is_nullable, column_default
    from information_schema.columns
   where table_schema = 'public' and table_name = 'habit' and column_name = 'is_health';
  -- esperado: boolean, NO, false
  select indexname from pg_indexes
   where schemaname = 'public' and tablename = 'habit' and indexname = 'habit_user_health_idx';
  -- esperado: 1 linha

  -- nenhum hábito existente virou hábito de saúde sozinho: tem de devolver 0
  select count(*) from public.habit where is_health;
  ```

  No app (teste de fumaça): criar um hábito pelo atalho "Novo hábito de saúde" do dashboard de
  Saúde, conferir que ele aparece na seção "Hoje" **e** na página de Hábitos com o ponto na cor de
  Saúde; fazer o check-in pelo dashboard e ver o contador "X de N" subir; desmarcar e ver descer; e
  conferir que um hábito comum (criado pela página de Hábitos) **não** aparece no dashboard de
  Saúde. Tudo isso já tem equivalente automatizado passando (`HealthDashboard.habits.test.tsx`,
  `Habits.health-badge.test.tsx`, `health.habits.test.ts`) — o roteiro só confirma contra o banco e
  o dado reais.
- **Checagem de satisfação no fechamento (2026-08-18).** Recorte do `prompt:` → artefato:
  *acompanhamento de "CONTROLE ... PARA ALIMENTAÇÃO"/"PARA INGESTÃO DE ÁGUA"* → `habit.is_health`
  validada em Postgres 16 e agora aplicada no remoto; `habits.is-health.test.ts` (5) na propagação
  da flag; `health.habits.test.ts` (7) no cruzamento com o `habit_log` de hoje;
  `HealthDashboard.habits.test.tsx` (9) no contador, no check-in com rollback de erro e na criação
  pelo atalho com sugestões; `Habits.health-badge.test.tsx` (4) no badge; `insights.test.ts` (4)
  na não-regressão dos insights. A parte de *notificação* desses dois itens é da 063, por decisão
  do refino registrada acima. Suíte completa reexecutada com
  `npx vitest run --testTimeout=30000 --hookTimeout=30000 --maxWorkers=4` (o `npm test` puro é
  instável nesta máquina): **161 arquivos, 1427 testes, 0 falhando** — as 2 falhas de
  `currency.test.ts` citadas acima foram corrigidas no commit `eb47042`.
