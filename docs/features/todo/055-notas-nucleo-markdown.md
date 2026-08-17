---
prompt: |
  - ADICIONAR MÓDULO DE NOTAS
    - CRIAÇÃO DE NOTAS
    - QUERO QUE SEJA UM OBSIDIAN/NOTION TUNADO
    - MARKDOWN NA VEIA COM POSSIBILIDADE DE PLUGINS
    - CRIAÇÃO DE CANVAS/DESENHOS
    - FLOWCHARTS
    - DIAGRAMAS BÁSICOS, IMAGINA O EXCALIDRAW SACA
    - VINCULAM-SE A PROJETOS, CONVERSAM COM TUDO
---

# 055 — Notas: núcleo markdown + vínculo a projeto

## Contexto

O app não tem módulo de notas. O que existe é um embrião: a feature 006 criou a coluna
`project.notes` (`supabase/migrations/20260806130000_project_notes_status_events.sql:4`), um `text`
nullable editado num textarea (`src/pages/admin/tasks/ProjectFormDialog.tsx:147-154`) e exibido com
`line-clamp-2` no card (`src/pages/admin/tasks/Projects.tsx:135-137`). É uma nota só por projeto,
sem título, sem histórico, sem busca.

Esta feature é o **núcleo entregável** do módulo pedido no prompt-mãe: nota markdown de verdade,
com título, CRUD, vínculo a projeto e busca. Os pedidos maiores do prompt (wiki-links/backlinks,
flowcharts/diagramas, canvas estilo Excalidraw, plugins) ficam para 056/057/058 — ver `## Notas`
para a ordem e as dependências. Sem este núcleo nenhuma das outras três tem onde se apoiar.

O app já renderiza markdown: `react-markdown@10` + `remark-gfm@4` estão no `package.json` e são
usados em `src/pages/admin/tasks/TaskDescriptionField.tsx` (abas Escrever/Visualizar + textarea com
handler de `Tab`). Esse componente é o precedente a extrair e reusar, não a reescrever.

## Decisões

- **Tabela `note` própria, não expansão de `project.notes`.** Nota precisa de título, timestamps
  próprios e existir solta (sem projeto) — nada disso cabe numa coluna `text` de `project`.
  Modelagem espelha `project_event` (feature 006, `src/api/tasks/projectEvents.ts`): entidade
  satélite com `user_id` + FK opcional para `project`. Descartado usar tabela genérica
  chave-valor: o app não tem esse padrão em lugar nenhum e ela pioraria o type-safety.
- **`project_id` é FK direta e nullable na própria `note`, não tabela de junção.** O prompt diz
  "VINCULAM-SE A PROJETOS" — vínculo primário, 1 projeto por nota, que é o caso real. O vínculo
  N:N genérico com *qualquer* entidade ("CONVERSAM COM TUDO") é problema da 056 e usa tabela
  separada, sem mexer nesta coluna. Descartado já nascer polimórfico: adia o núcleo utilizável e
  inaugura um padrão que o app não tem (confirmado: `src/api/search.ts` e `src/api/timeline.ts`
  agregam por união discriminada em TypeScript, não por referência polimórfica no banco).
- **`project.notes` é copiado agora; a coluna só é removida depois — migração e destruição em
  passos separados.** A migration desta feature **só copia** `project.notes` não-vazio para uma
  `note` com `project_id` preenchido e título `Notas do projeto`. A coluna **permanece no banco,
  intocada**, e a UI para de lê-la e escrevê-la (o textarea sai do formulário de projeto e do card;
  o lugar das notas de projeto passa a ser a aba de Notas). Ela vira órfã de propósito.
  Motivo: este é o banco remoto, com dados reais, e não há Supabase local para ensaiar. Copiar e
  dropar na mesma transação torna qualquer erro de filtro irreversível — o `btrim(notes) <> ''` já
  exclui casos de propósito, e um filtro errado levaria o original junto, sem de onde recuperar.
  Mantendo a coluna, o usuário confere na prática, usando o app, que nada se perdeu, e ainda existe
  caminho de volta enquanto o módulo novo não foi validado em uso real.
  O `drop column` é a **última tarefa da 058**, com o pré-requisito escrito de confirmação do
  usuário. Descartado dropar aqui: o risco de duplicidade que o drop evita é cosmético (a coluna
  fica invisível na UI), e o risco que ele cria é perda de dado do usuário.
