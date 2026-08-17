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
- [ ] Criar a migration `supabase/migrations/20260816120200_habit_is_health.sql` adicionando `is_health boolean not null default false` em `public.habit` (a tabela já tem RLS por `user_id`; a coluna não altera as políticas)
- [ ] Adicionar `is_health?: boolean` ao tipo `Habit` em `src/types/` (arquivo onde `Habit` está declarado hoje) e propagar em `createHabit`/`updateHabit` em `src/api/habits.ts`
- [ ] Adicionar `fetchHealthHabitsToday(): Promise<{ habit: Habit; doneToday: boolean }[]>` em `src/api/health.ts`, filtrando `habit.is_health = true` e cruzando com `habit_log` da data de hoje
- [ ] Adicionar a seção "Hoje" ao `HealthDashboard.tsx` (criado na 060): lista dos hábitos de saúde com contador "X de N concluídos" e um botão de check-in por hábito, que grava em `habit_log` e atualiza a lista sem recarregar a página; erros via `useToast` + `getErrorMessage`
- [ ] Adicionar ao dashboard o atalho "Novo hábito de saúde", abrindo o formulário de hábito existente já com `is_health: true` e com sugestões de nome ("Beber água", "Comer frutas", "Comer proteína")
- [ ] Em `src/pages/admin/habits/`, exibir um badge de saúde (dot na cor `--health`) nos hábitos com `is_health = true`, para que o usuário entenda por que eles aparecem nos dois lugares
- [ ] `npm run build`
- [ ] `npm run lint`
- [ ] `npm run test` — cobre domínio puro: verificar que `getHabitInsights` (em `src/domain/habits/`) continua correto com hábitos de saúde no conjunto, incluindo streak e taxa do dia
- [ ] Verificação manual, após confirmar com o usuário e rodar `supabase db push`: criar "Beber água" pelo atalho do dashboard e conferir que nasce com o badge de saúde; marcar o check-in e conferir que o contador "X de N" sobe e que o streak aparece na página de Hábitos; desmarcar e conferir que volta; conferir que hábitos antigos, sem `is_health`, não aparecem no Health Dashboard

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
- `habit_log` é único por (`habit_id`, `date`) — o check-in do dashboard deve fazer upsert, não insert, para não conflitar com um check-in feito pela página de Hábitos no mesmo dia.
- Migration timestamp `20260816120200`: único, distinto do da 061 (`20260816120100`) e dos escolhidos por 063 e 064.
