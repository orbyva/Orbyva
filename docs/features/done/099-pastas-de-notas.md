---
prompt: |
  Estou pensando em fazer uma parada pra deixar essas parte de notas e canvas mais organizadas, por exemplo, permitir separar em pastas e nas pastas vincula-las com as etiquetas ou um projeto específico se for o caso.
  Algo parecido com o Obsidian ou Notes do iPhone
---

# 099 — Pastas de notas (e canvas)

## Contexto

A lista de notas é plana: markdown e canvas já são a mesma entidade (`note.kind`), ordenada por
recência, com filtro só por texto. Organização de verdade hoje é o `project_id` opcional da 055 e
os vínculos da 056 (`note_link`, `[[wiki-links]]`). Não há pasta, e o catálogo de tags da 010 não
entra em nota.

O pedido é o eixo que falta no Obsidian/Notes do iPhone: **pasta como lugar**, com a pasta podendo
carregar um projeto e/ou uma etiqueta — sem obrigar projeto, e sem o movimento da nota reescrever
projeto nem tag.

## Decisões

- **Pasta é lugar, não faceta.** Uma nota mora em no máximo uma pasta (`note.folder_id` nullable).
  Canvas entra de graça: é a mesma tabela. Sem pasta = raiz ("Sem pasta"), o caso de toda nota
  existente. Descartado N:N nota↔pasta: viraria tag com outro nome e quebraria o modelo Notes/
  Obsidian que o pedido cita.
- **Tabela `note_folder` própria**, não reuso de `tag` nem de `project`. Pasta tem ciclo de vida
  (criar, aninhar, apagar, mover nota para dentro) que tag/projeto não têm. Espelha o precedente da
  050 (`shopping_category` em vez de reciclar `tag`). Campos: `id`, `user_id`, `name`, `parent_id`
  (self-FK nullable), `project_id` nullable, `tag_id` nullable, `created_at`. Sem `color` própria —
  a cor visível da pasta, quando houver, é a da etiqueta.
- **Projeto e etiqueta na pasta são atributos da pasta, 0 ou 1 cada.** `project_id` e `tag_id`
  opcionais, FKs com `on delete set null`. Projeto não é obrigatório. Etiqueta é uma só, do
  catálogo da 010 (criar inline no diálogo da pasta, mesmo fluxo do `TagCombobox`). Descartado
  `tag_ids uuid[]` na pasta: o pedido é "uma etiqueta para aquela pasta". Descartado tag na própria
  nota nesta feature — senão pasta e tag viram dois eixos na nota e o "mover só muda o lugar"
  precisa de regra extra.
- **Mover a nota só troca `folder_id`.** Não copia, não apaga, não sincroniza `note.project_id` nem
  nada da pasta. Projeto da nota continua sendo o `ProjectPicker` do editor (055); pasta é o
  arquivo. A aba Notas do projeto (`ProjectNotesSection`) continua filtrando por `note.project_id`,
  não pela pasta.
- **Criar nota com a pasta aberta preenche `folder_id`.** Se a pasta tiver `project_id`, o create
  também preenche `note.project_id` — é atalho de formulário (a nota já nasceria "daquele projeto"
  se o usuário tivesse escolhido no picker), não um vínculo contínuo. Create em "Todas"/"Sem pasta"
  deixa os dois nulos. Tag da pasta **não** é copiada para a nota (nota não tem tag nesta feature).
- **Aninhamento com teto de 5 níveis.** `parent_id` aponta para outra pasta do mesmo usuário;
  `parent_id <> id`; ciclo é recusado no domínio. O teto começou em 3; em 2026-09-18 o usuário
  pediu a árvore empresa → clientes → Finatec → demandas (4 níveis), então o cap subiu para 5
  — cabe o exemplo e sobra um. Sem teto a sidebar viraria finder. Apagar pasta: notas vão para
  "Sem pasta" (`on delete set null` em `note.folder_id`); subpastas sobem um nível (a API
  reparenta para o `parent_id` da pasta apagada **antes** do delete). `parent_id` no banco fica
  `on delete cascade` só como rede de segurança do wipe — a UI nunca dispara esse cascade
  porque reparenta primeiro.
