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

# 063 — Progresso corporal e preferências de lembrete

## Contexto
"Progresso no cuidado com o próprio corpo" precisa de valores ao longo do tempo — peso, medidas — que o modelo de hábito (booleano por dia) não representa. E o usuário quer controle sobre quando ser lembrado de água, alimentação, medicação e consultas. Esta feature cria as duas tabelas que faltam e entrega lembrete funcionando com o que o app já tem: notificação local do navegador via `src/lib/browserNotify.ts`. Push real (com o app fechado) é outra camada e está fora daqui — o porquê está nas Notas.

## Decisões
- **`health_metric` é tabela nova**, com uma linha por medição (`metric_type`, `value`, `recorded_date`). Hábito não serve: o valor é contínuo (78,4 kg), a frequência é irregular, e o que importa é a série histórica, não a aderência.
- **IMC não é coluna, é cálculo na tela.** Guardar IMC junto do peso duplica informação que sai de peso + altura e fica inconsistente quando um dos dois muda. A altura vai como uma métrica normal (`metric_type = 'height'`), e o IMC é derivado no cliente a partir da última altura conhecida.
- **`reminder_preference` guarda a configuração, não cada disparo.** Uma linha por (`user_id`, `entity_type`), com `frequency`, `time_of_day`, `enabled` e `last_notified_at`. Quais lembretes estão vencidos agora é função pura calculada na carga do app.
  - **Descartado — tabela de log de notificações**: só se paga quando houver envio server-side com necessidade de auditoria (ou seja, junto do push real). Para deduplicar disparo local, `last_notified_at` na própria linha basta.
- **O transporte desta feature é notificação local do navegador** (`browserNotify.ts`, já usado pelos alertas) mais toast in-app. Isso funciona com a aba aberta e não promete nada além disso. O app **é** um PWA com service worker (`VitePWA` em `vite.config.ts`), mas o SW é gerado pelo workbox e não comporta handler de `push` — o que falta para push real está detalhado nas Notas.
- **RLS por `user_id` nas duas tabelas**, com política para select, insert, update e delete. Dado de saúde não tem exceção.

## Tarefas
- [x] Criar a migration `supabase/migrations/20260816210000_health_metric.sql`: tabela `public.health_metric` (`id uuid pk default gen_random_uuid()`, `user_id uuid not null references auth.users(id) on delete cascade`, `metric_type text not null`, `value numeric not null`, `recorded_date date not null`, `notes text`, `created_at timestamptz not null default now()`), com check constraint de `metric_type` em ('weight','height','waist','hip','chest','arm'), índice em (`user_id`, `metric_type`, `recorded_date desc`), `enable row level security` e as quatro políticas por `user_id = auth.uid()` (select/insert/update/delete), espelhando o padrão das migrations existentes
- [x] Criar a migration `supabase/migrations/20260816220000_reminder_preference.sql`: tabela `public.reminder_preference` (`id uuid pk default gen_random_uuid()`, `user_id uuid not null references auth.users(id) on delete cascade`, `entity_type text not null`, `frequency text not null default 'daily'`, `time_of_day time`, `enabled boolean not null default true`, `last_notified_at timestamptz`, `created_at timestamptz not null default now()`), com check constraints de `entity_type` em ('medication','consultation','water','nutrition','body_metric') e de `frequency` em ('daily','weekly','monthly'), unique em (`user_id`, `entity_type`), `enable row level security` e as quatro políticas por `user_id = auth.uid()`
- [x] Adicionar a `src/types/health.ts` os tipos `MetricType`, `HealthMetric`, `ReminderEntityType`, `ReminderFrequency` e `ReminderPreference`, e estender `HealthSummary` com `latestMetrics: HealthMetric[]` e `reminderPreferences: ReminderPreference[]`
- [x] Criar `src/domain/health/metrics.ts` (puro): `computeBmi(weightKg, heightCm): number | null`, `latestByType(metrics): Record<MetricType, HealthMetric | undefined>` e `deltaSincePrevious(metrics, type): number | null` (variação em relação à medição anterior do mesmo tipo)
- [x] Criar `src/domain/health/reminder.ts` (puro): `nextReminderAt(pref, from): Date | null` e `isReminderDue(pref, now, graceMinutes = 5): boolean` — devido quando o horário agendado já passou dentro da tolerância e `last_notified_at` não cobre o período atual
- [x] Criar testes Vitest em `src/domain/health/` cobrindo `computeBmi` (incluindo altura ausente), `deltaSincePrevious`, `nextReminderAt` nas três frequências e `isReminderDue` nos casos: no horário, antes do horário, depois da tolerância, e já notificado no período
- [x] Estender `src/api/health.ts` com `recordHealthMetric`, `fetchHealthMetrics(type, limit)`, `fetchReminderPreferences` e `upsertReminderPreference`, e preencher os campos novos de `HealthSummary` em `loadHealthSummary`
- [x] Adicionar a seção "Progresso" ao `HealthDashboard.tsx`: cards com a última medição de cada tipo, variação em relação à anterior e IMC calculado quando houver peso e altura; `EmptyState` quando não houver nenhuma medição
- [x] Criar `src/pages/admin/life/RecordMetricDialog.tsx`: seleção de tipo, valor, data (padrão hoje) e observação; grava via `recordHealthMetric`; feedback com `useToast` + `getErrorMessage`
- [x] Criar `src/pages/admin/life/ReminderPreferencesDialog.tsx`: uma linha por `entity_type` com switch de ativo, seletor de frequência e horário; exibe "Próximo: <data e hora>" a partir de `nextReminderAt`; salva via `upsertReminderPreference`
- [x] Ligar o disparo local: na carga do Health Dashboard, para cada preferência com `isReminderDue`, exibir toast e chamar `browserNotify` (`src/lib/browserNotify.ts`), depois gravar `last_notified_at` para não repetir
- [ ] `npm run build`
- [ ] `npm run lint`
- [ ] `npm run test` — Vitest cobre exclusivamente as funções puras de `src/domain/health/` (métricas e lembretes). Ele não valida RLS nem insert no Supabase: não há Supabase local neste projeto e o domínio é testado sem I/O
- [ ] Verificação manual das tabelas, após confirmar com o usuário e rodar `supabase db push`: registrar peso e altura e conferir que o IMC aparece correto no card; registrar um segundo peso e conferir a variação; ativar o lembrete de água para um horário já passado no dia, recarregar o dashboard e conferir que toast e notificação do navegador aparecem uma vez só (recarregar de novo não deve repetir); desativar e conferir que não dispara
- [ ] Verificação manual de RLS, no mesmo passo: no SQL editor do Supabase, autenticado como um usuário, executar `select * from health_metric` e `select * from reminder_preference` e confirmar que só retornam linhas do próprio `user_id`; tentar `insert` com `user_id` de outro usuário e confirmar que a política rejeita

