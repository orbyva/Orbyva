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
- [x] Fluxo completo — verificado **por teste, não à mão no navegador** (a skill `next` proíbe
      Chrome, e o que faltava era cobertura automatizada, não um F5). `Notes.flow.test.tsx`
      "fluxo completo do embed" percorre os cinco passos contra o backend falso: criar canvas →
      desenhar (o `canvas_data` chega ao store com o elemento) → clicar em "Copiar referência" e
      capturar o que foi para o `navigator.clipboard` → **usar essa string exata** como conteúdo de
      uma nota markdown → abrir a aba Visualizar e afirmar que saiu um `<svg>`, que o `exportToSvg`
      recebeu a cena da nota-canvas (não o markdown em volta) e que o título e o parágrafo em volta
      continuam na tela → clicar em "Abrir canvas" e chegar no canvas certo, com o desenho
      ("elementos: 1"). O passo "recarregar a página" tem teste próprio (remontagem refazendo os
      fetches).
- [x] `kind` não vazou — também por teste. `Notes.flow.test.tsx` "nota antiga, sem kind gravado,
      continua abrindo no editor de markdown": a nota semeada **sem** `kind` (o backend falso
      preenche `'markdown'` na saída, como o default da coluna faz) abre com as abas
      Escrever/Visualizar e sem canvas nenhum; e o filtro da lista continua achando por título numa
      lista mista de nota e canvas.
      Busca global (055): `search-notes.test.ts` "acha um canvas pelo título e leva para o editor
      dele". Um buraco encontrado no caminho e consertado (ver Notas): a busca global montava o
      subtítulo com `noteExcerpt(content)`, e canvas não tem `content` — todo canvas apareceria na
      busca sem subtítulo nenhum. `src/api/search.ts` passou a trazer a coluna `kind` e a mostrar
      "Canvas".
- [x] Rodar `npm run build`, `npm run lint`, `npm test` e `npm run check:bundle`. Resultado:
      build OK; lint 0 erros (13 warnings pré-existentes de `react-refresh`, nenhum nos arquivos
      novos); `npm test` **1105 passando / 2 falhando** — as 2 são as pré-existentes e alheias de
      `src/lib/__tests__/currency.test.ts` (esperam `"—"`, `src/lib/currency.ts` devolve `"·"`), as
      mesmas registradas pela 055, 056 e 057; a 058 acrescentou 47 testes (1058 → 1105) e nenhuma
      falha nova. `check:bundle` OK: `NoteDetail` 10,3 KB e `Notes` 3,0 KB gzip (eram 8,4 e 1,9
      antes do canvas — 4,7 MB de lib com ~3 KB de crescimento de rota), `MarkdownPreview` 50,0 KB,
      101 chunks `excalidraw-*` na classe `canvas`, o maior com 719,6 KB contra o teto de 750 KB.
      Precache do PWA em 11.140 KiB, praticamente o mesmo dos 11.387 KiB de antes da feature.
      Migration validada à parte, em Postgres 16 (`bash supabase/tests/note_canvas/run.sh`).
- [x] **Migration do `drop column` escrita — a condição 1 foi cumprida** (2026-08-18): o usuário
      rodou `supabase db push` e `npx supabase migration list` mostra `20260816160000_notes_core`,
      `20260816170000_note_links` e `20260816180000_note_canvas` com `local` == `remote`. Criada
      `supabase/migrations/20260818120000_project_notes_drop.sql` com **uma única instrução**,
      `alter table public.project drop column if exists notes` — nada de `project_event`, policies
      ou `status`. O timestamp que a tarefa sugeria (`20260816190000`) já tinha sido tomado pela
      061; `20260818120000` é único e posterior a tudo, inclusive à `20260817120000_event_task_link`
      desta branch (migrations nunca compartilham timestamp — `docs/stack.md`).
      Verificação: `npm run build` limpo (nada no app lê ou escreve a coluna desde a 055 —
      reconferido: `src/types/tasks.ts` só a cita num comentário explicando a ausência e
      `src/api/tasks/projects.ts` não a menciona) e, sobretudo, o harness
      `bash supabase/tests/project_notes_drop/run.sh` em Postgres 16 descartável, que encena a
      sequência real do banco do usuário (coluna da 006 com dado dentro → migration da 055 copiando
      para `note` → drop) e afirma: `project.notes` some; as 3 notas migradas continuam byte a byte
      (digest de `content`/`user_id`/`project_id` idêntico ao de antes do drop); `project_event`
      e suas linhas **não** são arrastadas junto; `project_status_check`, o default de `status`,
      as 2 policies de `project` e as 4 de `project_event` seguem de pé; nenhuma linha de `project`
      mudou; `select`/`insert` citando `notes` passam a dar `undefined_column`; o CRUD de projeto,
      o vínculo nota→projeto e o `on delete set null` da 055 continuam funcionando; a RLS por
      `auth.uid()` segue barrando o alheio; `wipe_own_data` continua citando `note` e `project`; e
      reaplicar a migration é inofensivo. Mais 5 controles negativos (coluna de volta,
      `project_event` derrubada, nota migrada apagada, conteúdo de nota alterado, policy a menos),
      que provam que essas assertivas acusam de verdade. Resultado:
      `OK: 20260818120000_project_notes_drop.sql validada em Postgres 16.`
