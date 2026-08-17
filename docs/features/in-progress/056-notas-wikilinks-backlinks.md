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

# 056 — Notas: editor com realce, wiki-links e backlinks

## Contexto

A 055 entrega nota markdown com vínculo a um projeto. Falta o que faz um Obsidian ser Obsidian: o
texto vira uma teia. O prompt-mãe pede "OBSIDIAN/NOTION TUNADO" e "CONVERSAM COM TUDO" — ou seja,
`[[wiki-links]]` entre notas, painel de backlinks (quem aponta pra cá) e vínculo a entidades de
qualquer módulo, não só projeto.

Hoje o app não tem referência polimórfica em lugar nenhum: `src/api/search.ts` e
`src/api/timeline.ts` agregam módulos por união discriminada em TypeScript, com uma query por
tabela — não há `entity_type`/`entity_id` no banco. Esta feature **inaugura** esse padrão, e é por
isso que ele mora aqui e não na 055: o núcleo fica utilizável mesmo que esta feature demore.

Depende de: 055 (tabela `note`).

## Decisões

- **Editor passa a CodeMirror 6** (`@uiw/react-codemirror@4.25` + `@codemirror/lang-markdown@6.5`,
  `@codemirror/state`, `@codemirror/view`, `@codemirror/autocomplete`). ~110–130 KB gzip no setup
  completo (`@codemirror/view` é ~55 KB gzip, `lang-markdown` ~21 KB raw); peer `react >=17`, ESM
  nativo, sem configuração extra no Vite 6.
  Motivo decisivo: a API de `Decoration.mark/replace` + `ViewPlugin` dá exatamente o *live preview*
  do Obsidian — `**negrito**` aparece em negrito e a sintaxe reaparece na linha onde está o cursor,
  sendo que as decorações são **view-only**: o documento persistido continua markdown cru
  byte-a-byte. É a leitura literal de "MARKDOWN NA VEIA". Além disso o autocomplete de `[[` exige
  controle de cursor que um `<textarea>` não oferece.
  **Descartados:** TipTap/ProseMirror — WYSIWYG que persiste JSON próprio, contraria "markdown na
  veia" e criaria lock-in de formato logo na primeira migration; Lexical — mesma objeção de
  WYSIWYG, com API de baixo nível que custaria mais código nosso; Monaco — ~5 MB + web workers,
  IDE de código, não editor de prosa; textarea + overlay de highlight — sem decorações reais,
  sincronizar caret/scroll à mão é dívida permanente.
- **Wiki-link resolve por título, não por id.** `[[Nome da nota]]` é o que o usuário digita e o que
  sobrevive a copiar/colar. O id fica fora do texto. Consequência aceita e explícita: renomear uma
  nota quebra links que apontavam pro nome antigo — tratado mostrando o link como "não resolvido"
  com ação de criar a nota faltante (mesmo comportamento do Obsidian), não com renomeação em
  cascata (que exigiria reescrever o markdown de outras notas, e markdown do usuário não se
  reescreve sozinho).
- **Backlinks são derivados do texto, não persistidos em tabela.** Uma tabela de links entre notas
  precisaria ser reconciliada a cada save e sairia do ar assim que alguém editasse o markdown por
  fora. Em vez disso: parse do conteúdo no domínio + uma query `ilike` por `[[titulo]]` na busca
  do backlink. Descartado índice materializado: complexidade de sincronização que o volume de
  dados (notas de uma pessoa) não justifica.
- **`note_link` para "conversam com tudo" — polimórfico com `entity_type` + `entity_id`, sem FK.**
  Não dá para ter FK apontando para 9 tabelas diferentes. A integridade vem de: (a) RLS por
  `user_id` na própria `note_link`; (b) `entity_type` restrito por `check` a uma lista fechada;
  (c) a UI só oferece entidades que o usuário possui. Link órfão (entidade apagada) é tolerado e
  renderizado como "referência removida" — descartado trigger de limpeza por tipo, que seria um
  trigger por tabela do app para um ganho cosmético.
- **`note.project_id` da 055 continua existindo.** É o vínculo primário e é o que a aba de projeto
  usa; `note_link` cobre os vínculos secundários N:N. Descartado migrar `project_id` para dentro de
  `note_link`: perderia a FK real e o `on delete set null`, trocando integridade garantida pelo
  banco por convenção.

## Tarefas

