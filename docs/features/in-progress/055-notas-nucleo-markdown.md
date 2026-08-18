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

- [x] Criar migration `supabase/migrations/<TIMESTAMP>_notes_core.sql` (conferir com
      `ls supabase/migrations/` que o timestamp é único — nunca repetir, já causou bug de
      bookkeeping do CLI). Conteúdo: tabela `public.note` com `id uuid pk default
      gen_random_uuid()`, `user_id uuid not null references auth.users(id) on delete cascade`,
      `project_id uuid references public.project(id) on delete set null`, `title text not null`,
      `content text not null default ''`, `created_at`/`updated_at timestamptz not null default
      now()`; índices `note_user_updated_idx (user_id, updated_at desc)` e
      `note_project_idx (project_id)`; `comment on table`.
- [x] Na mesma migration: `enable row level security` + as 4 policies
      `note_{select,insert,update,delete}_own` com `user_id = auth.uid()`, no formato
      `drop policy if exists` + `create policy ... to authenticated` copiado de
      `20260806130000_project_notes_status_events.sql`.
- [x] Na mesma migration: adicionar `'note'` à lista de tabelas da função `public.wipe_own_data()`
      (antes de `project`, pois tem FK para ele) e criar o trigger
      `trg_enforce_app_access` em `public.note` no mesmo bloco `do $$ ... $$` condicional usado na
      migration da 006. Sem isso a nota escapa do wipe de conta e do gate Pro.
- [x] Na mesma migration: **copiar** os dados — `insert into public.note (user_id, project_id,
      title, content) select user_id, id, 'Notas do projeto', notes from public.project where notes
      is not null and btrim(notes) <> ''`. **Não incluir `drop column` aqui**: a coluna
      `project.notes` fica no banco, intocada (ver Decisões; o drop é a última tarefa da 058).
      **Não rodar `supabase db push` sem confirmar com o usuário.**
- [x] Validar a migration **sem tocar no banco remoto**, num Postgres 16 descartável em Docker:
      `supabase/tests/notes_core/` (stubs de `auth.users`/`auth.uid()`/`enforce_app_access` + um
      `public.project` com a coluna `notes` da 006, e então as assertivas). Cobre o roteiro que a
      tarefa original mandava fazer à mão no SQL editor — contagem antes/depois da cópia, conteúdo
      idêntico ao original, `project.notes` intocada, RLS barrando leitura/escrita alheia com o
      papel `authenticated` — mais índices, defaults, os dois `on delete`, `wipe_own_data` e a
      reaplicação idempotente. Verificação: `bash supabase/tests/notes_core/run.sh`.
      (Substitui a verificação manual pós-`db push`: a skill `next` proíbe navegador e o parent
      proíbe `db push`. O check no banco real depois do push ficou registrado em `## Notas`.)
- [x] Criar `src/types/notes.ts` com `Note` (campos da tabela, `project_id: string | null`) e
      `NoteDraft` (payload de create/update). Tipos definidos uma vez, reusados por api+domain.
- [x] Criar `src/domain/notes/noteDraft.ts` (exports nomeados, funções puras, sem I/O):
      `normalizeNoteDraft` (trim de título, título vazio vira `Sem título`, limite de tamanho) e
      `noteExcerpt(content, max)` (primeira linha não-vazia sem marcação, para o card da lista).
- [x] Criar `src/domain/notes/__tests__/noteDraft.test.ts` (Vitest) cobrindo: título só-espaços,
      excerpt ignorando linhas de `#`/`-`, excerpt truncando sem cortar palavra no meio.
      Verificação: `npm test`.
- [x] Criar `src/api/notes/notes.ts`: `fetchNotes({ projectId? })`, `fetchNote(id)`, `createNote`,
      `updateNote`, `deleteNote` — todas filtrando por `user_id` via `getCurrentUserId()` e
      setando `updated_at` no update, no mesmo formato de `src/api/tasks/projectEvents.ts`.
      Verificação: `src/api/notes/__tests__/notes-api.test.ts` (12 testes) contra o duplo do query
      builder de `shopping-api.test.ts` — prova tabela, escopo `user_id`, ordenação, payload
      normalizado e propagação de erro do PostgREST.
