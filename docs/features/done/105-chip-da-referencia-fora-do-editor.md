---
prompt: |
  quero que exista formas de referenciar tarefas, no projeto, que serão rastreáveis. Então se eu digitar>

  TASK-> painel de ...

  isso deve já criar e vincular uma task, ou posso na hora vincular uma já existente

  ---
  Fatia desta feature (decidida no desenho de 2026-09-21).

  "Rastreável" tem dois sentidos, e este é o primeiro: **o texto mostra o estado atual da
  tarefa**. Não basta a marca existir no markdown; ela tem de aparecer, fora do editor, como
  algo que diz em que pé a tarefa está.

  O chip mostra o estado, e dá para concluir por ali? Resposta do usuário: "sim, pode ter um
  mini componente com o status, e prazo se tiver prazo". Concluir a tarefa pelo chip fica de
  fora desta rodada — marcar concluída dentro de um texto que também é editável mistura dois
  modos no mesmo clique.

  O que acontece quando a tarefa referenciada é apagada? Resposta do usuário: "recomendado" —
  chip "referência removida", sem tocar no texto. É o mesmo tratamento que a feature 056 deu a
  vínculo órfão de `note_link`.

  Para onde o clique leva? `/tasks?task=<id>`, abrindo o Dialog de edição de tarefa.

  Decisão que vale para esta fatia: o conteúdo persistido continua Markdown cru byte a byte —
  o chip é render, nunca um formato próprio gravado.
---

# 105 — Chip da referência de tarefa fora do editor (prévia e card)

## Contexto
Depende de: 102, 103.

Com a 103 a marca `[Rótulo](orbyva-task:<id>)` existe e é parseável; com a 102 há para onde o
clique levar. Falta ela **aparecer** onde o texto é lido em vez de editado — que é onde a
rastreabilidade se paga.

São dois consumidores, e eles têm problemas diferentes:

**A prévia da nota / da descrição** (`src/pages/admin/notes/NoteMarkdownPreview.tsx`). Aqui há uma
vantagem que o desenho não previu: como a marca **já é um link markdown**, o `react-markdown`
entrega ela ao componente `a({ href, children })` que o arquivo já customiza (`:59`) — não precisa
de reescrita prévia do texto como o `[[…]]` precisa (`replaceWikiLinks`, `:50`). O chip é só mais
um ramo por esquema de href, ao lado do `parseMissingWikiLinkHref` que já está lá.
**Mas há uma armadilha**: o `urlTransform` daquele arquivo (`:117`) só abre exceção para
`WIKI_LINK_MISSING_SCHEME`; todo o resto passa por `defaultUrlTransform`, que **poda esquema
desconhecido**. Sem incluir `orbyva-task:` ali, o `href` chega vazio e o chip nunca renderiza.

**O card da tarefa** (`src/pages/admin/tasks/TaskDescriptionSnippet.tsx`). Aqui o problema é ordem:
o componente roda `stripMarkdown(description)` **primeiro** (`:23`) e só depois segmenta os
`[[…]]`. Isso funciona para wiki-link porque ele sobrevive ao strip, mas `stripMarkdown`
(`src/lib/markdown.ts:12`) tem `.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")` — ele **engole o link e
deixa só o rótulo**, jogando o id fora. A segmentação de tarefa tem de rodar antes do strip.

