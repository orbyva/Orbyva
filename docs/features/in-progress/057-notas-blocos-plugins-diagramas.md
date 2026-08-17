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
- [ ] Criar `src/components/markdown/remarkPlugins.ts` exportando o array central de plugins remark
      (começando com `remarkGfm`) e passar a usá-lo no `MarkdownPreview`, em vez do array inline.
- [ ] Instalar `mermaid@^11`. Verificação: `npm run build` + `npm run check:bundle` — confirmar que
      o chunk da rota `/notes` **não** cresceu (prova de que o import dinâmico funcionou).
- [ ] Declarar `mermaid` em `manualChunks` (`vite.config.ts:151`) e adicioná-lo ao `VENDOR_RE` de
      `scripts/check-bundle-budget.mjs`, com comentário explicando que é lazy e por isso tem
      limite próprio.
- [ ] Criar `src/components/markdown/MermaidBlock.tsx`: `await import("mermaid")` dentro de
      `useEffect`, `mermaid.initialize` com `securityLevel: "strict"` e tema seguindo o dark mode do
      app, `mermaid.parse` antes de `mermaid.render`, id único por instância, skeleton enquanto
      carrega e caixa de erro quando a sintaxe é inválida. Registrar como `mermaid` no
      `blockRegistry`.
- [ ] Verificação manual do `MermaidBlock`: numa nota, um ```mermaid com `graph TD; A-->B;` desenha
      o flowchart; um bloco com sintaxe quebrada mostra o erro sem derrubar o resto da nota;
      alternar light/dark redesenha com o tema certo.
- [ ] Adicionar ao editor (`NoteEditor.tsx`) um atalho "Inserir diagrama" que injeta um esqueleto
      ```mermaid com `graph TD` — descoberta da funcionalidade, já que ninguém digita a sintaxe de
      cabeça.
- [ ] Documentar o registry num comentário de cabeçalho em `blockRegistry.ts`: como registrar um
      renderer novo, em 3 linhas. É o que faz o "plugin" ser usável daqui a seis meses.
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

- Terceira das quatro features do módulo: `055` → `056` → **`057`** → `058`. Depende do
  `MarkdownPreview` da 055. Independente da 058.
- O registry de blocos é a peça que a 058 vai reusar para renderizar o canvas embutido numa nota —
  por isso ele vem antes, mesmo que o canvas pareça o pedido mais chamativo do prompt.
- `mermaid` é a maior dependência que o app terá. Se o orçamento apertar no futuro, existe
  `@mermaid-js/tiny` (~metade do peso) cobrindo só flowchart e sequência — trocar é mudar o import
  dentro de `MermaidBlock.tsx`, mais nada. Foi por isso que o import ficou isolado num componente.
