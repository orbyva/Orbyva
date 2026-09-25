---
prompt: |
  - aumente a sofisticação do markdown das notas, procure referências, sdkjs, bases abertas, a ideia é alcançar um nível sofisticado de escrita
---

# 070 — Notas: experiência de escrita (atalhos, menu `/`, preview lado a lado, sumário)

## Contexto

O prompt fala em "nível sofisticado de **escrita**". A 069 cuida do que a nota vira depois de
escrita; esta cuida do ato de escrever. Hoje o editor (`src/components/MarkdownCodeEditor.tsx` +
`src/pages/admin/notes/NoteEditor.tsx`) é um CodeMirror 6 propositalmente cru: `lineNumbers`,
`foldGutter`, `bracketMatching`, `closeBrackets` e `searchKeymap` todos desligados
(`MarkdownCodeEditor.tsx:30-42`), live preview cobrindo só título, negrito, itálico, tachado e
código inline (`src/components/codemirror/livePreview.ts:17-28`), autocomplete só de `[[`
(`wikiLinkCompletion.ts`), **nenhum** atalho de formatação (não há `Ctrl+B`/`Ctrl+I`/`Ctrl+K`),
nenhuma barra de ferramentas, e um único botão de inserção ("Inserir diagrama",
`NoteEditor.tsx:191-203`). O preview é uma **aba** ("Escrever"/"Visualizar"), então não dá para
escrever olhando o resultado. Não há sumário, contagem de palavras, nem indicação de que o autosave
(debounce de 800 ms, `NOTE_AUTOSAVE_DEBOUNCE_MS`) salvou ou falhou — o usuário escreve no escuro.

O que o app tem e esta feature reusa em vez de reinventar: `@codemirror/autocomplete` já ligado (o
`[[` prova o caminho para um menu `/`), `@codemirror/lang-markdown` com `LanguageDescription.load()`
(o mecanismo oficial de carregar gramática de linguagem sob demanda — foi por não usá-lo que a 057
desligou o highlight dentro de fences, para não pagar 73 KB gzip fixos), e `useSearchParams`, o
padrão de estado-na-URL já usado em `src/pages/admin/finance/Recurring.tsx:tab`.

## Decisões

- **Continua CodeMirror; markdown continua sendo texto que o usuário vê.** Descartado WYSIWYG
  (Tiptap/ProseMirror/Milkdown) e descartado sdkjs/ONLYOFFICE, citado no prompt: sdkjs é editor de
  documento OOXML, não de markdown — adotá-lo trocaria o formato do arquivo, quebraria wiki-links,
  mermaid e canvas, e transformaria a nota num binário. As "bases abertas" que atendem o pedido
  aqui são CodeMirror 6 e o `@codemirror/lang-markdown`, já no projeto. As referências de UX
  adotadas: Obsidian (menu `/`, sumário, painel lado a lado), Typora/iA Writer (contagem e foco).
- **Toda transformação de texto é função pura em `src/domain/notes/markdownCommands.ts`**, no
  formato `(doc, selection) => { text, selection }`, e o comando CodeMirror é uma casca fina em
  cima. Motivo: é o que torna "negrito", "link", "lista" testáveis com Vitest sem montar um editor,
  e é o mesmo espírito de `wikiLinks.ts`/`canvasScene.ts`, que já isolam a regra do widget.
- **Atalhos são os do mercado, sem invenção**: `Ctrl/Cmd+B` negrito, `Ctrl/Cmd+I` itálico,
  `Ctrl/Cmd+K` link, `Ctrl/Cmd+Shift+K` código, `Ctrl/Cmd+1..6` título, `Ctrl/Cmd+Shift+8` lista,
  `Ctrl/Cmd+Shift+7` lista numerada, `Ctrl/Cmd+S` força o autosave. Todo atalho é *toggle* (aplicar
  em texto já negrito remove), porque meio-toggle é a origem de `****texto****`.
- **Barra de ferramentas pequena e sempre visível**, não flutuante sobre a seleção: 8 botões
  (negrito, itálico, título, link, lista, tarefa, código, tabela) mais o "Inserir diagrama" que já
  existe. Toolbar flutuante exige medir a seleção e brigar com o `livePreview`; o ganho não paga.