- **Web primeiro, mobile depois.** A árvore nativa ficou de fora na v1; `folder_id` nullable
  deixava o Expo criar/editar nota como antes. **2026-09-17:** o usuário pediu para replicar no
  mobile agora — mesma regra (lugar, teto 5, mover só `folder_id`, create na pasta aberta copia
  `project_id` da pasta). Sem drag-and-drop no nativo (o gesto de toque da lista já abre a nota);
  mover é o picker no editor. Recolher fica em memória da sessão (sem `localStorage`).
- **Navegação na própria página `/notes`, não rota nova.** Coluna de pastas (Todas / Sem pasta /
  árvore) + lista filtrada. Estado na URL: `?folder=<id>` (pasta), `?folder=inbox` (sem pasta),
  sem param = todas. Mesmo precedente de `/shopping-list?project=` (052). Filtro de texto continua
  local e aplica **depois** do recorte por pasta. Clicar uma pasta mostra só as notas com aquele
  `folder_id`, não as das subpastas — subpasta se abre na árvore, como o Notes do iPhone.
- **Fora de escopo:** tag na nota; smart folder que lista `note.project_id` (já existe na página do
  projeto); herança contínua pasta→nota depois do create; reordenar irmãs (o drag de pasta só
  aninha, não muda a ordem entre iguais); "folder note" do Obsidian; drag-and-drop no Expo.

## Tarefas

- [x] Migration `supabase/migrations/20260916173000_note_folder.sql` (conferir com
      `ls supabase/migrations/` que o timestamp é único). Tabela `public.note_folder`: `id uuid pk
      default gen_random_uuid()`, `user_id uuid not null references auth.users(id) on delete
      cascade`, `name text not null`, `parent_id uuid references public.note_folder(id) on delete
      cascade`, `project_id uuid references public.project(id) on delete set null`, `tag_id uuid
      references public.tag(id) on delete set null`, `created_at timestamptz not null default now()`,
      `check (parent_id is distinct from id)`; índices `note_folder_user_idx (user_id)`,
      `note_folder_parent_idx (parent_id)`, `note_folder_project_idx (project_id)`,
      `note_folder_tag_idx (tag_id)`; unique index `(user_id, coalesce(parent_id,
      '00000000-0000-0000-0000-000000000000'), lower(name))` — dois nomes iguais no mesmo pai são
      recusados, em pais diferentes não; `comment on table`. Na mesma migration: `alter table
      public.note add column if not exists folder_id uuid references public.note_folder(id) on
      delete set null` + índice `note_folder_id_idx (folder_id)`. RLS + 4 policies
      `note_folder_{select,insert,update,delete}_own` com `user_id = auth.uid()`, formato da 055.
      Reescrever `wipe_own_data` copiando o array de `20260823120000_link_icon_rule.sql` e
      inserindo `'note_folder'` **depois** de `'note'` e **antes** de `'project'`/`'tag'`. Trigger
      `trg_enforce_app_access` na tabela nova, mesmo `do $$` condicional da 055. **Não rodar
      `supabase db push` sem confirmar com o usuário.**
- [x] Validar a migration sem tocar no banco remoto: `supabase/tests/note_folder/` no mesmo molde
      de `supabase/tests/notes_core/` (Postgres 16 descartável, stubs de
      `auth.users`/`auth.uid()`/`enforce_app_access` + `project`/`tag`/`note` mínimos). Assertivas:
      coluna `note.folder_id` nullable; FKs e `on delete` (nota sobrevive à pasta, pasta sobrevive
      a projeto/tag, `parent_id = id` recusado, unique no mesmo pai); RLS barrando linha alheia;
      wipe apaga pasta aninhada sem deixar órfã; reaplicar a migration é idempotente. Verificação:
      `bash supabase/tests/note_folder/run.sh`.