- [x] Instalar `@uiw/react-codemirror`, `@codemirror/lang-markdown`, `@codemirror/state`,
      `@codemirror/view` e `@codemirror/autocomplete`. Verificação: `npm run build` +
      `npm run check:bundle` — o chunk da rota `/notes` precisa continuar sob 160 KB gzip; se
      passar, adicionar entrada `codemirror` no `manualChunks` de `vite.config.ts:151` (junto de
      `radix`/`supabase`) e ao `VENDOR_RE` de `scripts/check-bundle-budget.mjs`.
      Feito: versões instaladas `@uiw/react-codemirror@4.25.11`, `@codemirror/lang-markdown@6.5.2`,
      `@codemirror/state@6.7.1`, `@codemirror/view@6.43.9`, `@codemirror/autocomplete@6.20.3`; o
      `manualChunks` ganhou o ramo `codemirror` (inclui `@lezer`, `style-mod`, `crelt` e
      `w3c-keyname`, que são deps transitivas do `@codemirror/view` e sem elas o chunk da rota
      inchava). `npm run build` + `npm run check:bundle` OK. A prova de que o split funciona vem
      na tarefa seguinte, quando o `NoteEditor` passa a importar CodeMirror de fato e o chunk
      `codemirror-*.js` aparece no `dist/`.
- [x] Trocar o `<textarea>` de `src/pages/admin/notes/NoteEditor.tsx` por CodeMirror com
      `markdown()` + tema alinhado ao Tailwind (fonte e cores de `src/index.css`, respeitando dark
      mode). Manter autosave com debounce e o comportamento de `Tab` já existente.
      Verificação manual: escrever `# titulo` e `**negrito**` e ver o realce sem perder o texto cru.
      Feito em `src/components/MarkdownCodeEditor.tsx` + `src/components/codemirror/`
      (`markdownTheme.ts`, `tabKeymap.ts`). O tema é só `hsl(var(--…))` de `src/index.css`, então
      acompanha o dark mode (classe `.dark`) sem tema duplicado.
      Verificação (sem navegador — a skill `next` proíbe): `MarkdownCodeEditor.test.tsx` (4 testes)
      monta o editor de verdade em jsdom e afirma comportamento — digitar `**negrito**` deixa os
      asteriscos no documento (nada de WYSIWYG), `Tab` insere tab literal **sem** tirar o foco do
      campo, `Shift+Tab` remove o tab de trás do cursor e não faz nada quando não há tab.
      `Notes.flow.test.tsx` (12 testes, ajustado o assert de `toHaveValue` para `toHaveTextContent`)
      prova que o autosave com debounce continua gravando o que se digita no CodeMirror.
      Desvio necessário: o `markdown()` do `@codemirror/lang-markdown` embute `lang-html` +
      `lang-javascript` + `lang-css` e levou o chunk `codemirror` a 212 KB gzip, acima do teto de
      200 KB de vendor. Trocado por `new LanguageSupport(markdownLanguage, [keymap.of(
      markdownKeymap)])` → 139 KB gzip, `npm run check:bundle` OK (chunk `codemirror` separado,
      rotas `Notes` 1,8 KB e `NoteDetail` 3,1 KB). O `src/test/setup-jsdom.ts` ganhou stub de
      `Range.getClientRects`, que o jsdom não implementa e o CodeMirror chama a cada medição.
- [x] Adicionar o *live preview* estilo Obsidian: um `ViewPlugin` com `Decoration.mark` que estiliza
      `**negrito**`/`_itálico_`/`# título` e `Decoration.replace` que esconde os marcadores, exceto
      na linha onde está o cursor. Verificação manual: mover o cursor para dentro de uma palavra em
      negrito e ver os `**` reaparecerem; sair da linha e sumirem. Verificação de que é view-only:
      salvar, recarregar a página e conferir que o conteúdo continua com os `**` no texto.
      Feito em `src/components/codemirror/livePreview.ts`. As decorações são uma **função pura de
      `EditorState`** (`buildLivePreviewDecorations`), e o `ViewPlugin` só a chama — foi assim que a
      verificação manual do navegador virou teste de verdade.
      Verificação: `src/components/codemirror/__tests__/livePreview.test.ts` (10 testes) afirma
      quais trechos ganham classe (`cm-md-strong`/`em`/`strike`/`code`, `cm-md-h1..h3`) e quais
      somem — com o cursor na linha 2, `hidden()` devolve `["**", "**"]`; com o cursor dentro do
      negrito, devolve `[]`; o `#` some junto com o espaço seguinte; dentro de fence ``` nada é
      decorado nem escondido. Mais o teste de ponta a ponta em `MarkdownCodeEditor.test.tsx`
      ("o live preview está ligado"), que monta o editor real, move o cursor com `Ctrl+End` e afirma
      que os `**` sumiram do DOM **e** continuam no documento — a prova de que é view-only.
      Ajuste do plano: `CodeMark` só é escondido quando o pai é `InlineCode`; a cerca ``` de bloco
      continua visível, senão o bloco perderia o limite na tela (descoberto por teste que falhou).
- [x] Criar `src/domain/notes/wikiLinks.ts` (exports nomeados, puro): `parseWikiLinks(content)`
      devolvendo `{ title, start, end }[]`, tolerando `[[a]] [[b]]` na mesma linha, ignorando
      ocorrências dentro de bloco de código (``` ... ```) e de código inline.
      Junto vieram `wikiLinkTitles` (títulos sem repetição, para resolver todos numa consulta só) e
      `normalizeWikiTitle` (chave de comparação: ignora caixa e espaço, **mantém** acento — sem ela
      cada consumidor inventaria a sua e "Reunião"/"reunião" resolveriam diferente).
