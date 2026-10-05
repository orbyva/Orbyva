---
prompt: |-
  Pedido do usuário, verbatim (05/10/26), lista de lacunas web → mobile:

  Visão Gantt (na lista e na aba do projeto)
  Dependências entre tarefas
  Marco (milestone), duração e botão "começar agora"
  Editar apontamentos de tempo
  Tarefas que citam esta tarefa
  Tela com as ocorrências da série
  Excluir várias tarefas de uma vez
  Editar evento do projeto (no mobile só dá para criar e excluir)
  Criar consulta direto pela tarefa
  Editar e excluir medição (lista de progresso)
  Página com a lista de consultas. O mobile mostra só a próxima
  Histórico de doses de cada medicação
  Atualizar a meta a partir da descrição de "aporte" na transação
  Editar uma visita registrada (no mobile só dá para criar e excluir)
  Resumo das opiniões direto na listagem. No mobile as opiniões ficam só no detalhe
  Anexos nas atividades (arquivo e link)

  Aplique isso tudo

  Fatia desta feature: "Atualizar a meta a partir da descrição de 'aporte' na transação".
---

# 250 — Mobile: meta atualiza ao pagar parcela de aporte

## Contexto
- No web, marcar uma parcela de recorrência como paga chama `syncGoalsFromAporteDescription`
  (`src/api/recurring.ts:333`, `src/api/goals.ts:50`): metas financeiras ativas cujo título casa  com a descrição ("Meta - <meta>", legado "Aporte meta: <meta>", ou classe com o título da meta) têm o progresso recalculado pelo
  razão.
- No mobile, `updateRecurringParcelPayment` (`mobile/src/api/finance/recurring.ts:319`) não faz
  isso: a meta só anda se o usuário tocar em "Sincronizar" na tela de Metas.
- Os helpers de domínio (`matchesGoalAporte`, `matchesGoalMetaClass`, `resolveSyncedGoalProgress`)
  e `sumGoalAporteFromLedger` já existem no mobile.

## Decisões
- Mesmo comportamento do web: best-effort, depois do pagamento gravado, sem bloquear o retorno
  nem propagar erro. Desfazer o pagamento não sincroniza (igual ao web).

## Tarefas
- [x] `syncGoalsFromAporteDescription(description)` em `mobile/src/api/goals/goals.ts`, espelho
      do web (só `financial` + `active`, só grava quando `resolved.changed`).
- [x] Chamar em `updateRecurringParcelPayment` após gravar `paid_parcels`, best-effort.
- [x] Teste em `mobile/src/api/__tests__/goalsAporteSync.test.ts`: casa por "Meta - <título>" e pelo prefixo legado,
      ignora meta não financeira/inativa, não grava sem mudança.

## Prompts
(vazio até haver iteração nova)

## Notas
- 2026-10-05 — a chamada em `updateRecurringParcelPayment` não tem teste próprio (exigiria simular o fluxo inteiro de parcela); o teste cobre a regra em `syncGoalsFromAporteDescription`, e a ligação é uma linha conferida no diff. Typecheck limpo.

## Como testar

1. **Pré-requisitos**: meta financeira ativa "Viagem" com alvo R$ 1.000 e uma recorrência
   parcelada com descrição "Meta - Viagem".
2. **Automatizado**: `cd mobile && npx vitest run --config ./vitest.config.ts goalsAporteSync`.
3. **Manual**: Finanças → Recorrências → marque uma parcela da "Meta - Viagem" como paga → abra
   Metas: o progresso da "Viagem" subiu sem tocar em "Sincronizar".
4. **Borda**: meta concluída ou de categoria não financeira não muda; desmarcar a parcela não
   recalcula (igual ao web).
