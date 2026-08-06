# 006 — Planejamento avançado de projeto (cor, prazos, notas, eventos)

## Contexto
O núcleo de Tarefas/Projetos (001) já criou `project.color` e `project.goal_id` no schema, mas nenhum dos dois é exposto na UI — o form de criar/editar projeto (`Projects.tsx`) só tem nome, descrição e status. Cronograma/calendário do módulo foi explicitamente deixado fora do escopo do v1 (ver Notas de 001). Agora o pedido é transformar a página de um projeto num painel de planejamento mais completo: cor de identificação, prazo/janela de execução, notas datadas ao longo do tempo e eventos/marcos relacionados — sem construir o módulo de Calendário completo (isso continua fora de escopo; aqui é planejamento *dentro* de um projeto específico).

## Decisões
- **Cor**: reaproveita `project.color` (já existe, nunca usado na UI). Paleta fixa de ~8-10 swatches predefinidos no form (não color-picker livre), exibida como accent (borda esquerda / dot) nos cards de `Projects.tsx` e no header de `ProjectKanban.tsx`.
- **Prazo/cronograma do projeto**: adiciona `start_date date` e `due_date date` em `project` (migration nova, ambos nullable). Editáveis no mesmo form; no header do Kanban mostram contagem regressiva/atraso, reaproveitando o padrão visual já usado para `task.due_date`.
- **Notas**: tabela nova `project_note` (id, user_id, project_id, body, created_at) — múltiplas notas datadas por projeto, não reaproveita `description` (que é um resumo curto e único). RLS por `user_id`, mesmo padrão do módulo.
- **Eventos relacionados**: tabela nova `project_event` (id, user_id, project_id, title, event_date date, description, created_at). Cobre tanto "cronograma" (marcos/datas) quanto "eventos relacionados" pedidos — um conceito só, para não duplicar. RLS por `user_id`.
- **UI da página do projeto**: `ProjectKanban.tsx` ganha `Tabs` (shadcn, componente já disponível em `components/ui/tabs.tsx`) para separar Kanban / Notas / Eventos, mantendo a URL atual `/tasks/projects/:id` e o comportamento atual do Kanban intacto na primeira aba.
- Sem Supabase Realtime, sem colaboração — mesmo padrão RLS estrito por `user_id` do resto do módulo (igual Finanças/Hábitos/Metas/001).
- `wipe_own_data()` precisa incluir `project_note` e `project_event` na lista de wipe.
- Cálculo de "dias restantes/atrasado" (prazo do projeto) vira função pura em `domain/tasks` com teste Vitest, mesmo padrão de `recurrence.ts`/`filters.ts` — não fica espalhado em JSX.

## Tarefas
- [ ] Migration: `project.start_date`, `project.due_date` (date, nullable) + tabelas `project_note` e `project_event` com RLS completo (select/insert/update/delete own), trigger `enforce_app_access`, e inclusão de ambas em `wipe_own_data()`
- [ ] `types/tasks.ts`: adicionar `start_date`/`due_date` em `Project`; novos tipos `ProjectNote`/`ProjectNoteCreateRequest` e `ProjectEvent`/`ProjectEventCreateRequest`/`ProjectEventUpdateRequest`
- [ ] `domain/tasks`: função pura `projectDeadlineStatus` (dias restantes / atrasado / sem prazo) + teste Vitest
- [ ] `api/tasks/projects.ts`: ajustar tipos para start_date/due_date (create/update já cobrem via spread); novo `api/tasks/projectNotes.ts` (fetch/create/delete) e `api/tasks/projectEvents.ts` (fetch/create/update/delete)
- [ ] Paleta de cor: constante `PROJECT_COLOR_OPTIONS` + pequeno componente de seleção de swatch, reutilizável entre `Projects.tsx` e `ProjectKanban.tsx`
- [ ] `Projects.tsx`: form ganha seletor de cor + `DatePicker` (start_date/due_date); cards da lista mostram accent de cor e badge de prazo
- [ ] `ProjectKanban.tsx`: header mostra cor + prazo/contagem regressiva; envolve conteúdo em `Tabs` (Kanban | Notas | Eventos) sem alterar o Kanban existente
- [ ] Aba "Notas": lista `project_note` (mais recente primeiro) + form de nova nota + excluir (`ConfirmDeleteDialog`)
- [ ] Aba "Eventos": lista `project_event` ordenada por `event_date` + form criar/editar (título, `DatePicker`, descrição) + excluir
- [ ] Verificação final: `npm run build`, `npm run lint`, `npm test` (domínio novo)

## Notas
