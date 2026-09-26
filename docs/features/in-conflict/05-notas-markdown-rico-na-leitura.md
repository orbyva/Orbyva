---
prompt: |
  - aumente a sofisticação do markdown das notas, procure referências, sdkjs, bases abertas, a ideia é alcançar um nível sofisticado de escrita
---

## Conflito

**Par na `master`:** `done/067-notas-markdown-sofisticado-renderizacao.md`. **O mesmo recurso, feito
duas vezes, de formas diferentes.** A implementação da `master` é a que ficou; esta está aqui só para
você julgar se sobrou algo a portar.

As duas abordagens, lado a lado:

| recurso | nesta feature | na `master` (a que valeu) |
|---|---|---|
| callout `> [!NOTE]` | `remarkCallout.ts` anotando `data-callout` via `data.hProperties`, estilo em CSS | `remarkCallout.ts` + `CalloutBlock.tsx` (componente React) |
| fórmula `$…$` | `MathBlock.tsx` com `katex` **0.16**, `import()` dinâmico | `MathBlock.tsx` com `katex` **0.18** |
| código colorido | `lowlight` + renderer React recursivo, para **nunca** usar `innerHTML` | `rehype-highlight` (biblioteca pronta) |
| âncora de título | `rehypeHeadingIds.ts` + `domain/notes/headings.ts` (slug caseiro, desempate `-2`) | `rehype-slug` (biblioteca pronta) |
| tipografia | classe `.markdown-body` em `src/index.css` | `previewTypography.ts` |
| índice de task-list | `rehypeTaskIndex.ts` | `rehypeTaskListIndex.ts` |
| **rótulo de footnote em pt-BR** | **tinha** (`remarkRehypeOptions`) | **não tinha** → **já portado**, ver `09` |

A escolha da `master` é a mais convencional nos dois pontos em que diverge de verdade
(`rehype-highlight` e `rehype-slug` em vez de código próprio), e é o que está em uso. O único item em
que esta versão era melhor — os rótulos de acessibilidade em português — **já foi aplicado** e está
registrado em `09-correcoes-aproveitadas.md`; não precisa decidir sobre ele.

O texto completo desta feature (Decisões, Notas e `## Como testar`) segue abaixo, e o código está no
commit `939e869`.

### P1 — Sobrou algo aqui que você queira na `master`? (ex.: a decisão de não usar `innerHTML` no bloco de código, que `rehype-highlight` não garante; ou o desempate de slug de títulos repetidos)
**Resposta:**

### P2 — Este arquivo pode ser descartado depois de você responder a P1, ou quer guardá-lo como registro das duas abordagens?
**Resposta:**

# 069 — Notas: markdown rico na leitura (math, callouts, código colorido, tipografia)

## Contexto

O prompt-mãe da 055 pedia "um Obsidian/Notion tunado, markdown na veia". O que existe hoje é o
mínimo: `react-markdown@10` com **um único** plugin remark (`remark-gfm`), montado em
`src/components/MarkdownPreview.tsx`, e a lista de plugins centralizada num array de uma linha
(`src/components/markdown/remarkPlugins.ts:18`). A 057 (`done/`) construiu os dois pontos de
extensão — `MARKDOWN_REMARK_PLUGINS` (parser) e `blockRenderers` (`blockRegistry.ts:38`, hoje só
`mermaid` e `orbyva-canvas`) — mas não os usou além dos diagramas.

O buraco na **leitura** é grande e mensurável: bloco de código sai sem cor nenhuma (nem no preview
nem no editor — a 057 tirou o highlight aninhado de propósito, por bundle); fórmula matemática não
existe; callout/admonition (`> [!NOTE]`) não existe; footnote é *parseada* pelo GFM mas sai sem
estilo algum; `MARKDOWN_PREVIEW_CLASS` (`MarkdownPreview.tsx:12`) estiliza **só** h1, h2, tabela,
lista e código inline — h3–h6, blockquote, `hr`, imagem e checkbox de task-list saem com o reset do
navegador. Ou seja: o texto sofisticado *pode* ser escrito, mas é renderizado como um README pobre.

Esta feature cuida da **saída** (como a nota se lê). A entrada (editor, atalhos, menu `/`, preview
lado a lado, sumário) é a 070. As duas nascem do mesmo bullet e podem ser feitas em qualquer ordem;
esta primeiro rende mais, porque a 070 vai exibir no preview lado a lado o que aqui for construído.

Restrições herdadas que **não** se renegociam aqui: HTML cru continua desligado (não existe
`rehype-raw`; ligar exige `rehype-sanitize` no mesmo commit — invariante repetida em 4 arquivos e
travada por teste em `MarkdownPreview.blocks.test.tsx`), e `scripts/check-bundle-budget.mjs` impõe
160 KB gzip por chunk de rota / 200 KB por vendor lazy.

## Decisões

