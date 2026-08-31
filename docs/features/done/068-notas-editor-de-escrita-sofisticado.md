---
prompt: |
  - aumente a sofisticação do markdown das notas, procure referências, sdkjs, bases abertas, a ideia é alcançar um nível sofisticado de escrita
---

# 068 — Notas: editor de escrita sofisticado

## Contexto

O editor de notas é um CodeMirror deliberadamente cru: sem barra de ferramentas, sem nenhum atalho de formatação (`Mod-b`/`Mod-i` não existem), sem menu de inserção, sem sumário, com a busca do CodeMirror explicitamente desligada (`searchKeymap: false`) e com um único botão no cabeçalho — "Inserir diagrama". A única ajuda de escrita é o autocomplete de `[[wikilink]]` da 056. Depois da 067, o app passa a **renderizar** callout, fórmula, código realçado e âncora de título; sem esta feature, tudo isso só existe para quem decorar a sintaxe. "Nível sofisticado de escrita" é as duas coisas: o que o texto expressa e o quanto custa escrevê-lo.

## Decisões

- **Os comandos de formatação são funções puras sobre `EditorState`**, num módulo próprio (`src/components/codemirror/markdownCommands.ts`), e a barra e os atalhos são só dois gatilhos para os mesmos comandos. É o que permite testar "negrito com seleção vazia", "negrito sobre seleção", "negrito sobre texto já negrito (desfaz)" sem DOM — a mesma escolha que `livePreview.ts` e `wikiLinkCompletion.ts` já fizeram.
- **Atalhos**: `Mod-b` negrito, `Mod-i` itálico, `Mod-Shift-x` riscado, `Mod-e` código inline, `Mod-k` link (com seleção vira o texto do link; sem seleção, insere o esqueleto com o cursor dentro), `Mod-Shift-1..3` alternam nível de título. Registrados com `Prec.high` no `MarkdownCodeEditor`, ao lado do `literalTabKeymap` que já existe.
- **O menu de inserção é o `/` do `@codemirror/autocomplete`**, a mesma máquina que já serve o `[[`, e não um popup próprio com `cmdk`. Um popup próprio exigiria posicionar um portal sobre o cursor do CodeMirror à mão e lidar com scroll, e é justamente o tipo de trabalho que a fonte de autocomplete já resolve. O `/` só dispara em início de linha (ou depois de espaço em linha vazia), para não sequestrar barra dentro de URL e de caminho de arquivo.
- **Itens do menu**: título 1–3, lista, lista numerada, checklist, citação, callout (um item por tipo), tabela 3×3, bloco de código (com escolha de linguagem entre as realçadas pela 067), fórmula em bloco, diagrama mermaid, referência de canvas, wikilink, data de hoje, linha horizontal. O botão "Inserir diagrama" do cabeçalho sai — vira um item do menu, e o `appendMermaidSnippet` (que hoje **anexa no fim do arquivo**, não no cursor) é substituído por inserção na posição do cursor.
- **A barra de ferramentas existe, é curta e é a segunda porta de entrada** — negrito, itálico, código, link, lista, checklist, citação, e um botão "Inserir" que abre o mesmo menu do `/`. Descartada uma barra completa com um botão por sintaxe: uma barra que não cabe numa linha em 360px vira duas linhas de barra num editor que já disputa altura com o texto.
- **Terceiro modo de visualização: "Dividido"**, ao lado de Escrever/Visualizar, com edição e preview lado a lado e scroll independente, disponível só a partir de `lg` (abaixo disso não há largura para duas colunas legíveis, e o modo simplesmente não aparece na `TabsList`). Descartado trocar as abas por split fixo: em telefone o split é pior que as abas de hoje.
- **Sumário derivado do conteúdo, não do DOM**: `extractHeadings(content)` puro no domínio de notas, alimentando um painel lateral colapsável que rola até o título (usando os `id` que a 067 passou a gerar) e destaca a seção atual. Só aparece a partir de dois títulos — abaixo disso é só ocupar espaço.
- **A busca dentro da nota é religada** (`@codemirror/search`, `Mod-f`), com o painel padrão. O `searchKeymap: false` de hoje foi economia de bundle numa época em que a nota era curta; nota longa sem busca é o oposto de escrita sofisticada. Entra com medição de bundle.
- **Rodapé com contagem de palavras, caracteres e tempo estimado de leitura**, calculados por função pura que ignora bloco de código, marcação e HTML — contar `#` e `*` como palavra deixaria o número errado exatamente nas notas mais formatadas.
- **A live preview do editor ganha citação, marcador de lista e link** (hoje cobre só título, forte, ênfase, riscado e código inline), mantendo a regra que já existe: a marcação reaparece na linha do cursor e o documento nunca é alterado.
- **Fora do escopo, como decisão**: templates de nota, modo foco/zen, dobrar seção (`foldGutter`), rascunho local offline e histórico de versões. Os três primeiros são conforto de tela e não bloqueiam escrever; os dois últimos mexem no autosave (hoje "última escrita vence", sem detecção de conflito), que é uma feature própria com risco próprio.

