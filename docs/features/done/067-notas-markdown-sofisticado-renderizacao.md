---
prompt: |
  - aumente a sofisticação do markdown das notas, procure referências, sdkjs, bases abertas, a ideia é alcançar um nível sofisticado de escrita
---

# 067 — Notas: sofisticação do Markdown renderizado

## Contexto

O Markdown das notas hoje é `react-markdown` + `remark-gfm` e nada mais: sem realce de sintaxe em bloco de código, sem fórmula, sem callout, sem âncora de título, com nota de rodapé aparecendo crua, checklist inerte e tabela larga estourando o layout. O que existe de sofisticado é lateral — diagrama mermaid e canvas, via o registry de blocos da 057. O prompt pede "nível sofisticado de escrita", e escrita sofisticada é primeiro **o que o texto consegue expressar quando renderizado**. Esta feature cuida da renderização; a 068 cuida de escrever isso sem decorar sintaxe.

A base já está pronta para receber: a 057 deixou dois pontos de extensão documentados — `MARKDOWN_REMARK_PLUGINS` (parser) e `blockRegistry` (render por linguagem de fence) — e a 055 deixou a regra de segurança que qualquer extensão tem que respeitar.

## Decisões

- **A base é o ecossistema aberto unified (remark/rehype), não o SDKJS.** O prompt cita "sdkjs, bases abertas" como direção de pesquisa; o veredito está na primeira tarefa e é este: o SDKJS/ONLYOFFICE Document Builder é um editor WYSIWYG de documento OOXML — pesado (ordem de dezenas de MB), licenciado em AGPL, e o formato do dado dele não é Markdown. Adotá-lo trocaria o texto em Markdown do usuário (versionável, colável, pesquisável por `ilike`, já usado por wikilink e busca global) por um documento binário, e jogaria fora a 055, a 056 e a 057 inteiras. O ecossistema unified é a "base aberta" que serve ao pedido: mesma família do que já está instalado, plugins pequenos e auditáveis, e a sintaxe alvo é a que o usuário já vê no GitHub e no Obsidian.
  - **Descartado — trocar `react-markdown` por MDX**: MDX executa JSX vindo do conteúdo, ou seja, execução de código do próprio texto — o mesmo vetor que a 055 fechou ao não instalar `rehype-raw`.
- **HTML cru continua desligado.** Nenhum plugin desta feature exige `rehype-raw`; se algum exigisse, entraria junto com `rehype-sanitize` no mesmo passo, como o comentário de `remarkPlugins.ts` manda. Cada sintaxe nova entra com um teste de que HTML cru segue inerte e `javascript:` segue barrado.
- **Callout no dialeto do GitHub (`> [!NOTE]`), com plugin próprio.** Cinco tipos — `NOTE`, `TIP`, `IMPORTANT`, `WARNING`, `CAUTION` — cada um com ícone lucide e cor de borda/fundo por token do design system.
  - **Descartado — `remark-directive` com a sintaxe `:::note`**: acrescenta uma dependência e uma sintaxe que o usuário não encontra em lugar nenhum fora do app. O dialeto do GitHub degrada graciosamente (num renderizador que não conhece, continua sendo uma citação legível) e o plugin cabe em poucas dezenas de linhas puras e testáveis, no mesmo estilo dos módulos de `src/domain/notes/`.
