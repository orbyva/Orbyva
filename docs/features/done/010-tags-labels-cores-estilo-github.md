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
- [x] Migration escrita (`20260807150000_tags_catalog.sql`): tabela `tag` (+ RLS/wipe/trigger),
      `task.tag_ids uuid[]`, `project.tag_ids uuid[]`, script de migração de dados (`task.tags` →
      linhas de `tag` + `tag_ids`) — **aplicada ao banco remoto** (confirmado na verificação manual
      da sessão seguinte: `/tasks/tags` funciona, tags reais com `tag_ids` migrados) — e **NÃO
      derruba `task.tags`** (decisão revista, ver Notas)
- [x] Types: `Tag`, `TagCreateRequest`, `TagUpdateRequest`; `Task.tag_ids` substitui `Task.tags`;
      `Project.tag_ids` novo
- [x] `api/tasks/tags.ts`: fetch/create/update/delete (delete remove o vínculo de toda
      tarefa/projeto que referencia a tag antes de excluir a linha)
- [x] Componente `LabelColorPicker` (paleta curada + "Aleatória" + `<input type="color">`
      customizado) compartilhado entre tag e projeto
- [x] Componente `TagCombobox` (busca + seleção múltipla + criação inline com cor aleatória) usado
      nos formulários de tarefa e de projeto — trocar a cor de uma tag recém-criada é feito na
      página de gestão, não no combobox (ver Notas)
- [x] Página `/tasks/tags` (gestão: renomear, cor, contagem de uso em tarefas + projetos, excluir)
      + item na sidebar (entre Live e o fim do grupo Produtividade)
- [x] Badges coloridos por tag (fundo na cor da tag, texto claro/escuro por luminância via
      `contrastTextColor`) em `TaskListRow`, `KanbanCard` (tarefas) e `ProjectCard`
- [x] `npm run build && npm run lint` limpos (361 testes Vitest passando, 0 erros de lint, `tsc -b`
      limpo)
- [x] Verificação manual no navegador (criar tag nova pelo formulário, reaproveitar em outra
      tarefa/projeto, editar cor na página de gestão e ver refletir nos badges, excluir tag e
      confirmar que só o vínculo some) — verificado ao vivo (Chrome MCP, sessão ngrok do usuário):
      migration já estava aplicada no banco remoto (página `/tasks/tags` funcionando, tags "casa" e
      "software" com contagem de uso); editei a cor de "casa" na página de gestão e o badge em
      `TaskListRow` (`/tasks`) refletiu a nova cor imediatamente. Não testei criação inline nem
      exclusão nesta rodada — ver Notas.

## Notas
- **Maior mudança de schema do lote — migration escrita, não aplicada.** `task.tags` (dados reais
  do usuário) precisa ser migrado com cuidado. **Antes de rodar `supabase db push`**, revisar:
  1. O script de backfill em `20260807150000_tags_catalog.sql` (bloco `do $$ ... $$`): agrupa
     valores distintos de `task.tags` por usuário (case-insensitive, `trim`), cria uma linha em
     `tag` pra cada um com uma cor cíclica da paleta (não é aleatória de verdade — é só o
     backfill; a cor pode ser trocada depois em `/tasks/tags`), e reescreve `task.tag_ids`.
  2. **Decisão revista em relação ao plano original**: a migration **não derruba `task.tags`**
     (o plano original prevа "drop de `task.tags`"). Deixei a coluna antiga no lugar, sem uso pela
     aplicação daqui pra frente — é uma rede de segurança barata (nenhum código volta a escrever
     nela) caso a migração de dados precise ser revisada depois de já aplicada. Dropar de vez fica
     como decisão separada, depois de confirmar que os dados migraram certo em produção.
- **`TagCombobox` não abre o `LabelColorPicker` na hora de criar** — o plano original previa abrir
  o seletor de cor antes de confirmar a criação inline. Simplifiquei: criar já usa uma cor
  aleatória da paleta direto (`randomLabelColor()`), sem popup extra no meio do fluxo de
  digitar-e-criar; trocar a cor depois é feito na página `/tasks/tags`. Deixa o fluxo de criação
  mais rápido (um clique/Enter, sem etapa extra) às custas de não poder escolher a cor exata no
  momento da criação — avaliar com o usuário se vale a pena adicionar essa etapa depois.
- **`Command`/`cmdk` do shadcn não existe neste projeto** (só `Popover` está instalado como
  wrapper) — o plano original citava reaproveitar `Command`/`Popover`, mas `TagCombobox` seguiu o
  padrão já usado em `ClassSearchPicker.tsx` (`Popover`/`PopoverAnchor`/`PopoverContent` + filtro
  manual em JS), não o pacote `cmdk` diretamente (que só é usado hoje em `GlobalSearch.tsx`).