## Prompts
- 2026-08-16 — "- SUB-MÓDULO DE VIDA.SAÚDE
  - CONTROLAR MEDICAMENTOS
  - CONSULTAS (VIRAM EVENTOS NO CALENDÁRIO GERAL)
  - E PROGRESSO NO CUIDADO COM O PRÓPRIO CORPO
    - CONTROLE DE NOTIFICAÇÕES PARA ALIMENTAÇÃO
    - CONTROLE DE NOTIFICAÇÕES PARA INGESTÃO DE ÁGUA
    - TUDO NO FUTURO VAI DAR UMA PUSH NOTIFICATION PARA O USUÁRIO"

## Notas
- **Recorte do prompt-mãe que esta feature cumpre**: "PROGRESSO NO CUIDADO COM O PRÓPRIO CORPO" (métricas corporais) e a parte de *controle de notificações* de água e alimentação — o usuário escolhe se, quando e com que frequência ser lembrado, e o lembrete dispara localmente. O item "TUDO NO FUTURO VAI DAR UMA PUSH NOTIFICATION" é explicitamente tratado como futuro pelo próprio usuário e **não** é cumprido aqui.
- **Depende da 060** (`HealthDashboard`, `HealthSummary`, `src/api/health.ts`). Depende da **062** para o `entity_type` de água e alimentação apontar para hábitos que existam. Independente da 061 e da 064, embora `entity_type` já preveja 'consultation' e 'medication'.
- **Push notification — posição honesta, e o pré-requisito que quase passou batido.** O app **já é um PWA com service worker**: `VitePWA` está configurado em `vite.config.ts` com `registerType: "prompt"`, bloco `workbox`, manifest completo e ícones em `public/` (`pwa-192.png`, `pwa-512.png`, `pwa-maskable-512.png`), e `scripts/minify-sw.mjs` minifica o SW no build. O que não existe é push. E o obstáculo principal não é "não há service worker" — é que a config **não declara `strategies`, então usa `generateSW`**: o workbox monta o arquivo inteiro e ele **não aceita código próprio**. Um listener de `push` e `notificationclick` é código próprio e é obrigatório para web-push.
- **Feature de push (a abrir — número fora da faixa 060-064 desta rodada).** Escopo, em ordem de custo:
  1. **Migrar `vite.config.ts` de `generateSW` para `injectManifest`** e passar a versionar um SW próprio no repo. É o item mais caro e o de maior risco: precisa preservar o `runtimeCaching` atual, o `navigateFallback` com sua denylist, `cleanupOutdatedCaches` e o `registerType: "prompt"`, sem regredir offline nem o fluxo de atualização. Atenção ao workaround já documentado em comentário no `vite.config.ts` — `generateSW` com `mode: "production"` trava no `@rollup/plugin-terser`, daí o `mode: "development"` + `minify-sw.mjs`; a migração precisa decidir o que acontece com esse pipeline de minificação.
  2. Gerar par de chaves VAPID, com a privada guardada como secret (nunca no bundle).
  3. Tabela `push_subscription` (`endpoint`, `p256dh`, `auth`, um registro por dispositivo) com RLS por `user_id`.
  4. No cliente: `Notification.requestPermission()` + `pushManager.subscribe()` e persistência da subscription, com tratamento de permissão negada e de subscription expirada.
  5. Handlers `push` e `notificationclick` no SW próprio (só possível depois do item 1).
  6. Edge Function agendada por cron — o projeto já tem esse padrão, com `x-cron-secret` e `verify_jwt = false` — que lê `reminder_preference`, resolve quem está vencido e envia.
  Esta feature (063) deixa o modelo de preferências pronto para essa Edge Function ler. É só isso que ela promete.
