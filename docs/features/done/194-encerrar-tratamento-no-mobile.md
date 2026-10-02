---
prompt: |-
  E faça isso no mobile:
  [...]
  Saúde
  - Encerrar um tratamento e apagar as doses futuras (endMedication...). Isso só existe em
    MedicationList.tsx, na web.
---

# 194 — Encerrar tratamento no mobile (paridade com a feature 075 da web)

## Contexto
- O "Encerrar medicação" do formulário de Saúde no mobile **já existia** e já apagava as doses
  futuras pendentes — a comparação web × mobile que originou o pedido errou esse ponto.
- O que faltava de fato: excluir uma dose pela tela da tarefa só oferecia "Excluir", que apaga a
  linha com o tratamento ainda ativo — a web recria a dose na próxima carga (o "apago e volta" que a
  feature 075 corrigiu na web com a opção "Encerrar o tratamento").
- O encerramento do mobile também não tinha a ordem garantida nem o erro por etapa da web.

## Decisões
- `endMedicationAndDeleteFutureDoses(medicationId)` no mobile: encerra (`active = false`) e só então
  apaga as doses com `due_date >= hoje`, `completed_at` nulo e `status <> 'done'` — mesmo filtro
  conservador da web (`src/api/tasks/taskRows.ts`). Devolve quantas saíram.
- `EndMedicationError` com `stage` ("deactivate" | "delete"), igual à web; no erro parcial a tela sai
  do formulário, porque o tratamento já está encerrado.
- `deactivateMedication` do mobile passa a delegar para a função nova (mesmo comportamento, agora com
  ordem e erro por etapa).
- Excluir uma dose pela tarefa oferece "Encerrar tratamento" e "Só esta dose", com o aviso de que a
  dose avulsa volta enquanto o tratamento estiver ativo.

## Tarefas
- [x] `mobile/src/api/health/health.ts`: `EndMedicationError` + `endMedicationAndDeleteFutureDoses`;
  `deactivateMedication` delega.
- [x] `mobile/src/api/__tests__/endMedication.test.ts` (Supabase falso com linhas reais): ordem
  encerra → conta → apaga; só doses futuras não tomadas daquele tratamento saem; falha ao encerrar não
  apaga nada; falha ao apagar devolve `stage: "delete"` com o tratamento já encerrado.
- [x] `mobile/src/app/(app)/tasks/form.tsx`: exclusão de dose com "Encerrar tratamento" / "Só esta dose".
- [x] `mobile/src/app/(app)/health/form.tsx`: erro parcial sai da tela.
- [x] `npx tsc --noEmit` e `npx vitest run` no `mobile/` (40 testes).

## Como testar
1. `cd mobile && npx vitest run src/api/__tests__/endMedication.test.ts` — 3 testes passam.
2. No app, abrir uma dose de medicação em Tarefas → Excluir → "Encerrar tratamento": a mensagem diz
   quantas doses saíram; em Saúde a medicação aparece como encerrada; recarregar a web não recria as
   doses futuras.
3. Saúde → editar medicação → "Encerrar medicação": mesmo efeito; "Reativar" volta a gerar doses.