- [x] `src/types/notes.ts`: `NoteFolder` (campos da tabela); `NoteFolderDraft` /
      `NoteFolderUpdateRequest`; `Note.folder_id: string | null`; `NoteDraft` e
      `NormalizedNoteDraft` ganham `folder_id`. Comentário no `Note` deixando claro que `folder_id`
      é lugar e `project_id` continua sendo o vínculo primário da 055.
- [x] `src/domain/notes/noteDraft.ts`: `normalizeNoteDraft` também zera `folder_id` vazio para
      `null`. Testes em `src/domain/notes/__tests__/noteDraft.test.ts`. Verificação: `npm test`.
- [x] `src/domain/notes/folders.ts` (puro, sem I/O): `NOTE_FOLDER_MAX_DEPTH = 3`;
      `buildFolderTree(folders)` (lista → árvore ordenada por `name`); `folderDepth(folders, id)`;
      `wouldCreateCycle(folders, id, nextParentId)`; `canNestUnder(folders, parentId)` (false se o
      pai já está no nível 3); `notesInFolder(notes, folderId)` — `null` = todas, `"inbox"` = sem
      pasta, uuid = só aquele `folder_id` (sem descendentes); `reparentChildren(folders, deletedId)`
      devolve o patch `id → parent_id` (o `parent_id` da pasta apagada, ou `null`). Verificação:
      `src/domain/notes/__tests__/folders.test.ts` — árvore, teto de profundidade, ciclo,
      recorte sem vazar subpasta, reparent. Verificação: `npm test`.
- [x] `src/api/notes/folders.ts`: `fetchNoteFolders()`, `createNoteFolder`, `updateNoteFolder`,
      `deleteNoteFolder` (reparenta filhos via `reparentChildren` **antes** do delete; as notas
      caem em "Sem pasta" pelo `on delete set null`). Mesmo formato de I/O de
      `src/api/notes/notes.ts` (`getCurrentUserId`, erro do PostgREST vira `Error`). Recusar no
      client `wouldCreateCycle` / profundidade > 3 antes de gravar. Verificação:
      `src/api/notes/__tests__/folders-api.test.ts` contra o duplo do query builder já usado em
      `notes-api.test.ts`.
- [x] `src/api/notes/notes.ts`: `fetchNotes` ganha `folderId?: string | null | "inbox"` (uuid filtra
      `folder_id`, `"inbox"` filtra `is null`, omitido = sem filtro); `createNote`/`updateNote`/
      `normalizeNoteDraft` passam `folder_id`. Testes novos em `notes-api.test.ts`. Verificação:
      `npm test`.
- [x] `src/pages/admin/notes/NoteFolderDialog.tsx`: criar/editar pasta — nome obrigatório, pasta
      pai (select das pastas em que `canNestUnder` é true, opção "Raiz"), `ProjectPicker` opcional,
      `TagCombobox` limitado a 0 ou 1 tag (`onChange` fica com o último id; criar tag inline com
      cor aleatória, igual tarefa/projeto). Reusa `fetchTags`/`createTag` de `src/api/tasks/tags.ts`.
      Verificação: `npm run build && npm run lint`.
- [x] `src/pages/admin/notes/NoteFolderTree.tsx`: árvore acessível (`<nav aria-label="Pastas">`) com
      Todas, Sem pasta e as pastas aninhadas; contagem de notas **diretas** em cada uma; badge do
      projeto e da etiqueta quando a pasta tiver; ações nova subpasta / editar / excluir
      (`ConfirmDeleteDialog` avisando que as notas vão para Sem pasta e as subpastas sobem um
      nível). Item ativo sincronizado com `?folder=`. Verificação: teste de componente cobrindo
      seleção, badge e o aviso do delete.