- **Fórmula matemática entra por `remark-math` no parser + KaTeX carregado por `import()` dinâmico no componente**, e não por `rehype-katex`. `rehype-katex` renderizaria de forma síncrona e arrastaria o KaTeX (mais o CSS e as fontes) para o chunk do `MarkdownPreview` — que está no caminho de rota das Notas **e** da descrição de tarefa. O padrão de carga sob demanda já está provado no `MermaidBlock` da 057, inclusive o estado de erro; fórmula inválida vira uma caixa `role="alert"` "Fórmula inválida" sem derrubar o resto da nota.
- **Realce de código com `rehype-highlight` (lowlight) e lista curta de linguagens registradas explicitamente** — `ts`, `tsx`, `js`, `json`, `sql`, `bash`, `python`, `css`, `html`, `markdown`, `diff` —, não o pacote "todas as linguagens". O tema não vem de um CSS pronto do highlight.js: são poucas classes escritas com os tokens do app, para o realce seguir o dark mode como o resto (mesma razão pela qual o `markdownEditorTheme` usa `hsl(var(--…))`). Se a medição de bundle mostrar o chunk de rota estourando, o realce migra para um componente de bloco com `import()` dinâmico — decisão já tomada, tarefa já escrita.
- **Título ganha `id` (`rehype-slug`) e âncora de link no hover.** É o que torna possível linkar um trecho de nota e o que a 068 usa para o sumário. Sem `rehype-autolink-headings`: a âncora é um `components.h1..h6` próprio, para não instalar uma dependência por causa de um `<a>`.
- **Checklist do GFM vira interativa nas notas, e só nelas.** Clicar num `- [ ]` do preview reescreve o Markdown de origem. A reescrita é uma função **pura** no domínio (`toggleTaskListItem(content, index)`), testada contra os casos que quebram um regex ingênuo: checkbox dentro de bloco de código, dentro de citação, em lista aninhada, com `- [X]` maiúsculo. O `MarkdownPreview` genérico continua somente-leitura quando o handler não é passado — descrição de tarefa não muda de comportamento nesta feature.
- **Tabela larga passa a rolar dentro do próprio container** (`overflow-x: auto` no wrapper de `<table>`), em vez de esticar a página. É o bug de layout mais provável de aparecer no instante em que o usuário escrever a primeira tabela de verdade.
- **A tipografia sai da string gigante de utilitários e vira um arquivo próprio** (`src/components/markdown/previewTypography.ts`), cobrindo o que hoje não tem estilo nenhum: `blockquote`, `hr`, `h3`–`h6`, listas aninhadas, `pre`, nota de rodapé. `MARKDOWN_PREVIEW_CLASS` continua exportado com o mesmo nome, para não tocar em nenhum consumidor.
- **Fora do escopo, como decisão e não adiamento**: exportar nota (PDF/HTML), imagem anexada com upload (exige bucket, cota e limpeza — feature própria), e comentários/versionamento. Nenhum deles é "escrever melhor"; são publicar, armazenar e colaborar.

## Tarefas