- [x] Criar `src/domain/notes/__tests__/wikiLinks.test.ts` cobrindo: múltiplos links na linha,
      colchetes não fechados, link dentro de fence de código (não deve casar), título com acento e
      com espaço. Verificação: `npm test`.
      15 testes passando, além dos pedidos: índices `start`/`end` conferidos por `slice`, link
      markdown comum `[texto](url)` não casa, fence com `~~~`, fence aberto e nunca fechado, código
      inline, crase solta e título vazio.
- [ ] Renderizar wiki-link no preview: passar um componente customizado ao `MarkdownPreview`
      (criado na 055) que troca `[[Titulo]]` por link para `/notes/<id>` quando a nota existe, e
      por um chip "criar nota" quando não existe. Verificação manual nos dois estados.
- [ ] Autocomplete de `[[` no CodeMirror via `@codemirror/autocomplete`: ao digitar `[[`, sugerir
      títulos das notas do usuário (buscar com debounce, reusando `fetchNotes` da 055).
- [ ] Criar migration `supabase/migrations/<TIMESTAMP>_note_links.sql` (timestamp único — conferir
      `ls supabase/migrations/`): tabela `public.note_link` com `id uuid pk`, `user_id uuid not
      null references auth.users(id) on delete cascade`, `note_id uuid not null references
      public.note(id) on delete cascade`, `entity_type text not null`, `entity_id text not null`,
      `label text`, `created_at timestamptz not null default now()`;
      `check (entity_type in ('project','task','book','movie','album','trip','place','goal','habit','vehicle'))`;
      `unique (note_id, entity_type, entity_id)`; índices `(user_id, note_id)` e
      `(user_id, entity_type, entity_id)` — o segundo serve a consulta reversa.
- [ ] Na mesma migration: RLS habilitada + 4 policies `note_link_*_own` (`user_id = auth.uid()`),
      `note_link` na lista de `public.wipe_own_data()` e trigger `trg_enforce_app_access` — mesmo
      formato de `20260806130000_project_notes_status_events.sql`.
      **Confirmar com o usuário antes de `supabase db push`.**
- [ ] Verificação manual pós-`db push` (manual por necessidade: sem Supabase local, e o Vitest deste
      repo não cobre I/O nem RLS): no SQL editor, tentar inserir em `note_link` um `entity_type`
      fora da lista e confirmar que o `check` rejeita; inserir o mesmo `(note_id, entity_type,
      entity_id)` duas vezes e confirmar que o `unique` rejeita; apagar uma nota e confirmar que os
      `note_link` dela somem junto (`on delete cascade`).
- [ ] Adicionar `NoteLink` e `NoteLinkEntityType` a `src/types/notes.ts`, com o union de tipos
      espelhando exatamente o `check` do banco (é o contrato entre os dois).
- [ ] Criar `src/api/notes/noteLinks.ts`: `fetchLinksForNote(noteId)`,
      `fetchNotesLinkedTo(entityType, entityId)`, `addNoteLink`, `removeNoteLink` — todas com
      filtro por `user_id`.
- [ ] Criar `src/pages/admin/notes/NoteLinksPanel.tsx`: no editor, uma seção "Vínculos" listando os
      `note_link` com ícone por tipo, e um seletor (`cmdk`, já no `package.json`) para adicionar —
      reusando `ProjectPicker` quando o tipo for projeto. Mutações com `useToast` +
      `getErrorMessage`.
- [ ] Criar `src/pages/admin/notes/BacklinksPanel.tsx`: lista "Mencionada em" — notas cujo
      `content` contém `[[<título desta nota>]]` (query `ilike` em `src/api/notes/notes.ts`) e
      notas ligadas via `note_link`. `EmptyState` quando não houver nenhuma.
- [ ] Mostrar o vínculo no sentido inverso em pelo menos uma entidade não-projeto para provar o
      padrão: seção "Notas" em `src/pages/admin/goals/Goals.tsx` (ou no detalhe de meta), usando
      `fetchNotesLinkedTo("goal", id)`. Verificação manual: criar vínculo pelo editor e ver a nota
      aparecer do outro lado.
- [ ] Rodar `npm run build`, `npm run lint`, `npm test` e `npm run check:bundle`.

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

- Segunda das quatro features do módulo de Notas: `055` → **`056`** → `057` → `058`. Depende da
  tabela `note` da 055. Não fecha o prompt-mãe sozinha.
- `note_link` é o primeiro padrão polimórfico do banco. Se ele se provar, é candidato natural a ser
  reusado por outros módulos — mas não generalizar antes de ter um segundo caso real de uso.
- Wiki-link por título assume títulos únicos por usuário na prática. Não há `unique` no banco (dois
  rascunhos "Sem título" são legítimos); se dois títulos colidirem, o painel de backlinks mostra as
  duas notas — comportamento aceito, não bug.