## Tarefas

- [x] Criar `src/components/codemirror/markdownCommands.ts`: `toggleInlineMark(view, mark)` (negrito, itálico, riscado, código), `toggleHeading(view, level)`, `insertLink(view)`, `insertSnippet(view, text, cursorOffset)` — todas puras sobre `EditorState`/`EditorView`, sem tocar em React. Verificação: `npm run build`
- [x] `src/components/codemirror/__tests__/markdownCommands.test.ts`: seleção vazia insere o par e põe o cursor no meio; seleção envolve o trecho; aplicar duas vezes desfaz; alternar título troca o nível em vez de acumular `#`; link com seleção usa a seleção como texto; comando com seleção de várias linhas. Verificação: `npm test src/components/codemirror`
- [x] Registrar o keymap de formatação no `MarkdownCodeEditor` (`Prec.high`, junto do `literalTabKeymap`), com uma constante exportada para a barra reusar os mesmos rótulos e teclas. Verificação: `npm run build && npm run lint`
- [x] Criar `src/pages/admin/notes/NoteEditorToolbar.tsx`: barra curta (negrito, itálico, código, link, lista, checklist, citação, "Inserir"), com `aria-label` e `title` mostrando o atalho, e `flex-wrap` para caber em 360px. Verificação: `npm run build && npm run lint`
- [x] Criar `src/components/codemirror/slashMenu.ts`: fonte de autocomplete disparada por `/` em início de linha, devolvendo os itens de inserção com rótulo, `detail` e `apply`; a lista de itens fica num módulo de dados separado, para a barra e o menu usarem a mesma. Verificação: `npm run build`
- [x] `src/components/codemirror/__tests__/slashMenu.test.ts`: dispara em linha vazia e depois de espaço; **não** dispara dentro de `http://` nem em `a/b`; filtra por texto digitado (com e sem acento); a inserção coloca o cursor no lugar certo (dentro do fence, dentro da célula da tabela); `Escape` fecha sem inserir. Verificação: `npm test src/components/codemirror`
- [x] Ligar o slash menu e a barra no `NoteEditor`, removendo o botão "Inserir diagrama" do cabeçalho e trocando o `appendMermaidSnippet` (anexa no fim) por inserção no cursor. Verificação: `npm run build && npm run lint`; ajustar o teste existente que clica em "Inserir diagrama"
- [x] `src/pages/admin/notes/__tests__/NoteEditor.toolbar.test.tsx`: clicar em negrito com texto selecionado envolve a seleção e dispara o autosave; o item "Diagrama" do menu insere no cursor, não no fim; a barra some no modo "Visualizar". Verificação: `npm test src/pages/admin/notes`
- [x] Criar `src/domain/notes/outline.ts`: `extractHeadings(content)` → `{ level, text, slug }[]`, com o mesmo algoritmo de slug do `rehype-slug` (incluindo o sufixo de desambiguação para títulos repetidos) e ignorando `#` dentro de bloco de código. Verificação: `npm run build`
- [x] `src/domain/notes/__tests__/outline.test.ts`: níveis 1–6; título repetido gera slug distinto e igual ao do preview; `#` dentro de fence e de citação não vira título; título com acento e com emoji; conteúdo vazio devolve lista vazia. Verificação: `npm test src/domain/notes`
- [x] Criar `src/pages/admin/notes/NoteOutline.tsx`: painel colapsável com os títulos, rolando até a âncora e marcando a seção atual; só renderiza com dois títulos ou mais; escondido abaixo de `lg`. Verificação: `npm run build && npm run lint`; teste do "some com menos de dois títulos"
- [x] `NoteEditor`: terceiro modo "Dividido" na `TabsList` (só a partir de `lg`), com edição e preview lado a lado e scroll independente. Verificação: `npm run build && npm run lint`; teste de que o gatilho não é renderizado quando a media query não bate
- [x] Religar a busca do CodeMirror (`@codemirror/search` + `searchKeymap`, `Mod-f`) no `MarkdownCodeEditor`. Verificação: `npm run build && npm run check:bundle` — registrar nas Notas o delta do chunk `codemirror-*`
- [x] Criar `src/domain/notes/wordCount.ts` (`countWords(content)` → palavras, caracteres e minutos de leitura, ignorando bloco de código e marcação) + testes: nota vazia dá zero; bloco de código não conta; marcação não conta como palavra; texto com acento e hífen. Verificação: `npm test src/domain/notes`
- [x] Rodapé do `NoteEditor` com a contagem, ao lado do `SaveIndicator`, com `aria-live="off"` para não competir com o anúncio de "salvo". Verificação: `npm run build && npm run lint`
- [x] Estender `src/components/codemirror/livePreview.ts` para citação, marcador de lista e link, mantendo a regra de reexibir a marcação na linha do cursor. Verificação: testes novos em `src/components/codemirror/__tests__/livePreview.test.ts`, incluindo o caso "cursor na linha mostra a marcação de novo"
- [x] `npm run build`, `npm run lint`, `npm test` e `npm run check:bundle` limpos, com a contagem registrada
- [x] Verificação do pedido literal, por teste e não no navegador: escrever uma nota inteira **sem digitar sintaxe** — título pela barra, callout e fórmula pelo menu `/`, bloco de código com linguagem, checklist marcada no preview (067), sumário refletindo os títulos e contagem de palavras coerente ao fim