- **Editor V1 = textarea + preview, zero dependência nova.** Extrair o padrão de
  `TaskDescriptionField.tsx` para um `MarkdownEditor`/`MarkdownPreview` compartilhado.
  `scripts/check-bundle-budget.mjs` impõe 160 KB gzip por chunk de rota e o prompt pede "MARKDOWN
  NA VEIA" — texto cru, não WYSIWYG. Um editor com syntax highlight (CodeMirror 6) é upgrade real
  mas é decisão da 056, com o núcleo já funcionando. Descartado TipTap/ProseMirror de saída:
  são WYSIWYG que persistem JSON próprio, o oposto de "markdown na veia", e criariam lock-in de
  formato logo na primeira migration.
- **HTML cru fica desabilitado no markdown — decisão explícita, não acidente.** `react-markdown@10`
  não renderiza HTML embutido a menos que se adicione `rehype-raw`; o app não tem `rehype-raw`,
  `rehype-sanitize` nem `dompurify` instalados. Portanto o núcleo é seguro sem dependência nova, e
  **assim deve continuar**: nenhuma feature posterior pode habilitar `rehype-raw` sem, no mesmo
  passo, adicionar `rehype-sanitize`. Vale o mesmo para SVG vindo de fora do markdown (mermaid na
  057, `exportToSvg` do Excalidraw na 058): SVG injetado como HTML carrega vetor de XSS e precisa
  ser sanitizado ou inserido por API que não interprete script. Registrado aqui porque este é o
  arquivo que cria o `MarkdownPreview` — quem for mexer nele vê a restrição.
- **Busca reusa `searchGlobal`.** `src/api/search.ts` já faz fan-out `ilike` por tabela com união
  discriminada; adicionar `kind: "note"` é seguir o padrão, não criar busca paralela.
- **Cor de módulo:** Notas entra no grupo **Produtividade** da sidebar (junto de Tarefas/Projetos)
  e reusa `moduleColors.productivity` (`src/lib/design-tokens.ts:16`). Não inventar cor nova para
  um módulo que é irmão de Tarefas.
- **Autosave com debounce, sem botão Salvar como única via.** Nota longa perde conteúdo se
  depender de clique. Debounce de ~800 ms + indicador de estado; `useToast` só no erro
  (`getErrorMessage`), para não spammar toast a cada tecla.

## Tarefas

- [ ] Criar migration `supabase/migrations/<TIMESTAMP>_notes_core.sql` (conferir com
      `ls supabase/migrations/` que o timestamp é único — nunca repetir, já causou bug de
      bookkeeping do CLI). Conteúdo: tabela `public.note` com `id uuid pk default
      gen_random_uuid()`, `user_id uuid not null references auth.users(id) on delete cascade`,
      `project_id uuid references public.project(id) on delete set null`, `title text not null`,
      `content text not null default ''`, `created_at`/`updated_at timestamptz not null default
      now()`; índices `note_user_updated_idx (user_id, updated_at desc)` e
      `note_project_idx (project_id)`; `comment on table`.
- [ ] Na mesma migration: `enable row level security` + as 4 policies
      `note_{select,insert,update,delete}_own` com `user_id = auth.uid()`, no formato
      `drop policy if exists` + `create policy ... to authenticated` copiado de
      `20260806130000_project_notes_status_events.sql`.