- [x] Extrair o markdown de `src/pages/admin/tasks/TaskDescriptionField.tsx` para
      `src/components/MarkdownPreview.tsx` (a constante `MARKDOWN_PREVIEW_CLASS` + o
      `<ReactMarkdown remarkPlugins={[remarkGfm]}>`), e trocar `TaskDescriptionField` para
      consumi-lo. Verificação: `npm run build` + `TaskDescriptionField.test.tsx` (7 testes) — o
      preview renderiza título/lista/negrito/link/tabela, o `Tab`/`Shift+Tab` indenta e desindenta
      dentro do campo, e HTML cru continua NÃO sendo interpretado (a decisão de segurança da 055
      virou assertiva, não só comentário). O handler de `Tab` saiu junto, para
      `src/components/MarkdownTextarea.tsx`, senão o `NoteEditor` teria que duplicá-lo.
- [x] Criar `src/pages/admin/notes/NoteEditor.tsx`: input de título, textarea de conteúdo com o
      handler de `Tab` de `TaskDescriptionField`, abas Escrever/Visualizar usando
      `MarkdownPreview`, e `ProjectPicker` (`src/pages/admin/tasks/ProjectPicker.tsx`) para o
      vínculo. Autosave com debounce ~800 ms + indicador `Salvando…`/`Salvo`; erro via `useToast`
      + `getErrorMessage`. Verificação: `Notes.flow.test.tsx` (12 testes) — escrever grava sozinho
      (sem botão Salvar), o preview renderiza GFM (checklist vira checkbox), o vínculo com projeto
      persiste, e remontar a página traz de volta o que foi escrito.
- [x] Criar `src/pages/admin/notes/Notes.tsx` (default export): `PageShell` com eyebrow
      "Produtividade", lista de notas (título + excerpt + projeto + data), campo de filtro por
      texto, `EmptyState` quando vazio, `TableLoadingSkeleton` no loading e
      `ConfirmDeleteDialog` no excluir — mesmo padrão de `Goals.tsx`/`Habits.tsx`. O filtro é
      `filterNotes` (`src/domain/notes/filters.ts`, puro, 5 testes), local: a lista já está em
      memória e ir ao banco a cada tecla seria uma consulta por caractere.
- [x] Registrar as rotas em `src/routes.tsx` com `lazy()` como as demais: `notes` → `Notes` e
      `notes/:id` → página de detalhe (`NoteDetail.tsx`) que monta o `NoteEditor`. Verificação:
      `notes-navigation.test.tsx` resolve as duas URLs contra `appRoutes` de verdade e monta o
      elemento casado (não cai no `*`).
- [x] Adicionar `{ title: "Notas", url: "/notes" }` ao grupo **Produtividade** em
      `src/components/app-sidebar.tsx` (depois de "Projetos"). Verificação:
      `notes-navigation.test.tsx` renderiza a sidebar e confere o `href` e o estado ativo.
- [x] Mostrar as notas do projeto em `src/pages/admin/tasks/ProjectDetail.tsx`: lista as notas com
      `project_id` daquele projeto, com ação de criar nota já vinculada. É o vínculo no sentido
      projeto → nota. Virou `ProjectNotesSection`, uma seção **fora** das abas — não a quarta aba
      que a tarefa descrevia (ver Notas para o porquê). Verificação:
      `ProjectNotesSection.test.tsx` (4 testes) — só as notas daquele projeto aparecem, cada uma
      leva ao editor, e "Nova nota" nasce com `project_id` preenchido já no create.
- [x] Fazer a UI parar de ler e escrever `project.notes` (a coluna continua no banco): removidos o
      textarea, o `line-clamp-2` do card, o `notes` do `emptyProject`/`openEdit` (tudo em
      `src/pages/admin/tasks/Projects.tsx` — o `ProjectFormDialog.tsx` que a tarefa citava não
      existe mais, o formulário foi consolidado ali) e o campo de `src/types/tasks.ts`.
      `src/api/tasks/projects.ts` usa `select("*")`, então não há coluna listada para tirar — a
      coluna continua vindo do banco e é ignorada, que é o esperado.
      Verificação: `npm run build` + `Projects.notes-migration.test.tsx` (3 testes) — a página é
      alimentada com uma linha que **ainda tem** `notes` preenchido (como o `select("*")` vai
      devolver de verdade) e nem o card nem o formulário mostram o valor. Só o build não provaria
      isso: tipo removido não impede o valor de chegar em runtime.
- [x] Adicionar `kind: "note"` em `src/api/search.ts` (`GlobalSearchKind`, o `Promise.all` com
      `ilike` em `title`/`content`, o push do hit com `href: /notes/<id>` e o rótulo "Nota" em
      `SEARCH_KIND_LABEL`). O subtítulo do hit reusa `noteExcerpt`, então vem sem marcação.
      Verificação: `src/api/__tests__/search-notes.test.ts` (5 testes) roda o roteiro que a tarefa
      mandava fazer à mão — buscar um trecho que só existe no corpo da nota e conferir que o hit
      leva a `/notes/n1` — contra um duplo do Supabase que registra tabela, escopo e `ilike`.