- [x] Levantamento de referências pedido no prompt, registrado nas Notas deste arquivo (não em documento novo): spec CommonMark e GFM (o que já é padrão e não precisa de plugin), ecossistema unified/remark/rehype (quais plugins são mantidos e qual o peso de cada um), sintaxe de alerta do GitHub e de callout do Obsidian, KaTeX, e o veredito escrito sobre SDKJS/ONLYOFFICE com o motivo de não entrar. Verificação: as Notas passam a ter uma lista de referências com uma linha de conclusão por item
- [x] Instalar `rehype-slug` e ligá-lo no `MarkdownPreview` (novo array `MARKDOWN_REHYPE_PLUGINS` em `src/components/markdown/rehypePlugins.ts`, com o mesmo comentário de contrato do `remarkPlugins.ts`). Verificação: `npm run build`
- [x] `MarkdownPreview`: `components.h1..h6` renderizando o texto + uma âncora `#` visível só no hover (`aria-label="Link para esta seção"`), apontando para o `id` gerado. Verificação: teste em `src/components/__tests__/MarkdownPreview.headings.test.tsx` — dois títulos iguais geram ids distintos, e a âncora existe com o `href` certo
- [x] Criar `src/components/markdown/remarkCallout.ts`: plugin puro que transforma `blockquote` iniciado por `[!TIPO]` num nó com `data-callout={tipo}` e título opcional na mesma linha. Verificação: `npm run build`
- [x] Criar `src/components/markdown/CalloutBlock.tsx` (ícone lucide + cor por tipo, com `role="note"`) e ligá-lo no `MarkdownPreview`. Verificação: `npm run build && npm run lint`
- [x] `src/components/markdown/__tests__/remarkCallout.test.ts`: os 5 tipos; tipo desconhecido (`[!FOO]`) continua sendo citação comum; `[!NOTE]` dentro de bloco de código não vira callout; callout com título na primeira linha; callout de várias linhas e com lista dentro. Verificação: `npm test src/components/markdown`
- [x] Instalar `rehype-highlight` e registrar o subconjunto de linguagens no `MarkdownPreview`, mantendo o `blockRegistry` com precedência (```mermaid e ```orbyva-canvas continuam indo para os renderers da 057, não para o realce). Verificação: `npm run build` e um teste provando que ```mermaid não é realçado
- [x] Tema de realce em `src/index.css` (ou no arquivo de tipografia), light e dark, com os tokens do app — sem importar CSS de tema do highlight.js. Verificação: `npm run build`; teste conferindo que as classes `hljs-*` esperadas saem no HTML de um bloco ```ts
- [x] Medir o custo: `npm run build && npm run check:bundle`, registrando nas Notas o tamanho gzip do chunk de Notas e do chunk que carrega a descrição de tarefa, antes e depois. Verificação: nenhum orçamento estourado — se estourar, a tarefa seguinte deixa de ser opcional
- [x] (não se aplicou — a medição não estourou; ver Notas) Se (e só se) a medição acima estourar: mover o realce para um `CodeBlock` com `import()` dinâmico do lowlight, no padrão do `MermaidBlock`, com fallback de texto simples enquanto carrega. Verificação: `npm run check:bundle` limpo e o teste de realce continua passando (com `await waitFor`)
- [x] Instalar `remark-math` e ligá-lo em `MARKDOWN_REMARK_PLUGINS`. Verificação: `npm run build`
- [x] Criar `src/components/markdown/MathBlock.tsx` (bloco `$$…$$` e inline `$…$`) com `import()` dinâmico de `katex` + CSS, estado de carregamento discreto e caixa `role="alert"` "Fórmula inválida" quando o parse falhar. Verificação: `npm run build && npm run lint`
- [x] `src/components/markdown/__tests__/MathBlock.test.tsx`: fórmula válida renderiza (com `await`), fórmula inválida vira a caixa de erro sem derrubar o restante da nota, `$` solto em texto comum não vira fórmula, e `$…$` dentro de bloco de código continua literal. Verificação: `npm test src/components/markdown`
- [x] Criar `src/domain/notes/taskList.ts`: `extractTaskListItems(content)` e `toggleTaskListItem(content, index)`, puros. Verificação: `npm run build`
- [x] `src/domain/notes/__tests__/taskList.test.ts`: alternar marca e desmarca preservando indentação e o resto do arquivo byte a byte; `- [X]` maiúsculo; item dentro de citação; item em lista aninhada; checkbox dentro de bloco de código **não** conta para o índice; índice fora de faixa não altera nada. Verificação: `npm test src/domain/notes`
- [x] `MarkdownPreview` aceita `onToggleTaskItem?(index)`; sem o handler, o checkbox segue `disabled` como hoje. `NoteMarkdownPreview` passa o handler, que aplica `toggleTaskListItem` e entra no autosave já existente do `NoteEditor`. Verificação: `npm run build && npm run lint`
- [x] `src/pages/admin/notes/__tests__/NoteMarkdownPreview.test.tsx`: clicar no checkbox salva o conteúdo alterado; a descrição de tarefa (`MarkdownPreview` sem handler) continua com checkbox desabilitado; erro ao salvar mostra toast e reverte o estado visual. Verificação: `npm test src/pages/admin/notes`
- [x] Criar `src/components/markdown/previewTypography.ts` com o `MARKDOWN_PREVIEW_CLASS` movido e estendido (blockquote, hr, h3–h6, listas aninhadas, `pre`, nota de rodapé) + wrapper com `overflow-x: auto` em volta de `<table>`. Reexportar de `MarkdownPreview.tsx` para não quebrar consumidor nenhum. Verificação: `npm run build && npm run lint`; teste de que a tabela sai dentro do wrapper rolável
- [x] Teste de regressão de segurança em `src/components/__tests__/MarkdownPreview.security.test.tsx`, cobrindo as sintaxes novas: `<script>` e `<img onerror>` continuam inertes; `[x](javascript:alert(1))` continua barrado; callout, math e realce não abrem caminho para HTML cru. Verificação: `npm test src/components`
- [x] `npm run build`, `npm run lint`, `npm test` e `npm run check:bundle` limpos, com a contagem registrada
- [x] Verificação do pedido literal ("nível sofisticado de escrita"), por teste e não no navegador: uma nota de fixture usando **todas** as sintaxes novas ao mesmo tempo (título com âncora, callout, fórmula inline e em bloco, bloco ```ts realçado, tabela larga, nota de rodapé, checklist interativa, diagrama mermaid da 057) renderiza inteira, sem erro no console e sem um recurso quebrando o outro

## Prompts

- 2026-08-19 — "- aumente a sofisticação do markdown das notas, procure referências, sdkjs, bases abertas, a ideia é alcançar um nível sofisticado de escrita"

## Notas

- **Recorte do prompt-mãe que esta feature cumpre**: a metade "o que o Markdown consegue expressar quando renderizado". A outra metade — escrever isso sem decorar sintaxe (toolbar, atalhos, menu de barra, sumário, preview lado a lado) — é a 068, que carrega o mesmo prompt.
- Ordem de implementação: **067 antes da 068**. O menu de barra da 068 insere as sintaxes que esta feature ensina o app a renderizar; na ordem inversa, o menu ofereceria callout e fórmula que sairiam como texto cru.
- Depende da 055 (`MarkdownPreview`, decisão de não usar `rehype-raw`) e da 057 (`MARKDOWN_REMARK_PLUGINS`, `blockRegistry`, padrão de carga dinâmica do `MermaidBlock`). Não depende da 056 nem da 058.
- `katex` já é conhecido pelo `LAZY_VENDOR_BASE_RE` de `scripts/check-bundle-budget.mjs` (chegava como dependência transitiva do mermaid) — passar a usá-lo diretamente não exige regra nova no orçamento, mas exige a medição da tarefa correspondente.

- **Desvio (067, tarefa do `CalloutBlock`)**: a tarefa pedia só `build`+`lint`, mas a skill `next`
  exige afirmativa concreta de comportamento e proíbe navegador — então entrou um arquivo de teste
  a mais, `src/components/markdown/__tests__/CalloutBlock.test.tsx`, que é onde "o callout aparece
  na tela com ícone, rótulo e corpo" fica provado. O `remarkCallout.test.ts` continua sendo o teste
  do parser (árvore mdast); este é o da ponte parser → tela.
- **Desvio (067)**: `CALLOUT_LABEL` e `parseCalloutType` nasceram no `CalloutBlock.tsx` e foram
  movidos para `remarkCallout.ts` — exportar constante de um arquivo de componente acende
  `react-refresh/only-export-components` no lint, e a regra do repo é não acrescentar warning novo.

- **Desvio (067, fórmula)**: a fórmula **não** virou um caso especial no `MarkdownPreview` — o
  `remark-math` já entrega `$…$` e `$$…$$` como `code.language-math`, que é o mesmo formato de um
  fence, então o `MathBlock` entrou pelo `blockRegistry` da 057 como qualquer outro renderer (e de
  brinde ` ```math ` também funciona). O único ajuste no contrato do registry foi passar a
  `className` do `<code>` ao renderer, que é como o `MathBlock` distingue `math-inline` de
  `math-display`; renderer que só declara `{ code }` continua válido.