- [ ] Na mesma migration: adicionar `'note'` à lista de tabelas da função `public.wipe_own_data()`
      (antes de `project`, pois tem FK para ele) e criar o trigger
      `trg_enforce_app_access` em `public.note` no mesmo bloco `do $$ ... $$` condicional usado na
      migration da 006. Sem isso a nota escapa do wipe de conta e do gate Pro.
- [ ] Na mesma migration: **copiar** os dados — `insert into public.note (user_id, project_id,
      title, content) select user_id, id, 'Notas do projeto', notes from public.project where notes
      is not null and btrim(notes) <> ''`. **Não incluir `drop column` aqui**: a coluna
      `project.notes` fica no banco, intocada (ver Decisões; o drop é a última tarefa da 058).
      **Não rodar `supabase db push` sem confirmar com o usuário.**
- [ ] Verificação manual pós-`db push` — obrigatoriamente manual, porque não há Supabase local e o
      Vitest deste repo cobre só domínio puro, sem I/O e sem RLS. No SQL editor do Supabase:
      registrar `select count(*) from project where notes is not null and btrim(notes) <> ''`
      **antes** do push e conferir que bate com `select count(*) from note where title = 'Notas do
      projeto'` depois; confirmar que `project.notes` **continua existindo** com o conteúdo
      original; e, logado como o usuário no app, conferir que a lista de notas só traz as próprias
      (prova prática da RLS).
- [ ] Criar `src/types/notes.ts` com `Note` (campos da tabela, `project_id: string | null`) e
      `NoteDraft` (payload de create/update). Tipos definidos uma vez, reusados por api+domain.
- [ ] Criar `src/domain/notes/noteDraft.ts` (exports nomeados, funções puras, sem I/O):
      `normalizeNoteDraft` (trim de título, título vazio vira `Sem título`, limite de tamanho) e
      `noteExcerpt(content, max)` (primeira linha não-vazia sem marcação, para o card da lista).
- [ ] Criar `src/domain/notes/__tests__/noteDraft.test.ts` (Vitest) cobrindo: título só-espaços,
      excerpt ignorando linhas de `#`/`-`, excerpt truncando sem cortar palavra no meio.
      Verificação: `npm test`.
- [ ] Criar `src/api/notes/notes.ts`: `fetchNotes({ projectId? })`, `fetchNote(id)`, `createNote`,
      `updateNote`, `deleteNote` — todas filtrando por `user_id` via `getCurrentUserId()` e
      setando `updated_at` no update, no mesmo formato de `src/api/tasks/projectEvents.ts`.
- [ ] Extrair o markdown de `src/pages/admin/tasks/TaskDescriptionField.tsx` para
      `src/components/MarkdownPreview.tsx` (a constante `MARKDOWN_PREVIEW_CLASS` + o
      `<ReactMarkdown remarkPlugins={[remarkGfm]}>`), e trocar `TaskDescriptionField` para
      consumi-lo. Verificação: `npm run build` e a descrição de tarefa continua renderizando igual.
- [ ] Criar `src/pages/admin/notes/NoteEditor.tsx`: input de título, textarea de conteúdo com o
      handler de `Tab` de `TaskDescriptionField`, abas Escrever/Visualizar usando
      `MarkdownPreview`, e `ProjectPicker` (`src/pages/admin/tasks/ProjectPicker.tsx`) para o
      vínculo. Autosave com debounce ~800 ms + indicador `Salvando…`/`Salvo`; erro via `useToast`
      + `getErrorMessage`.
- [ ] Criar `src/pages/admin/notes/Notes.tsx` (default export): `PageShell` com eyebrow
      "Produtividade", lista de notas (título + excerpt + projeto + data), campo de filtro por
      texto, `EmptyState` quando vazio, `TableLoadingSkeleton` no loading e
      `ConfirmDeleteDialog` no excluir — mesmo padrão de `Goals.tsx`/`Habits.tsx`.
- [ ] Registrar as rotas em `src/routes.tsx` com `lazy()` como as demais: `notes` → `Notes` e
      `notes/:id` → página de detalhe que monta o `NoteEditor`.
