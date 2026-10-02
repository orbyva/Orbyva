---
prompt: |-
  E faça isso no mobile:
  [...]
  Saúde
  - Diálogo de preferências de lembrete (ReminderPreferencesDialog.tsx). O mobile tem a lógica por
    baixo, mas não tem tela.
---

# 195 — Preferências de lembrete no mobile

## Contexto
- A seção "Lembretes" da Saúde no mobile só ligava/desligava cada tipo, sempre "Todo dia · 09:00".
- A web (`ReminderPreferencesDialog.tsx`, feature 063) deixa escolher frequência e horário e mostra
  o "Próximo" disparo.

## Decisões
- Tela própria `health/reminders` (stack de Saúde), aberta pelo link "Frequência e horários" no fim
  da seção; a lista rápida de liga/desliga continua onde estava.
- Mesmo comportamento da web: cada mexida salva na hora por upsert (`user_id` + `entity_type`), volta
  ao valor anterior no erro, sem botão "Salvar".
- Linhas e rótulo "Próximo" em funções puras (`reminderRows`, `nextReminderLabel`) sobre o
  `nextReminderAt` que o mobile já tinha.

## Tarefas
- [x] `mobile/src/domain/health/reminder.ts`: `ReminderRow`, `reminderRows`, `nextReminderLabel`.
- [x] `mobile/src/domain/health/__tests__/reminderRows.test.ts`: ordem e defaults das linhas,
  "Próximo" diário hoje/amanhã, desligado sem próximo.
- [x] `mobile/src/app/(app)/health/reminders.tsx`: `Switch`, chips de frequência, `TimeField`,
  "Próximo".
- [x] Registro no `health/_layout.tsx` e link na seção Lembretes de `health/index.tsx`.
- [x] `npx tsc --noEmit` e `npx vitest run` no `mobile/`.

## Como testar
1. `cd mobile && npx vitest run src/domain/health/__tests__/reminderRows.test.ts` — 3 testes passam.
2. No app, Saúde → Mais → Lembretes → "Frequência e horários": ligar Água, escolher "Toda semana" e
   14:30 — aparece "Próximo: <data> 14:30"; voltar e a linha mostra "Toda semana · 14:30"; na web o
   diálogo de lembretes mostra o mesmo.
