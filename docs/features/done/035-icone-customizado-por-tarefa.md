---
prompt: |
  gostaria de poder colocar um ícone atribuído a uma tarefa, de modo que eu possa somente ver as referências dessa tarefa pelo ícone, nas visualizações. algumas tarefas vão ser só marcações e etc.
  - permita adicionar um ícone, não somente selecionar de uma lista, para que eu possa pegar o ícone e adicionar lá
---

# 035 — Ícone customizado por tarefa

## Contexto
Feature nova: nenhum campo de ícone existe hoje em `Task` (`src/types/tasks.ts`) nem componente de
seleção de ícone no domínio de tarefas. Existe um precedente de upload de imagem pro Supabase
Storage em `src/api/albums.ts` (bucket `album-covers`, criado via migration
`supabase/migrations/20260728160000_albums.sql`: `insert into storage.buckets (...)` + policies de
`select`/`insert`/`update`/`delete` restritas por pasta `auth.uid()`), que serve de modelo direto
pra esta feature.

Pedido do usuário: atribuir um ícone a uma tarefa pra reconhecê-la visualmente nas visualizações
(Lista, Kanban, Gantt, Agenda) — "algumas tarefas vão ser só marcações", ou seja, o ícone funciona
como um identificador rápido, não substitui nenhum campo existente (prioridade, status etc.).
Explicitamente pede as duas formas de escolher: selecionar de uma lista pré-definida **e** enviar um
ícone próprio (upload de imagem) — não só uma ou outra.

## Decisões
- Duas colunas novas em `task` (migration nova, `supabase/migrations/<timestamp>_task_icon.sql`):
  `icon_key text null` (chave de um preset fixo, ex. `"flag"`, `"star"`) e `icon_url text null`
  (URL pública de um ícone customizado enviado pelo usuário). Só um dos dois fica preenchido por vez
  — selecionar um preset limpa `icon_url`; fazer upload limpa `icon_key`. Exibição prioriza
  `icon_url` quando presente, senão `icon_key`, senão nenhum ícone.
- Bucket de storage novo `task-icons`, criado na mesma migration, espelhando exatamente o padrão de
  `album-covers` (`public: true`, `file_size_limit` menor já que são ícones — ex. 1MB,
  `allowed_mime_types: image/png, image/jpeg, image/webp, image/svg+xml`) + as 4 policies
  (`select` público, `insert`/`update`/`delete` restritas a `(storage.foldername(name))[1] =
  auth.uid()::text`).
- `icon_key`/`icon_url` adicionados a `Task`/`TaskCreateRequest` (`src/types/tasks.ts`) — já
  passam a existir em `TaskUpdateRequest` automaticamente (`Partial<TaskCreateRequest>`), sem
  mudança em `updateTask`/`createTask` (`src/api/tasks/tasks.ts`, ambos genéricos).
- `uploadTaskIcon(taskId: string, file: File): Promise<string>` em `src/api/tasks/tasks.ts`,
  mesmo padrão de `uploadAlbumCover` em `src/api/albums.ts` (`supabase.storage.from("task-icons")
  .upload(...)` + `getPublicUrl`).
- Catálogo fixo de presets (lista curta de ícones lucide comuns pra marcação — ex. `Flag`, `Star`,
  `Bookmark`, `Pin`, `Bell`, `AlertCircle`, `CheckCircle2`; ajustar lista exata na implementação),
  cada um identificado por uma `icon_key` string.
- Novo componente `TaskIconBadge.tsx`: exibição somente-leitura (renderiza `icon_url` como `<img>`
  pequeno, ou o ícone lucide correspondente a `icon_key`, ou nada quando ambos são `null`) —
  reutilizado em todas as visualizações.
