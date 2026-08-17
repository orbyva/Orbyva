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
- [ ] Atualizar `src/types/notes.ts`: `kind: NoteKind` e `canvas_data: unknown | null` em `Note`,
      com `NoteKind = "markdown" | "canvas"` espelhando o `check` do banco.
- [ ] Instalar `@excalidraw/excalidraw@^0.18`. Verificação: `npm run build` — se o build acusar
      conflito de peer dependency com React 19 vindo de dependências transitivas (Radix), resolver
      via `overrides` no `package.json` (o projeto já usa esse mecanismo), **não** com
      `--legacy-peer-deps`.
- [ ] Declarar `excalidraw` em `manualChunks` (`vite.config.ts:151`) e no `VENDOR_RE` de
      `scripts/check-bundle-budget.mjs`, com limite próprio comentado.
- [ ] Criar `src/pages/admin/notes/CanvasEditor.tsx`: `React.lazy` do `<Excalidraw />` dentro de
      `Suspense` com skeleton, `initialData` vindo de `canvas_data`, `onChange` com debounce
      ~1,5 s chamando `updateNote`, indicador `Salvando…`/`Salvo`, erro via `useToast` +
      `getErrorMessage`. Tema do Excalidraw seguindo o dark mode do app.
- [ ] Verificação de bundle do passo anterior: `npm run build && npm run check:bundle` e conferir
      no output que o chunk `excalidraw` existe **separado** e que o chunk da rota `/notes` não
      cresceu.
- [ ] Fazer a criação de nota oferecer os dois tipos: no `Notes.tsx` (055), botão dividido
      "Nova nota" / "Novo canvas" definindo `kind`. A rota `/notes/:id` monta `NoteEditor` ou
      `CanvasEditor` conforme `note.kind`.
- [ ] Diferenciar canvas na lista de `Notes.tsx`: ícone próprio e, no lugar do excerpt de texto,
      a contagem de elementos do desenho (`canvas_data.elements.length`) — excerpt de markdown não
      faz sentido para canvas.
- [ ] Criar `src/components/markdown/CanvasBlock.tsx`: lê o id do bloco ` ```orbyva-canvas `, busca
      a nota, renderiza o desenho em modo leitura com `exportToSvg` (também via import dinâmico),
      anexando o `SVGSVGElement` retornado por `ref` — nunca via `dangerouslySetInnerHTML` — e um
      link "Abrir canvas". Estado de erro quando o id não existe ou não é do usuário. Registrar
      como `orbyva-canvas` no `blockRegistry` da 057.
- [ ] Adicionar no `CanvasEditor` a ação "Copiar referência", que põe na área de transferência o
      bloco ` ```orbyva-canvas ` já com o id — é o que torna o embed descobrível.
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
