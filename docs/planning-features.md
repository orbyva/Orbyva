- [ ] Agrupar cinema/leitura em um grupo, em que serão salvos também não só filmes, séries e livros, mas também vídeos, artigos, posts, álbums/músicas entre outros 
  - colocar tags
  - [ ] Extensão Chrome para Read Later / Marcar como Lido
    -  para artigos/posts/vídeos/conteúdos no geral
    -  o processamento no backend faz a diferenciação do tipo de conteúdo e pode criar categorias
-  Melhoria da parte de tarefas / projetos
   -  ✅ quero poder ter uma criação de um projeto
   -  ✅ quero poder atribuir tarefas para o projeto
   -  devo ser capaz de visualizar em formato de calendário, em formato de cronograma (adiado para v2, fora do escopo do núcleo)
   -  ✅ devo ser capaz de adicionar tags para as tarefas
   -  ✅ devo ser capaz de adicionar prazos para as tarefas
   -  ✅ devo ser capaz de visualizar as tarefas que estão em andamento, em uma seção tipo 'live' que deve ser útil para gerenciamento de tempo e de organização das tarefas
   -  ✅ deve ser possível tipo agrupar, as tarefas, pra poder encadear.
   -  ✅ recorrência de tarefas vinculada a Recorrências Financeiras (ex: pagamento da psicóloga toda terça, DAS), para lembrar de pagamentos nas tarefas e manter os dois em sincronia

   #### Tarefas de implementação — Núcleo de Tarefas/Projetos (v1)
   - [x] Migration: tabelas `projects`, `tasks`, `task_dependencies`, `task_time_entries` + RLS por `user_id` (e07348f; fix de FK task.project_id em 47679bc)
   - [x] `domain/tasks`: `recurrence.ts`, `dependencies.ts` (detecção de ciclo, soft-block), `timeTracking.ts`, `filters.ts` + testes (Vitest) (e07348f)
   - [x] `api/tasks`: `projects.ts`, `tasks.ts` (materialização lazy de recorrência no fetch), `timeEntries.ts`, `dependencies.ts` (e07348f)
   - [x] Página Lista (`/tasks`) com filtro por tag/prazo/projeto (e07348f)
   - [x] Página Projetos (`/tasks/projects`) + Kanban do projeto (`/tasks/projects/:id`) com subtarefas (e07348f; Kanban em e392ffb)
   - [x] Página Live (`/tasks/live`): timer start/pause/stop + histórico de tempo do dia (e392ffb)
   - [x] Recorrência simples (diária/semanal/mensal) na criação/edição de tarefa (e07348f)
   - [x] Novo grupo de navegação "Produtividade" na sidebar (e07348f)

   #### Tarefas de implementação — Vínculo Tarefa ↔ Recorrência Financeira
   Spec: `docs/superpowers/specs/2026-08-06-task-finance-recurrence-link-design.md`
   - [ ] Migration: `task.linked_recurring_id` + `task.linked_installment_number`
   - [ ] `domain/tasks`: `computeMissingLinkedInstallments` (ou equivalente) + testes
   - [ ] `api/tasks`: materialização lazy de instâncias vinculadas às parcelas em aberto
   - [ ] Sync tarefa→Finanças em `updateTask` (chama `updateRecurringParcelPayment`)
   - [ ] Sync Finanças→tarefa em `updateRecurringParcelPayment` (conclui/reabre a tarefa vinculada)
   - [ ] Campo "Vincular a uma Recorrência Financeira" no formulário de tarefa
   - [ ] Ação opcional "Lançar transação" em tarefas não vinculadas ao concluir