- Novo componente `TaskIconPicker.tsx`: trigger (`TaskIconBadge` do valor atual, ou placeholder "+
  Ícone") que abre um popover com grid de presets clicáveis + um botão "Enviar imagem" (`<input
  type="file" accept="image/*">`) que chama `uploadTaskIcon` e seta `icon_url`; `onChange({
  icon_key, icon_url })`.
- Exibição: `TaskIconBadge` aparece antes do título em `TaskListRow`, `KanbanCard`,
  `GanttTaskNameCell` (Gantt) e nos chips da Agenda (`TaskChip`/`DayViewItemRow` em
  `AgendaGrid.tsx`) — mesma ideia de "um componente central refletido em todas as visões" da
  feature `033`.
- Edição: `TaskIconPicker` como quick-edit em `TaskListRow` (Lista) e `KanbanCard`, com
  `onIconChange` chamando `updateTask({ id, icon_key, icon_url })` — reaproveitando os handlers
  padrão já criados na feature `033`. Também um campo "Ícone" na aba "Geral" do form completo
  (`TaskList.tsx`/`ProjectDetail.tsx`).

## Tarefas
- [x] Migration `supabase/migrations/<timestamp>_task_icon.sql`: colunas `icon_key`/`icon_url` em
      `task` + bucket `task-icons` + policies (espelhando `20260728160000_albums.sql`) — **não
      aplicar (`supabase db push`) sem confirmar com o usuário antes**, conforme regra do projeto.
- [x] Adicionar `icon_key`/`icon_url` em `Task`/`TaskCreateRequest` (`src/types/tasks.ts`).
- [x] `uploadTaskIcon(taskId, file)` em `src/api/tasks/tasks.ts` (mesmo padrão de
      `uploadAlbumCover`).
- [x] Criar `TaskIconBadge.tsx` (exibição somente-leitura: `icon_url` como imagem, `icon_key` como
      ícone lucide, fallback nada).
- [x] Criar `TaskIconPicker.tsx` (trigger + popover com grid de presets e upload custom).
- [x] Adicionar `TaskIconBadge` antes do título em `TaskListRow`, `KanbanCard`,
      `GanttTaskNameCell` e nos chips da Agenda.
- [x] Trocar `TaskIconBadge` estático por `TaskIconPicker` em `TaskListRow` e `KanbanCard`
      (reaproveitando os handlers de quick-edit padronizados na feature `033`).
- [x] Adicionar campo "Ícone" (`TaskIconPicker`) na aba "Geral" do form completo.
- [x] `npx tsc -p tsconfig.app.json --noEmit && npm run build && npm run lint`.
- [x] Testes de componente (Testing Library/jsdom, substituindo o item antigo de "Teste manual" —
      skill `next` proíbe Chrome/browser automation sem exceção): `TaskIconBadge.test.tsx` (fallback
      vazio sem ícone, `<img>` para `icon_url`, prioridade de `icon_url` sobre `icon_key`, os 7
      presets renderizando o ícone lucide certo, `icon_key` desconhecido não renderiza nada);
      `TaskIconPicker.test.tsx` (trigger "+ Ícone"/"Trocar ícone", popover com os 7 presets
      clicáveis chamando `onChange`, `aria-pressed` no preset atual, upload desabilitado + dica
      "Salve a tarefa antes..." quando `taskId` é `null`, upload chamando `uploadTaskIcon` e
      `onChange` com a URL, falha de upload disparando toast de erro sem chamar `onChange`, remover
      ícone); extensão de `TaskViews.test.tsx` provando `TaskIconBadge`/`TaskIconPicker` aparecendo
      e funcionando em `TaskListRow` (Lista) e `KanbanCard` via `TaskQuickFields`.

## Prompts

## Notas
- Migration criada como `supabase/migrations/20260814010000_task_icon.sql` (não
  `20260814000000_task_icon.sql`, que colidiria com a migration não commitada
  `20260814000000_task_estimated_duration.sql` já presente no repo). **Não aplicada** — `supabase
  db push` não foi rodado, conforme regra do projeto; falta confirmação do usuário antes de aplicar
  ao banco remoto (e, por consequência, o bucket `task-icons` só existe no arquivo de migration,
  não no Storage de verdade ainda — o teste manual da última tarefa depende disso).
- Catálogo de presets definido em `TaskIconBadge.tsx` (`TASK_ICON_PRESETS`): `flag`, `star`,
  `bookmark`, `pin`, `bell`, `alert-circle`, `check-circle` — os 7 sugeridos na feature, sem
  ajuste.
- `TaskIconPicker` recebe `taskId: string | null`. Decisão não coberta explicitamente em
  `## Decisões`: quando `taskId` é `null` (formulário de tarefa nova, ainda não salva — não há
  onde gravar o arquivo em `{userId}/{taskId}.{ext}` sem um id), o botão "Enviar imagem" fica
  desabilitado com uma dica ("Salve a tarefa antes de enviar uma imagem"); os presets continuam
  disponíveis (não dependem de `taskId`). Mesma lacuna existe hoje pra `uploadAlbumCover`
  (precisa de um id antes do upload) — resolvida lá gerando o id manual no cliente antes de
  criar; não repliquei esse padrão aqui pra não aumentar o escopo de uma feature já grande, mas é
  uma opção se o usuário preferir permitir upload já na criação.
- `GanttTaskInput`/`GanttNode` (`src/domain/tasks/gantt.ts`) ganharam `icon_key`/`icon_url`
  opcionais pra `GanttTaskNameCell` conseguir renderizar `TaskIconBadge` — exigiu atualizar o
  snapshot `toEqual` do primeiro teste em `gantt.test.ts` (`icon_key: null, icon_url: null`
  adicionados ao nó esperado).
- Verificação rodou `npx tsc -p tsconfig.app.json --noEmit` (não `npx tsc --noEmit` na raiz,
  conforme instrução do projeto) e `npm test` (script real do repo — `npm run test:unit` não
  existe em `package.json`, só `test`/`test:watch`). Suíte completa: 529 passaram, 2 falharam
  (`src/lib/__tests__/currency.test.ts`, `formatDateBR`/`formatDateTimeBR` "retorna travessão" —
  comparam `"—"` e recebem `"·"`). Pré-existente e sem relação com esta feature (não toquei em
  `currency.ts`/esse teste); parece um problema de encoding do caractere em-dash no ambiente de
  teste, não uma regressão desta rodada.
- Não escrevi teste de componente (Testing Library) pro `TaskIconPicker`/`TaskIconBadge`: o repo
  inteiro não tem nenhum `.test.tsx` nem `@testing-library/react` instalado — o padrão existente
  (inclusive nas features `029`/`033`/`034`, que adicionaram componentes equivalentes como
  `TaskPriorityQuickPick`/`TaskDueQuickEdit`/`ProjectBadgeButton`) é cobrir lógica de domínio via
  teste unitário e deixar o comportamento de UI pra a tarefa de "Teste manual" explícita no
  arquivo. Segui a mesma convenção em vez de introduzir infraestrutura de teste de componente só
  pra esta feature.
  **Superado**: a infra de teste de componente (`@testing-library/react`/`jsdom`, `vite.config.ts`
  `environmentMatchGlobs`, `src/test/setup-jsdom.ts`) foi adicionada ao repo depois desta nota, e a
  skill `next` foi atualizada pra proibir Chrome/browser automation sem exceção e exigir cobertura
  automatizada real em vez de "Teste manual". A última tarefa da lista foi reescrita e implementada
  como testes de componente reais: `TaskIconBadge.test.tsx`, `TaskIconPicker.test.tsx`, e uma
  extensão de `TaskViews.test.tsx` cobrindo `TaskListRow`/`KanbanCard` via `TaskQuickFields` — ver
  item marcado `[x]` acima.
