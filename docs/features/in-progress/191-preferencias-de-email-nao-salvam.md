---
prompt: |-
  As preferências de e-mail da página `/account` não salvam. O usuário mexe nos toggles, a tela não
  dá erro nenhum, e nada é gravado.

  Achado em 2026-09-24 pelo agente de ataque do planning 109, enquanto procurava onde guardar a
  versão ativa da Orb. Verificado no código, não é suposição:

  - `src/api/billing.ts:249-273` — `updateEmailPrefs` faz `supabase.from("profiles").update(payload).eq("id", userId)`
    direto do browser, como `authenticated`.
  - `supabase/migrations/20240101000300_billing.sql:30-31` — derruba a policy `profiles_update_own` e
    deixa escrito o porquê: *"Sem UPDATE para authenticated: billing só via service_role + trigger."*
  - `supabase/migrations/20240101001200_security_hardening.sql:46` — derruba de novo.
  - Nenhuma migration do projeto cria `create policy ... on public.profiles for update`.

  Com RLS ligada e sem policy de UPDATE, o `update` casa **zero linhas e não retorna erro**: o
  `error` volta `null`, `updateEmailPrefs` retorna sem exceção, e a tela mostra sucesso. É falha
  silenciosa, não exceção — por isso ninguém percebeu.

  As colunas afetadas são as de e-mail em `profiles`: `email_digest_enabled`,
  `email_alerts_enabled`, `email_habit_reminder_enabled` e `email_unsubscribed_at`.

  O que precisa ser decidido no desenho: como devolver a escrita dessas quatro colunas ao usuário
  **sem** reabrir escrita nas colunas de billing da mesma tabela (`plan`, `stripe_customer_id`,
  `stripe_subscription_id`, `subscription_status`, `current_period_end`), que é exatamente o que a
  migration de hardening fechou de propósito. Os dois caminhos óbvios são uma policy de UPDATE
  restrita por coluna e uma RPC `security definer` que só toca as colunas de e-mail — e já existe o
  trigger `protect_profiles_billing` (`20240101001200_security_hardening.sql:41-44`) como terceira
  peça a considerar.

  Vale checar, no mesmo desenho, se há outras escritas do cliente em `profiles` sofrendo do mesmo
  silêncio, e se o efeito colateral disso chega nos e-mails que já são enviados (digest semanal,
  alertas, lembrete de hábito) — alguém que pediu para não receber pode estar recebendo.
---

# 191 — Preferências de e-mail de `/account` não salvam

## Contexto
- `/account` grava as quatro colunas de e-mail com `update` direto em `profiles`; sem policy de
  UPDATE para `authenticated`, casa zero linhas com `error: null` e a tela mostra sucesso.
- Achado em 2026-09-24 pelo agente de ataque do planning 109, verificado no código.
- `supabase/functions/_shared/emailHtml.ts:31-32` — rodapé de todo e-mail manda "abrir Conta no app
  e desativar o envio": é o único opt-out do produto, e é exatamente o caminho quebrado.
- As colunas de billing da mesma tabela foram fechadas de propósito; a correção não pode reabri-las.

## Definições
- Colunas de e-mail: `email_digest_enabled`, `email_alerts_enabled`,
  `email_habit_reminder_enabled`, `email_unsubscribed_at`.
- Colunas de billing (intocáveis pelo cliente): `plan`, `stripe_customer_id`,
  `stripe_subscription_id`, `subscription_status`, `current_period_end`.
- Falha silenciosa: UPDATE com RLS ligada e sem policy casa zero linhas, devolve `error: null` e
  não levanta exceção — o client não distingue de sucesso.
- Fora: unsubscribe por token no e-mail (ver P3); varredura das outras chamadas `.update()` do
  cliente (ver P2); reenvio ou compensação de e-mails já entregues.

## Estrutura
- Frente A — devolver a escrita das quatro colunas. Mecanismo em P1.
  - `supabase/migrations/<novo>_email_prefs_rpc.sql` — não existe → RPC `security definer`,
    `where id = auth.uid()`, tocando só as quatro colunas + `updated_at`.
  - Padrão da casa, não invenção: `revoke all ... from public` + `grant execute ... to
    authenticated`, igual a `touch_last_seen` (`20260725220000_retention_d7.sql:53-54`).
  - `src/api/billing.ts:269-273` — `.from("profiles").update(payload).eq("id", userId)` → `rpc(...)`,
    do mesmo jeito que `src/api/billing.ts:50` já faz.
- Frente B — a falha silenciosa não passa de novo.
  - `src/api/billing.ts:272-273` — `if (error) throw` é a única checagem hoje; zero linhas não é erro.
  - RPC devolve o estado gravado; `updateEmailPrefs` confere contra o pedido e lança se não bateu.
- Frente C — a tela para de confirmar antes da confirmação.
  - `src/pages/admin/Account.tsx:566-571` (e os três toggles irmãos até `:680`) — `setProfile`
    otimista roda antes do `await`; falta voltar ao valor anterior no `catch`.
- Frente D — prova por código, Chrome bloqueado.
  - `e2e/rls.spec.ts` + `e2e/helpers/auth.ts` — `passwordGrant` + `rest` batem no PostgREST com JWT
    real, sem navegador: único harness do repo que exercita RLS de verdade.
  - Asserts: gravação confirmada por releitura; `update` direto em `plan` pelo mesmo token continua
    sem efeito; a chamada nova não move nenhuma coluna de billing.
  - Caveat: a suíte faz `test.skip` sem `E2E_EMAIL`/`E2E_PASSWORD` — teste que pula não prova nada.