- [x] `src/pages/admin/notes/Notes.tsx`: layout em duas colunas (árvore | lista) a partir de
      `sm:`; abaixo disso a árvore vira um `<Select>` de pasta para não esmagar o card. Ler/escrever
      `?folder=` na URL. "Nova nota" / "Novo canvas" gravam `folder_id` da pasta aberta (e
      `project_id` da pasta, se houver). Card da lista ganha o nome da pasta quando a visão é
      Todas. EmptyState de pasta vazia distinto do de "nenhuma nota ainda". Estender
      `Notes.flow.test.tsx` (ou arquivo irmão `Notes.folders.flow.test.tsx`) com backend falso que
      imita reparent + `on delete set null`: criar pasta, criar nota dentro, mover para outra,
      conferir que `project_id` da nota **não** muda no move, apagar pasta e ver a nota em Sem
      pasta, filtrar `?folder=` pela URL. Verificação: `npm test`.
- [x] `NoteEditor.tsx` e `CanvasEditor.tsx`: picker de pasta ao lado do `ProjectPicker` (select
      plano indentado pela árvore, opção "Sem pasta"). Mudar a pasta dispara o autosave só com
      `folder_id` — `project_id` do editor permanece o que o usuário escolheu. Verificação: testes
      existentes de autosave continuam passando; um teste novo em `Notes.flow.test.tsx` (ou no do
      canvas) prova que trocar a pasta não zera o projeto.
- [x] Create a partir de tarefa (084) e wiki-link quebrado (`NoteDetail.handleCreateLinkedNote`)
      continuam com `folder_id: null` — nascem na raiz. `ProjectNotesSection` não filtra por pasta.
      Verificação: `notes-from-task.test.tsx` e `ProjectNotesSection.test.tsx` seguem verdes sem
      mudança de comportamento.
- [x] Atualizar fixtures que constroem `Note`/`NoteDraft` para incluir `folder_id: null` onde o
      tipo passar a exigir. Verificação: `npm run build`, `npm run lint`, `npm test`.
- [x] Arrastar nota da lista para a pasta (e para Sem pasta): o card ganha punho de arraste
      (`GripVertical`, mesmo padrão de categorias financeiras / roteiro) e a árvore vira
      drop zone. Soltar só grava `folder_id` — `project_id` da nota não muda. "Todas" não
      recebe drop (é filtro, não lugar). Mobile estreito continua pelo picker do editor (a
      árvore some abaixo de `sm:`). Verificação: `Notes.folders.flow.test.tsx` +
      `NoteFolderTree.test.tsx`.
- [x] Expo: `mobile/src/types/notes.ts` ganha `folder_id` e `NoteFolder`; domínio
      `mobile/src/domain/notes/folders.ts` espelha o web (sem drop zone HTML5);
      `mobile/src/api/notes/folders.ts` + `fetchNotes`/`createNoteApi`/`updateNoteApi`
      passam `folder_id`. Verificação: `cd mobile && npx tsc --noEmit`.
- [x] Expo: árvore na lista (`NoteFolderTree`) — Todas / Sem pasta / aninhamento com recolhe,
      ícone na cor da etiqueta, ponto+nome do projeto e ícone+nome da etiqueta; criar/editar
      pasta em `notes/folder-form` (pai, projeto opcional, 0 ou 1 tag); apagar avisa que as
      notas vão para Sem pasta. "+" ganha "Nova pasta". Verificação: `npx tsc --noEmit`.
- [x] Expo: lista recorta por pasta; card mostra o nome da pasta na visão Todas; criar nota
      com a pasta aberta grava `folder_id` (e `project_id` da pasta, se houver); editor e
      `notes/form` têm picker de pasta; create a partir do projeto / wiki-link quebrado
      nascem na raiz. Sem drag. Verificação: `cd mobile && npx tsc --noEmit`.
- [x] Web: em `/notes/:id` manter a coluna de pastas (desktop). Clicar uma pasta **troca o
      filtro e volta à lista** (`/notes?folder=…`); não altera `folder_id` da nota. Abrir nota
      a partir da lista e "Todas as notas" preservam o `?folder=`. Verificação:
      `NoteDetail.folders.test.tsx` + hrefs em `folders.test.ts` verdes.