## Prompts

- 2026-08-19 — "- aumente a sofisticação do markdown das notas, procure referências, sdkjs, bases abertas, a ideia é alcançar um nível sofisticado de escrita"

## Notas

- **Recorte do prompt-mãe que esta feature cumpre**: a metade "escrever sem decorar sintaxe". A outra metade — o que o Markdown renderiza — é a 067, que carrega o mesmo prompt. As duas juntas cobrem o pedido; nenhuma delas sozinha.
- **Depende da 067** e deve ser implementada depois dela: o menu de inserção oferece callout, fórmula e bloco de código realçado, que só existem como sintaxe depois que o renderizador os entende. O sumário depende dos `id` de título que a 067 passou a gerar, e o slug de `extractHeadings` **precisa** casar com o do `rehype-slug` — se divergir, o sumário rola para lugar nenhum, e é por isso que existe teste comparando os dois.
- Depende também da 055 (`MarkdownCodeEditor`, autosave) e da 056 (a fonte de autocomplete de `[[`, cujo padrão o `/` copia). O `MarkdownTextarea` da descrição de tarefa não é tocado.

- **Desvio (068, `markdownCommands`)**: cada comando virou **duas** funções — o núcleo puro
  (`inlineMarkEdit(state, mark)` → `TransactionSpec`) e o wrapper de view
  (`toggleInlineMark(view, mark)`). A tarefa pedia só o wrapper, mas `EditorView` exige DOM e o
  teste da tarefa seguinte roda em ambiente "node" (`environmentMatchGlobs` só manda `.test.tsx`
  para jsdom). Com o núcleo puro, o teste aplica a transação com `state.update(spec).state` e
  afirma documento **e** posição do cursor sem montar editor nenhum — que é o mesmo padrão do
  `buildLivePreviewDecorations` da 056.
- **Desvio (068, keymap)**: a constante compartilhada (`MARKDOWN_FORMAT_ACTIONS`) e o keymap ficaram
  em `src/components/codemirror/formatKeymap.ts`, não dentro do `MarkdownCodeEditor.tsx` como a
  tarefa dizia — exportar constante de arquivo de componente acende
  `react-refresh/only-export-components`, o mesmo motivo que moveu `CALLOUT_LABEL` na 067. O
  componente só importa e registra.
- **Bug real evitado (068, `Mod-k`)**: `Ctrl/⌘+K` já é a busca global do app (`GlobalSearch` escuta
  no `window`), e o `preventDefault` do CodeMirror **não** impede o evento de subir — o atalho de
  link abriria a busca por cima do editor. As KeyBindings de formatação entram com
  `stopPropagation: true`, e há teste em `MarkdownCodeEditor.test.tsx` provando que o evento não
  chega ao `window`. Checklist e citação ficaram sem atalho de propósito (não estão na Decisão, e
  `Mod-Shift-c` é o inspetor do Chrome).