- [ ] **Aguarda o usuário — e esta tarefa é destrutiva, leia antes de rodar.** Dois passos, nesta
      ordem:
      1. **Condição 2, que continua não cumprida**: abrir `/notes` no app, com o banco já migrado, e
         **confirmar explicitamente** que todas as notas de projeto migradas ('Notas do projeto')
         estão lá, íntegras. No SQL editor, `select count(*) from note where title = 'Notas do
         projeto'` tem de bater com `select count(*) from project where notes is not null and
         btrim(notes, E' \t\r\n') <> ''`. É a conferência registrada na 055 — a cópia foi feita com
         `insert ... select` e a coluna original é a única rede de segurança que resta.
      2. Mover o arquivo de volta para o caminho de push:
         `git mv supabase/pending/20260818120000_project_notes_drop.sql supabase/migrations/`
         (o orquestrador da esteira estacionou o arquivo em `supabase/pending/` justamente para
         que o push da 066 não levasse o drop junto — ver Notas).
      3. Só então rodar `supabase db push`, que aplica `20260818120000_project_notes_drop.sql` e
         **destrói a coluna `project.notes` de vez, sem volta**. Depois do push, conferir no SQL
         editor que `select count(*) from project_event` continua retornando o mesmo de antes (é o
         que o harness já prova em Postgres 16, mas que confirma que o push chegou inteiro no banco
         real) e que `select notes from project limit 1` passa a dar erro de coluna inexistente.
      **O gatilho está desarmado**: o arquivo saiu de `supabase/migrations/` e vive em
      `supabase/pending/`, então nenhum `db push` o aplica por acidente — inclusive o push que a
      feature 066 vai exigir. Rearmar é o passo 2 acima, e só depois da conferência do passo 1.

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

- **Por que a feature está em `in-progress/` e não em `done/` (2026-08-17, ainda válido em
  2026-08-18).** Sobra exatamente uma
  `- [ ]`: o `drop column` de `project.notes`, bloqueado por duas condições que só o usuário pode
  satisfazer (rodar o `db push` e confirmar que as notas migradas estão íntegras). Todas as outras
  15 tarefas estão verificadas por código. A checagem de satisfação do `prompt:` está abaixo.
  **Atualização de 2026-08-18:** a condição 1 caiu (o push foi rodado) e a migration do drop foi
  escrita e validada em Postgres 16 — mas a condição 2 continua aberta e o novo `db push` é do
  usuário, então a feature **permanece em `in-progress/`**. Foi a única das dez features desta
  rodada em que sobrou trabalho de código, e ele foi feito.