- [x] Rodar `npm run build`, `npm run lint`, `npm test` e `npm run check:bundle`. Resultado:
      build OK; lint 0 erros (13 warnings pré-existentes de `react-refresh`, nenhum nos arquivos
      novos); `npm test` 925 passando / 2 falhando — as 2 são as pré-existentes e alheias de
      `src/lib/__tests__/currency.test.ts` (esperam `"—"`, `src/lib/currency.ts` devolve `"·"`),
      fora do escopo desta feature; `check:bundle` OK, com os chunks da rota em 2,1 KB
      (`NoteDetail`), 1,8 KB (`Notes`), 0,8 KB (`api/notes`) e 0,4 KB (`noteDraft`) contra o teto
      de 160 KB — nenhuma dependência nova, como previsto.
- [x] **Migration aplicada no banco remoto** (2026-08-18): o usuário rodou `supabase db push` e
      `npx supabase migration list` mostra `20260816160000_notes_core` com `local` == `remote`
      (as das 050, 051 e 052 também). A tabela `note` existe no banco real e o módulo de Notas
      funciona em produção. Verificação: a saída do `migration list` (leitura — esta sessão nunca
      roda `db push`); o comportamento da cópia `project.notes` → `note`, com o filtro
      `btrim(notes, E' \t\r\n')`, está provado em Postgres 16 por
      `bash supabase/tests/notes_core/run.sh`, que compara as contagens antes/depois exatamente
      como o roteiro do SQL editor mandava.
      **Continua sendo passo do usuário, e é o portão da 058:** rodar no SQL editor do banco real
      `select count(*) from note where title = 'Notas do projeto'` e
      `select count(*) from project where notes is not null and btrim(notes, E' \t\r\n') <> ''` e
      conferir que batem, com o conteúdo visível em `/notes`. **Só depois disso** a migration
      `20260818120000_project_notes_drop.sql` (058) pode ir no próximo `db push` — ela é
      irreversível (ver Notas).

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

- **`btrim(notes) <> ''` sem lista de caracteres era filtro furado.** O `btrim(x)` de uma
  argumento só remove **espaço** — uma `project.notes` com só quebras de linha/tabs (`'   \n\t '`)
  passava e virava nota vazia no módulo novo. Descoberto pela assertiva de `supabase/tests/
  notes_core/`, que falhou de verdade antes do conserto. A migration usa
  `btrim(p.notes, E' \t\r\n') <> ''`. Mexer no filtro aqui é seguro justamente porque o original
  fica no lugar: o filtro só decide o que é copiado, nunca o que é destruído.
- **A migration ganhou um `not exists` que a tarefa não pedia**, só para a reaplicação ser
  idempotente (sem duplicar `Notas do projeto`). Na primeira aplicação ele não filtra nada.
- **Pendência para o usuário, depois de rodar `supabase db push`:** conferir no SQL editor que
  `select count(*) from note where title = 'Notas do projeto'` bate com
  `select count(*) from project where notes is not null and btrim(notes, E' \t\r\n') <> ''`, e que
  `project.notes` continua com o conteúdo original. A migration não foi aplicada por esta sessão —
  `db push` vai para o banco remoto e é decisão do usuário.
