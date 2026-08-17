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

# 057 — Notas: registry de blocos (plugins) + flowcharts e diagramas

## Contexto

O prompt-mãe pede duas coisas que são a mesma coisa por baixo: "MARKDOWN NA VEIA COM POSSIBILIDADE
DE PLUGINS" e "FLOWCHARTS / DIAGRAMAS BÁSICOS". Num Obsidian, diagrama não é um tipo especial de
documento — é um bloco de código com uma linguagem que algum renderer entende. Ou seja: o mecanismo
de plugin e o suporte a flowchart são a mesma peça, e flowchart é só o primeiro cliente dela.

Esta feature entrega o **registry de renderers de bloco de código**: um mapa `linguagem →
componente React`, consultado pelo `MarkdownPreview` (criado na 055) ao encontrar um fence
` ```<linguagem> `. Adicionar um "plugin" novo depois vira uma entrada no mapa, não uma mudança no
editor.

Depende de: 055 (`MarkdownPreview`, tabela `note`). Independente da 058 — as duas podem trocar de
ordem.

## Decisões

- **"Plugins" = registry interno de renderers de bloco, não plataforma de terceiros.** Carregar
  código arbitrário de terceiros num app com sessão Supabase autenticada é um vetor de XSS com
  acesso ao token do usuário — não se faz. O que atende à intenção do prompt (estender o markdown
  sem mexer no editor) é um registry tipado no próprio código: `Record<string, ComponentType<{
  code: string }>>`. Descartado sandbox por iframe/Web Worker: complexidade grande para um app de
  usuário único, sem nenhum plugin de terceiro existindo para justificar.
- **Segundo ponto de extensão: plugins remark/rehype.** `react-markdown` já roda sobre `unified`
  (o app usa `remark-gfm`). Um array central de plugins deixa a extensão do *parser* tão barata
  quanto a do renderer. É a extensibilidade que já vem de graça com a lib que existe.
- **Diagramas via `mermaid@11`, carregado com `await import()` — 0 KB no bundle inicial.**
  Escolhido porque é o formato de fato para flowchart em markdown (a sintaxe ` ```mermaid ` é
  portável para GitHub/Obsidian, então a nota do usuário não fica presa ao Orbyva) e porque cobre
  flowchart, sequência, gantt e ER de uma vez. É pesado (core minificado ~690 KB), mas é ESM-only e
  já faz code-split interno por tipo de diagrama: só baixa o tipo usado, e só quando a nota tem um
  bloco mermaid.
  **Descartados:** React Flow — editor de grafo por nós, ótimo para UI de fluxo interativo, mas não
  lê texto do markdown, então não serve a "diagrama dentro da nota"; escrever um renderer próprio —
  reimplementar layout de grafo é projeto, não tarefa.
- **Orçamento de bundle é ajustado de forma explícita, não contornado.**
  `scripts/check-bundle-budget.mjs` impõe 160 KB gzip por chunk de rota — o mermaid estoura isso
  sozinho. Como ele é carregado sob demanda e nunca entra no caminho crítico, a correção certa é
  declarar `mermaid` em `manualChunks` (`vite.config.ts:151`) e no `VENDOR_RE` do script, com um
  limite próprio comentado. Descartado subir `MAX_ROUTE_GZIP` global: afrouxaria o orçamento de
  todas as rotas do app por causa de uma.
- **Render de diagrama é read-only nesta feature.** O usuário escreve a sintaxe mermaid e vê o
  desenho. Edição visual de diagrama é outro problema — e quem quer desenhar com o mouse tem o
  canvas da 058. Descartado editor visual de mermaid: dobraria o escopo por um ganho que a 058 já
  cobre por outro caminho.
- **Erro de sintaxe não quebra a nota.** `mermaid.parse` valida antes de renderizar; bloco inválido
  vira uma caixa de erro discreta com a mensagem, e o resto da nota continua renderizando.
- **SVG do mermaid é inserido com `securityLevel: "strict"`, não com `dangerouslySetInnerHTML` cru.**
  A 055 fixou que HTML cru fica desabilitado no markdown (sem `rehype-raw`); o mermaid contorna isso
  por outro caminho, porque devolve uma string de SVG. `securityLevel: "strict"` faz o próprio
  mermaid sanitizar e desabilitar scripts/`<foreignObject>` arbitrários no que produz — é a barreira
  que mantém a decisão da 055 válida. O app não tem `dompurify` nem `rehype-sanitize` instalados; se
  algum dia o `securityLevel` for afrouxado, uma dessas dependências passa a ser obrigatória no
  mesmo commit.