- **Menu `/` usa o `autocompletion` já ligado, não um popover próprio.** Uma segunda fonte
  (`slashCommandSource`) ao lado de `wikiLinkCompletion`, disparando só com `/` em início de linha
  (senão engatilharia dentro de URL e de caminho de arquivo). Itens inserem *snippet*: título,
  lista, lista de tarefas, tabela, citação, callout, bloco de código, fórmula, mermaid, canvas,
  data de hoje, link de nota.
- **Preview lado a lado é um terceiro modo, não substitui as abas**: "Escrever | Dividir |
  Visualizar", com o modo na URL (`?view=dividir`), seguindo `Recurring.tsx` — sobrevive ao refresh
  e é linkável, sem inaugurar `localStorage` (que hoje só existe em `useAuth.tsx`). Abaixo de
  `md` o modo "Dividir" cai para "Escrever": duas colunas em telefone é ilegível.
- **Rolagem sincronizada é proporcional, não por bloco.** Mapear linha-fonte → elemento renderizado
  exigiria `sourcepos` em cada nó e um índice; proporcional resolve 90% do caso a 5% do custo, e
  quem quiser precisão usa o sumário. Descartado sincronizar nos dois sentidos: só o editor comanda
  o preview, para não haver laço de rolagem.
- **Sumário vem de função pura `extractHeadings(markdown)`**, reusando `slugifyHeading` da 069, e
  clicar rola **o editor** até a linha (não o preview) — no modo "Visualizar" rola o preview pela
  âncora. É um painel colapsável ao lado de "Vínculos"/"Backlinks", que já ocupam esse lugar.
- **Checkbox de task-list clicável no preview** (`- [ ]` → `- [x]`), porque metade do uso de nota é
  checklist e hoje só dá para marcar editando o texto. A escrita de volta é pura
  (`toggleTaskListItem(markdown, index)`), indexada pela **ordem de ocorrência** do checkbox no
  documento — é o que o `react-markdown` entrega sem sourcepos. Só habilitado no editor da nota
  (onde há `onChange`); em `TaskDescriptionField` e em previews read-only o checkbox continua
  desabilitado.
- **Estado de salvamento vira visível**: "Salvando…", "Salvo às HH:mm", "Falha ao salvar — tentar
  novamente". Hoje uma falha de autosave só produz um toast que some, e o usuário segue escrevendo
  sobre texto perdido. `Ctrl+S` força o flush pendente. Descartado bloquear a saída da página com
  `beforeunload`: o autosave é curto e o aviso do navegador é hostil.
- **Highlight dentro de fences volta, mas carregado sob demanda**: `markdown({ codeLanguages })`
  com `LanguageDescription.of({ load: () => import(...) })` para uma lista curta
  (js/ts, json, css, html, sql, python, bash). É o caminho oficial do CodeMirror para não pagar
  bundle fixo, e é a resposta direta ao trade-off que a 057 registrou nas Notas dela.
- **Cuidado obrigatório (bug real já registrado)**: o array de extensões passado ao
  `MarkdownCodeEditor` precisa ter identidade estável (`useMemo`), senão o editor reconfigura a cada
  tecla. Toda extensão nova desta feature entra memoizada.
- **Fora de escopo**: modo foco/máquina-de-escrever, histórico de versões da nota, colar HTML
  virando markdown (exige parser de HTML), colar imagem (não há bucket de storage para notas) e
  edição colaborativa.

## Tarefas

- [x] Criar `src/domain/notes/markdownCommands.ts` (puro): `toggleWrap(doc, sel, marker)` para
      negrito/itálico/código/tachado, `toggleHeading(doc, sel, level)`, `toggleList(doc, sel, kind)`
      (bullet/numerada/tarefa), `toggleQuote(doc, sel)` e `insertLink(doc, sel, url?)`. Cada uma
      devolve `{ text, selection }`. Verificação: `npm run build`.
- [x] Testes Vitest em `src/domain/notes/__tests__/markdownCommands.test.ts`: aplicar e **remover**
      cada marcador, seleção vazia (insere o par e põe o cursor no meio), seleção de múltiplas
      linhas, título trocando de nível em vez de empilhar `##`, lista já aplicada volta a texto, e
      link com seleção virando `[sel](url)` e sem seleção virando `[](url)`. Verificação: `npm test`.
- [x] Criar `src/components/codemirror/formattingKeymap.ts` ligando os atalhos da Decisão às
      funções puras acima (`Prec.high`, sem colidir com `literalTabKeymap`), e ligá-lo em
      `MarkdownCodeEditor`. Verificação: `npm run build && npm run lint` + teste em
      `MarkdownCodeEditor.test.tsx` disparando `Ctrl+B` e conferindo o documento resultante.