- **Desvio (067)**: `MATH_BLOCK_LANGUAGE`/`MATH_DISPLAY_CLASS` ficaram em
  `src/domain/notes/blockLanguage.ts` (junto do resto do vocabulário de bloco) em vez de no
  componente, pelo mesmo motivo do `CALLOUT_LABEL`: constante exportada de arquivo de componente
  acende `react-refresh/only-export-components`.

- **Consequência assumida (âncora de título)**: com o `aria-label="Link para esta seção"` que a
  tarefa pede, o nome acessível de um título passa a ser "Título Link para esta seção". A
  alternativa (`aria-hidden` na âncora, como o GitHub faz) deixaria um link focável fora da árvore
  de acessibilidade — pior. Testes que casavam o nome do título por igualdade exata passaram a usar
  regex.
- **Desvio (067, checklist)**: o índice do checkbox não é contado no componente e sim carimbado na
  árvore por um plugin novo, `src/components/markdown/rehypeTaskListIndex.ts` (atributo
  `data-task-index`). Contador vivo entre renders é frágil em React (render duplo do StrictMode
  numeraria errado); no hast a contagem acontece uma vez e a ordem de documento é, por construção, a
  mesma que o `extractTaskListItems` enxerga no texto.
- **Desvio (067, checklist)**: a tarefa dizia só "entra no autosave já existente", mas a tarefa de
  teste seguinte exigia reverter o estado visual quando a gravação falha. O `NoteEditor` passou a
  guardar o par antes/depois da última alternância e desmarca de volta **se** o conteúdo ainda for
  exatamente o que a alternância produziu — se o usuário digitou por cima, reverter apagaria o texto
  dele, e aí só o toast é o comportamento certo.