## Tarefas

- [x] Criar `src/domain/notes/blockLanguage.ts` (puro, exports nomeados): `parseBlockLanguage(className)`
      extraindo `<lang>` de `language-<lang>` e normalizando para minúsculas, devolvendo `null` quando
      não houver linguagem. É a parte testável, e por isso mora em `domain/` e não em `components/`.
      A varredura é por token (`className.split(/\s+/)`), não `startsWith`: o `react-markdown` entrega
      a classe no meio de outras.
- [x] Criar `src/domain/notes/__tests__/blockLanguage.test.ts`: `language-Mermaid` → `mermaid`,
      `className` vazio ou ausente → `null`, `className` com classes extras não quebra.
      Verificação: `npx vitest run src/domain/notes/__tests__/blockLanguage.test.ts` — 6 testes
      passando, incluindo `language-` sem linguagem → `null` e `hljs language-mermaid extra`.
- [x] Criar `src/components/markdown/blockRegistry.ts`: tipo `BlockRenderer = ComponentType<{ code:
      string }>` e um `Record<string, BlockRenderer>` exportado, com lookup via
      `parseBlockLanguage` e fallback para o bloco de código normal quando não houver renderer.
      O lookup é `findBlockRenderer(className)`; o mapa `blockRenderers` nasce vazio e ganha o
      `mermaid` na tarefa do `MermaidBlock`.
- [x] Refatorar `src/components/MarkdownPreview.tsx` (da 055) para consultar o registry no
      componente `code` do `react-markdown`, extraindo a linguagem de `className`
      (`language-<lang>`). Sem renderer registrado, o comportamento atual não muda.
      Verificação: `npm run build` + `MarkdownPreview.blocks.test.tsx` (7 testes) — um renderer de
      mentira registrado no mapa recebe o código cru do fence, um bloco ```ts sem renderer continua
      saindo como `pre > code.language-ts`, código inline não vira plugin, a linguagem casa sem
      diferenciar caixa e HTML cru continua não interpretado.
      Ajuste do plano: o componente `pre` também foi sobrescrito, para **desembrulhar** o bloco com
      renderer — dentro do `<pre>` o SVG herdaria `white-space: pre` e fonte monoespaçada. Bloco sem
      renderer continua dentro do `<pre>` de sempre.
- [x] Criar `src/components/markdown/remarkPlugins.ts` exportando o array central de plugins remark
      (começando com `remarkGfm`) e passar a usá-lo no `MarkdownPreview`, em vez do array inline.
      `MARKDOWN_REMARK_PLUGINS: PluggableList`. Verificação: `MarkdownPreview.blocks.test.tsx`
      "o array central de plugins remark está ligado (GFM continua valendo)" — tabela, checklist
      marcado e `~~riscado~~` continuam saindo depois da troca (o array inline sumiu).
- [x] Instalar `mermaid@^11`. Verificação: `npm run build` + `npm run check:bundle` — confirmar que
      o chunk da rota `/notes` **não** cresceu (prova de que o import dinâmico funcionou).
      Instalado `mermaid@11.16.1`. Baseline logo após o install (ainda sem nenhuma referência no
      código): `NoteDetail` 8,1 KB, `Notes` 1,8 KB, `api/notes` 0,6 KB gzip, `check:bundle` OK —
      os mesmos números da 056. A prova de que o `await import()` mantém isso vem na tarefa do
      `MermaidBlock`, quando o import passa a existir de verdade.
- [x] Declarar `mermaid` em `manualChunks` (`vite.config.ts:151`) e adicioná-lo ao `VENDOR_RE` de
      `scripts/check-bundle-budget.mjs`, com comentário explicando que é lazy e por isso tem
      limite próprio.
      **Desvio, com medição** (ver Notas): declarar `mermaid` num `manualChunks` único **piora** —
      medido, 888,3 KB gzip num arquivo só, porque colapsa o code-split por tipo de diagrama que a
      própria Decisão desta feature queria preservar (e exigiria subir o teto de vendor para ~900 KB).
      Sem `manualChunks`, o Rollup já divide sozinho: `mermaid.core` 140,1 KB, `cytoscape` 139,1 KB,
      `cynefin` 151,5 KB, `katex` 75,8 KB, 54 chunks no total, um por tipo de diagrama.
      O que foi feito então: `check-bundle-budget.mjs` ganhou a classe **`lazy`**
      (`MAX_LAZY_VENDOR_GZIP` = 200 KB, `LAZY_VENDOR_BASE_RE`/`LAZY_VENDOR_FILE_RE`), que reconhece
      os chunks do mermaid pelo sufixo de 8 caracteres do build dele
      (`sequenceDiagram-SI44F4Z6-…`) e pelos pacotes que só ele usa. Nenhum teto foi afrouxado:
      rota continua 160 KB, vendor 200 KB.
      Consertado no caminho um estouro real que a instalação do mermaid causou: o `manualChunks`
      mandava todo `node_modules/d3-` para o chunk `recharts`, e o mermaid traz a família d3 inteira
      — `recharts` foi de 112,9 para 128,0 KB gzip, cobrado de **toda rota de gráfico**. Agora só o
      d3 que o `victory-vendor` usa vai para um chunk `d3` compartilhado (26,1 KB) e o resto do d3
      cai nos chunks lazy do mermaid: `recharts` 89,5 KB. Rota de gráfico paga 115,6 KB (era 112,9
      antes do mermaid) e o diagrama não arrasta mais o recharts inteiro.
- [x] Criar `src/components/markdown/MermaidBlock.tsx`: `await import("mermaid")` dentro de
      `useEffect`, `mermaid.initialize` com `securityLevel: "strict"` e tema seguindo o dark mode do
      app, `mermaid.parse` antes de `mermaid.render`, id único por instância, skeleton enquanto
      carrega e caixa de erro quando a sintaxe é inválida. Registrar como `mermaid` no
      `blockRegistry`.
      O id vem de um contador de módulo, não de `useId`: `useId` devolve `:r3:`, que não é seletor
      de CSS válido e o mermaid usa o id em seletores que ele gera. O tema segue a classe `dark` do
      `<html>` (é assim que o app guarda o tema, ver `nav-user.tsx`) por `MutationObserver`, já que
      não há contexto de React para assinar.
- [x] Verificação do `MermaidBlock` (por teste, não por navegador — a skill `next` proíbe Chrome):
      `src/components/__tests__/MermaidBlock.test.tsx` (8 testes), com o mermaid trocado por um
      duplo (ele mede texto com `getBBox`, que o jsdom não implementa). Afirma: o fence
      ```mermaid de uma nota chega ao renderer com o código exato (`graph TD;\n  A-->B;`) e vira
      SVG na tela; `initialize` recebe `securityLevel: "strict"`; sintaxe inválida vira caixa
      `role="alert"` com a mensagem do mermaid **e o resto da nota continua renderizando** (título e
      parágrafo seguem na tela); `parse` barra antes de `render`; o esqueleto cobre a espera do
      import dinâmico; e alternar a classe `dark` do `<html>` redesenha com `theme: "dark"`
      (`render` chamado duas vezes).