- [x] Expo: na tela da nota, chip/breadcrumb da pasta da nota (não a árvore inteira). Toque
      volta à lista já recortada nessa pasta (`setNoteFolderNav` + `/notes`; a lista lê o
      nav no `useFocusEffect`). Verificação: `cd mobile && npx tsc --noEmit`.
- [x] Arrastar pasta da árvore para dentro de outra: só troca `parent_id` se `canMoveFolder`
      (teto 5 + sem ciclo). Destino inválido recusa com toast. Notas da pasta **não** mudam de
      `folder_id`. "Todas" e "Sem pasta" não recebem pasta (Sem pasta é lugar de nota). Web
      (`sm:`); Expo continua pelo formulário. Verificação: `NoteFolderTree.test.tsx` +
      `Notes.folders.flow.test.tsx`.
- [x] Teto de aninhamento 5 (o exemplo IDEA → Clientes → Finatec → Demandas pede 4). Constante
      `NOTE_FOLDER_MAX_DEPTH` no domínio web e Expo; mensagens da API/toast/form usam a constante.
      Testes de domínio, API e fluxo cobrem criar o 6º nível e mover uma subárvore que estouraria.
      Verificação: `npm test` nos arquivos de pasta; `cd mobile && npx tsc --noEmit`.
- [x] **Migration aplicada pelo usuário** — só depois de confirmação explícita: `supabase db push`.
      **2026-10-05:** já aplicada — `20260916173000_note_folder` aparece local e remoto em
      `supabase migration list`; `db push --dry-run` responde "Remote database is up to date".
      Pendência de fumaça na conta real fica em `## Notas` (abrir `/notes`, criar pasta com
      etiqueta, criar nota dentro, mover, apagar a pasta).

## Prompts

- 2026-09-16 — pedido original (frontmatter).
- 2026-09-16 — respostas às decisões de desenho, verbatim:

```
1. Nota em uma pasta só
2. Aos 2, não é obrigatório ter um projeto. Mas pode fazer uma etiqueta para aquela pasta
3. Só o lugar
4. Faz em web primeiro. Quando ficar redondo vamos fazer no web.
```

