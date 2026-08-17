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

# 058 — Notas: canvas de desenho livre (Excalidraw)

## Contexto

Último pedido do prompt-mãe ainda em aberto: "CRIAÇÃO DE CANVAS/DESENHOS" e "DIAGRAMAS BÁSICOS,
IMAGINA O EXCALIDRAW SACA". A 057 cobriu diagrama **declarativo** (você escreve a sintaxe mermaid,
o app desenha); esta cobre o desenho **livre** — arrastar retângulo, seta, texto à mão.

Depende de: 055 (tabela `note`, rotas, lista) e 057 (o registry de blocos, para embutir um canvas
dentro de uma nota markdown). Independente da 056.

## Decisões

- **`@excalidraw/excalidraw@0.18`, com `React.lazy`.** É literalmente o que o usuário pediu ("imagina
  o Excalidraw"), é MIT, e os `peerDependencies` já declaram `^19.0.0` — React 19 é suportado.
  Traz pronto o que custaria meses: ferramentas de desenho, seleção, undo/redo, zoom/pan, estilo
  à mão livre, export.
  **Descartados:** tldraw — licença proprietária, cobrança na casa de milhares de dólares/ano para
  uso em produção, o que mata a opção antes de qualquer análise técnica; Konva e Fabric.js — são
  *primitivas* de canvas 2D, não aplicativos de desenho: não têm ferramentas, undo, seleção
  múltipla nem export, então adotá-los significa escrever o Excalidraw à mão.
- **Carregamento obrigatoriamente lazy.** O dist de produção passa de 2,5 MB (mais os locales em
  chunks próprios) — ordens de grandeza acima do limite de 160 KB gzip por rota de
  `scripts/check-bundle-budget.mjs`. Só entra via `React.lazy` + `Suspense`, na rota do canvas e no
  bloco embutido, com entrada dedicada em `manualChunks` e no `VENDOR_RE` do script de orçamento.
  Se ele aparecer no chunk de outra rota, é bug de import estático — o `check:bundle` é o teste.
- **Canvas é uma nota, não uma entidade nova.** Adicionar `kind` (`'markdown' | 'canvas'`) e
  `canvas_data jsonb` à tabela `note` da 055. Assim canvas herda de graça tudo que já existe: RLS,
  `project_id`, busca por título, `note_link` da 056, wipe de conta, lista.
  Descartada tabela `canvas` separada: duplicaria RLS, vínculos e listagem para ganhar apenas uma
  coluna nula a menos.
- **Persistir o JSON nativo do Excalidraw (`elements` + `appState` relevante) em `jsonb`.** É o
  formato `.excalidraw` — portável, importável/exportável no app oficial. Descartado converter para
  um formato próprio: perderia compatibilidade e viraria manutenção nossa a cada versão da lib.
- **SVG do `exportToSvg` entra como nó do DOM, nunca como HTML cru.** A 055 fixou que HTML embutido
  fica desabilitado no markdown (sem `rehype-raw`) e o app não tem `dompurify` nem `rehype-sanitize`.
  `exportToSvg` devolve um `SVGSVGElement` já construído — anexá-lo via `ref` mantém a garantia sem
  dependência nova. Injetar `outerHTML` com `dangerouslySetInnerHTML` reabriria o vetor de XSS que
  as três features anteriores fecharam, já que o conteúdo do desenho (inclusive texto livre) é dado
  do usuário.
- **Save com debounce alto (~1,5 s) e explícito.** O Excalidraw dispara `onChange` a cada
  movimento de ponteiro; salvar direto seria uma escrita por frame. Debounce maior que o do editor
  markdown, mais indicador de estado.
- **Nota markdown pode embutir um canvas por referência, não por cópia.** Um bloco
  ` ```orbyva-canvas ` contendo o id de uma nota-canvas renderiza o desenho em modo leitura
  (via `exportToSvg`, sem montar o editor inteiro), com link para abrir. Reusa o registry da 057.
  Descartado embutir o JSON no corpo do markdown: inflaria a nota e criaria duas cópias do mesmo
  desenho, sem fonte da verdade.

## Tarefas

- [x] Criar migration `supabase/migrations/20260816180000_note_canvas.sql`:
      `add column if not exists kind text not null default 'markdown'`,
      `add column if not exists canvas_data jsonb` e o `check (kind in ('markdown','canvas'))`
      (via `do $$` — Postgres 16 não tem `add constraint if not exists`). Sem tabela nova: RLS,
      `wipe_own_data` e o trigger de acesso da 055 já valem — conferido lendo
      `20260816160000_notes_core.sql` e afirmado no harness abaixo.
      **`supabase db push` NÃO foi rodado** (regra do projeto: só com confirmação do usuário).
- [x] Verificação da migration por harness em Docker, não à mão no SQL editor — mesmo caminho da
      056 (`supabase/tests/note_links/`). Criado `supabase/tests/note_canvas/`
      (`00_stubs.sql`, `01_seed.sql`, `02_assert_schema.sql`, `03_assert_behavior.sql`, `run.sh`),
      rodando a migration sobre um Postgres 16 descartável com notas semeadas **antes** dela.
      Afirma: `kind` é `text not null default 'markdown'` e `canvas_data` é `jsonb` nullable; as 3
      notas antigas ficaram `kind = 'markdown'` com `canvas_data null` sem update nenhum;
      `update note set kind = 'outro'` e `insert ... kind = 'excalidraw'` levam `check_violation`;
      o JSON do Excalidraw faz round-trip em `jsonb` (2 elementos + `appState` de volta); a RLS da
      055 continua barrando leitura e update de nota alheia depois da migration; `wipe_own_data`
      apaga a nota-canvas junto. Reaplicar a migration é idempotente (as assertivas rodam duas
      vezes). Resultado: `OK: 20260816180000_note_canvas.sql validada em Postgres 16.`
      Ajuste no `run.sh`: `pg_isready` sozinho não serve de sinal de pronto (a imagem sobe um
      servidor temporário no initdb), a espera é por um `select 1` que responda — ver Notas.
- [x] Atualizar `src/types/notes.ts`: `kind: NoteKind` e `canvas_data` em `Note`, com
      `NOTE_KINDS`/`NoteKind` espelhando o `check` do banco (mesmo padrão de
      `NOTE_LINK_ENTITY_TYPES` da 056).
      Ajuste do plano: em vez de `canvas_data: unknown | null` (que colapsa em `unknown` e obrigaria
      a cast em todo uso), o tipo é `NoteCanvasData | null` — uma descrição **estrutural mínima** do
      `.excalidraw` (`elements` + `appState` + `files`), para o card da lista poder contar elementos
      sem importar tipo de dentro do pacote de 2,7 MB. Quem desenha faz o cast na fronteira.
      `NoteDraft` ganhou `kind?`/`canvas_data?` (opcionais: a maioria das criações é markdown e o
      banco já tem default) e `normalizeNoteDraft` passou a devolver `NormalizedNoteDraft`, com os
      dois já resolvidos.
      Verificação: `noteDraft.test.ts` (3 testes novos) — rascunho sem `kind` vira `markdown` com
      `canvas_data` nulo, rascunho de canvas preserva `kind` e o desenho, e desenho mandado numa
      nota markdown é descartado (seria dado órfão); `notes-api.test.ts` (1 teste novo) — o payload
      real do `insert` de um canvas leva `kind: "canvas"` e o `canvas_data`, e o de nota comum leva
      `kind: "markdown"`. Suíte de `src/domain/notes` + `src/api/notes`: 92 testes passando.
- [x] Instalar `@excalidraw/excalidraw@^0.18`. Instalado `0.18.1` com `npm install` puro — **sem**
      `--legacy-peer-deps` e sem precisar de `overrides` novo: os `peerDependencies` do pacote já
      declaram `react@^19`, então não houve conflito a resolver. Verificação: `npm run build` OK e
      `npm run check:bundle` OK, com os chunks de rota inalterados (`NoteDetail` 8.4 KB, `Notes`
      1.9 KB gzip) — instalar sozinho não muda nada, é a linha de base contra a qual a tarefa do
      `CanvasEditor` vai ser medida.
- [x] Declarar `excalidraw` em `manualChunks` (`vite.config.ts`) e com limite próprio comentado em
      `scripts/check-bundle-budget.mjs`.
      **Desvio, com medição** (ver Notas): um `manualChunks` devolvendo `"excalidraw"` para tudo —
      o que a tarefa pedia ao pé da letra — foi medido e **reprovado**: 4,71 MB num arquivo só
      (1.532,1 KB gzip), porque colapsa os ~90 locales e os chunks internos da lib; de quebra o
      Workbox nem consegue pré-cachear (limite de 2 MB por arquivo) e o `npm run build` falhava.
      É a mesma armadilha que a 057 documentou com o mermaid.
      O que foi feito: `manualChunks` devolve **um nome por arquivo do pacote**
      (`excalidraw-<arquivo>`), preservando o split que o próprio Excalidraw já traçou (101 chunks:
      core, subsetting de fonte, um por idioma) e dando nome **estável** para o orçamento
      classificar — sem isso o Rollup nomearia o chunk principal a partir de um símbolo qualquer de
      dentro da lib (`percentages-BXMCSKIN-…`).
      No `check-bundle-budget.mjs`, classe nova `canvas` (`EXCALIDRAW_RE`, `MAX_EXCALIDRAW_GZIP`
      750 KB) em vez de entrada no `VENDOR_RE`. **Nenhum teto existente foi afrouxado**: rota
      continua 160 KB, vendor 200 KB, vendor lazy 200 KB. Os 750 KB são medição, não margem: o
      subsetting de fonte do Excalidraw (com o wasm do harfbuzz embutido) é um **único arquivo-fonte
      indivisível** de 719,6 KB gzip; os outros 100 chunks ficam todos abaixo de 171 KB.
      Consertado no caminho um estouro real que o canvas causava fora do orçamento: o precache do
      PWA subiu de 11.387 KiB para 15.905 KiB, ou seja, **todo usuário do app** baixaria 4,7 MB de
      canvas na instalação. `globIgnores: ["**/excalidraw-*.js", "**/excalidraw-*.css"]` no
      `VitePWA` devolveu o precache a 11.137 KiB; os chunks continuam disponíveis pela rede, sob
      demanda (o nome estável do `manualChunks` é o que torna esse `globIgnores` possível).
- [x] Criar `src/pages/admin/notes/CanvasEditor.tsx`: `React.lazy` + `Suspense` com skeleton,
      `initialData` vindo de `canvas_data`, `onChange` com debounce de 1,5 s
      (`CANVAS_AUTOSAVE_DEBOUNCE_MS`) chamando `updateNote`, indicador `Salvando…`/`Salvo`/
      `Não salvo`, erro via `useToast` + `getErrorMessage`, tema seguindo o dark mode do app.
      Três peças a mais que o plano não previa, todas por necessidade (ver Notas):
      1. `src/pages/admin/notes/ExcalidrawCanvas.tsx` — módulo separado, o **único** ponto do app
         com `import` de `@excalidraw/excalidraw` e do CSS dele (144 KB). Sem essa separação, o CSS
         entraria no chunk da rota mesmo com o componente sob `React.lazy`.
      2. `src/domain/notes/canvasScene.ts` (puro) — o que vai para o `jsonb` e o que volta dele.
      3. `src/hooks/useIsDarkTheme.ts` — o hook que vivia privado dentro do `MermaidBlock` (057),
         agora compartilhado pelos dois (terceira cópia do mesmo `MutationObserver` no app).
      Verificação por teste, não por navegador: `canvasScene.test.ts` (14 testes) e
      `CanvasEditor.test.tsx` (10 testes, com um Excalidraw de mentira — o real mede a tela e usa
      wasm, não roda em jsdom). Afirmam: o esqueleto cobre a espera do `React.lazy`; o desenho
      salvo chega ao canvas (2 elementos) e canvas novo abre em branco; desenhar grava
      `canvas_data` com os elementos certos e mostra `Salvando…` → `Salvo`; **o `onChange` de
      montagem não grava** (senão abrir um canvas carimbaria `updated_at` e reordenaria a lista);
      três movimentos seguidos viram uma gravação só, com o último estado; renomear grava o título
      e nem manda `canvas_data`; erro vira toast `destructive` + `Não salvo` sem perder o desenho da
      tela; o tema segue a classe `dark` do `<html>`.
- [x] Verificação de bundle: `npm run build && npm run check:bundle` com o canvas já ligado na rota
      (antes disso não haveria chunk a medir). `Bundle budget OK.` Os 101 chunks `excalidraw-*`
      existem **separados** — maior 719,6 KB, depois 171,0 / 157,7 / 144,6 KB e os ~90 locales
      abaixo de 11 KB cada. O chunk da rota **não** engordou com a lib: `NoteDetail` 8,4 → 10,2 KB
      gzip e `Notes` 1,9 → 2,4 KB, que é o código do próprio editor (estado, debounce, painéis), não
      o Excalidraw — 4,7 MB de lib com 1,8 KB de crescimento de rota é a prova de que o
      `React.lazy` funcionou.
- [x] Fazer a criação de nota oferecer os dois tipos: `Notes.tsx` ganhou "Novo canvas" ao lado de
      "Nova nota", e a rota `/notes/:id` monta `NoteEditor` ou `CanvasEditor` conforme `note.kind`.
      Ajuste do plano: **dois botões lado a lado** em vez de um botão dividido com menu — são só
      duas opções, e esconder o canvas atrás de um clique a mais o tornaria invisível para quem não
      sabe que ele existe.
      Verificação: `Notes.flow.test.tsx` (2 testes novos) — clicar em "Novo canvas" grava
      `kind: "canvas"` no store e monta o editor de desenho (sem as abas Escrever/Visualizar);
      desenhar grava `canvas_data` com 2 elementos e **remontar a página** (o F5 do teste) traz o
      desenho de volta.
- [x] Diferenciar canvas na lista de `Notes.tsx`: ícone próprio (`PenTool`, com `aria-label`
      "Canvas" contra "Nota") e, no lugar do excerpt, a contagem de elementos.
      Verificação: `Notes.flow.test.tsx` (2 testes novos) — numa lista mista sai
      "Canvas · 3 elementos" para o desenho e o excerpt de sempre para a nota de texto, com um
      ícone de cada; canvas sem traço nenhum diz "Canvas vazio" e um traço só usa o singular.
- [x] Criar `src/components/markdown/CanvasBlock.tsx`: lê o id do bloco ` ```orbyva-canvas `, busca
      a nota, desenha em modo leitura com `exportToSvg` (import dinâmico), anexa o `SVGSVGElement`
      por `ref` (`replaceChildren`) — sem `dangerouslySetInnerHTML` — e mostra "Abrir canvas: …".
      Registrado como `orbyva-canvas` no `blockRegistry` da 057, em 3 linhas, exatamente como o
      cabeçalho do registry manda.
      `sanitizeSvg.ts` ganhou `sanitizeSvgElement` (a mesma regra, sobre nó em vez de string), para
      a limpeza acontecer com o SVG ainda **fora** do documento e sem uma segunda passagem de
      parser entre limpar e mostrar.
      Verificação: `CanvasBlock.test.tsx` (9 testes) — o id do fence vira `fetchNote("c1")` e o
      desenho aparece; `<script>`, `onclick`, `href="javascript:"` e `<foreignObject>` não entram
      na página e o `<rect>` sobrevive; o link aponta para `/notes/c1`; canvas em branco nem chama
      o Excalidraw; id inexistente (ou escondido pela RLS) e nota de texto viram caixa `role=alert`;
      bloco vazio nem vai ao banco; falha ao desenhar **não derruba o resto da nota** (título e
      parágrafo seguem na tela); e o fence chega ao renderer pelo registry, desembrulhado do
      `<pre>`. Mais 3 testes de `sanitizeSvgElement` em `sanitizeSvg.test.tsx`, incluindo o `on*`
      da própria raiz `<svg>` e o nó inserido de verdade na página.
      `npm run check:bundle` OK: `MarkdownPreview` 50,0 KB gzip (era 48,5) — o Excalidraw **não**
      entrou junto, só o componente.
- [x] Adicionar no `CanvasEditor` a ação "Copiar referência", que põe na área de transferência o
      bloco ` ```orbyva-canvas ` já com o id.
      Verificação: `CanvasEditor.test.tsx` — clicar no botão escreve exatamente
      "```orbyva-canvas\nc1\n```\n" no `navigator.clipboard` e o rótulo vira "Copiado"; e
      `canvasScene.test.ts` afirma que esse fence é reconhecido por `parseBlockLanguage`, ou seja,
      o que o botão copia é o que o registry sabe desenhar.
- [ ] Verificação manual do fluxo completo: criar canvas → desenhar → recarregar a página e ver o
      desenho preservado → copiar a referência → colar numa nota markdown → ver o SVG renderizado
      → clicar e chegar no canvas certo.
- [ ] Verificação manual de que o `kind` não vazou: uma nota markdown antiga continua abrindo no
      `NoteEditor` (default `'markdown'` da migration) e a busca global da 055 continua achando
      notas por título.
- [ ] Rodar `npm run build`, `npm run lint`, `npm test` e `npm run check:bundle`.
- [ ] **Última tarefa do módulo — remoção da coluna `project.notes`, herdada da 055.**
      Pré-requisito bloqueante: o usuário precisa confirmar explicitamente que abriu o módulo de
      Notas e viu que **todas** as notas de projeto migradas estão lá, íntegras. Sem essa
      confirmação, esta tarefa não roda e continua `- [ ]` — a coluna ficar viva não é bug.
      Ao liberar: migration nova (timestamp único) contendo **uma única instrução**,
      `alter table public.project drop column if exists notes`.
      Nada de tocar em `project_event`, nas policies ou no `status` — a migration da feature 006
      (`20260806130000_project_notes_status_events.sql`) criou a coluna `notes` **e** a tabela
      `project_event` no mesmo arquivo, então é fácil arrastar junto o que não deve sair.
      Verificação: `npm run build` (nada referencia a coluna desde a 055) e, no SQL editor,
      `select count(*) from project_event` continua retornando o mesmo de antes.

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

- Última das quatro features do módulo: `055` → `056` → `057` → **`058`**. Ao concluir esta,
  reler o `prompt:` do frontmatter das quatro e conferir item a item antes de mover qualquer uma
  para `done/`.
- Cobertura do prompt-mãe pelas quatro: criação de notas + markdown → 055; "Obsidian tunado"
  (live preview, wiki-links, backlinks) → 056; plugins + flowcharts + diagramas → 057;
  canvas/desenhos → 058; "vinculam-se a projetos" → 055 (FK direta), "conversam com tudo" → 056
  (`note_link`).
- Excalidraw é a maior dependência do app inteiro. Se `check:bundle` acusar que ela vazou para o
  chunk de entrada, a causa quase certa é um import estático de tipo — usar `import type` resolve
  sem trazer runtime.