- [x] **Tarefa acrescentada** (não estava no plano — ver Notas): `src/components/markdown/sanitizeSvg.ts`,
      segunda barreira sobre o SVG antes de ele entrar na página. O `securityLevel: "strict"` é
      barreira de terceiro e fica a um `initialize` de distância de ser afrouxada por engano,
      enquanto a decisão da 055 (HTML cru desligado) vale para o app inteiro — e "o mermaid
      sanitiza" não era afirmável por nenhum teste deste repo. `sanitizeSvgMarkup` analisa o SVG num
      documento **inerte** do `DOMParser` (sem contexto de navegação: script não roda e imagem não
      carrega, que é o furo de limpar depois de inserir), remove `<script>`, `<foreignObject>`,
      `<iframe>`/`<object>`/`<embed>`, todo atributo `on*` e URL `javascript:`, e devolve o resto.
      Verificação: `src/components/__tests__/sanitizeSvg.test.tsx` (7 testes) — nó, aresta e texto
      sobrevivem; `<script>`, `onerror`/`onclick`/`ONLOAD`, `JaVaScRiPt: ` com espaço e
      `<foreignObject>` não; `href="/notes/n1"` continua; e o SVG limpo, **inserido de verdade num
      elemento da página**, não deixa handler nenhum. Mais o teste do `MermaidBlock` "o SVG entra na
      página já limpo de script e de handler".