- [x] Criar `src/pages/admin/notes/NoteEditorToolbar.tsx` (8 botões + o "Inserir diagrama"
      existente, com `aria-label` e `title` mostrando o atalho), chamando os mesmos comandos.
      Verificação: teste novo `NoteEditorToolbar.test.tsx` — cada botão produz a transformação
      esperada no texto; toolbar não aparece no modo "Visualizar".
- [x] Criar `src/components/codemirror/slashCommands.ts`: fonte de autocomplete disparada por `/`
      em início de linha, com os itens da Decisão, cada um inserindo um snippet e posicionando o
      cursor. Não dispara dentro de fence nem de código inline (reusar a detecção que
      `wikiLinks.ts:34-90` já faz). Verificação: `npm run build`.
- [x] Testes em `src/components/codemirror/__tests__/slashCommands.test.ts`: dispara em início de
      linha, **não** dispara no meio de uma palavra nem depois de `http:/`, não dispara dentro de
      fence, filtra por texto digitado e o snippet escolhido entra com o cursor no lugar certo.
      Verificação: `npm test`.
- [x] Ligar `slashCommands` em `NoteEditor.tsx` junto de `wikiLinkCompletion`, dentro do mesmo
      `useMemo` de extensões (identidade estável — ver Decisões). Verificação: `npm run build`;
      teste de fumaça em `Notes.flow.test.tsx` de que digitar `[[` continua completando notas.
- [x] Reativar highlight dentro de fences: `markdownLanguage.ts` passa a usar `markdown({ base,
      codeLanguages })` com `LanguageDescription.of({ name, load: () => import(...) })` para
      js/ts/json/css/html/sql/python/bash. Verificação: `npm run build && npm run check:bundle` —
      o chunk `codemirror` **não** pode crescer (as gramáticas têm que sair em chunks lazy); anotar
      em Notas os dois tamanhos.
- [x] Ampliar `src/components/codemirror/livePreview.ts` para decorar também link, lista, citação e
      linha de fence (fundo sutil), mantendo a invariante já testada de que as decorações são
      view-only e o documento não muda. Verificação: casos novos em `livePreview.test.ts`,
      incluindo um que reassere "o documento continua idêntico".
- [x] `NoteEditor.tsx`: modo de visualização vira `Escrever | Dividir | Visualizar`, com o valor no
      query param `?view=` (padrão "escrever" omite o parâmetro, como em `Recurring.tsx`), e o modo
      "Dividir" renderizando editor e `NoteMarkdownPreview` em duas colunas. Abaixo de `md`,
      "Dividir" cai para "Escrever". Verificação: teste em `NoteEditor.split.test.tsx` — abrir com
      `?view=dividir` já mostra as duas colunas; trocar de modo escreve na URL com `replace`.
- [x] Rolagem proporcional do preview acompanhando o editor no modo "Dividir" (só nesse sentido),
      com `requestAnimationFrame` para não disparar por frame. Verificação: teste simulando `scroll`
      no contêiner do editor e conferindo o `scrollTop` do preview; `npm run lint`.
- [ ] Criar `extractHeadings(markdown)` em `src/domain/notes/headings.ts` (ao lado do
      `slugifyHeading` da 069) devolvendo `{ level, text, slug, line }[]`, ignorando `#` dentro de
      fence. Testes: níveis 1–6, `#` em bloco de código não vira título, título vazio, slugs
      repetidos recebendo sufixo. Verificação: `npm test`.
- [ ] Criar `src/pages/admin/notes/NoteOutlinePanel.tsx` (painel colapsável ao lado de "Vínculos"),
      listando os títulos com indentação por nível; clicar rola o editor até a linha no modo
      Escrever/Dividir e usa a âncora no modo Visualizar; `EmptyState` curto ("Sem títulos ainda")
      quando a nota não tem nenhum. Verificação: teste `NoteOutlinePanel.test.tsx` — lista, hierarquia,
      clique chama o scroll com a linha certa, e estado vazio.
- [ ] Contagem de palavras, caracteres e tempo de leitura no rodapé do editor, a partir de função
      pura `countWords(markdown)` que desconta fences e marcadores (reusar `stripMarkdown` de
      `src/lib/markdown.ts`). Verificação: testes de `countWords` (texto vazio, só código, acentos,
      múltiplos espaços) + teste de que o rodapé exibe os três números.