- **Bug real evitado (068, live preview de link)**: o parser do CodeMirror enxerga `[[Nota]]` como
  um `Link` de `[Nota]` **sem URL**. Escondendo `LinkMark` sem checar isso, o wiki-link da 056
  apareceria na tela como `[Nota]` pintado de link. A regra passou a ser "só link com destino
  (`URL` entre os filhos) tem marcação escondida", com teste dedicado.
- **Desvio (068, marcador de lista)**: o `-` não é escondido, é **substituído** por um widget `•`.
  Escondê-lo (como se faz com `#` e `**`) apagaria a informação "isto é uma lista". Lista numerada
  fica intocada: em `1.` o número é conteúdo.
- **Desvio (068, rodapé)**: a contagem ficou num rodapé embaixo do editor, e o `SaveIndicator`
  **não** foi movido para junto dela (a tarefa dizia "ao lado do `SaveIndicator`"). O indicador
  pertence ao topo, colado no campo de título que ele descreve, e movê-lo mexeria num
  `role="status"` que outras features já afirmam em teste. O que a tarefa queria de fato — a
  contagem não competir com o anúncio de "Salvo" — está garantido pelo `aria-live="off"`, com teste.
- **Medição (068, busca `Mod-f`)**: o chunk `codemirror-*` ficou **138,9 KB → 138,9 KB gzip**
  (teto de vendor: 200 KB) — o arquivo saiu do build com o **mesmo hash**, byte a byte. Motivo: o
  `@codemirror/search` já entrava no bundle pelo `highlightSelectionMatches` que o `basicSetup`
  liga por padrão; `searchKeymap: false` só removia as teclas de um array em tempo de execução.
  Ou seja, o app pagava pela busca desde a 056 sem oferecê-la. `npm run check:bundle`: OK.
- **Desvio (068, sumário)**: o slug **não** foi reimplementado — entrou `github-slugger` como
  dependência direta (já vinha como transitiva do `rehype-slug` da 067, então não é pacote novo no
  `node_modules`). Reimplementar "parecido" era o caminho garantido para o sumário rolar para lugar
  nenhum; `outline.test.ts` compara os slugs com os `id` que o preview realmente gera.
- **Recorte assumido (068, sumário)**: só título ATX (`## x`), e título dentro de citação não entra
  no sumário (a tarefa pede isso explicitamente) — ou seja, `> # Aviso` ganha `id` no preview mas
  não aparece no painel. Setext (`Título\n---`) também fica de fora: nada do que a barra, o menu
  `/` ou os atalhos produzem escreve setext.
- **Desvio (068, `/` no teste)**: o Enter que aceita a sugestão do autocomplete tem um
  `interactionDelay` de 75 ms embutido no CodeMirror (anti-clique-acidental) e, em teste, o
  cronômetro é reiniciado quando o tooltip monta — Enter logo depois de digitar não aceita. Os
  testes clicam no item do menu (o `mousedown` do tooltip aplica sem esse atraso), que é também o
  caminho de quem usa o mouse. Não é bug do app: para uma pessoa digitando, 75 ms já passaram.
- **Desvio (068)**: entrou um comando a mais no módulo, `linePrefixEdit`/`toggleLinePrefix` (lista,
  lista numerada, checklist, citação). A barra da tarefa 4 pede esses quatro botões e eles não são
  marca inline nem título; sem ele, a barra teria lógica de edição própria, que é justamente o que
  a Decisão do módulo quis evitar.

### Contagem final (tarefa "build, lint, test e check:bundle limpos")

- `npm run build` — exit 0.
- `npm run lint` — exit 0, **0 erros e 78 warnings**, exatamente a mesma contagem de antes da
  feature (todos `react-refresh/only-export-components` preexistentes). Zero warning novo.
- `npm test` — **170 arquivos, 1613 testes, todos passando** (a 067 fechou em 162/1474). São **142
  testes novos** desta feature e **3 removidos** (os do `appendMermaidSnippet`, que deixou de
  existir): `markdownCommands` 26, `slashMenu` 28, `outline` 18, `NoteEditor.toolbar` 17,
  `wordCount` 12, `highlight` +12 (as linguagens do menu `/`), `livePreview` +10, `NoteOutline` 9,
  `NoteEditorToolbar` 5, `MarkdownCodeEditor` +4, `notaSemSintaxe` 1.
- `npm run check:bundle` — `Bundle budget OK.`

### Medição de bundle (068)