### Checagem de satisfação do prompt-mãe (rastreabilidade)

Um artefato concreto por pedido do `prompt:` — nenhum "pelo código parece certo", e nenhum
navegador (a skill `next` proíbe).

| Pedido | Artefato que comprova |
| --- | --- |
| "aumente a sofisticação do markdown" — callout | `remarkCallout.test.ts` (15 testes: os 5 tipos, `[!FOO]` intocado, dentro de bloco de código, título, aninhado) + `CalloutBlock.test.tsx` (11 testes, a caixa na tela com ícone, rótulo e corpo) |
| …fórmula matemática | `MathBlock.test.tsx` (7 testes: inline, bloco, fórmula inválida virando `role="alert"` sem derrubar a nota, `$` solto, `$…$` em código) |
| …realce de sintaxe | `highlight.test.tsx` (25 testes: `hljs-keyword`/`hljs-number` num bloco ```ts, as 10 linguagens registradas uma a uma, ```mermaid não realçado, tema em token do app) |
| …âncora de título | `MarkdownPreview.headings.test.tsx` (6 testes: ids de slug, dois títulos iguais → `etapas`/`etapas-1`, `href` da âncora) |
| …checklist interativa | `taskList.test.ts` (20 testes puros) + `NoteMarkdownPreview.test.tsx` (o clique grava `- [x]` de verdade via `updateNote`, o índice pula bloco de código, e a falha de gravação desmarca de volta) |
| …tabela e tipografia | `previewTypography.test.tsx` (14 testes: wrapper `overflow-x-auto` em volta de `<table>`, blockquote/hr/h3–h6/lista aninhada/`pre`/nota de rodapé cobertos, `MARKDOWN_PREVIEW_CLASS` ainda exportado do mesmo lugar) |
| "procure referências" | a seção "Referências levantadas" abaixo, uma linha de conclusão por item |
| "sdkjs" | veredito escrito (não entra: dado não é Markdown, AGPLv3, peso) nas Decisões e nas Referências |
| "bases abertas" | as dependências novas são todas do ecossistema unified/aberto (`rehype-slug`, `rehype-highlight` + `highlight.js`, `remark-math`, `katex`), e nenhuma trocou o formato do dado — `notes.content` continua Markdown |
| "nível sofisticado de escrita" | `notaCompleta.test.tsx`: **uma nota** com título repetido + âncora, callout, fórmula inline e em bloco, tabela de 6 colunas, checklist, nota de rodapé, bloco ```ts realçado e diagrama mermaid, tudo renderizando junto, sem erro nem warning no console |
| segurança (regra herdada da 055) | `MarkdownPreview.security.test.tsx` (11 testes: `<script>`/`<img onerror>` inertes, `javascript:` e `data:text/html` barrados, callout/fórmula/realce sem porta para HTML cru, `rehype-raw` ainda fora do `package.json`) |

Ressalva registrada: `npm run test:e2e` (Playwright) **não** foi rodado — é automação de navegador, o
que a skill `next` proíbe neste fluxo. A cobertura equivalente está nos testes de componente acima.

### Contagem final (tarefa "build, lint, test e check:bundle limpos")

- `npm run build` — exit 0.
- `npm run lint` — exit 0, **0 erros e 78 warnings**, exatamente a mesma contagem de antes da
  feature (todos `react-refresh/only-export-components` preexistentes). Zero warning novo.
- `npm test` — **162 arquivos, 1474 testes, todos passando**, dos quais 116 escritos por esta
  feature (âncora de título 6, `remarkCallout` 15, `CalloutBlock` 11, realce 25, `MathBlock` 7,
  `taskList` 20, tipografia 14, segurança 11, nota completa 1, checklist no `NoteEditor` 6).
- `npm run check:bundle` — `Bundle budget OK.`

### Medição de bundle (tarefa "Medir o custo")

`npm run build && npm run check:bundle`, gzip, antes (só `remark-gfm`) e depois (slug + callout +
realce):

| chunk | antes | depois | teto |
| --- | --- | --- | --- |
| `MarkdownPreview-*.js` — **o chunk que Notas e descrição de tarefa carregam** | 50,0 KB | 121,5 KB | 160 KB (rota) |
| `NoteDetail-*.js` (rota da nota) | 10,3 KB | 10,3 KB | 160 KB |
| `Notes-*.js` (lista de notas) | 3,0 KB | 3,0 KB | 160 KB |
| `TaskViews-*.js` (onde mora a descrição de tarefa) | 22,7 KB | 22,7 KB | 160 KB |
| `TaskList-*.js` | 7,5 KB | 7,5 KB | 160 KB |
| `index-*.js` (entry) | 33,7 KB | 33,6 KB | 380 KB |
| `katex-*.js` (lazy, novo) | — | 75,9 KB | 200 KB (lazy) |

(Os números da linha do `MarkdownPreview` acima foram medidos logo depois do realce; a contagem
final, com tipografia, tabela rolável e checklist incluídas, é **123,9 KB**. O chunk `katex` novo é
**lazy**: só é baixado quando a nota tem fórmula, e é um chunk separado da cópia de KaTeX que o
`@excalidraw/mermaid-to-excalidraw` já vendorizava — essa não dá para deduplicar, é outro arquivo em
disco.)

Conclusão: **nenhum orçamento estourou** (`Bundle budget OK.`), então a tarefa condicional de mover
o realce para um bloco com `import()` dinâmico **não se aplicou** — a decisão da feature a
condicionava a "se estourar", e não estourou. O custo está concentrado num lugar só: os +71,5 KB do
`rehype-highlight` + as 10 gramáticas do highlight.js, todos no chunk compartilhado. É 76% do teto
de rota; quem for acrescentar linguagem à lista de `MARKDOWN_HIGHLIGHT_LANGUAGES` precisa medir de
novo, e se um dia passar do teto, o caminho já está escrito na Decisão (bloco com `import()`
dinâmico, no padrão do `MermaidBlock`).

### Referências levantadas (tarefa 1 — "procure referências, sdkjs, bases abertas")

Uma linha de conclusão por item; o que virou decisão está em `## Decisões`, isto aqui é o rastro de
onde a decisão veio.