## Decisões
- **O chip mostra título, status e — havendo — o prazo.** (Resposta do usuário: "um mini
  componente com o status, e prazo se tiver prazo".)
- **Não se conclui a tarefa pelo chip nesta rodada.** Marcar concluída dentro de um texto que
  também é editável mistura dois modos no mesmo clique; o clique do chip tem um significado só,
  que é abrir a tarefa.
- **Tarefa apagada vira chip "referência removida", e o texto não é tocado.** Mesmo tratamento que
  a 056 deu a vínculo órfão de `note_link`. Reescrever o markdown de alguém porque um id sumiu
  seria pior que o buraco.
- **Na prévia, o chip entra como ramo do componente `a` que já existe** — nada de reescrever o
  texto antes do `react-markdown`, como o `[[…]]` precisa. A marca já é link válido; aproveitar
  isso é o que torna esta feature barata.
- **`orbyva-task:` tem de ser liberado no `urlTransform`** de `NoteMarkdownPreview.tsx:117`, ao
  lado do esquema dos wiki-links quebrados. Sem isso o `href` chega vazio e nada renderiza — e o
  sintoma é mudo, sem erro no console.
- **No card, segmentar por referência de tarefa ANTES de `stripMarkdown`**, e aplicar o strip em
  cada pedaço de prosa separadamente. A ordem inversa perde o id para sempre. A segmentação de
  `[[…]]` continua depois do strip, aninhada nos pedaços de texto — ela sobrevive ao strip e mudar
  isso seria mexer no que já funciona.
- **Duas densidades do mesmo chip**: na prévia, completo (ícone de status + título + prazo); no
  card, compacto (ícone + título), porque ali o espaço é de `line-clamp-2` e um prazo empurraria o
  texto para fora. Mesmo componente, uma prop.
- **A resolução é em lote, por id.** Um hook no molde de `useNotesTitleIndex`
  (`src/hooks/useNotesTitleIndex.ts`) resolve todos os ids citados de uma vez; uma consulta por
  ocorrência seria uma consulta por chip na tela.

## Tarefas
- [x] `src/hooks/useTaskRefIndex.ts` — hook que recebe os ids citados (`taskRefIds` da 103) e
      devolve um `Map<id, { title, status, due_date }>`, resolvendo em lote. Espelhar a forma de
      `src/hooks/useNotesTitleIndex.ts`. Id não encontrado simplesmente não entra no mapa — é
      assim que o chip sabe que a tarefa foi apagada. Verificação: `npm run build`
- [x] Testar o hook: dois ids resolvem numa chamada só (não duas); id inexistente fica fora do
      mapa sem lançar; lista de ids vazia não dispara consulta nenhuma; a lista de ids mudando
      refaz a resolução. Verificação: `npm test src/hooks`
- [x] `src/components/tasks/TaskRefChip.tsx` — o componente: ícone por `status`, título, e prazo
      quando `due_date` existe (formatado como o resto do app formata data). Prop de densidade
      (`compact`) escondendo o prazo. Tarefa concluída sai com traço no título. Âncora para
      `/tasks?task=<id>` com `onPointerDown={stopPropagation}` e `onClick` que respeita
      Ctrl/Cmd/Shift/Alt — copiar o cuidado de `TaskDescriptionSnippet.tsx:38-45`, que existe
      porque o card inteiro é clicável por baixo. Verificação: `npm run build && npm run lint`
- [x] Estado "referência removida" no `TaskRefChip`: sem entrada no mapa, o chip vira um selo
      apagado, com o rótulo que estava no texto, **sem link** e com `title`/`aria-label` dizendo
      que a tarefa não existe mais. Verificação: `npm run build`
- [x] Testar o chip em `src/components/tasks/__tests__/TaskRefChip.test.tsx`: tarefa aberta com
      prazo mostra título e prazo; tarefa aberta sem prazo não mostra rótulo de prazo vazio;
      concluída sai com traço; `compact` esconde o prazo e mantém o título; estado removido não
      renderiza `<a>` e anuncia a ausência; o clique não borbulha para o card de trás.
      Verificação: `npm test src/components/tasks`
- [x] Liberar `orbyva-task:` no `urlTransform` de
      `src/pages/admin/notes/NoteMarkdownPreview.tsx:117`, ao lado de `WIKI_LINK_MISSING_SCHEME`.
      Verificação: `npm run build`
- [x] Ramo do chip no componente `a` de `NoteMarkdownPreview.tsx` (por volta de `:59`): quando
      `parseTaskRefHref(href)` devolve id, renderizar `TaskRefChip` completo em vez de `<a>`;
      senão, o comportamento de hoje, inalterado. Resolver os ids com `useTaskRefIndex` a partir
      do conteúdo. Verificação: `npm run build && npm run lint`
- [x] Estender `src/pages/admin/notes/__tests__/NoteMarkdownPreview.test.tsx`: conteúdo com a marca
      renderiza o chip com título e status vindos do banco falso (**não** o rótulo cru do texto,
      que pode estar velho); link markdown comum continua `<a>` normal; `[[Nota]]` continua se
      comportando como antes; **e o teste que prova a armadilha** — sem a exceção no
      `urlTransform`, o href chega vazio (garanta que o teste falharia se a exceção fosse removida).
      Verificação: `npm test src/pages/admin/notes`
- [x] Inverter a ordem em `src/pages/admin/tasks/TaskDescriptionSnippet.tsx`: segmentar a descrição
      **crua** com `taskRefPlainSegments` (103), depois aplicar `stripMarkdown` só nos pedaços de
      prosa, e dentro de cada pedaço já limpo continuar segmentando `[[…]]` como hoje (`:28`).
      Verificação: `npm run build && npm run lint`
- [x] Renderizar o chip compacto no snippet e garantir que o `line-clamp-2` continua valendo — chip
      é `inline-flex` com `align-baseline`, não bloco. Verificação: `npm run build`
- [x] Testar o snippet em `src/pages/admin/tasks/__tests__/`: descrição com marca mostra o chip com
      o título da tarefa; descrição com marca **e** markdown em volta (negrito, título, lista) sai
      limpa com o chip no meio; descrição com `[[Nota]]` **e** marca de tarefa mostra os dois
      corretamente; descrição com link markdown comum não vira chip; descrição vazia continua
      devolvendo `null`. Verificação: `npm test src/pages/admin/tasks`
- [x] Teste de regressão da ordem, explícito, porque é o bug que esta feature existe para evitar:
      uma descrição que é **só** `[Rótulo](orbyva-task:<uuid>)` tem de render chip — se o
      `stripMarkdown` rodar antes, sobra o texto "Rótulo" e nenhum chip.
      Verificação: `npm test src/pages/admin/tasks`
- [x] `npm run build && npm run lint && npm test && npm run check:bundle` limpos, com a contagem de
      testes registrada nesta linha. `npm run build`: `built in 33s`, 0 erros de `tsc`.
      `npm run lint`: `88 problems (0 errors, 88 warnings)` — mesma contagem da base, só os
      warnings pré-existentes de `react-refresh`. `npm test`: **279 arquivos / 3102 testes, 0
      falhas** (base era 276 / 3065 — a feature somou **3 arquivos e 37 testes**: 8 de
      `useTaskRefIndex.test.tsx`, 8 de `TaskRefChip.test.tsx`, 11 de
      `TaskDescriptionSnippet.test.tsx` e 10 acrescentados a `NoteMarkdownPreview.test.tsx`, que
      foi de 16 para 26). `npm run check:bundle`: `Bundle budget OK.`

## Prompts

## Notas

- 2026-09-22 — **A leitura em lote ganhou um módulo próprio, `src/api/tasks/taskRefs.ts`**, em vez
  de sair de `@/api/tasks/tasks`. Mesmo motivo já medido na 104: aquele módulo arrasta a API de
  recorrência, a de medicação e o domínio de tarefas inteiro, e quem monta o chip é a **prévia da
  nota** — uma rota que não precisa de nada disso para abrir. O novo módulo importa só `supabase` e
  `getCurrentUserId`, então o import pôde ser estático (sem o `import()` dinâmico que a 104
  precisou). `select` estreito (`id, title, status, due_date`), que são os três campos do chip.
  Decisão minha, de engenharia.
- 2026-09-22 — **O mapa do `useTaskRefIndex` é lido por `lookupTaskRef`, não por `Map.get` cru.**
  `taskRefIds` deduplica ignorando a caixa do uuid e devolve a primeira grafia; um segundo
  `orbyva-task:ABC…` no mesmo texto chegaria ao chip com a grafia dele e um `get` direto
  renderizaria "referência removida" para uma tarefa que existe. A função existe para o consumidor
  não errar isso — o mapa é chaveado em minúsculas.
- 2026-09-22 — **Falha de rede não entra no cache do índice.** `useLinkIconRules` cacheia o vazio de
  propósito (evita tempestade de requisição numa tabela fora do ar); aqui o vazio tem significado —
  "a tarefa foi apagada" —, e congelá-lo transformaria uma queda momentânea em selo de referência
  removida permanente na tela. O id continua pendente e a próxima montagem tenta de novo; o erro vai
  para o `console.error`, sem toast (é leitura de fundo, o usuário não pediu isso agora).
- 2026-09-22 — **Ícone e rótulo de status foram repetidos dentro do `TaskRefChip`**, em vez de
  importados de `TaskViews.tsx` (`STATUS_ICONS`/`STATUS_LABELS`). Aquele arquivo é a lista de
  tarefas inteira (card, Kanban, Gantt, quadrante) e importá-lo do chip colaria tudo isso no chunk
  de Notas. São seis linhas de constante contra um grafo de módulo.
- 2026-09-22 — **`stripSegment` preserva o espaço das bordas de cada pedaço de prosa.** O
  `stripMarkdown` termina com `.trim()`, então `**Contexto** e ` + chip sairia colado
  ("Contexto e[chip]") toda vez que a marca estivesse no meio de uma frase. O teste "markdown em
  volta sai limpo e o chip fica no meio" afirma o texto final inteiro por isso.
- 2026-09-22 — **O selo de referência removida não leva traço no texto.** O traço significa
  "concluída" no chip resolvido; repeti-lo no selo apagado faria "apagada" e "feita" parecerem a
  mesma coisa. Ele se distingue por borda tracejada, opacidade, ícone de elo partido e
  `role="note"` + `aria-label` dizendo que a tarefa não existe mais.
- 2026-09-22 — **As duas armadilhas escritas no arquivo foram provadas por experimento, não por
  leitura.** Removendo `|| url.startsWith(TASK_REF_SCHEME)` do `urlTransform`, o arquivo de teste da
  prévia foi de 26/26 para `8 failed | 2 passed`; trocando a ordem do snippet para
  `taskRefPlainSegments(stripMarkdown(description))`, o arquivo do snippet foi de 11/11 para
  `8 failed | 3 passed`. Nos dois casos o estado correto foi restaurado e a suíte voltou verde — é
  a prova de que os testes falhariam se a proteção sumisse.
- 2026-09-22 — **Flakiness conhecida, não regressão**: rodando `npx vitest run src/pages/admin/notes`
  em paralelo, `Notes.flow.test.tsx > escrever título e conteúdo salva sozinho` estourou o
  `testTimeout` de 5 s uma vez. Isolado, o arquivo passa 21/21, e a suíte inteira (`npm test`) passou
  279/279 arquivos. É o mesmo padrão já reportado por outros agentes desta esteira; nenhum teste
  alheio foi alterado.

## Como testar

Este roteiro só faz sentido com a **102** e a **103** implementadas. Com a **104** também pronta,
dá para criar as marcas digitando; sem ela, escreva a marca à mão no markdown (é texto comum).

1. **Pré-requisitos**
   - Nenhuma migration. `npm run dev`, login normal.
   - Ter três tarefas e anotar os `id`: uma **aberta com prazo**, uma **aberta sem prazo** e uma
     **concluída** (`select id, title, status, due_date from task limit 5`).
   - Ter uma nota em `/notes` para editar.

2. **Verificação automatizada** — comandos exatos, um por linha (rodados nesta ordem ao fechar a
   feature):
   - `npm test src/components/tasks/__tests__/TaskRefChip.test.tsx` — passou = **8 testes**, 0
     falhas. O chip acerta as quatro aparências (com prazo, sem prazo, concluída, removida), o
     `compact` esconde o prazo sem perder o título, o estado removido não renderiza `<a>` e o
     clique não borbulha para o card de trás.
   - `npm test src/hooks/__tests__/useTaskRefIndex.test.tsx` — passou = **8 testes**, 0 falhas. É
     onde o **lote** é provado pela contagem de chamadas: dois ids (e até dois componentes
     montados juntos) saem numa consulta só, id inexistente fica fora do mapa, lista vazia não
     consulta nada e a lista mudando pede só o id novo.
   - `npm test src/pages/admin/notes/__tests__/NoteMarkdownPreview.test.tsx` — passou = **26
     testes**, 0 falhas (16 eram do `[[…]]` e da checklist; 10 são desta feature). Cobre o chip com
     o título do banco em vez do rótulo do texto, o selo de referência removida, cinco marcas com
     **uma** consulta, link comum seguindo `<a>`, marca em bloco de código literal e o clique
     dentro de um Dialog. O teste "o `urlTransform` deixa o esquema `orbyva-task:` passar inteiro"
     é o que falha se a exceção do `urlTransform` for removida.
   - `npm test src/pages/admin/tasks/__tests__/TaskDescriptionSnippet.test.tsx` — passou = **11
     testes**, 0 falhas. O teste "descrição que é **só** a marca ainda vira chip (a prova da
     ordem)" é o que falha se o `stripMarkdown` voltar a rodar antes da segmentação.
   - `npm test src/pages/admin/tasks` — passou = **63 arquivos / 723 testes**, 0 falhas. A rede de
     que o card, o Kanban e o Gantt (que montam o mesmo snippet) não quebraram ao lado.
   - `npm run build && npm run lint && npm run check:bundle` — passou = `tsc` sem erro, lint com
     **0 erros** (88 warnings de `react-refresh` pré-existentes) e `Bundle budget OK.`.
   - `npm test` — passou = **279 arquivos / 3102 testes**, 0 falhas.