| chunk | 067 | 068 | teto |
| --- | --- | --- | --- |
| `codemirror-*.js` (vendor do editor) | 138,9 KB | 138,9 KB | 200 KB (vendor) |
| `NoteDetail-*.js` (rota da nota) | 10,3 KB | 15,4 KB | 160 KB (rota) |
| `MarkdownPreview-*.js` (compartilhado com a descrição de tarefa) | 123,9 KB | 124,0 KB | 160 KB |
| `Notes-*.js` (lista) | 3,0 KB | 3,0 KB | 160 KB |
| `TaskViews-*.js` | 22,7 KB | 22,7 KB | 160 KB |
| `index-*.js` (entry) | 33,6 KB | 33,7 KB | 380 KB |

Os +5,1 KB da rota da nota são a barra, o sumário, o catálogo do menu `/` e a contagem — código do
app, não dependência nova (a única instalada, `github-slugger`, já vinha como transitiva do
`rehype-slug` e é compartilhada com o chunk do preview). O chunk do preview, que é o apertado
(77,5% do teto), **não** mudou: nada da 068 entra nele.

### Checagem de satisfação do prompt-mãe (rastreabilidade)

O `prompt:` é o mesmo da 067 — "aumente a sofisticação do markdown das notas, procure referências,
sdkjs, bases abertas, a ideia é alcançar um nível sofisticado de escrita". A 067 cumpriu a metade
do **render**; esta cumpre a metade do **escrever**. Um artefato concreto por pedido, nenhum
navegador (a skill `next` proíbe):

| Pedido | Artefato que comprova |
| --- | --- |
| "nível sofisticado de escrita" — escrever sem decorar sintaxe | `notaSemSintaxe.test.tsx`: uma nota inteira (título, negrito, callout, fórmula, bloco ```ts, segundo título, checklist) escrita **sem digitar um único caractere de sintaxe**, só barra + menu `/` + atalhos; o Markdown gravado é conferido linha a linha |
| …atalhos de formatação | `markdownCommands.test.ts` (26 testes puros) + `MarkdownCodeEditor.test.tsx` (Ctrl+B envolve e desfaz, Ctrl+Shift+2 troca o nível, Ctrl+K insere link sem vazar para a busca global) |
| …barra de ferramentas | `NoteEditorToolbar.test.tsx` (5 testes contra um `EditorView` real) + `NoteEditor.toolbar.test.tsx` (o clique em Negrito grava `**…**` de verdade pela API; a barra some no "Visualizar") |
| …menu de inserção | `slashMenu.test.ts` (28 testes: gatilho, `http://` e `a/b` intocados, filtro com e sem acento, cursor dentro do fence e da célula, `Escape` fecha sem inserir) + o item "Diagrama" inserindo **no cursor** em `Notes.flow.test.tsx` e em `NoteEditor.toolbar.test.tsx` |
| …sumário | `outline.test.ts` (18 testes, incluindo a comparação byte a byte dos slugs com os `id` que o preview gera) + `NoteOutline.test.tsx` (9) + `NoteEditor.toolbar.test.tsx` (clicar leva o cursor; a seção atual acompanha) |
| …preview lado a lado | `NoteEditor.toolbar.test.tsx` — "Dividido" mostra editor e preview juntos, o gatilho **não é renderizado** sem a media query, e cada coluna tem rolagem própria |
| …busca dentro da nota | `MarkdownCodeEditor.test.tsx` — Ctrl+F abre o painel `.cm-search` com o campo de busca, sem tocar no documento |
| …contagem de palavras | `wordCount.test.ts` (12 testes: bloco de código, cerca aberta, HTML, marcação, acento e hífen, plural) + o rodapé com `aria-live="off"` afirmado no `NoteEditor.toolbar.test.tsx` |
| …live preview mais rica | `livePreview.test.ts` (+10 testes: citação, marcador de lista virando `•`, link com URL escondida, wiki-link intocado, e a marcação reaparecendo na linha do cursor) |
| "procure referências, sdkjs, bases abertas" | levantado e concluído na 067 (seção "Referências levantadas" daquele arquivo, com o veredito escrito sobre o SDKJS); esta feature não trocou o formato do dado — `notes.content` continua Markdown cru, e a única dependência nova (`github-slugger`) é do mesmo ecossistema aberto do `rehype-slug` |

Ressalva registrada: `npm run test:e2e` (Playwright) **não** foi rodado — é automação de navegador,
o que a skill `next` proíbe neste fluxo. A cobertura equivalente está nos testes acima.