- **CommonMark 0.31.2 (spec.commonmark.org)** — parágrafo, ênfase, lista, citação, ATX/setext,
  fence, link de referência e entidade já são padrão. **Conclusão**: nada disso precisa de plugin;
  o que falta no app não é parser, é *render* (título sem `id`, `pre` sem realce, `blockquote` sem
  estilo).
- **GFM (github.github.com/gfm) + `remark-gfm` 4** — tabela, riscado, autolink, checklist e nota de
  rodapé, tudo já instalado. **Conclusão**: nota de rodapé e tabela **já são parseadas hoje** e
  saem feias por falta de CSS, não por falta de plugin; checklist já vira `<input disabled>` — o
  trabalho é estilo + interatividade, não dependência nova.
- **Ecossistema unified (remark/rehype)** — mesma família do `react-markdown`/`remark-gfm` que já
  estão no `package.json`; plugins são pacotes pequenos, de escopo único, mantidos pelo mesmo grupo
  (wooorm/unifiedjs). **Conclusão**: é a "base aberta" que o prompt pede — extensão por composição,
  sem trocar o formato do dado (Markdown em `notes.content`, que wikilink, busca `ilike` e
  `MarkdownCodeEditor` já dependem).
- **`rehype-slug`** — gera `id` de título a partir do texto (`github-slugger`), com desambiguação
  automática de títulos repetidos. **Conclusão**: entra; é a peça que permite linkar um trecho de
  nota e a base do sumário da 068. Sem `rehype-autolink-headings` junto: a âncora sai de um
  `components.h1..h6` próprio, dependência a menos.
