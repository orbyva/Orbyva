# 006 — Projeto: cor, notas, eventos + visão Kanban de projetos

## Contexto
Pedido do usuário: projetos devem carregar mais contexto (cor, notas, eventos — reuniões e horários
de trabalho dedicados) e a aba `/tasks/projects` deve virar um painel de verdade, não só uma lista —
com Kanban por status, principais tarefas em andamento, notas e um preview do calendário de cada
projeto.

`Project.color` já existe na tabela e no tipo desde a feature 001, mas nunca foi exposto na UI.
`Project.status` hoje só tem `active/completed/archived` — todo projeto novo já nasce "Ativo", então
não existe um estado "para fazer" para distinguir projeto planejado de projeto em andamento.

## Decisões
- **Novo status `planned`**: `ProjectStatus` vira `"planned" | "active" | "completed" | "archived"`.
  Migration altera a check constraint e o default da coluna para `'planned'`. Projetos existentes
  (todos `active` hoje) não são migrados — o usuário reclassifica manualmente se quiser.
- **`project.notes`**: coluna `text` nullable nova, editada por um textarea no dialog de projeto.
- **`project.color`**: exposto no dialog como uma paleta fixa de ~10 swatches (sem color-picker
  externo — YAGNI). Usado como barra lateral colorida nos cards de projeto (lista e Kanban).
- **Tabela nova `project_event`**: `id, user_id, project_id, title, starts_at (timestamptz),
  ends_at (timestamptz nullable), created_at`. RLS por `user_id`, mesmo padrão de `task`/`project`.
  Entra em `wipe_own_data` e no trigger `enforce_app_access`. Representa reuniões e blocos de tempo
  dedicados ao projeto; consumida por este preview e, depois, pela Agenda de tarefas (fora de escopo
  aqui — nota para revisar quando a Agenda global for tocada de novo).
- **`/tasks/projects` ganha duas visões** (tabs "Lista" / "Kanban", mesmo padrão de tabs já usado):
  - Lista: grid atual, com a barra de cor e um preview de notas (1-2 linhas truncadas) adicionados.
  - Kanban: 3 colunas fixas (Planejado / Ativo / Concluído). Arquivado fica fora do Kanban — um
    toggle "Mostrar arquivados" na Lista cobre esse caso, sem precisar de uma 4ª coluna permanente.
    Sem drag-and-drop nesta rodada (o usuário não pediu explicitamente para projetos, diferente do
    Kanban de tarefas na feature 003) — mudança de status via um select compacto no card.
- **Card do Kanban de projeto mostra**: nome, cor, até 3 tarefas de topo com status `todo`/`doing`
  (ordenadas por prazo), preview de notas, e o próximo `project_event` futuro (título + data) se
  houver. Todos os dados vêm de `fetchTasks()` + `fetchProjectEvents()` já carregados na página e
  agrupados client-side por `project_id` — sem N+1 de queries por card.
- **Gestão de eventos**: lista simples dentro do dialog de edição do projeto (título + data/hora +
  excluir) + mini-formulário para adicionar um novo. Sem edição inline — excluir e recriar cobre o
  caso de uso por ora.

## Tarefas
- [ ] Migration: `project.notes`, novo status `planned` (+ default), tabela `project_event` com
      RLS/wipe/trigger de acesso — pedir confirmação antes de `supabase db push`
- [ ] Types: `Project.notes`, `ProjectStatus` com `planned`, `ProjectEvent`/`ProjectEventCreateRequest`
- [ ] `api/tasks/projectEvents.ts`: fetch/create/delete por projeto
- [ ] Dialog de projeto: campo Cor (paleta de swatches), Notas (textarea), seção de Eventos
- [ ] `domain/tasks/`: função pura para escolher as "principais tarefas em andamento" de um projeto
      (testável)
- [ ] Tabs "Lista"/"Kanban" em `Projects.tsx`; Lista ganha cor/notas/toggle de arquivados
- [ ] Kanban de projetos: 3 colunas, card com tarefas/notas/preview de evento, troca de status via
      select
- [ ] `npm run build && npm run lint` limpos + verificação manual

## Notas
