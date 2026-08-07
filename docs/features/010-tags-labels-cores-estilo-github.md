# 010 — Sistema de tags com gestão + cores estilo GitHub (tarefas e projetos)

## Contexto
Hoje tags são só texto livre: `task.tags text[]` (`supabase/migrations/20260803121500_tasks_projects.sql:55`,
`src/types/tasks.ts:59`), digitadas num `Input` de texto separado por vírgula
(`TaskList.tsx:441-446`, `ProjectDetail.tsx:768-773`) — sem cor, sem página de gestão, sem
reaproveitamento (digitar "urgente" duas vezes com grafias diferentes cria duas tags diferentes).
Cor de projeto também é uma paleta fixa de 11 hex hardcoded (`Projects.tsx:62-73`,
`COLOR_SWATCHES`), sem opção de cor aleatória nem cor customizada. Pedido do usuário: um sistema de
tags com página de gestão, criação inline (se não existir, cria), escolha de cor estilo labels do
GitHub (aleatória ou definida) — e o mesmo modelo de cor para projetos, incluindo labels
(tags) nos próprios projetos, que hoje não existem.

## Decisões
- **Tabela nova `tag`**: `id, user_id, name, color (text, hex), created_at`. Único por
  `(user_id, lower(name))` — evita duplicata por capitalização. RLS por `user_id`, entra em
  `wipe_own_data` e no trigger `enforce_app_access`, mesmo padrão de `project_event` (feature 006).
- **Tags são compartilhadas entre tarefas e projetos** — um único catálogo por usuário, não dois
  sistemas paralelos. `task.tags text[]` vira `task.tag_ids uuid[]`; `project` ganha
  `tag_ids uuid[]` novo (projetos não tinham tags antes). Migração de dados: para cada valor
  distinto hoje em `task.tags` (case-insensitive) por usuário, cria uma linha em `tag` com cor
  aleatória do conjunto de presets (decisão abaixo) e reescreve o array da tarefa para `tag_ids`.
- **Cor estilo GitHub labels**: componente compartilhado `LabelColorPicker` (usado por tag e por
  projeto) — botão "Aleatória" sorteia um hex de uma paleta curada de ~20 cores acessíveis (contraste
  ok em light/dark, reaproveita a ideia dos 11 swatches atuais de projeto, ampliada), mais um input
  de cor customizada (`<input type="color">` nativo, sem lib nova) para quem quer definir a cor
  exata. Substitui os `COLOR_SWATCHES` fixos de `Projects.tsx` por esse componente.
- **Criação inline no campo de tag**: campo de busca/combobox (reaproveita `Command`/`Popover` do
  shadcn/ui, já no design system) — digitar filtra tags existentes; se não houver match exato,
  aparece opção "Criar tag '<texto>'" que abre o `LabelColorPicker` (com uma cor aleatória
  pré-selecionada) antes de confirmar. Usado nos formulários de tarefa e agora também no de projeto.
- **Página de gestão `/tasks/tags`**: lista todas as tags do usuário (nome, cor, contagem de uso em
  tarefas + projetos), permite renomear, trocar cor (mesmo `LabelColorPicker`) e excluir (com
  `ConfirmDeleteDialog` — excluir remove a tag de todo `tag_ids` que a referencia, sem excluir as
  tarefas/projetos). Nova entrada na sidebar dentro do grupo "Produtividade".
- **Exibição**: badge de tag em Lista/Agenda/Kanban de tarefas e em Lista/Kanban de projetos usa a
  cor da tag como fundo (com texto claro/escuro calculado por luminância, mesmo princípio do
  GitHub) em vez do `Badge` neutro atual.
- Fora de escopo: hierarquia de tags, tags compartilhadas entre usuários — RLS por `user_id` como
  todo o resto do app.

## Tarefas
- [ ] Migration: tabela `tag` (+ RLS/wipe/trigger), `task.tag_ids uuid[]`, `project.tag_ids uuid[]`,
      script de migração de dados (`task.tags` → linhas de `tag` + `tag_ids`), drop de `task.tags`
      e de `COLOR_SWATCHES`-only — aplicada ao banco remoto
- [ ] Types: `Tag`, `TagCreateRequest`; `Task.tag_ids`, `Project.tag_ids`
- [ ] `api/tasks/tags.ts`: fetch/create/update/delete
- [ ] Componente `LabelColorPicker` (aleatória + custom color input) compartilhado
- [ ] Componente `TagCombobox` (busca + criação inline) usado nos formulários de tarefa e de projeto
- [ ] Página `/tasks/tags` (gestão: renomear, cor, contagem de uso, excluir) + item na sidebar
- [ ] Badges coloridos por tag em Lista/Agenda/Kanban de tarefas e Lista/Kanban de projetos
- [ ] `npm run build && npm run lint` limpos + verificação manual (criar tag nova pelo formulário,
      reaproveitar em outra tarefa/projeto, editar cor na página de gestão e ver refletir nos badges,
      excluir tag e confirmar que só o vínculo some)

## Notas
- Maior mudança de schema do lote — migração de dados de `task.tags text[]` para `tag_ids` precisa
  ser testada com cuidado (dados reais do usuário já têm tags hoje). Rodar `supabase db push` só
  depois de revisar o script de migração de dados com o usuário.