- **Ampliar pelos pontos de extensão da 057; não trocar o motor.** Continua `unified` +
  `react-markdown`. Descartado migrar para Tiptap/ProseMirror/Milkdown/Lexical: jogaria fora
  wiki-links (056), mermaid e canvas (057, 058), que hoje são plugins de *renderer* e virariam
  extensões de *schema* de editor, e estouraria o orçamento de bundle da rota. Descartado embutir
  **sdkjs** (ONLYOFFICE, citado no prompt): é um editor de documento OOXML/WYSIWYG de ~vários MB,
  com modelo de documento próprio — não renderiza markdown e não conversa com nada do módulo. A
  "base aberta" que o prompt pede já é a que o projeto usa: o ecossistema **unified/remark/rehype**.
  As referências de *comportamento* adotadas são Obsidian (callouts, math, footnotes) e GitHub
  (alerts, tabelas, footnotes) — ambos formatos de texto puro, que degradam para markdown legível
  se um dia o motor mudar.
- **Nenhum recurso novo inventa sintaxe própria.** Tudo que entrar tem que ser sintaxe já escrita
  por Obsidian ou GitHub, para que a nota continue portável: `$…$`/`$$…$$` (math),
  `> [!NOTE]`/`> [!WARNING]` (callout), `[^1]` (footnote), ` ```lang ` (código). Descartado
  `:::note` (remark-directive): exigiria dependência nova e é a sintaxe de menor alcance das duas.
- **Callout sai de um plugin remark local, sem dependência nova.** `> [!TIPO]` já é um blockquote
  válido para o GFM; o plugin só reconhece o primeiro parágrafo, tira o marcador e anota o nó
  (`data.hProperties`). Tipo desconhecido cai no blockquote normal — nunca some texto da tela.
- **Math e highlight de código são carregados sob demanda, pelo padrão do `MermaidBlock`**
  (`await import(...)` dentro do componente). Nenhum dos dois entra no chunk da rota de Notas.
  KaTeX já está no `package-lock` transitivamente (via mermaid) e já é whitelisted em
  `LAZY_VENDOR_BASE_RE`, então o custo real é o CSS/fonte, não o JS.
- **Highlight de código renderiza árvore React, não `innerHTML`.** Usa `lowlight` (hast) + um
  renderer recursivo minúsculo em vez de `hljs.highlight().value` + `dangerouslySetInnerHTML`.
  Motivo: mantém literalmente verdadeira a invariante "o preview não interpreta HTML", que hoje é
  garantida por teste; um `innerHTML`, mesmo de fonte escapada, abriria a porta que a 057 fechou.
  Descartado `shiki`: qualidade melhor, mas carrega grammars/themes na casa dos MB.
- **Linguagem desconhecida não é erro**: o fence é renderizado sem cor, com o nome da linguagem no
  cabeçalho. Idem falha do `import()` dinâmico — cai para texto puro. Um bloco de código nunca pode
  sumir por causa da cor.
- **Fórmula inválida mostra o código-fonte + a mensagem do KaTeX**, no mesmo desenho de erro que
  `MermaidBlock` já usa para `mermaid.parse` que falha. `throwOnError: false` do KaTeX fica
  desligado de propósito: silenciar o erro faz o usuário achar que escreveu certo.
- **`MARKDOWN_PREVIEW_CLASS` deixa de ser uma string gigante de variantes arbitrárias e vira a
  classe `.markdown-body`, definida em `src/index.css`** (`@layer components`), com tokens
  `hsl(var(--…))` para seguir o dark mode. A constante continua exportada com o mesmo nome (é usada
  fora do módulo de Notas, em `TaskDescriptionField`), só muda o valor. Motivo: o escopo desta
  feature mais que dobra o número de seletores estilizados, e a string arbitrária já é ilegível.
- **Cada bloco de código ganha "Copiar"**; é a affordance que separa "renderiza código" de
  "trabalha com código", e é barata. Sem número de linha (ruído em nota).
- **Fora de escopo, explicitamente**: upload/colagem de imagem (não existe bucket de storage para
  notas — só `task-icons`; abrir isso é feature própria com schema), exportar para PDF/DOCX,
  transclusão `![[nota]]` (é vocabulário da 056), e checkbox de task-list clicável — este último é
  *edição*, e mora na 070.

## Tarefas

- [x] Extrair o valor de `MARKDOWN_PREVIEW_CLASS` (`src/components/MarkdownPreview.tsx:12`) para
      uma classe `.markdown-body` em `src/index.css` (`@layer components`), mantendo exatamente os
      estilos atuais (h1, h2, tabela, th, td, código inline, listas) e trocando cores cruas por
      `hsl(var(--…))`. A constante passa a valer `"markdown-body"`. Verificação: `npm run build`;
      `MarkdownPreview.blocks.test.tsx` e `NoteMarkdownPreview.test.tsx` continuam passando sem
      alteração (nenhum deles assere o conteúdo da string).
- [x] Completar a tipografia em `.markdown-body`: h3–h6 (escala coerente com h1/h2), `blockquote`
      (barra à esquerda + `text-muted-foreground`), `hr`, `img` (`max-width:100%`, cantos, borda),
      `kbd`, `a` (sublinhado sutil + `hover`), `ul/ol` aninhados e `pre` (fundo `bg-muted`, padding,
      `overflow-x:auto`). Verificação: `npm run build && npm run lint` + teste novo em
      `src/components/__tests__/MarkdownPreview.typography.test.tsx` renderindo um documento com
      h1–h6, citação, regra, imagem e link, e conferindo que cada tag chega ao DOM com a classe do
      contêiner aplicada.
- [x] Tabela larga passa a rolar dentro de si: override do componente `table` em `MarkdownPreview`
      envolvendo-a num `div` com `overflow-x:auto`, para a nota nunca provocar scroll horizontal na
      página. Verificação: teste no mesmo arquivo acima conferindo o wrapper; `npm run build`.
- [x] Estilizar footnotes (já parseadas pelo `remark-gfm`, hoje sem estilo): `sup` do marcador,
      `section[data-footnotes]` com separador e fonte menor, e o link de volta (`↩`) visível.
      Verificação: teste renderizando `texto[^1]` + `[^1]: nota` e conferindo o marcador, a seção e
      o link de retorno.
- [x] Criar `src/components/markdown/remarkCallout.ts`: plugin remark local que transforma
      `> [!NOTE] …` (e `TIP`, `IMPORTANT`, `WARNING`, `CAUTION`) em blockquote anotado
      (`data.hProperties['data-callout']`), removendo o marcador do texto. Tipo desconhecido ou
      blockquote comum passam intactos. Verificação: `npm run build`.
- [x] Testes Vitest do `remarkCallout` em `src/components/markdown/__tests__/remarkCallout.test.ts`:
      os 5 tipos reconhecidos, tipo desconhecido vira blockquote comum, blockquote sem marcador não
      é tocado, marcador no meio do texto não conta, e o texto do callout não perde conteúdo.
      Verificação: `npm test`.
- [x] Registrar `remarkCallout` em `MARKDOWN_REMARK_PLUGINS` (`src/components/markdown/remarkPlugins.ts`)
      e estilizar os 5 tipos em `.markdown-body` (ícone via `::before`, cor por tipo usando
      `--success`/`--warning`/`--destructive`/`--primary` — sem inventar token novo). Verificação:
      teste de render conferindo `[data-callout="warning"]` no DOM e o texto preservado; o teste
      existente "o array central de plugins remark está ligado (GFM continua valendo)" precisa
      continuar passando.
- [x] Adicionar `remark-math` ao `package.json` e ao `MARKDOWN_REMARK_PLUGINS`, sem renderer ainda
      (nesta etapa `$x$` vira um nó `inlineMath`/`math` inerte). Verificação: `npm run build` e
      `npm run check:bundle` — confirma que o parser sozinho não estoura orçamento.
- [x] Criar `src/components/markdown/MathBlock.tsx` (bloco `$$…$$`) e `InlineMath` (`$…$`), ambos
      com `await import("katex")` dinâmico + import do CSS do KaTeX dentro do próprio módulo lazy,
      estado de carregamento (o texto-fonte, sem "pisca") e estado de erro mostrando fonte +
      mensagem do KaTeX. Ligar os dois em `MarkdownPreview` pelos overrides de componente.
      Verificação: `npm run build && npm run check:bundle` (o chunk da rota `/notes` não pode
      crescer — katex precisa cair num chunk lazy).
- [x] Testes de `MathBlock`/`InlineMath` em `src/components/__tests__/MathBlock.test.tsx`, com
      `katex` mockado: fórmula válida renderiza, fórmula inválida mostra a fonte e a mensagem de
      erro (não some), falha do `import()` cai para texto puro. Verificação: `npm test`.
- [x] Adicionar `lowlight` ao `package.json` e criar `src/components/markdown/CodeBlock.tsx`:
      substitui o override `code`/`pre` atual, carrega `lowlight` via `import()` dinâmico, converte
      a árvore hast em elementos React (sem `innerHTML`), e mostra a linguagem no cabeçalho.
      Fence sem linguagem, linguagem desconhecida ou falha de import → texto puro, sem cor, sem
      erro. Verificação: `npm run build && npm run check:bundle`.
- [x] Mapear as cores do highlight para tokens do tema em `.markdown-body` (classes `hljs-*` →
      `hsl(var(--…))`), cobrindo claro e escuro. Verificação: `npm run build`; inspeção do CSS —
      nenhuma cor literal fora de token.
- [x] Botão "Copiar" no cabeçalho do `CodeBlock` (`navigator.clipboard.writeText`), com feedback
      "Copiado" por 2s e `toast` de erro via `getErrorMessage` quando a área de transferência é
      negada. Verificação: teste em `src/components/__tests__/CodeBlock.test.tsx` — copia o
      **texto-fonte** (não o HTML colorido), mostra o feedback, e o caminho de erro não derruba o
      bloco.
- [x] `id` estável em h1–h6 (slug do texto, com sufixo `-2`, `-3` em colisão) via override de
      componente, mais âncora `#` visível no hover. É o que permite `[[nota#seção]]` e o sumário da
      070 apontarem para algum lugar. A função de slug vai para `src/domain/notes/headings.ts`
      (pura). Verificação: testes de `slugifyHeading` (acentos, pontuação, colisão, string vazia) +
      teste de render conferindo `id` e âncora.