- Frente E — alcance do estrago nos e-mails que já são enviados.
  - `20260727180000_email_lifecycle.sql:150` — digest gate em `email_digest_enabled`, default
    `true`: quem tentou desligar continuou recebendo.
  - `20260727200000_email_p2.sql:131` e `20260727180000_email_lifecycle.sql:110` — lembrete de
    hábito e `alerts_digest` gate em colunas default `false`: nunca saíram para ninguém.
  - Contar o cohort real em `profiles` por estado das quatro colunas ficou pendente — a leitura
    direta ao Postgres foi bloqueada nesta sessão.

## Decisões
- Varredura de `profiles` fechada: esta é a única escrita silenciosa do cliente — `src/api/billing.ts`
  tem 3 SELECT, 1 INSERT (com policy) e este UPDATE; referral e `last_seen` já passam por RPC.
- O repo já reconhece o buraco por escrito: `20260804120000_improve_md_features.sql:30` — "RPCs
  (profiles não tem UPDATE policy para authenticated)".
- `security definer` escreve mesmo com RLS ligada: nenhuma migration usa `force row level security`.
- O trigger `protect_profiles_billing` (`20240101001200_security_hardening.sql:10-44`) fica como
  está — reverte billing em qualquer UPDATE não-`service_role` e é a segunda linha em qualquer P1.
- A escrita aceita patch parcial: campo ausente não mexe na coluna, preservando o contrato de
  `EmailPrefsPatch` (`src/api/billing.ts:241-247`).
- Nada a recuperar dos afetados: a preferência nunca chegou ao banco e não há log da tentativa.
- Timestamp da migration conferido na hora de escrever — outros agentes da esteira criam migration
  em paralelo, e timestamp repetido já quebrou o bookkeeping do CLI (`done/002-...`, Notas).
- `supabase db push` só com confirmação explícita do usuário: é banco remoto compartilhado.

## Perguntas em aberto
### P1 — Mecanismo: RPC `security definer` ou policy de UPDATE com `grant` por coluna?
- Recomendada: RPC — é o padrão já usado em `profiles` e honra o "sem UPDATE para authenticated"
  escrito em `20240101000300_billing.sql:30-31`; RLS não filtra coluna, quem filtraria seria
  `grant update (col)`, que um `grant` amplo futuro reabre sem aviso.
- **Resposta:** RPC `security definer` (recomendada aceita pelo usuário em 2026-10-02).

### P2 — Esta rodada conserta só `profiles` ou cria guarda geral contra update que casa zero linhas?
- Recomendada: só `profiles` — são ~77 chamadas `.update()` em `src/api/`, varrer todas é feature
  própria; o risco fica registrado aqui.
- **Resposta:** só `profiles` (recomendada aceita pelo usuário em 2026-10-02).

### P3 — Entra nesta rodada um unsubscribe por token no e-mail, ou só o conserto de `/account`?
- Recomendada: só o conserto — o rodapé volta a ser verdade assim que `/account` grava; link por
  token e `List-Unsubscribe` pedem Edge Function nova.
- **Resposta:** só o conserto (recomendada aceita pelo usuário em 2026-10-02).

## Tarefas
- [x] `supabase/migrations/20261002110000_email_prefs_rpc.sql`: RPC `update_email_prefs(p_digest,
  p_alerts, p_habit_reminder, p_unsubscribed)` — `security definer`, `where id = auth.uid()`, null =
  coluna intocada, devolve o estado gravado; `revoke all from public` + `grant execute to
  authenticated`. Timestamp único conferido contra `supabase/migrations/`.
- [x] `src/api/billing.ts`: `updateEmailPrefs` passa a chamar a RPC, confere o estado devolvido contra
  o pedido e lança "A preferência não foi gravada" se não bateu ou se não voltou linha. Novo helper
  puro `applyEmailPrefsPatch` para o estado otimista.
- [x] `src/pages/admin/Account.tsx`: os quatro toggles passam por `saveEmailPref`, que volta ao
  estado anterior no erro e aplica o estado devolvido pelo banco no sucesso.
- [x] `src/api/__tests__/emailPrefs.test.ts`: RPC chamada só com os campos pedidos e sem `from()`
  direto; estado divergente, resposta vazia e erro da RPC viram exceção; `applyEmailPrefsPatch`.
- [x] `e2e/email-prefs.spec.ts`: JWT real no PostgREST — RPC grava, releitura confirma, `PATCH` direto
  em `plan` continua sem efeito. Pula sem `E2E_EMAIL`/`E2E_PASSWORD`.
- [x] **AGUARDA O USUÁRIO — `supabase db push`** para aplicar a migration no banco remoto. Até lá a
  tela mostra erro ao salvar (a RPC não existe), em vez do sucesso falso de antes.
  **2026-10-05:** já aplicada — `20261002110000_email_prefs_rpc` local e remoto em
  `supabase migration list`; `db push --dry-run` responde "Remote database is up to date".
- [ ] Rodar `npx playwright test e2e/email-prefs.spec.ts` com `E2E_EMAIL`/`E2E_PASSWORD` depois do push.

## Como testar
1. Aplicar a migration (`supabase db push`).
2. `npx vitest run src/api/__tests__/emailPrefs.test.ts` — 7 testes passam.
3. Com `E2E_EMAIL`/`E2E_PASSWORD` definidos: `npx playwright test e2e/email-prefs.spec.ts` — passa,
   não pula.
4. Em `/account`, desligar "Digest semanal", recarregar a página: o toggle continua desligado.

## Prompts
- 2026-10-02 — "Faça isso no Web. [...] E faça isso no mobile: [...] Conta - Preferências de e-mail
  (updateEmailPrefs)." Usuário escolheu corrigir a web pela 191 e então levar ao mobile (feature 193).