- [x] Adicionar ao editor (`NoteEditor.tsx`) um atalho "Inserir diagrama" que injeta um esqueleto
      ```mermaid com `graph TD` — descoberta da funcionalidade, já que ninguém digita a sintaxe de
      cabeça.
      Botão ao lado das abas Escrever/Visualizar; o texto injetado é `appendMermaidSnippet`
      (`src/domain/notes/mermaidSnippet.ts`, puro), e o esqueleto já é um grafo **desenhável**
      (`graph TD` com decisão e dois caminhos), não uma cerca vazia — colar e ver o desenho é o que
      ensina a sintaxe. O botão também volta para a aba Escrever, senão o texto novo apareceria
      atrás do preview.
      Verificação: `mermaidSnippet.test.ts` (6 testes — nota vazia, separação por linha em branco,
      sem empilhar linhas, inserir duas vezes deixa dois blocos fechados, o fence é reconhecido por
      `parseBlockLanguage`) e `Notes.flow.test.tsx` `"Inserir diagrama" escreve um bloco mermaid
      válido, salva e o preview desenha` — clica no botão de verdade, espera o autosave gravar o
      ```mermaid no store, abre a aba Visualizar e afirma que saiu um `<svg>` e que o renderer
      recebeu **só o código do bloco**, não o markdown inteiro.
- [x] Documentar o registry num comentário de cabeçalho em `blockRegistry.ts`: como registrar um
      renderer novo, em 3 linhas. É o que faz o "plugin" ser usável daqui a seis meses.
      O cabeçalho tem o procedimento em 3 passos, o aviso de `await import()` para dependência
      pesada, o aviso de que o código do fence é texto do usuário (com ponteiro para `sanitizeSvg`)
      e o ponteiro para o segundo ponto de extensão (`remarkPlugins.ts`). Verificação de que a
      documentação bate com o código: `MarkdownPreview.blocks.test.tsx` executa exatamente o
      procedimento descrito (registra `demo` em `blockRenderers` e afirma o que sai na tela) — se o
      passo a passo deixar de valer, o teste quebra.
- [x] Rodar `npm run build`, `npm run lint`, `npm test` e `npm run check:bundle`. Resultado:
      build OK; lint 0 erros (13 warnings pré-existentes de `react-refresh`, nenhum nos arquivos
      novos); `npm test` **1058 passando / 2 falhando** — as 2 são as pré-existentes e alheias de
      `src/lib/__tests__/currency.test.ts` (esperam `"—"`, `src/lib/currency.ts` devolve `"·"`), as
      mesmas registradas pela 055 e pela 056; a 057 acrescentou 36 testes (1022 → 1058) e nenhuma
      falha nova. `check:bundle` OK: rotas de notas em `NoteDetail` 8,2 KB e `Notes` 1,9 KB gzip
      (eram 8,1 e 1,8 antes do mermaid — o diagrama não entrou no caminho crítico), `recharts`
      89,5 KB + `d3` 26,1 KB, `codemirror` 138,9 KB, e os 54 chunks `lazy` do mermaid, o maior com
      151,5 KB contra o teto de 200 KB.

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

