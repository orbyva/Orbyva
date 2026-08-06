# 002 — Vínculo Tarefa ↔ Recorrência Financeira

## Contexto
Lembrar de pagamentos recorrentes nas tarefas (ex.: psicóloga toda terça, DAS mensal), com sincronização bidirecional para Recorrências Financeiras quando a cadência é mensal/anual. Pedido original do usuário, não uma linha pré-existente de um doc-fonte.

Spec completa: `docs/superpowers/specs/2026-08-06-task-finance-recurrence-link-design.md`.
Plano completo: `docs/superpowers/plans/2026-08-06-task-finance-recurrence-link.md`.

## Decisões
- Tarefa vinculada não usa `recurrence_rule` própria — quem dita as datas é a Recorrência Financeira (elimina duas engines de recorrência independentes precisando bater por data).
- Sync bidirecional: concluir a tarefa marca a parcela paga (reaproveita `updateRecurringParcelPayment`, já existente); marcar a parcela paga em Finanças conclui a tarefa. Desfazer em qualquer lado desfaz no outro.
- Recorrências Financeiras só suportam Mensal/Anual — não foi estendido para Semanal nesta rodada. Casos semanais (psicóloga) continuam tarefa recorrente comum, sem vínculo, com ação opcional "Lançar transação" ao concluir.
- Vínculo configurado no formulário de Tarefa (não no de Recorrência). Só tarefas de topo — subtarefas não são vinculáveis.
- Sync Finanças→Tarefa nunca chama `updateTask` (grava direto na tabela `task`) para não recursar com o sync Tarefa→Finanças.

## Tarefas
- [x] Migration: `task.linked_recurring_id` + `task.linked_installment_number` (f934830)
- [x] Types: `Task.linked_recurring_id`/`linked_installment_number` (5d823f3)
- [x] `domain/tasks/linkedInstallments.ts`: `computeMissingLinkedInstallments` + testes (f771e33)
- [x] `api/recurring.ts`: `fetchRecurringTransactionsByIds` + sync Finanças→Tarefa em `updateRecurringParcelPayment` (6c8a002; guard contra erro derrubar operação principal em 3a533cd)
- [x] `api/tasks/tasks.ts`: materialização de instâncias vinculadas + sync Tarefa→Finanças em `updateTask` (d602d9e)
- [x] UI `TaskList.tsx`: campo de vínculo, filtro de tarefas-template, "Lançar transação" (9be9ecd)
- [x] UI `ProjectKanban.tsx`: idem (ea94a33)
- [x] UI `Live.tsx`: exclui tarefas-template do seletor (0719ee3)
- [x] Fix: editar uma instância vinculada zerava `due_date` (bug encontrado na verificação manual, não estava no plano original) (2802313)
- [x] Verificação manual fim a fim: materialização, sync nos dois sentidos (incluindo desfazer), reparo da linha corrompida pelo bug do `due_date`, "Lançar transação" ao vivo — tudo confirmado no navegador; dados de teste limpos

## Notas
- Migration `20260803120000_tasks_projects.sql` (feature 001) e uma segunda migration do mesmo dia (`ops_trial_ends_at`) compartilhavam o mesmo timestamp — corrompeu o bookkeeping de migrations do Supabase CLI e mascarou por um tempo que a migration da feature 001 nunca tinha sido de fato aplicada ao banco remoto. Renomeada para `20260803121500` antes de aplicar. Lição: nunca duas migrations com o mesmo timestamp (ver `docs/stack.md`).
- Bug real encontrado durante a verificação manual (não capturado pelo review por task, já que o bug atravessa como o dialog de edição interage com uma linha já materializada): `TaskList.tsx`/`ProjectKanban.tsx` zeravam `due_date` de qualquer edição em uma tarefa vinculada, mesmo quando a edição era só reatribuir o projeto. Corrigido distinguindo "editando o template" (zera `due_date`, correto) de "editando uma instância já materializada" (nunca deve zerar). Ver commit `2802313`.
- Confirmado via query direta ao banco (não só pela UI) que o sync nas duas direções funciona, incluindo desfazer pagamento em Finanças reabrindo a tarefa.
- Gap de UX descoberto durante a verificação, fora do escopo desta feature: a lista flat de Tarefas (`/tasks`) não tem nenhum jeito de marcar status — só o Kanban tem (e exige a tarefa pertencer a um projeto). Tarefas sem projeto (como "Pagar DAS"/"Pagar psicóloga" no mundo real) não têm como ser concluídas sem antes serem movidas para um projeto. Candidato a virar o círculo de conclusão pedido na visão agrupada de Tarefas (Hoje/Essa semana/Esse mês) ainda não especificada.