- [x] Guardar a invariante de segurança: acrescentar a `MarkdownPreview.blocks.test.tsx` (ou ao
      arquivo novo) um caso por recurso novo provando que HTML cru **continua** não interpretado —
      dentro de callout, dentro de math e dentro de fence com linguagem `html`. Verificação:
      `npm test`.
- [x] Passada final: `npm run build`, `npm run lint`, `npm run check:bundle` e a suíte completa
      (`npx vitest run --testTimeout=30000 --hookTimeout=30000 --maxWorkers=4`, forma já usada nas
      Notas da 050 por instabilidade do `npm test` puro nesta máquina). Registrar em Notas o
      tamanho do chunk de `/notes` antes e depois.
- [x] **Achado da checagem de satisfação**: dentro de uma nota, link de âncora (`#…`) cai no
      `else` do override de `a` do `NoteMarkdownPreview` e sai com `target="_blank"` — ou seja, o
      marcador da footnote e o `↩` de volta **abrem outra aba** em vez de rolar a página, e a
      footnote entregue pela 4ª tarefa desta feature não navega de verdade no único lugar onde ela
      importa. Fragmento tem que virar link comum. Verificação: teste em
      `NoteMarkdownPreview.test.tsx` conferindo que o marcador da footnote aponta para
      `#user-content-fn-1` **sem** `target`, e que link externo continua com `target="_blank"`.