- [ ] Criar `toggleTaskListItem(markdown, index)` em `src/domain/notes/markdownCommands.ts` (puro):
      alterna o n-ésimo `- [ ]`/`- [x]` do documento, ignorando checkbox dentro de fence.
      Verificação: testes — marcar, desmarcar, índice fora do intervalo devolve o texto intacto,
      checkbox em bloco de código não conta, indentação preservada.
- [ ] Tornar o checkbox clicável no preview quando o `MarkdownPreview` receber `onToggleTask`
      (opcional); `NoteEditor` passa o handler e escreve o resultado no documento; demais usos
      (`TaskDescriptionField`, previews read-only) continuam com o checkbox `disabled`.
      Verificação: teste clicando o segundo checkbox de uma nota e conferindo o markdown resultante,
      + teste de que em `TaskDescriptionField` o checkbox segue desabilitado.
- [ ] Indicador de salvamento no cabeçalho do `NoteEditor`: "Salvando…" / "Salvo às HH:mm" /
      "Falha ao salvar" com botão "Tentar novamente"; `Ctrl/Cmd+S` força o flush do debounce.
      Verificação: teste `NoteEditor.autosave.test.tsx` — digitar mostra "Salvando…", sucesso mostra
      o horário, erro mostra a falha **e mantém o texto digitado**, e o botão refaz a chamada.
- [ ] Passada final: `npm run build`, `npm run lint`, `npm run check:bundle` e a suíte completa
      (`npx vitest run --testTimeout=30000 --hookTimeout=30000 --maxWorkers=4`). Anotar em Notas os
      tamanhos de chunk antes/depois e qualquer teste alheio que tenha precisado de ajuste.
- [ ] Checagem de satisfação do `prompt:` ("nível sofisticado de escrita", lado editor), com
      artefato por item e sem navegador: atalhos → `markdownCommands.test.ts` +
      `MarkdownCodeEditor.test.tsx`; menu `/` → `slashCommands.test.ts`; escrever vendo o resultado
      → `NoteEditor.split.test.tsx`; navegação em nota longa → `NoteOutlinePanel.test.tsx`;
      checklist utilizável → teste do `toggleTaskListItem`; confiança no salvamento →
      `NoteEditor.autosave.test.tsx`. Faltou algo? Abrir tarefa nova aqui, não fechar a feature.

## Prompts

- 2026-08-18 — "- aumente a sofisticação do markdown das notas, procure referências, sdkjs, bases abertas, a ideia é alcançar um nível sofisticado de escrita"

## Notas

- 2026-09-25 — O arquivo nasceu sem `## Como testar` (a seção passou a ser obrigatória depois do
  planning). Escrita agora, como a skill `next` manda, e mantida a cada tarefa.
- 2026-09-25 — `Ctrl/Cmd+K` dentro do editor precisou de `stopPropagation`, não só do
  `preventDefault` do CodeMirror: `GlobalSearch` escuta `keydown` no `window`, então o mesmo atalho
  inseria o link **e** abria a paleta de busca por cima. O handler novo não consome o evento (só
  impede de subir) — quem formata continua sendo o keymap. Coberto por teste.
- 2026-09-25 — `Ctrl+Shift+K` está registrado duas vezes (`Mod-Shift-k` e `Mod-Shift-K`). Com Shift
  o navegador manda `event.key === "K"` e o CodeMirror só chega no `"k"` traduzindo o `keyCode`,
  que o jsdom não preenche. Sem o par, o atalho funcionaria no navegador e nunca no teste.
- 2026-09-25 — Seleção que começa na coluna 0 continua na coluna 0 depois de um toggle de linha
  (título/lista/citação): o marcador entra **dentro** do bloco selecionado, então o bloco segue
  inteiro selecionado e o atalho de novo desfaz exatamente o que acabou de ser feito.