- **Timestamps das migrations corrigidos na implementação**: o refino tinha escrito `20260816120300` e `20260816120400`, que são **anteriores** a migrations já commitadas (`20260816130000` … `20260816200000`) e ainda não aplicadas no remoto — o `db push` aplica em ordem e um timestamp para trás quebra a sequência. Passaram a ser `20260816210000_health_metric.sql` e `20260816220000_reminder_preference.sql`, únicos e posteriores a tudo. Timestamps repetidos já causaram bug real — ver Notas de `docs/features/done/002-vinculo-tarefa-recorrencia-financeira.md`.
- **Semântica de `isReminderDue` fechada na implementação** (o refino deixou "devido quando o horário agendado já passou dentro da tolerância", que é ambíguo): a tolerância **abre a janela para a frente, não a fecha**. O lembrete vence quando `now + graceMinutes >= slot do período corrente`, e continua vencido depois — quem abre o app às 14h ainda é lembrado do slot das 9h. Fechar a janela em 5 minutos faria o lembrete só existir para quem estivesse com a aba aberta no minuto exato. O que impede repetição é `last_notified_at`; o que impede o lembrete de ontem tocar hoje de manhã é o slot ser sempre o do **período corrente** (hoje, esta semana, este mês), nunca o anterior. Cadência semanal/mensal é ancorada em `created_at` (mesmo dia da semana / do mês, preso ao último dia em mês curto).
- **Testes de domínio escritos junto de cada função**, não numa tarefa separada no fim: a skill `next` proíbe marcar `[x]` sem assertiva concreta, então `metrics.test.ts` saiu com `metrics.ts` e `reminder.test.ts` com `reminder.ts`. A tarefa de testes ficou como a conferência de que todos os casos listados estão cobertos.
- **Diálogos em `src/pages/admin/life/`, não `src/pages/admin/health/`** (o refino tinha escrito `health/`): o `HealthDashboard` da 060 mora em `src/pages/admin/life/` — Saúde é sub-módulo de Vida, e a rota é `/life/health`. Abrir uma pasta `health/` só para dois diálogos partiria o sub-módulo em dois lugares.
- **`sendBrowserNotification` é novo em `src/lib/browserNotify.ts`** — o arquivo só tinha `maybeNotifyCriticalAlerts`, colado no sino de alertas. O lembrete de saúde **não** passa pelo toggle `isBrowserNotifyEnabled()` (que é do sino): quem liga e desliga o lembrete é a linha de `reminder_preference`; exigir os dois faria o lembrete configurado na tela não chegar, sem explicação. A permissão do navegador é pedida quando o usuário liga o switch (gesto do usuário), não na carga da página.
- **Harness em Postgres 16 descartável**: `supabase/tests/health_metric_reminder/` valida as duas migrations em Docker, sem tocar no banco remoto — mesmo formato de `supabase/tests/habit_is_health/` (readiness por query real, não `pg_isready`, e controles negativos que sabotam o banco para provar que as assertivas acusam). É lá que RLS se verifica, com `set role authenticated` e `auth.uid()` — não no Vitest.
- `supabase db push` aplica no banco remoto: confirmar com o usuário antes de rodar.
- O disparo local só acontece com o app aberto no Health Dashboard. É a limitação honesta do transporte atual e deve ficar visível na UI do diálogo de preferências (uma linha de texto explicando), para o usuário não contar com lembrete que não vai chegar.