- [x] Checagem de satisfação do `prompt:` ("nível sofisticado de escrita", lado leitura), com
      artefato por item, sem navegador: código colorido → `CodeBlock.test.tsx`; math →
      `MathBlock.test.tsx`; callout → `remarkCallout.test.ts` + teste de render; tipografia
      completa e footnote → `MarkdownPreview.typography.test.tsx`; portabilidade da sintaxe →
      nenhuma sintaxe fora de GitHub/Obsidian (revisão das Decisões); segurança → o caso novo de
      HTML cru. Se faltar algo, abrir tarefa nova aqui em vez de fechar.

## Prompts

- 2026-08-18 — "- aumente a sofisticação do markdown das notas, procure referências, sdkjs, bases abertas, a ideia é alcançar um nível sofisticado de escrita"

## Notas

- 2026-08-18 — `kbd` foi estilizado como a tarefa pedia, mas hoje é **inalcançável pelo markdown**:
  sem `rehype-raw`, `<kbd>` escrito na nota sai como texto (há teste provando isso em
  `MarkdownPreview.typography.test.tsx`). A regra fica no lugar para quando algum plugin remark
  emitir o nó — não é dívida, é a folha já preparada.
- 2026-08-18 — Aproveitei a passada de tipografia para estilizar também o checkbox de task-list e o
  `<pre>` de fence sem linguagem, que estavam na mesma lacuna descrita no Contexto (saíam com o
  reset do navegador). Não é edição de checkbox — isso continua sendo da 070; o `react-markdown`
  já entrega a caixa desabilitada.
- 2026-09-25 — Além do estilo que a tarefa de footnote pedia, troquei os rótulos de acessibilidade
  que o `mdast-util-gfm-footnote` escreve por padrão ("Footnotes", "Back to reference 1") pelos
  equivalentes em português, via `remarkRehypeOptions` no `MarkdownPreview`. Motivo: são invisíveis
  na tela mas lidos em voz alta por leitor de tela, num app inteiro em português — texto em inglês
  ali é bug de acessibilidade, não detalhe. Coberto por teste no mesmo arquivo.
- 2026-09-25 — O arquivo não tinha `## Como testar` (feature escrita antes da seção virar
  obrigatória). Escrita agora, como a skill `next` manda, e mantida a cada tarefa.
- 2026-09-25 — Callout: `important` divide o token `--primary` com `note`. A paleta não tem um
  quinto matiz e a Decisão diz "sem inventar token novo" — o que separa os dois é o rótulo e o
  ícone do `::before`. O rótulo fica em `::before` (CSS) e não no DOM de propósito: copiar o
  callout devolve o Markdown que o usuário escreveu, sem uma palavra a mais.