- 2026-09-25 — **Realce dentro do fence, medido.** A fábrica `markdown()` continua fora: ela importa
  `@codemirror/lang-html` de forma estática, e é isso que levava o chunk `codemirror` a 212 KB. O
  caminho usado é o `parseCode` do `@lezer/markdown` com um `codeParser` próprio que devolve
  `ParseContext.getSkippingParser(import(...))` — o bloco fica sem cor até a gramática chegar e é
  reparseado sozinho. Números gzip: chunk `codemirror` **138,9 KB → 155,6 KB** (teto de vendor:
  200 KB) e as sete gramáticas em chunks **lazy** próprios — `cm-lang-javascript` 33,8 KB,
  `cm-lang-python` 18,8 KB, `cm-lang-sql` 12,8 KB, `cm-lang-css` 12,5 KB, `cm-lang-html` 6,1 KB,
  `cm-lang-json` 1,5 KB, `cm-lang-shell` 1,2 KB. Rota de Notas: `NoteDetail` 10,3 KB (fim da 069) →
  **14,3 KB** (toolbar, menu `/`, atalhos, painéis novos); `Notes` segue em 3,0 KB.
- 2026-09-25 — **O plano pedia que o chunk `codemirror` não crescesse; ele cresceu 16,7 KB gzip, e
  não são gramáticas.** O que entrou foi a *maquinaria* de parse aninhado, que é estática por
  natureza: `parseCode`/`parseMixed`, `LanguageDescription`, `ParseContext`, `LRLanguage` e
  `StreamLanguage` (esta última medida sozinha em 3,9 KB, o preço do ` ```bash `). Medido bloco a
  bloco: com as gramáticas caindo no vendor (sem `manualChunks` próprio) era 201,5–211,8 KB e o
  orçamento **falhava**; com um chunk por linguagem, 155,6 KB e `Bundle budget OK.`. Nenhum byte de
  gramática ficou no caminho crítico — prova: o chunk não contém nenhum dos nomes de nó das
  gramáticas (`MismatchedCloseTag`, `TemplateString`, `PseudoClassName`, `JsonText`) e não importa
  estaticamente nenhum `cm-lang-*`.
- 2026-09-25 — HTML dentro do fence vem do parser cru `@lezer/html`, não de `@codemirror/lang-html`.
  Motivo medido: `lang-markdown` importa `lang-html` estaticamente (é o que `markdown()` usa), e
  hoje ele só some por tree-shaking porque ninguém o usa — bastou um `import()` dinâmico dele para
  o Rollup ter de mantê-lo no grafo estático e o vendor saltar 73 KB.
- 2026-09-25 — `check-bundle-budget.mjs` passou a testar `LAZY_VENDOR_BASE_RE` também contra o
  **nome do arquivo**, como já fazia com excalidraw e vendor: nome com hífen no meio
  (`cm-lang-javascript-<hash>.js`) é encurtado demais pelo `base`, que vira só `cm`. Sem isso as
  gramáticas entravam como `route` (teto de 160 KB) em vez de `lazy`.
- 2026-09-25 — Dependências novas no `package.json`: `@codemirror/lang-json`, `lang-sql`,
  `lang-python` e `legacy-modes` (instaladas), mais `lang-javascript`, `lang-css`, `@lezer/markdown`
  e `@lezer/html`, que já vinham transitivamente e agora são explícitas — mesma decisão que a 069
  tomou com o `katex`. `@codemirror/lang-html` **não** entrou: nada o importa diretamente.
- 2026-09-25 — `useIsMobile` (que decide a queda de "Dividir" para "Escrever") chama
  `window.matchMedia`, que o jsdom não implementa — sem stub, **toda** tela que usa o hook derrubava
  o teste. Entrou um stub em `src/test/setup-jsdom.ts`, ao lado dos de `ResizeObserver` e
  `Range.getClientRects`, com `matches` derivado de `window.innerWidth` (que o teste controla).
- 2026-09-25 — `ViewMode`/`VIEW_PARAM`/`parseViewMode` foram para `src/domain/notes/viewMode.ts` em
  vez de ficarem no componente: exportar função de um arquivo de componente acende
  `react-refresh/only-export-components` (o lint tem 18 warnings pré-existentes e nenhum novo
  entrou por esta feature).

## Como testar

### 1. Pré-requisitos

- `npm ci` na raiz do projeto. A feature **não** acrescenta dependência nova, não tem migration,
  seed nem variável de ambiente: é 100% cliente.
- Para a parte manual: `npm run dev`, logar com qualquer usuário, ir em **Notas** (`/admin/notes`)
  e abrir (ou criar) uma nota.

### 2. Verificação automatizada

```
npx vitest run src/domain/notes/__tests__/markdownCommands.test.ts
npx vitest run src/components/__tests__/MarkdownCodeEditor.test.tsx
npx vitest run src/pages/admin/notes/__tests__/NoteEditorToolbar.test.tsx
npx vitest run src/pages/admin/notes/__tests__/NoteEditor.split.test.tsx
npx vitest run src/components/codemirror/__tests__/slashCommands.test.ts
npx vitest run src/components/codemirror/__tests__/markdownLanguage.test.ts
npx vitest run src/components/codemirror/__tests__/livePreview.test.ts
npx vitest run src/domain/notes/__tests__/scrollSync.test.ts
npx vitest run src/pages/admin/notes/__tests__/Notes.flow.test.tsx
npm run build
npm run lint
npm run check:bundle
```

- `markdownCommands.test.ts` prova as transformações puras (aplicar **e** remover cada marcador,
  seleção vazia, várias linhas, troca de nível de título, troca de tipo de lista, link com e sem
  seleção). `Test Files 1 passed`.
- `MarkdownCodeEditor.test.tsx` prova que os atalhos estão **ligados no editor**: digita
  `Ctrl+B`/`Ctrl+I`/`Ctrl+K`/`Ctrl+Shift+K`/`Ctrl+2`/`Ctrl+Shift+8`/`Ctrl+Shift+7` no
  `contenteditable` e confere o documento resultante.
- `NoteEditorToolbar.test.tsx` monta a barra **com um editor de verdade** e clica cada botão,
  conferindo o documento resultante (inclusive o esqueleto de tabela com linha em branco antes).
- `NoteEditor.split.test.tsx` prova os três modos: abre em "Escrever" sem parâmetro, `?view=dividir`
  já mostra editor **e** preview, trocar de modo escreve na URL com `replace` (o padrão apaga o
  parâmetro), valor inválido cai em "Escrever", abaixo de `md` o "Dividir" some da barra e cai para
  "Escrever" **sem** perder o `?view=` da URL, e a barra de formatação some em "Visualizar".
- `slashCommands.test.ts` prova o menu `/`: abre só em início de linha (não em `http:/`, não em
  `12/`, não dentro de fence nem de código inline), filtra por rótulo e por palavra-chave sem
  acento, e cada item insere o esqueleto certo com o cursor no lugar.
- `Notes.flow.test.tsx` é o fluxo fim a fim do módulo: os dois popups do editor (`[[` e `/`) abrem
  no editor real e o que fica **gravado no banco falso** é markdown cru, sem a barra do menu.
- `markdownLanguage.test.ts` prova o realce dentro do fence: os apelidos (`js`, `ts`, `py`,
  `bash`…) resolvem, linguagem desconhecida continua sem cor e sem erro, e depois de a gramática
  carregar o miolo de um ```js vira `VariableDefinition`/`Number` na árvore de sintaxe — que é de
  onde o realce sai.
- `livePreview.test.ts` prova as decorações novas (link, URL, marcador de lista, citação e fundo do
  fence) **e** a invariante que sustenta o editor: mesmo com todas elas, `state.doc` continua byte a
  byte o que o usuário escreveu.
- `scrollSync.test.ts` prova a conta da rolagem proporcional (topo, metade, fim, elástico além do
  fim, nota curta sem nada a rolar) e `NoteEditor.split.test.tsx` prova que ela está **ligada**:
  rolar o painel do editor move o `scrollTop` do preview na mesma fração, e rolar o preview **não**
  move o editor (a sincronia é de mão única, para não haver laço).
- `npm run check:bundle` também precisa listar os `cm-lang-*.js` como **lazy** (e não como `entry`
  nem `route`) e o `codemirror-*.js` abaixo de 200 KB — é o que prova que nenhuma gramática entrou
  no caminho crítico do editor.
- `npm run build` sem erro de `tsc -b`; `npm run lint` com `0 errors` (os 18 warnings de
  `react-refresh` são pré-existentes); `npm run check:bundle` imprimindo `Bundle budget OK.`

### 3. Verificação manual, passo a passo

1. Em `/admin/notes`, abra uma nota e clique no editor (aba **Escrever**).
2. Selecione uma palavra e tecle `Ctrl/Cmd+B`: ela vira `**palavra**`. Tecle de novo: os `**`
   somem. Idem `Ctrl/Cmd+I` (`_palavra_`) e `Ctrl/Cmd+Shift+K` (`` `palavra` ``).
3. Selecione uma palavra e tecle `Ctrl/Cmd+K`: vira `[palavra]()` com o cursor **dentro dos
   parênteses** — digite a URL e ela entra no lugar certo. A paleta de busca global **não** pode
   abrir junto.
4. Com o cursor numa linha de texto, tecle `Ctrl/Cmd+2`: a linha vira `## …`. Tecle `Ctrl/Cmd+3`:
   vira `### …` (troca de nível, não empilha `#`). Tecle `Ctrl/Cmd+3` de novo: o título some.
5. Selecione duas linhas e tecle `Ctrl/Cmd+Shift+8`: viram `- linha`. Tecle `Ctrl/Cmd+Shift+7`:
   viram `1. linha` / `2. linha`.
6. Digite `/` no começo de uma linha vazia: abre a lista de blocos (Título, Lista, Lista de
   tarefas, Tabela, Citação, Callout, Bloco de código, Fórmula, Diagrama, Canvas, Data de hoje,
   Link de nota). Digite `tab` para filtrar até **Tabela** e tecle Enter: entra o esqueleto com
   linha em branco antes e o nome da primeira coluna **selecionado** — digite para trocá-lo.
7. Escolha **Link de nota**: entra `[[]]` com o cursor no meio e o popup de notas já aberto.
8. Escreva um bloco ` ```ts ` com `const total = 1 + 2;` dentro. No **editor** (não no preview), a
   palavra `const` e o número saem coloridos depois de um instante — a gramática é baixada sob
   demanda (aba de rede: `cm-lang-javascript-*.js`). Um ` ```brainfuck ` continua sem cor, sem erro.
9. Ainda no editor: link sai colorido com a URL sublinhada em cinza, `-`/`1.` de lista saem em
   destaque, citação ganha barra à esquerda em todas as linhas e o bloco de código ganha fundo
   cinza de ponta a ponta — tudo **sem** o texto mudar (os `>` e `-` continuam lá).
10. Troque para **Dividir**: o editor fica à esquerda e o markdown renderizado à direita, e a URL
    vira `.../notes/<id>?view=dividir` — recarregue a página e o modo continua. Voltar para
    **Escrever** limpa o parâmetro. Estreite a janela para menos de 768 px: a aba **Dividir** some
    e sobra só o editor (a URL não muda).
    No modo Dividir, role o editor com uma nota longa: o preview acompanha na mesma proporção.
    Rolar o **preview** não mexe no editor.
11. Acima do editor há a barra com **Negrito, Itálico, Título, Link, Lista, Tarefa, Código, Tabela**
   e o **Inserir diagrama** que já existia. Passe o mouse em cada um: o `title` mostra o atalho.
   Clique em **Tabela** no fim de um parágrafo: entra o esqueleto GFM em bloco próprio, com o
   cabeçalho pronto para ser trocado. Vá para **Visualizar**: a barra some.

### 4. Casos de borda e caminhos negativos

- Atalho com **nada** selecionado: `Ctrl+B` insere `****` com o cursor no meio; teclar de novo tira
  o par em vez de empilhar outro.
- Seleção arrastada de trás para frente (fim → começo): o resultado é o mesmo da seleção normal.
- `Ctrl+Shift+8` numa seleção que inclui linha em branco: a linha em branco **não** ganha marcador.
- Item indentado (`  - filho`) virando tarefa mantém os dois espaços de indentação.
- `/` no **meio** de uma palavra, depois de `http:/`, em `12/05` ou dentro de um bloco de código
  não abre o menu — é `/` de conteúdo.
- `/zzz` (nada casa) fecha o menu em vez de mostrar lista vazia.

### 5. Sinais de que quebrou

- `Ctrl+B` não faz nada e o navegador aplica negrito visual no texto → o `markdownFormattingKeymap`
  saiu de `MarkdownCodeEditor`.
- `Ctrl+K` abre a paleta de busca global junto com o link → o `stopAppShortcuts` de
  `formattingKeymap.ts` se perdeu.
- Atalho de título empilhando `## ## Título` → regressão em `toggleHeading`; o teste
  "troca de nível em vez de empilhar `#`" falharia junto.
- O menu `/` abrindo dentro de bloco de código, ou a barra `/` sobrando no texto depois de escolher
  um item → regressão em `slashCommands.ts` (`isInsideCode` ou o `from` do resultado).