3. **Verificação manual, passo a passo**
   1. Numa nota, escreva `Depende de [revisar contrato](orbyva-task:<id da tarefa aberta COM
      prazo>)` e vá para a aba **Visualizar**. **Esperado**: no lugar do link aparece um chip com
      ícone de status, o **título real da tarefa** (não necessariamente o rótulo que você digitou)
      e o prazo em `dd/mm/aaaa`.
   2. Clique no chip. **Esperado**: vai para `/tasks?task=<id>` e o Dialog daquela tarefa abre.
   3. Troque o id pelo da tarefa **sem prazo**. **Esperado**: chip igual, sem o pedaço do prazo —
      e sem um rótulo de prazo vazio ou "—" sobrando.
   4. Troque pelo id da tarefa **concluída**. **Esperado**: o título aparece com traço.
   5. Troque por um uuid que não existe (`00000000-0000-0000-0000-000000000000`). **Esperado**:
      selo apagado (borda tracejada, ícone de elo partido) com o rótulo que você escreveu e o
      tooltip "A tarefa referenciada não existe mais (…)", **sem link** — passar o mouse mostra o
      aviso, clicar não leva a lugar nenhum. O texto da nota continua exatamente como você
      escreveu — confira na aba Escrever.
   6. Agora o card: edite uma tarefa, ponha na **Descrição**
      `**Contexto** e [subir painel](orbyva-task:<id>) para sexta`, salve e olhe a linha dela em
      `/tasks`. **Esperado**: a prévia de duas linhas mostra "Contexto e [chip] para sexta" — o
      negrito some (é o strip), o chip fica.
   7. Clique no chip **dentro do card** da lista. **Esperado**: abre a tarefa referenciada, e
      **não** o formulário da tarefa que contém o texto (o card inteiro é clicável por baixo).