- [ ] Adicionar `{ title: "Notas", url: "/notes" }` ao grupo **Produtividade** em
      `src/components/app-sidebar.tsx` (depois de "Projetos").
- [ ] Adicionar aba **Notas** em `src/pages/admin/tasks/ProjectDetail.tsx` (junto de
      Kanban/Lista/Gantt, `TabsList` na linha ~628): lista as notas com `project_id` daquele
      projeto, com ação de criar nota já vinculada. É o vínculo no sentido projeto → nota.
- [ ] Fazer a UI parar de ler e escrever `project.notes` (a coluna continua no banco): remover o
      textarea de `src/pages/admin/tasks/ProjectFormDialog.tsx:147-154`, o `line-clamp-2` de
      `src/pages/admin/tasks/Projects.tsx:135-137`, o campo de `src/types/tasks.ts:9` e a coluna
      dos `select` em `src/api/tasks/projects.ts`. A partir daqui o lugar das notas de projeto é a
      aba de Notas. Verificação: `npm run build` sem erro de tipo — é o que prova que não sobrou
      nenhuma referência viva à coluna.
- [ ] Adicionar `kind: "note"` em `src/api/search.ts` (`GlobalSearchKind`, o `Promise.all` com
      `ilike` em `title`/`content`, e o push do hit com `href: /notes/<id>`).
      Verificação manual: buscar por um trecho que só exista dentro de uma nota e ver o hit levar
      ao editor certo.
- [ ] Rodar `npm run build`, `npm run lint`, `npm test` e `npm run check:bundle` — este último
      confirma que o chunk da rota `/notes` cabe nos 160 KB gzip (deve caber folgado: nenhuma
      dependência nova nesta feature).

## Prompts

- 2026-08-16 — prompt que originou o módulo de Notas, verbatim:

```
- ADICIONAR MÓDULO DE NOTAS
  - CRIAÇÃO DE NOTAS
  - QUERO QUE SEJA UM OBSIDIAN/NOTION TUNADO
  - MARKDOWN NA VEIA COM POSSIBILIDADE DE PLUGINS
  - CRIAÇÃO DE CANVAS/DESENHOS
  - FLOWCHARTS
  - DIAGRAMAS BÁSICOS, IMAGINA O EXCALIDRAW SACA
  - VINCULAM-SE A PROJETOS, CONVERSAM COM TUDO
```

## Notas

- **Ordem de implementação do módulo (dependências):**
  `055` (núcleo: tabela `note` + markdown + projeto + busca) →
  `056` (wiki-links `[[nota]]`, backlinks, vínculo genérico a qualquer entidade, editor com syntax
  highlight) →
  `057` (registry de renderers de bloco = os "plugins" do prompt; mermaid para flowchart/diagrama) →
  `058` (canvas de desenho livre estilo Excalidraw).
  056, 057 e 058 dependem todas da tabela `note` criada aqui. 057 e 058 são independentes entre si
  e podem trocar de ordem; 056 é a que mais muda o editor, então vem antes das duas.
- O prompt-mãe pede o módulo inteiro ("Obsidian/Notion tunado"). Esta feature **não** cumpre o
  prompt sozinha — só o cumprimento das quatro fecha o pedido. Não mover o conjunto para `done/`
  achando que a 055 bastou.
- **Pendência deixada de propósito:** ao fim desta feature a coluna `project.notes` continua no
  banco, com o conteúdo original, sem nenhum código lendo ou escrevendo nela. Isso é intencional —
  é o caminho de volta enquanto o módulo novo não foi usado de verdade. O `drop column` é a última
  tarefa da 058 e depende de confirmação explícita do usuário de que as notas migradas estão todas
  visíveis no módulo novo. Se as quatro features forem concluídas e essa coluna ainda existir, não
  é esquecimento: é a ordem combinada.