(O item 4 foi lido como web agora e mobile depois — a pergunta era "mobile na mesma hora ou web
primeiro".)

- 2026-09-17 — pedido no meio da implementação, verbatim:

```
Como eu posso mover uma nota para a pasta que criei? Queria mover arrastando
```

- 2026-09-17 — pedido de visual da árvore, verbatim:

```
Melhore só essa visualização aqui
```

- 2026-09-17 — pedido no meio da implementação, verbatim:

```
Permita recolher as pastas, tipo aqui: Permita a pasta finatec recolher essa outra pasta
```

- 2026-09-17 — pedido no meio da implementação, verbatim:

```
Coloque essa etiqueta e projeto em outro lugar pra ficar mais bonito. Consulte os especialistas UI/UX
```

- 2026-09-17 — pedido no meio da implementação, verbatim:

```
Como vai saber qual o projeto e qual a etiqueta agora?
```

- 2026-09-17 — pedido no meio da implementação, verbatim:

```
Ficou bom. Replique para o Mobile agora
```

- 2026-09-18 — pedido no meio da implementação, verbatim:

```
- Até quantos níveis de pasta dentro de pasta posso ter? 
- Permita arrastas as pastas para dentro outras pastas
```

- 2026-09-18 — pedido no meio da implementação, verbatim:

```
Eu queria que tivesse mais. Pois, por exemplo. Trabalho em uma empresa chamada idea, que nela tem projetos de clientes, como finatec, e coisas internas. Queria separar assim:
- IDEA
  - Clientes
    - Finatec
      - Demandas Sap x Conveniar dia tal
      - Demandas BI 
- Interno
  - Plataforma não sei oq
    - Alinhamento dia 23/09/2026
      - Brainstorming
```

- 2026-09-22 — pedido no meio da implementação, verbatim:

```
Na parte de notas, o que acha de manter a barra das pastinhas ali ao abrir uma nota
```

- 2026-09-22 — decisão do usuário, verbatim:

```
Vou seguir sua recomendação do web e do app. 
Troca o filtro e volta à lista.
```

## Notas

- Não encaixa na 055 (núcleo, `done/`) nem na 058 (canvas, `in-progress/`): pasta é eixo novo, e
  canvas já é `note`. Feature nova, não acréscimo.
- O "vamos fazer no web" do item 4 está anotado como mobile-depois; se for outra leitura, corrigir
  antes de implementar.
- Create-com-pasta-aberta preenchendo `project_id` da pasta é atalho, não herança. Se na revisão
  isso parecer demais, a tarefa de `Notes.tsx` cai para só `folder_id`.
- Wipe de `wipe_own_data` copiou o array de `20260823120000_link_icon_rule.sql` e inseriu
  `'note_folder'` depois de `'note'` e antes de `'project'`/`'tag'`. `note_link` ficou de fora de
  propósito: some por CASCADE da nota, igual no wipe de origem.
- Harness SQL (`bash supabase/tests/note_folder/run.sh`) passou em Postgres 16 descartável depois
  de subir o OrbStack (o daemon estava parado). Timestamp `20260916173000` é único.
- Verificação de app: `npx vitest run` 2757/2757; `npm run build && npm run lint` 0 erros
  (25 warnings pré-existentes).
- A árvore da lista (2026-09-17): ações no hover para o nome não cortar, ícone + linha de
  aninhamento, badges dentro do mesmo bloco da pasta, hint só enquanto arrasta. Recolher/
  expandir com chevron (persistido em localStorage); ancestral da pasta aberta na URL abre sozinho.
  Projeto e etiqueta: nomes visíveis numa linha discreta (ponto = projeto, ícone de tag = etiqueta);
  a cor da pasta continua sendo a da etiqueta.
- **PENDÊNCIA DO USUÁRIO:** `supabase db push` e fumaça na conta real (abrir `/notes`, criar pasta
  com etiqueta, criar nota dentro, mover, apagar a pasta). Sem confirmação explícita, a migration
  não vai para o remoto.
- Expo (2026-09-17): mesma regra do web. Árvore na lista com recolhe só na sessão; criar/editar
  pasta em `notes/folder-form`; picker no editor e no create; `+` oferece "Nova pasta". Mover é
  o picker (sem drag). Create a partir do projeto ou de wiki-link quebrado nasce na raiz.
- Expo (2026-09-22): na nota aberta, chip da pasta (não a árvore). Toque aplica
  `folderNavForNote` + lista (a lista sincroniza no `useFocusEffect`). Web: sidebar de pastas
  sticky em `/notes/:id`; clicar pasta **volta à lista** com o filtro (`/notes?folder=…`);
  `folder_id` da nota não muda. `NoteDetail.folders.test` + `folders.test` + `tsc` mobile.
  Fumaça no aparelho ainda depende do `db push`.
- `CanvasEditor.test` “renomear grava o título”: o `waitFor` pegava o autosave do espaço
  (`"Arquitetura "`) quando o debounce ganhava do `user.type`. Passou a esperar o título fechado.
- Arraste de pasta (2026-09-18): soltar em outra pasta troca só `parent_id`. Ciclo ou mais de
  5 níveis vira toast. Notas de dentro não mudam de lugar. Sem pasta / Todas não recebem pasta.
  `NoteFolderTree.test` + `Notes.folders.flow.test` passaram.
- Teto 5 (2026-09-18): o exemplo IDEA → Clientes → Finatec → Demandas pede 4 níveis; o cap
  subiu de 3 para 5. Sem migration — o limite é só no domínio. Testes de pasta + `tsc` mobile
  passaram.
