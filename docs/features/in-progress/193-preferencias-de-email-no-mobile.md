---
prompt: |-
  E faça isso no mobile:
  [...]
  Conta
  - Preferências de e-mail (updateEmailPrefs).
---

# 193 — Preferências de e-mail na Conta do mobile

## Contexto
- A web tem a seção "E-mails" em `/account`; o mobile não tinha.
- A escrita da web estava quebrada (feature 191): o mobile já nasce usando a RPC `update_email_prefs`.
- Depende de: 191 (migration `20261002110000_email_prefs_rpc.sql` aplicada no banco).

## Decisões
- Mesmo contrato da web: `updateEmailPrefs` confere o estado devolvido contra o pedido e lança se
  não bateu; a tela volta ao valor anterior no erro.
- Mesmos quatro controles e mesmo texto da web; os três primeiros ficam desabilitados com "Pausar
  todos" ligado.

## Tarefas
- [x] `mobile/src/api/emailPrefs.ts`: `fetchEmailPrefs` (defaults das colunas), `updateEmailPrefs`
  (RPC + conferência), `applyEmailPrefsPatch` (otimista), `EMAIL_PREF_OPTIONS`.
- [x] `mobile/src/api/__tests__/emailPrefs.test.ts`: RPC só com o campo pedido, estado divergente
  vira erro, erro da RPC propaga, defaults da leitura, pausar/retomar.
- [x] `mobile/src/app/(app)/account.tsx`: card "E-mails" com os quatro `Switch`, rollback no erro.
- [x] `npx tsc --noEmit` e `npx vitest run` no `mobile/`.
- [ ] **AGUARDA O USUÁRIO — `supabase db push`** (migration da 191).

## Como testar
1. Aplicar a migration da 191 (`supabase db push`).
2. `cd mobile && npx vitest run src/api/__tests__/emailPrefs.test.ts` — 5 testes passam.
3. No app, Conta → E-mails: desligar "Digest semanal", sair e voltar à tela — continua desligado; em
   `/account` na web o mesmo toggle aparece desligado.
