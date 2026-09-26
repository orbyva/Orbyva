# 001 — Núcleo de Tarefas/Projetos (v1)

## Contexto
Módulo novo e independente de Tarefas/Projetos — criação de projetos, tarefas com tags/prazo/subtarefas/dependências, visão Lista + Kanban, timer "Live" (start/pause/stop) e recorrência simples. Sem depender de Metas/Hábitos, sem Supabase Realtime.

Plano completo original: `docs/superpowers/plans/2026-08-03-tasks-projects-core-v1.md`.

## Decisões
- RLS estritamente por `user_id` — sem convites/colaboração, igual Finanças/Hábitos/Metas.
- v1 cobre só Lista + Kanban. Calendário/cronograma fica para uma feature própria (ver Notas).
- Kanban sem drag-and-drop — mudança de status via botões (YAGNI, evita dependência nova).
- Dependências entre tarefas são soft-block — aviso visual, nunca impede a ação do usuário.
- Recorrência: só `daily | weekly | monthly` + `interval`, geração lazy no `fetchTasks`.

## Tarefas
- [x] Migration: tabelas `project`, `task`, `task_dependency`, `task_time_entry` + RLS (e07348f; fix de FK `task.project_id` → `on delete set null` em 47679bc)
- [x] `domain/tasks`: `recurrence.ts`, `dependencies.ts` (ciclo, soft-block), `timeTracking.ts`, `filters.ts` + testes Vitest (e07348f)
- [x] `api/tasks`: `projects.ts`, `tasks.ts` (materialização lazy de recorrência), `timeEntries.ts`, `dependencies.ts` (e07348f)
- [x] Página Lista (`/tasks`) com filtro por tag/prazo/projeto (e07348f)
- [x] Página Projetos (`/tasks/projects`) + Kanban do projeto (`/tasks/projects/:id`) com subtarefas (e07348f; Kanban em e392ffb)
- [x] Página Live (`/tasks/live`): timer start/pause/stop + histórico de tempo do dia (e392ffb)
- [x] Recorrência simples (diária/semanal/mensal) na criação/edição de tarefa (e07348f)
- [x] Grupo de navegação "Produtividade" na sidebar (e07348f)

## Notas
- O trabalho original foi implementado num worktree (`worktree-tasks-projects-core-v1`) que ficou 10 commits atrás de `master` — migration nunca chegou a ser aplicada no banco remoto e o worktree divergiu o suficiente pra causar um bug real de bookkeeping do Supabase CLI (duas migrations com o mesmo timestamp). Todo o trabalho foi reportado para a branch `feat/produtividade` (a partir de `master` atualizado) nos commits acima; o worktree foi removido.
- Visão de Calendário (organizar sessões/eventos, alocar tarefas por dia) ficou fora do escopo do núcleo — vira feature própria quando especificada.
- Bug real encontrado e corrigido durante o desenvolvimento da feature 002: editar uma tarefa vinculada a uma Recorrência Financeira zerava seu `due_date`. Ver `docs/features/done/002-vinculo-tarefa-recorrencia-financeira.md`.
- **A decisão "RLS estritamente por `user_id` — sem convites/colaboração" foi revertida em parte pela feature 076**, e só para **eventos de agenda** (`project_event`). Motivo: o pedido do usuário na 076 era literalmente "criar um convite para alguém... cria o evento na agenda dela", e isso não cabe num módulo monousuário. A reversão é deliberadamente mínima — as 4 policies de `project_event` continuam `user_id = auth.uid()` e não há leitura cruzada: aceitar um convite **copia** o evento para a conta do convidado (`project_id = null`), via RPC `security definer`. Tarefas, projetos, subtarefas e apontamento de tempo continuam estritamente monousuário. Ver `docs/features/done/076-enviar-convite-para-um-evento.md`.