- **Checagem de satisfação (2026-08-17), item do `prompt:` → artefato que prova.** O prompt-mãe
  cobre as quatro features do módulo; o que a 057 se propôs a cumprir está abaixo, com o teste que
  passou:
  - *MARKDOWN NA VEIA COM POSSIBILIDADE DE PLUGINS* → o registry existe e é usável em 3 linhas:
    `MarkdownPreview.blocks.test.tsx` (8 testes) registra um renderer novo exatamente como o
    cabeçalho de `blockRegistry.ts` manda e afirma que ` ```demo ` passa a ser desenhado por ele,
    recebendo o código cru do fence, sem quebrar bloco de linguagem não registrada
    (```ts continua `pre > code.language-ts`), código inline ou o resto do Markdown;
    `blockLanguage.test.ts` (6 testes) cobre a extração da linguagem. O segundo ponto de extensão,
    o do parser, é `MARKDOWN_REMARK_PLUGINS`, com o teste de que GFM continua valendo depois da
    troca. "Na veia" continua verdade: o documento salvo é markdown puro, o plugin só muda o
    *render*.
  - *FLOWCHARTS* e *DIAGRAMAS BÁSICOS* → `MermaidBlock.test.tsx` (8 testes): o fence
    ```mermaid de uma nota chega ao mermaid com o código exato e vira `<svg>` na tela; e o caminho
    do usuário inteiro em `Notes.flow.test.tsx` `"Inserir diagrama" escreve um bloco mermaid válido,
    salva e o preview desenha` — clique no botão, autosave gravando o bloco, aba Visualizar
    desenhando. Sintaxe quebrada vira caixa `role="alert"` **sem derrubar o resto da nota** (teste
    dedicado, com título e parágrafo ainda na tela). Trocar o tema redesenha com `theme: "dark"`.
  - *Segurança do que o mermaid gera* (requisito herdado da 055, não do texto do prompt) →
    `initialize` com `securityLevel: "strict"` afirmado em teste, mais `sanitizeSvg.test.tsx`
    (7 testes) provando que `<script>`, `on*`, `javascript:` e `<foreignObject>` não entram na
    página, inclusive com o SVG inserido de verdade num elemento.
  - *CRIAÇÃO DE CANVAS/DESENHOS* → **fora do escopo da 057 por decisão do refino**, é a 058. Não há
    artefato porque não foi implementado; é a ordem combinada, não pendência esquecida. O mesmo vale
    para o `drop column` de `project.notes`, última tarefa da 058.
  - Suíte completa: `npm test` → 1058 passando, 2 falhando (as pré-existentes de `currency.test.ts`).
    Antes desta feature eram 1022/2.
  - **Por que foi para `done/`:** ao contrário de 050/051/052/055/056, esta feature **não tem
    migration** — nada aqui depende de `supabase db push`. Todas as tarefas foram verificadas por
    código. A tabela `note` de que o módulo vive continua pendente de push pela 055, e é lá que essa
    pendência está registrada.
- **Desvio do plano, com medição: `mermaid` num `manualChunks` próprio piora o bundle.** A tarefa
  mandava declarar `mermaid` no `manualChunks` do `vite.config.ts`. Foi tentado e medido: um chunk
  `mermaid` de **888,3 KB gzip**, que `check:bundle` reprova (`[FAIL] route 888.3 KB / 160.0 KB`).
  A razão é que `manualChunks` colapsa em um arquivo tudo que o mermaid importa dinamicamente,
  matando o code-split por tipo de diagrama que a própria Decisão desta feature usa como argumento
  ("só baixa o tipo usado"). Sem `manualChunks`, o Rollup preserva a divisão do mermaid: 54 chunks,
  o maior com 151,5 KB. Então a extensibilidade foi para o *outro lado* — o script de orçamento
  ganhou a classe `lazy`, com limite próprio de 200 KB e comentário explicando o porquê. Nenhum teto
  foi afrouxado. Se um dia um chunk de diagrama passar de 200 KB, o CI falha e a saída continua
  sendo import dinâmico, não limite maior.
- **Bug real encontrado no caminho: instalar o mermaid engordou o chunk `recharts` em 15 KB gzip.**
  O `manualChunks` tinha um `id.includes("node_modules/d3-")` genérico apontando para `recharts`, e
  o mermaid traz a família d3 inteira (`d3-sankey`, `d3-geo`, `d3-force`, `d3-zoom`…). Resultado:
  toda rota de gráfico baixaria d3 que só o diagrama usa (112,9 → 128,0 KB). A regra passou a listar
  só o d3 que o `victory-vendor` (dependência do recharts) importa, num chunk `d3` compartilhado; o
  resto do d3 fica sem regra e o Rollup o coloca dentro dos chunks lazy do mermaid. `recharts` caiu
  para 89,5 KB e o `d3` compartilhado tem 26,1 KB. Efeito colateral bom: um diagrama numa nota não
  arrasta mais o chunk do recharts inteiro.
- **Tarefa acrescentada por decisão própria: `sanitizeSvg.ts`.** As Decisões diziam que
  `securityLevel: "strict"` bastava e que o app não precisaria de sanitizador. Continua verdade que
  não entrou dependência nova — mas a barreira era 100% de terceiro (e o mermaid, aliás, embute o
  DOMPurify dele) e nenhum teste deste repo conseguia afirmar nada sobre ela. `sanitizeSvgMarkup`
  são ~40 linhas sem dependência, com superfície pequena e conhecida (um gerador só), e é o que
  torna "SVG do mermaid não injeta script" uma assertiva de teste em vez de uma promessa de
  changelog. Não substitui `rehype-sanitize`/`dompurify` para HTML arbitrário, e a regra da 055
  continua valendo: ligar `rehype-raw` exige um sanitizador de verdade no mesmo commit.
- Terceira das quatro features do módulo: `055` → `056` → **`057`** → `058`. Depende do
  `MarkdownPreview` da 055. Independente da 058.
- O registry de blocos é a peça que a 058 vai reusar para renderizar o canvas embutido numa nota —
  por isso ele vem antes, mesmo que o canvas pareça o pedido mais chamativo do prompt.
- `mermaid` é a maior dependência que o app terá. Se o orçamento apertar no futuro, existe
  `@mermaid-js/tiny` (~metade do peso) cobrindo só flowchart e sequência — trocar é mudar o import
  dentro de `MermaidBlock.tsx`, mais nada. Foi por isso que o import ficou isolado num componente.