- **`rehype-highlight` + `lowlight`/highlight.js** — 37 linguagens comuns por padrão, com opções
  `languages` (registrar) e `subset` (limitar a autodetecção). **Conclusão**: entra com lista curta
  registrada explicitamente (`ts/tsx/js/json/sql/bash/python/css/html/markdown/diff`); "todas as
  linguagens" (190) seria peso morto num chunk que a descrição de tarefa também carrega.
- **Sintaxe de alerta do GitHub (`> [!NOTE]`, `TIP`, `IMPORTANT`, `WARNING`, `CAUTION`)** — é
  blockquote comum com uma palavra-chave entre colchetes na **primeira linha**; fora do GitHub
  degrada para citação legível. **Conclusão**: é o dialeto adotado, com plugin próprio de poucas
  dezenas de linhas — o usuário já conhece a sintaxe de fora do app e nada quebra em renderizador
  que não a conheça.
- **Callout do Obsidian (`> [!info] Título`)** — mesmo formato de gatilho, mas com dezenas de tipos,
  dobrável (`> [!note]-`) e título livre na mesma linha. **Conclusão**: o *título na mesma linha* é
  a boa ideia e foi incorporado; o catálogo enorme de tipos e o dobrável não — cinco tipos cobrem o
  uso real e mantêm o mapa de ícone/cor pequeno.
- **`remark-directive` (`:::note`)** — sintaxe genérica de diretiva (MyST/Docusaurus). **Conclusão**:
  descartado — dependência a mais e sintaxe que o usuário não encontra em lugar nenhum fora do app;
  num renderizador que não a conhece vira `:::note` cru na tela.
- **MDX** — Markdown que executa JSX vindo do conteúdo. **Conclusão**: descartado por segurança — é
  execução de código a partir do texto, o mesmo vetor que a 055 fechou ao não instalar
  `rehype-raw`.
- **`remark-math` + KaTeX** — `remark-math` só marca os nós (`inlineMath`/`math`); quem renderiza é o
  KaTeX, que ganha do MathJax em tamanho de bundle e tempo de carga de fonte, ao custo de cobrir um
  subconjunto do LaTeX. **Conclusão**: `remark-math` no parser + KaTeX por `import()` dinâmico no
  componente. `rehype-katex` foi descartado porque arrastaria KaTeX + CSS + fontes para o chunk
  síncrono do `MarkdownPreview`, que está no caminho da rota de Notas **e** da descrição de tarefa.
- **SDKJS / ONLYOFFICE Document Builder (citado no prompt)** — SDK JavaScript dos editores do
  ONLYOFFICE, **AGPLv3** (dual-licenciado, comercial sob contato), voltado a criar/editar/converter
  OOXML (DOCX/XLSX/PPTX) e PDF; é um editor WYSIWYG de documento, da ordem de dezenas de MB.
  **Conclusão**: **não entra**. Três motivos, em ordem: (1) o dado dele não é Markdown — trocaria
  `notes.content` (texto versionável, colável, pesquisável por `ilike`, base de wikilink e busca
  global) por documento binário, jogando fora a 055, a 056 e a 057; (2) AGPLv3 é licença viral para
  um app hospedado; (3) o peso é incompatível com o orçamento de bundle deste projeto (`route` =
  160 KB gzip). O pedido "bases abertas" é atendido pelo unified, que é aberto **e** compatível com
  o que já existe.
- **Fora do escopo por decisão** (exportar PDF/HTML, upload de imagem, comentário/versão) — nenhum é
  "escrever melhor"; são publicar, armazenar e colaborar. Registrado em `## Decisões`.