- 2026-09-25 — `remarkCallout` caminha a árvore com uma recursão de seis linhas em vez de
  `unist-util-visit`: o pacote só existe aqui como dependência transitiva do `react-markdown`, e a
  Decisão da feature era "sem dependência nova". Alcança callout aninhado em lista e em outro
  callout (coberto por teste).
- 2026-09-25 — `katex` entrou como dependência **direta** no `package.json` (na versão exata que já
  estava resolvida no lock, `0.16.47`), em vez de continuar só transitiva via mermaid. Não muda uma
  linha do bundle — o chunk `katex-*.js` já existia e continua com 75,8 KB gzip — mas tira o risco
  de uma atualização do mermaid derrubar a renderização de fórmula sem ninguém notar. A Decisão
  ("KaTeX já está no lock transitivamente") continua verdadeira; isto só torna a dependência
  explícita.
- 2026-09-25 — `MathBlock` desenha com `katex.render(fonte, elemento, opções)`, que monta **nós de
  DOM**, em vez de `renderToString` + `dangerouslySetInnerHTML`. É a mesma razão que a Decisão dá
  para o highlight usar `lowlight`: nenhum `innerHTML` no caminho do preview. O elemento hospedeiro
  é renderizado sempre vazio pelo React, então o React não reconcilia o que o KaTeX pôs lá dentro.