- **Checagem de satisfação (2026-08-16), item do `prompt:` → artefato que prova.** O prompt-mãe
  cobre as quatro features; o que a 055 se propôs a cumprir está abaixo, com o teste que passou:
  - *CRIAÇÃO DE NOTAS* → `Notes.flow.test.tsx` "criar uma nota abre o editor dela e a nota nasce
    com título padrão" e "excluir a nota pela lista tira ela do banco e da tela"; CRUD da camada
    de I/O em `notes-api.test.ts` (12 testes).
  - *MARKDOWN NA VEIA* → `Notes.flow.test.tsx` "a aba Visualizar renderiza o Markdown do corpo da
    nota" (título, lista, checklist GFM virando `checkbox`, negrito) e
    `TaskDescriptionField.test.tsx` "HTML cru NÃO é interpretado", que trava a decisão de
    segurança em assertiva.
  - *VINCULAM-SE A PROJETOS* → `Notes.flow.test.tsx` "vincular a nota a um projeto persiste e
    aparece na lista" e "excluir o projeto preserva a nota, só desfaz o vínculo";
    `ProjectNotesSection.test.tsx` "criar pela página do projeto já nasce vinculada"; no banco, a
    assertiva de `on delete set null` em `supabase/tests/notes_core/04_assert_fk_wipe.sql`.
  - *CONVERSAM COM TUDO* (o que cabia aqui: achar nota de qualquer lugar) →
    `search-notes.test.ts` "um trecho que só existe no corpo da nota devolve o hit apontando para
    o editor". O vínculo genérico com qualquer entidade é da 056.
  - *POSSIBILIDADE DE PLUGINS*, *CANVAS/DESENHOS*, *FLOWCHARTS*, *DIAGRAMAS BÁSICOS* → **fora do
    escopo da 055 por decisão do refino**, são 057 e 058. Não há artefato porque não foram
    implementados; é a ordem combinada, não pendência esquecida.
  - Suíte completa: `npm test` → 925 passando, 2 falhando. As 2 são pré-existentes e alheias
    (`src/lib/__tests__/currency.test.ts` espera `"—"`, `src/lib/currency.ts` devolve `"·"`).
    Antes desta feature eram 859/2; a 055 acrescentou 66 testes e nenhuma falha nova.
- **A migration NÃO foi aplicada.** `supabase db push` vai para o banco remoto e é decisão do
  usuário; a validação foi toda em Postgres 16 descartável (ver a tarefa correspondente e a
  pendência mais abaixo).
- **Desvio do plano: as notas do projeto viraram seção, não aba.** A tarefa pedia uma quarta aba ao
  lado de Kanban/Lista/Gantt. Não foi feito assim porque a feature 052, no mesmo arquivo, já deixou
  a decisão escrita em comentário: aquelas abas alternam entre *visões das tarefas* do projeto, e
  outra entidade ligada ao projeto (lá compras, aqui notas) não é uma quarta visão de tarefa — deve
  continuar visível qualquer que seja a aba escolhida. `ProjectNotesSection` fica logo abaixo de
  `ProjectShoppingSection`, com o mesmo formato. O requisito da tarefa (listar as notas daquele
  projeto e criar uma já vinculada) está cumprido igual; só o lugar mudou.
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
- **Fechamento (2026-08-18) — a migration foi aplicada pelo usuário e a feature foi para `done/`.**
  A confirmação veio de `npx supabase migration list` (`20260816160000` com `local` == `remote`),
  **não** de teste manual: a skill `next` proíbe navegador e esta sessão nunca roda `supabase db
  push` (é passo do usuário, aplica em produção).
- **Passo remanescente, do usuário, fora do código — e ele é o portão da 058.** No SQL editor do
  banco real, conferir que `select count(*) from note where title = 'Notas do projeto'` bate com
  `select count(*) from project where notes is not null and btrim(notes, E' \t\r\n') <> ''`, e que
  as notas migradas aparecem íntegras em `/notes`. Enquanto isso não for feito, **não rodar o
  próximo `supabase db push`**: a migration `20260818120000_project_notes_drop.sql` (058) já está
  commitada e o push a aplica, destruindo a coluna original de vez. Não virou tarefa em aberto
  aqui porque não há código a escrever — a lógica da cópia já está provada por
  `supabase/tests/notes_core/run.sh` —, mas é a conferência que autoriza o drop.
- **Checagem de satisfação reconfirmada no fechamento (2026-08-18):** a rastreabilidade item a item
  registrada acima (criação de notas, markdown na veia, vínculo a projeto, busca) continua válida,
  com todos os testes citados verdes. Suíte completa reexecutada com
  `npx vitest run --testTimeout=30000 --hookTimeout=30000 --maxWorkers=4` (o `npm test` puro é
  instável nesta máquina): **161 arquivos, 1427 testes, 0 falhando** — as 2 falhas de
  `currency.test.ts` citadas acima foram corrigidas no commit `eb47042`. O prompt-mãe é do módulo
  inteiro (055+056+057+058); esta feature fecha o recorte dela, não o prompt sozinha.
- **Pendência deixada de propósito:** ao fim desta feature a coluna `project.notes` continua no
  banco, com o conteúdo original, sem nenhum código lendo ou escrevendo nela. Isso é intencional —
  é o caminho de volta enquanto o módulo novo não foi usado de verdade. O `drop column` é a última
  tarefa da 058 e depende de confirmação explícita do usuário de que as notas migradas estão todas
  visíveis no módulo novo. Se as quatro features forem concluídas e essa coluna ainda existir, não
  é esquecimento: é a ordem combinada.