4. **Casos de borda e caminhos negativos**
   - Descrição que é **só** a marca, sem nenhum texto em volta → tem de render chip. Se aparecer só
     a palavra do rótulo, o `stripMarkdown` voltou a rodar antes da segmentação.
   - Um link markdown comum (`[Google](https://google.com)`) na mesma nota → continua link normal,
     azul, abrindo fora. Se virar chip, o parser está casando qualquer link.
   - `[[Alguma Nota]]` e a marca de tarefa no mesmo parágrafo → os dois renderizam, cada um com seu
     comportamento.
   - A marca dentro de um bloco de código cercado → fica texto literal, sem chip.
   - Cinco marcas da mesma tarefa no mesmo texto → cinco chips, e na aba Network **uma** consulta,
     não cinco.
   - Marca com rótulo vazio `[](orbyva-task:<id>)` → o chip usa o título real da tarefa, não fica em
     branco. (Com a tarefa apagada **e** o rótulo vazio, o selo diz só "Tarefa" — não fica mudo.)
   - Ctrl/Cmd+clique no chip → abre a tarefa em aba nova, sem trocar a página de baixo.
   - Tarefa renomeada depois de citada → o chip mostra o **nome novo** sem ninguém editar o texto.
     É o ponto de resolver por id.

5. **Sinais de que quebrou**
   - Nenhum chip aparece na prévia e **não há erro no console**: quase certamente o `urlTransform`
     está podando `orbyva-task:` e o `href` chega vazio. É a falha mais provável desta feature, e é
     silenciosa.
   - Chip aparece na prévia mas não no card: a inversão de ordem do `stripMarkdown` não foi feita.
   - Clicar no chip dentro do card abre a tarefa errada (a do próprio card): falta o
     `stopPropagation` no `onPointerDown`.
   - O chip mostra o rótulo do texto em vez do título atual da tarefa: o componente não está lendo
     do índice resolvido — e aí renomear a tarefa deixaria o texto mentindo, que é exatamente o que
     resolver por id deveria evitar.
   - Uma requisição por chip na aba Network: a resolução não está em lote.