- **Checagem de satisfação (2026-08-17), item do `prompt:` → artefato que prova.** O prompt-mãe
  cobre as quatro features do módulo; o que a 058 se propôs a cumprir é a parte de desenho:
  - *CRIAÇÃO DE CANVAS/DESENHOS* → `Notes.flow.test.tsx` "'Novo canvas' cria a nota com
    kind = canvas e abre o editor de desenho" e "desenhar num canvas grava o canvas_data e
    recarregar a página traz o desenho de volta": o botão existe na lista, cria a nota com o `kind`
    certo, o editor monta, o traço vai para o banco e sobrevive à remontagem. Mais
    `CanvasEditor.test.tsx` (10 testes) no comportamento do editor e `canvasScene.test.ts`
    (14 testes) nas regras do que se grava.
  - *DIAGRAMAS BÁSICOS, IMAGINA O EXCALIDRAW SACA* → é literalmente o Excalidraw:
    `@excalidraw/excalidraw@0.18.1` em `ExcalidrawCanvas.tsx`, com as ferramentas, undo/redo,
    seleção e zoom que vêm com ele. O que os testes afirmam é a **integração** (o que entra e o que
    sai do editor), não o desenho em si, que é responsabilidade da lib.
  - *VINCULAM-SE A PROJETOS, CONVERSAM COM TUDO* → de graça, por canvas **ser** uma nota: o
    `CanvasEditor` monta o mesmo `ProjectPicker`, o mesmo `NoteLinksPanel` e o mesmo
    `BacklinksPanel` da 055/056, sem adaptação. O harness de Postgres prova o lado do banco (RLS,
    `wipe_own_data` e o `project_id` continuam valendo para `kind = 'canvas'`).
  - *Canvas dentro da nota markdown* (não está no texto do prompt, é a ponte com o "Obsidian
    tunado") → `CanvasBlock.test.tsx` (9 testes) e o fluxo de ponta a ponta em `Notes.flow.test.tsx`
    "fluxo completo do embed", que vai de copiar a referência até clicar nela e chegar no canvas.
  - *Segurança do SVG* (requisito herdado da 055/057) → `sanitizeSvg.test.tsx` (10 testes, 3 novos
    para `sanitizeSvgElement`) e o teste do `CanvasBlock` "o SVG entra como nó, não como HTML cru".
  - Suíte completa: `npm test` → **1105 passando, 2 falhando** (as pré-existentes de
    `currency.test.ts`). Antes desta feature eram 1058/2.
- **Por que a migration do `drop column` não foi escrita** (posição de 2026-08-17, revista no dia
  seguinte — ver o item abaixo). A tarefa manda criar o arquivo "ao
  liberar". Criá-lo antes seria pior do que inútil: migration commitada em `supabase/migrations/`
  é aplicada pelo **próximo `supabase db push` que o usuário rodar**, seja lá por qual motivo — o
  arquivo *é* o gatilho, não a decisão de rodá-lo. Como a liberação depende de o usuário confirmar
  que as notas migradas estão íntegras, escrever o arquivo agora tiraria dele a chance de dizer não.
  O conteúdo exato da migration está na tarefa, pronto para ser criado quando a confirmação vier.
- **2026-08-18 — a migration foi escrita, com a condição 2 ainda em aberto. O porquê e o risco.**
  O usuário rodou `supabase db push`: `npx supabase migration list` mostra todas as migrations do
  módulo (`160000`, `170000`, `180000`) com `local` == `remote`, ou seja, a **condição 1 caiu** e a
  tarefa deixou de estar bloqueada por falta de banco. A **condição 2** (o usuário abrir `/notes` e
  confirmar que as notas migradas estão íntegras) **continua não cumprida** — ninguém confirmou
  nada —, e por isso a feature **segue em `in-progress/`**, com a tarefa de push registrada como
  passo do usuário, não como coisa feita. O que mudou em relação à posição de ontem é só quem
  segura o gatilho: antes, o gatilho era escrever o arquivo; agora o arquivo existe e o gatilho é o
  próximo `db push`. **Consequência que precisa ficar visível:** qualquer `supabase db push` que o
  usuário rode por outro motivo — a migration da 066, por exemplo — leva o drop junto e destrói
  `project.notes` sem que a conferência tenha acontecido. Se isso for inaceitável, a correção é
  mover o arquivo para fora de `supabase/migrations/` até a confirmação vir; a decisão é do
  usuário, e está escrita na tarefa em vez de escondida aqui.
- **O harness `supabase/tests/project_notes_drop/` roda a 055 antes do drop, de propósito.** Testar
  o `drop column` isolado provaria pouco: o que importa não é "a coluna sumiu", é "a coluna sumiu
  **depois** de o conteúdo dela estar salvo em `note`, e o resto do schema da 006 sobreviveu". Por
  isso o harness encena a sequência real (schema da 006 com dado dentro → `20260816160000_notes_core`
  copiando → `20260818120000_project_notes_drop`) e tira um retrato (`11_snapshot.sql`) do que
  precisa sobreviver, para comparar por digest depois do drop. Os 5 controles negativos existem
  porque um harness de `drop column` é o tipo de teste que passa à toa com facilidade: eles
  devolvem a coluna, derrubam `project_event`, apagam uma nota migrada, mexem no conteúdo dela e
  tiram uma policy, exigindo que as assertivas acusem em cada caso.
- **Desvio com medição: `manualChunks` único para o excalidraw é pior, igual ao caso do mermaid na
  057.** A tarefa mandava declarar `excalidraw` em `manualChunks`. Foi feito e medido: um chunk de
  4,71 MB (**1.532,1 KB gzip**), que `check:bundle` reprova e que **quebra o `npm run build`** — o
  Workbox não pré-cacheia arquivo acima de 2 MB e aborta. A causa é a mesma da 057: `manualChunks`
  colapsa num arquivo só tudo que a lib importa dinamicamente, aqui os ~90 locales e os chunks
  internos. A correção foi devolver **um nome por arquivo do pacote** (`excalidraw-<arquivo>`), o
  que preserva o split natural (101 chunks) e ainda dá nome estável — sem isso o Rollup batizaria o
  chunk principal a partir de um símbolo interno da lib (`percentages-BXMCSKIN-…`), que é
  exatamente o tipo de nome frágil que a 057 teve de aceitar para o mermaid.
- **Bug real encontrado no caminho: o canvas engordava o precache do PWA em 4,5 MB.** O
  `globPatterns` do `VitePWA` pega `**/*.js`, então os 101 chunks do Excalidraw entravam no
  precache: 11.387 KiB → 15.905 KiB, cobrados de **todo usuário do app na instalação**, inclusive
  de quem nunca abre um canvas. Nenhum teto de bundle pega isso, porque por chunk está tudo dentro
  do orçamento. `globIgnores: ["**/excalidraw-*.js", "**/excalidraw-*.css"]` devolveu o precache a
  11.140 KiB. Contrapartida aceita e documentada no `vite.config.ts`: abrir um canvas pela primeira
  vez exige estar online.
- **Bug real: a busca global mostrava canvas sem subtítulo.** `src/api/search.ts` montava o
  subtítulo do hit com `noteExcerpt(content)`, e canvas não tem `content` — todo desenho apareceria
  na busca como uma linha só com o título. Passou a trazer a coluna `kind` e a mostrar "Canvas".
  Coberto por `search-notes.test.ts`.
- **Decisão própria: o `onChange` de montagem do Excalidraw não pode gravar.** O Excalidraw dispara
  `onChange` assim que monta, com a cena que acabou de restaurar, e depois a cada movimento de
  ponteiro — inclusive movimentos que não mudam nada. Sem tratamento, **abrir** um canvas gravaria
  por cima dele e carimbaria `updated_at`, reordenando a lista de notas sem que ninguém tivesse
  editado nada. A solução é `canvasSceneSignature`: a cena que chega é comparada com a que já está
  gravada, e save só acontece quando o documento mudou de verdade. Tem teste dedicado.
- **Ajuste do plano: `canvas_data` é `NoteCanvasData | null`, não `unknown | null`.** `unknown | null`
  colapsa em `unknown` no TypeScript e obrigaria a cast em todo uso, inclusive no card da lista.
  O tipo é uma descrição **estrutural mínima** do `.excalidraw` (`elements`/`appState`/`files`), sem
  importar nada de dentro do pacote de 2,7 MB — os tipos reais da lib só aparecem na fronteira, em
  `ExcalidrawCanvas.tsx`.
- **`ExcalidrawCanvas.tsx` existe por causa do CSS.** O `React.lazy` sozinho não bastaria: o
  `import "@excalidraw/excalidraw/index.css"` (144 KB) é estático por natureza, e num arquivo
  importado pela rota ele entraria no CSS da rota mesmo com o componente sob `lazy`. Isolando o
  módulo, o Vite emite o CSS junto do chunk lazy.
- **Fontes do Excalidraw vêm do CDN dele (`EXCALIDRAW_ASSET_PATH` no default).** São 13 MB de
  woff2 no pacote; servi-las do próprio app significaria copiá-las para `public/`. Não foi feito, de
  propósito: sem elas o Excalidraw cai numa fonte de sistema e o desenho continua funcionando. Se um
  dia isso incomodar, o conserto é copiar a pasta `dist/prod/fonts` e setar
  `window.EXCALIDRAW_ASSET_PATH`.
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
