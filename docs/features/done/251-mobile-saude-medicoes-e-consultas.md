---
prompt: |-
  Pedido do usuário, verbatim (05/10/26) — ver o pedido completo no frontmatter da 250.

  Fatia desta feature: "Editar e excluir medição (lista de progresso)" e "Página com a lista de
  consultas. O mobile mostra só a próxima".
---

# 251 — Mobile: editar/excluir medição e lista de consultas

## Contexto
- Web: `ProgressList.tsx` lista as medições com excluir; `RecordMetricDialog.tsx` edita
  (`updateHealthMetric`). `ConsultationList.tsx` lista as consultas (`fetchConsultationTasks`).
- Mobile: `health/metric-form.tsx` só cria; `health/index.tsx` mostra as medições recentes e só a
  próxima consulta.

## Decisões
- Editar reaproveita `metric-form` com `?id=` (padrão dos outros formulários do mobile).
- Lista de consultas e lista de medições viram rotas próprias (`health/consultations`,
  `health/progress`), alcançadas por links na tela de Saúde — espelho das rotas do web.

## Tarefas
- [x] API mobile: `updateHealthMetric`, `deleteHealthMetric`, `fetchHealthMetricById`,
      `fetchConsultationTasks` em `mobile/src/api/health/health.ts`.
- [x] `metric-form.tsx` aceita `id` (carrega, salva com update, botão excluir).
- [x] Rota `health/progress.tsx`: medições agrupadas por tipo, tocar abre edição, excluir com
      confirmação.
- [x] Rota `health/consultations.tsx`: próximas e passadas, tocar abre a tarefa.
- [x] Links "Ver todas" na tela de Saúde.
- [x] Testes de API das quatro funções novas.

## Prompts
(vazio até haver iteração nova)

## Notas
- "Próximas" usa `status !== "done"` (o web usa `=== "todo"`, que deixava consulta em andamento
  fora das duas listas). Lógica em `domain/health/consultations.ts`, testada em `healthEdit.test.ts`.
- Removido o atalho duplicado "Frequência e horários" da tela de Saúde.
- Telas `progress.tsx`/`consultations.tsx` sem teste de componente (o mobile não tem harness de
  render); a lógica delas está nas funções de API/domínio testadas.

## Como testar

1. **Pré-requisitos**: conta com 2+ medições e 2+ consultas (uma passada, uma futura).
2. **Automatizado**: `cd mobile && npx vitest run --config ./vitest.config.ts healthEdit`.
3. **Manual**: Saúde → "Ver todas as medições" → toque numa medição → mude o valor → salvar →
   valor novo na lista. Excluir outra → some da lista. Saúde → "Ver todas as consultas" →
   aparecem futuras e passadas.
4. **Sinais de que quebrou**: editar cria uma medição nova em vez de alterar.