- 2026-09-25 — `math` foi registrado no `blockRegistry` (além do `$$…$$`, o fence ` ```math ` passa
  a renderizar, como no GitHub) — o `remark-math` entrega os dois pelo mesmo caminho de fence. Só o
  `$…$` inline é desviado à mão no override de `code` do `MarkdownPreview`, porque lá a linguagem
  também é `math` e o bloco de display quebraria a linha no meio da frase.
- 2026-09-25 — Custo medido do KaTeX no PWA: o precache do service worker foi de 384 entradas /
  11.203,85 KiB para 404 / 11.490,38 KiB (+286 KiB, +2,6%) — são as fontes `.woff2` do KaTeX, que o
  `globPatterns` do `vite-plugin-pwa` recolhe. É exatamente o custo que a Decisão previu ("o custo
  real é o CSS/fonte, não o JS") e fica **duas ordens de grandeza** abaixo do que motivou tirar o
  excalidraw do precache (4,7 MB). Chunk de rota não mexeu: `NoteDetail` 10,3 KB gzip antes e
  depois.
- 2026-09-25 — O bloco de código passou a ser decidido no override de **`pre`**, não no de `code`
  como o plano supunha. Motivo descoberto na implementação: fence e código inline chegam os dois
  como `<code>`, e um fence **sem linguagem** não tem nem `className` para diferenciar — só o
  `<pre>` em volta distingue. O `code` continua cuidando do inline e dos renderers do registry.
- 2026-09-25 — Precisei dar nome ao chunk do `lowlight` no `manualChunks` (`vite.config.ts`) e
  incluí-lo em `LAZY_VENDOR_BASE_RE` (`scripts/check-bundle-budget.mjs`). Sem isso o Rollup o
  batizava de `index-…` (o arquivo de entrada do lowlight se chama `index.js`) e o orçamento o
  classificava como **chunk de entrada do app**, dando a ele o teto de 380 KB — o oposto da falha
  ruidosa que aquele arquivo documenta querer. Com o nome: `lowlight-*.js`, 51,3 KB gzip, classe
  `lazy` (teto 200 KB). Foi só `common` (~37 linguagens); `all` (~190) multiplicaria isso.
- 2026-09-25 — O `id` de título saiu de um plugin **rehype** local (`rehypeHeadingIds`, mais o array
  central novo `rehypePlugins.ts`), não do override de componente que a tarefa supunha. Motivo:
  unicidade. Dois títulos iguais precisam virar `secao` e `secao-2`, e um componente de título não
  enxerga os irmãos — geraria o mesmo `id` duas vezes e o link levaria sempre ao primeiro. A âncora
  `#`, essa sim, é override de componente: um `<a>` posto na árvore passaria pelo override de `a`
  do consumidor (no módulo de Notas, o do wiki-link da 056, que manda link externo abrir em outra
  aba).
- 2026-09-25 — A âncora `#` é `aria-hidden` + `tabIndex={-1}`, como no GitHub. Sem isso o nome
  acessível de todo título vira "Seção Link para esta seção" — o texto do link entra na composição
  do nome do título. Foi bug de verdade: dez testes de outras features quebraram procurando o
  título pelo nome, o que é exatamente o que um leitor de tela teria ouvido.
- 2026-09-25 — **Passada final, medida.** Chunks da rota de Notas, gzip, antes (commit `09faaea`,
  com as 4 primeiras tarefas prontas) e depois da feature inteira: `Notes` **3,0 KB → 3,0 KB** e
  `NoteDetail` **10,3 KB → 10,3 KB** — zero crescimento, que era a condição do plano. O que cresceu
  foi só o que carrega sob demanda: `katex-*.js` 75,8 KB (já existia, via mermaid) e
  `lowlight-*.js` 51,3 KB (novo), ambos `lazy`. O chunk compartilhado `MarkdownPreview-*.js`
  terminou em 53,5 KB (react-markdown + os plugins); a medida dele **antes** da feature não foi
  capturada — o plano pedia o chunk da rota, e é esse que está medido nas duas pontas. Suíte
  completa: 166 arquivos, 1.562 testes, tudo passando. `npm run lint`: 0 erros (18 warnings
  pré-existentes de `react-refresh`). `npm run check:bundle`: `Bundle budget OK.`
- 2026-09-25 — **A checagem de satisfação achou um buraco de verdade, e ele virou tarefa em vez de
  observação.** Dentro de uma nota, o override de `a` do `NoteMarkdownPreview` (o do wiki-link,
  056) vê **todos** os links do markdown e repassava só `href` e `children`: o marcador de footnote
  perdia o `data-footnote-ref`, o `↩` perdia a classe `data-footnote-backref` — ou seja, a footnote
  que a 4ª tarefa desta feature estilizou saía **sem estilo e sem navegação** exatamente onde ela
  importa — e ambos ainda caíam no ramo de link externo, com `target="_blank"`: abriam outra aba
  para rolar a mesma página. Corrigido com um ramo para `#…` e o repasse do resto das props;
  provado por três testes novos em `NoteMarkdownPreview.test.tsx` (o marcador e o `↩` sem `target`,
  link externo ainda com `target="_blank"`), escritos **antes** do conserto e vistos falhando.
  Fica a lição para a 070: esse override é um funil por onde passa todo link da nota.
- 2026-09-25 — **Checagem de satisfação do `prompt:`**, artefato por requisito (portão
  `feature-satisfied` rodado: `TYPESAFE_API_KEY` ausente → UNAVAILABLE, vale a regra escrita da
  skill `next`):
  - *"sofisticação do markdown"* — **callout**: `remarkCallout.test.ts`, 15 testes passando (os 5
    tipos anotam, tipo desconhecido não some, marcador no meio não conta, aninhados) + o describe
    "callouts" em `MarkdownPreview.typography.test.tsx`; **math**: `MathBlock.test.tsx`, 10 testes
    (inline vs. display, `throwOnError`, fórmula inválida mostra fonte + mensagem, KaTeX ausente
    cai no texto-fonte, `R$ 10` não vira fórmula); **código colorido + copiar**:
    `CodeBlock.test.tsx`, 12 testes (realce em árvore React, linguagem desconhecida sem cor,
    lowlight ausente sem erro, copiar manda o texto-fonte e o clipboard negado vira toast);
    **tipografia, footnote, tabela, âncora**: `MarkdownPreview.typography.test.tsx`, 36 testes, e
    `headings.test.ts`, 13 testes.
  - *"procure referências, bases abertas"* — o que entrou em código é o ecossistema aberto
    unified/remark/rehype (`remark-gfm` + `remarkCallout` local + `remark-math`, e o array novo
    `MARKDOWN_REHYPE_PLUGINS` com `rehypeHeadingIds`), todos exercitados pelos testes acima.
  - *"sdkjs"* — avaliado e descartado nas Decisões, com motivo escrito (editor OOXML de vários MB
    que não renderiza markdown). Não é lacuna: é a resposta à referência que o prompt citou.
  - *portabilidade* — nenhum teste escreve sintaxe inventada: só `> [!NOTE]`, `$…$`/`$$…$$`,
    ` ```math `, `[^1]` e ` ```lang `, todas de GitHub/Obsidian.
  - *segurança* — `MarkdownPreview.blocks.test.tsx`, 12 testes, com o describe novo usando **KaTeX
    e lowlight reais** (sem mock): `<img src=x onerror=alert(1)>` dentro de callout, de fórmula, de
    fence `html` e de título nunca vira elemento.
  - *metade de **escrita** do mesmo bullet* (editor, atalhos, menu `/`, preview lado a lado,
    sumário) — **fora do escopo desta feature por decisão do planning**: o Contexto diz que a
    entrada é a 070. O que esta entrega é a leitura, inteira.
- 2026-09-25 — Cores do realce: só 4 matizes e o cinza, todos de token já existente. Verde e
  vermelho vão onde a cor **é** o significado (linha adicionada/removida no diff); nome de função e
  título saem em peso, não em cor, porque a paleta do app não tem hue de editor sobrando e inventar
  token estava fora de escopo.

## Como testar

### 1. Pré-requisitos

- `npm ci` na raiz do projeto (a feature acrescenta dependências ao `package.json`).
- Nenhuma migration, seed ou variável de ambiente nova: a feature é 100% de renderização no
  cliente. Banco, login e permissões não mudam.
- Para a parte manual: `npm run dev`, logar com qualquer usuário e ir em **Notas**
  (`/admin/notes`), abrindo ou criando uma nota.

### 2. Verificação automatizada

```
npx vitest run src/components/markdown/__tests__/remarkCallout.test.ts
npx vitest run src/components/__tests__/MarkdownPreview.typography.test.tsx
npx vitest run src/components/__tests__/MarkdownPreview.blocks.test.tsx
npx vitest run src/components/__tests__/MathBlock.test.tsx
npx vitest run src/components/__tests__/CodeBlock.test.tsx
npx vitest run src/domain/notes/__tests__/headings.test.ts
npx vitest run src/pages/admin/notes/__tests__/NoteMarkdownPreview.test.tsx
npm run build
npm run lint
npm run check:bundle
```

- Cada `vitest run` precisa terminar com `Test Files 1 passed` e nenhum teste pulado.
  `remarkCallout.test.ts` prova o parser de callout (marcador vira atributo, tipo desconhecido não
  some); `MarkdownPreview.typography.test.tsx` prova o que chega ao DOM (tags que a folha estiliza,
  footnote, callout); `MarkdownPreview.blocks.test.tsx` prova que o registry de blocos e o array
  central de plugins continuam ligados; `MathBlock.test.tsx` prova a fórmula (KaTeX mockado: modo
  inline vs. display, fórmula inválida, KaTeX que não carrega); `CodeBlock.test.tsx` prova o realce
  (lowlight mockado: linguagem conhecida colore, desconhecida não, lowlight que não carrega não
  quebra nada); `headings.test.ts` prova o slug do `id` de título (acento, pontuação, colisão,
  título sem letra nenhuma); `NoteMarkdownPreview.test.tsx` prova que link de âncora **dentro de
  uma nota** (footnote, seção) navega na própria página, enquanto link externo continua abrindo em
  outra aba.
- `npm run check:bundle` também precisa listar `lowlight-*.js` como `lazy` (e **não** como `entry`)
  e o `katex-*.js` como `lazy` — é o que prova que nenhum dos dois entrou no caminho da rota.
- `npm run build` precisa terminar sem erro de `tsc -b` (ele compila os testes também).
- `npm run lint` precisa terminar com `0 errors` (os warnings de `react-refresh` são
  pré-existentes).
- `npm run check:bundle` precisa imprimir `Bundle budget OK.` — é o que garante que nada novo caiu
  no chunk da rota de Notas.

### 3. Verificação manual, passo a passo

1. Em `/admin/notes`, crie uma nota e cole no editor:

       # Titulo

       ## Secao

       ### Subsecao

       > uma citacao comum

       > [!NOTE]
       > isto e um aviso informativo

       > [!TIP]
       > - com lista
       > - e `codigo inline`

       > [!IMPORTANT]
       > nao esqueca disto

       > [!WARNING]
       > cuidado com o prazo

       > [!CAUTION]
       > isto quebra producao

       > [!FOO]
       > tipo que nao existe

       Uma formula no meio da frase: $E = mc^2$, e outra em bloco:

       $$
       \int_0^1 x^2 \, dx = \frac{1}{3}
       $$

       Formula errada de proposito: $\naoexiste{x}$

       Custou R$ 10 e sobrou troco.

       ```ts
       const soma = (a: number, b: number) => a + b; // comentario
       ```

       ```brainfuck
       +++.
       ```

       ```
       fence sem linguagem
       ```

       Texto com nota de rodape[^1].

       [^1]: o texto da nota.

2. Na leitura da nota (fora do editor), esperado:
   - os cinco callouts saem em caixas com barra colorida à esquerda e rótulo no topo —
     **ⓘ Nota** (azul), **✦ Dica** (verde), **★ Importante** (azul), **⚠ Atenção** (âmbar),
     **⊘ Cuidado** (vermelho);
   - o texto `[!NOTE]`, `[!TIP]`… **não** aparece em lugar nenhum da tela;
   - `> [!FOO]` continua uma citação cinza comum, **com o texto `[!FOO]` visível** — nada some;
   - `> uma citacao comum` continua citação cinza, sem caixa nem rótulo.
3. Ainda na leitura, as fórmulas:
   - `$E = mc^2$` sai tipografada **na própria linha do texto**, sem quebrar o parágrafo;
   - a integral sai centralizada em bloco, em corpo maior;
   - `$\naoexiste{x}$` sai numa caixinha vermelha com **o que foi escrito** mais a mensagem do
     KaTeX (`Undefined control sequence`) — a fórmula nunca some da tela;
   - `Custou R$ 10` continua texto normal: cifrão solto não vira fórmula.
4. Fórmula longa (ex.: uma matriz larga) rola dentro do próprio bloco; a **página** não ganha
   scroll horizontal.
5. Os blocos de código:
   - o de `ts` sai numa moldura com cabeçalho (`TS` à esquerda), `const` e `=>` coloridos e o
     comentário em cinza itálico;
   - o de `brainfuck` sai na mesma moldura, com `BRAINFUCK` no cabeçalho e **sem cor** — linguagem
     desconhecida não é erro;
   - o fence sem linguagem sai na moldura, sem nome e sem cor;
   - nenhum deles perde um caractere do código.
6. Clique em **Copiar** no cabeçalho de um bloco: o botão vira **Copiado** por ~2 segundos e volta.
   Cole num editor de texto: vem o código **como foi escrito** (duas linhas, com a quebra), sem
   marcação nem cor.
7. Passe o mouse sobre **## Secao**: aparece um `#` discreto ao lado. Clique: a URL ganha
   `#secao` e a página rola até o título. Um segundo `## Secao` na mesma nota vira `#secao-2` —
   é o que faz `[[nota#seção]]` (056) e o sumário da 070 terem alvo.
8. Ainda na leitura: o marcador `1` da nota de rodapé sai sobrescrito e clicável; clicar leva à
   seção do fim (separada por uma linha, em fonte menor), a linha de destino se acende, e o `↩`
   volta para o ponto do texto — tudo **na mesma aba**, sem abrir janela nova.
9. Alterne o tema (claro/escuro) com os callouts na tela: as cores acompanham o tema, sem nenhuma
   caixa ficando ilegível (tudo sai de token `hsl(var(--…))`, não de cor literal).

### 4. Casos de borda e caminhos negativos

- `> [!note]` em minúscula: vale igual (jeito do Obsidian).
- `> [!NOTE] Um título aqui` com texto na mesma linha: vira callout e o título fica como primeira
  linha do corpo — nada de conteúdo se perde.
- `> olha o [!NOTE] no meio`: **não** vira callout (o marcador só conta abrindo o bloco).
- `> [!IMPORTANT]` sozinho, sem corpo: vira uma caixa só com o rótulo, sem parágrafo vazio.
- Callout dentro de item de lista e callout dentro de callout: os dois são reconhecidos.
- `> [!CAUTION]` com `<img src=x onerror=alert(1)>` no corpo: o HTML sai **como texto**, nenhuma
  tag é criada — a invariante da 055 (sem `rehype-raw`) continua valendo dentro de callout.
- Fence ` ```math ` (em vez de `$$`): renderiza como fórmula em bloco, igual ao GitHub.
- `$$<img src=x onerror=alert(1)>$$`: o KaTeX recebe isso como **texto de fórmula**; nenhuma tag
  `<img>` aparece no DOM.
- Abrir a nota **offline**, sem o chunk do KaTeX em cache: a fórmula aparece como o texto-fonte em
  monoespaçada (`E = mc^2`), sem caixa de erro — biblioteca que não chegou não é erro de quem
  escreveu.
- Dois títulos com o mesmo texto: o segundo vira `-2`; um título só de emoji (`## 🚀`) ainda ganha
  um alvo (`#secao`), em vez de `id` vazio.
- Copiar com a área de transferência negada (navegador em contexto inseguro, ou permissão
  bloqueada): aparece um toast vermelho de "não foi possível copiar" e o bloco continua inteiro —
  nada de tela branca.

### 5. Sinais de que quebrou

- Todos os callouts saindo como citação cinza, com `[!NOTE]` visível na tela → o `remarkCallout`
  saiu de `MARKDOWN_REMARK_PLUGINS` (`src/components/markdown/remarkPlugins.ts`).
- Caixa colorida certa mas sem rótulo no topo → a folha `.markdown-body [data-callout]::before`
  (`src/index.css`) se perdeu.
- Callout vazio, sem o texto que foi escrito → regressão no corte do marcador em
  `remarkCallout.ts`; `remarkCallout.test.ts` falharia junto.
- Fórmula aparecendo como `$E = mc^2$` com os cifrões → o `remark-math` saiu do array de plugins.
- Fórmula ficando **eternamente** em monoespaçada, sem erro nenhum → o `import("katex")` está
  falhando; olhe a aba de rede atrás do chunk `katex-*.js`.
- Símbolos da fórmula empilhados/desalinhados → o CSS do KaTeX não carregou (`katex-*.css`).
- Todo bloco de código cinza, sem cor nenhuma, em qualquer linguagem → o chunk `lowlight-*.js` não
  chegou (aba de rede) ou o `manualChunks` do `vite.config.ts` perdeu a regra do lowlight.
- Cores do código erradas no tema escuro → alguma regra `hljs-*` em `src/index.css` voltou a usar
  cor literal em vez de `hsl(var(--token))`.
- Clicar no marcador da footnote (ou no `↩`) abrindo **outra aba**, ou a seção de rodapé saindo sem
  estilo dentro de uma nota → o override de `a` do `NoteMarkdownPreview` voltou a engolir as props
  ou perdeu o ramo de `#…`.
- `npm run check:bundle` imprimindo `FAIL` numa linha `route` → alguma dependência nova entrou no
  chunk da rota em vez de ficar no `import()` dinâmico.
