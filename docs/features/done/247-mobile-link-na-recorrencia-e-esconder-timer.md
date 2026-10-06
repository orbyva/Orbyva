---
prompt: |-
  Replique isso que veio para a versão mobile
  (contexto: os 3 commits puxados de origin/master em 2026-10-05 — 4a3c3a0 link em recorrência
  financeira [feature 206 do web], 5857925 esconder o timer flutuante [feature 226], 54ed94c safe
  area do topo no iPhone [feature 246])
commits:
  - 12a2e42 — feat(mobile): identidade do web, navegação enxuta, Orb, link na recorrência e timer
    escondível
pr: nenhum — commitado direto na master
---

# 247 — Mobile: link na recorrência e esconder o timer

## Contexto
O `git pull` de 2026-10-05 trouxe três mudanças do web. Esta feature leva ao app Expo o que faz
sentido lá:

- **Link na recorrência (web 206):** coluna `recurring_transaction.link_url`, campo "Link" no
  formulário e atalho na lista.
- **Esconder o timer (web 226):** o X do `LiveWidget` passa a guardar a escolha e deixa um botão
  redondo no canto que traz o timer de volta.
- **Safe area do topo (web 246):** não se aplica — no app, os cabeçalhos nativos do
  `expo-router` já descontam o notch, e as telas sem cabeçalho (`login.tsx`, toast, `AppSidebar`,
  `OrbCapabilities`) já usam `SafeAreaView`/`insets.top`.

## Decisões
- Regra do link espelhada do web (`mobile/src/domain/recurring/links.ts`): mesma frase de erro
  ("Comece com https://"), validação bloqueante no salvar, `trim` e `null` quando vazio — apagar o
  link manda `link_url: null` explícito no update.
- Na lista o link aparece como o domínio clicável (`nubank.com.br`), não só como ícone: no celular,
  um alvo com texto é mais fácil de reconhecer. Abre por `openExternalUrl` (`lib/url.ts`).
- Preferência do timer no aparelho via `secureStoreAdapter`, mesma chave do web
  (`orbyva_live_widget_hidden_v1`); ausente, inválida ou storage com erro = visível.
- "Parar e concluir" continua tirando o timer da tela só na sessão (`dismissed`), separado da
  preferência (`hidden`): depois de concluir não sobra botão redondo para uma tarefa feita.
- A decisão do que desenhar virou função pura (`liveWidgetMode`) porque o Vitest do mobile roda sem
  renderer de React Native — é o que dá para provar por teste.

## Tarefas
- [x] `domain/recurring/links.ts` (`normalizeRecurringLink`, `isHttpLink`, `linkLabel`,
  `RECURRING_LINK_HINT`) + `domain/recurring/__tests__/links.test.ts`
- [x] Tipos: `Recurring.link_url?` e `RecurringCreateRequest.link_url` obrigatório; `link_url: null`
  nos outros dois criadores (`api/orbActions.ts`, `app/(app)/goals/index.tsx`)
- [x] `api/finance/recurring.ts`: `link_url` no select e no update +
  `api/__tests__/recurring.linkUrl.test.ts` (select, insert, update, apagar = `null`)
- [x] `recurring-form.tsx`: campo "Link", carregado na edição, validado e normalizado ao salvar
- [x] `RecurringList.tsx`: domínio clicável abaixo da categoria
- [x] `lib/liveWidgetVisibility.ts` (ler/gravar preferência + `liveWidgetMode`) +
  `lib/__tests__/liveWidgetVisibility.test.ts`
- [x] `LiveWidget.tsx`: X grava a preferência; escondido vira botão redondo no mesmo canto, com o
  ícone em `primary` quando há timer rodando
- [x] Verificação: testes novos quebrados de propósito (update sem `link_url`, `liveWidgetMode`
  ignorando `dismissed`) falham e voltam a passar; `npx tsc --noEmit` limpo; `npx vitest run`
  40 arquivos / 750 testes; `npx expo export --platform ios` ok

## Prompts
- 2026-10-05 — "Replique isso que veio para a versão mobile"
- 2026-10-06 — "esse tipo de tarefa não deve ser mais registrada nas features, não faz sentido
  exigir que eu rode o supabase db push localmente para permitir passar pra frente, nem testes. Não
  é assim. eu quero uma descrição de issue que seja auto contida, em que ela possa implementar,
  executar testes (automatizados somente) e marcar como concluída> / remova essas e suba para done,
  porque afinal essa issue já foi realizada. registre també na master que deve ser salvo no
  cabeçalho os commits feitos, e o pr (se feito também)"

## Notas
- 2026-10-06: saíram as duas últimas tarefas, que eram `AGUARDA O USUÁRIO` — o `supabase db push` da
  migration `20261005120000_recurring_transaction_link_url.sql` (que veio do web em `4a3c3a0`,
  feature 206, não desta feature) e a conferência no aparelho. Tarefa que depende de ação do usuário
  não entra mais em feature: a migration é pré-requisito de ambiente (está em **Como testar**) e a
  conferência manual é o roteiro de avaliação, não gate de conclusão. Regra registrada em
  `~/.claude/master/MASTER.md` e nas skills `attack`/`next`.
- O estado remoto da coluna `recurring_transaction.link_url` não foi conferido nesta sessão: o
  `npx supabase migration list` falhou em `LegacyDbConfigLoginRoleStatusError` (connection timeout)
  e o MCP do projeto está sem credencial (`npm run mcp:login`). Pela regra nova isso não bloqueia o
  fechamento — o código e os testes da feature estão entregues e verdes (`12a2e42`).
- Numeração: o web já usa 206 e 246; esta é a 247. A onda 4 do mobile, que colidia com a
  `206-link-na-recorrencia-financeira.md` do web, foi renumerada para 248 em 2026-10-05.

## Como testar
1. **Pré-requisito de ambiente** — a coluna `recurring_transaction.link_url` precisa existir no banco
   remoto; a migration é `20261005120000_recurring_transaction_link_url.sql`, que veio do web
   (`4a3c3a0`): `supabase db push` se ainda não estiver aplicada.
2. `cd mobile && npx vitest run src/domain/recurring src/lib/__tests__/liveWidgetVisibility.test.ts src/api/__tests__/recurring.linkUrl.test.ts` — 29 testes passam.
3. No app, Finanças → Recorrências → Nova: preencher "Link" com `nubank.com.br` e salvar — aparece
   "Comece com https://" e nada é gravado. Trocar para `https://nubank.com.br` e salvar.
4. Na lista, a recorrência mostra `nubank.com.br`; tocar abre o navegador. Editar, apagar o link e
   salvar — o link some da lista (e da tabela do web).
5. Iniciar um timer numa tarefa, tocar no X do widget: no lugar fica um botão redondo com o ícone
   azul. Fechar e reabrir o app — continua escondido. Tocar no botão — o widget volta.
6. Com o widget visível, "parar e concluir" — o widget some e não fica botão redondo.
