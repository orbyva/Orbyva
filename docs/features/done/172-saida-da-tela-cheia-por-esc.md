---
prompt: |-
  colocar em tela cheia o excalidraw

  Fatia desta feature — a saída por teclado do modo tela cheia que a 171 criou.

  Decidido no desenho:

  - P3 "Como se sai?" → **Resposta: isso** = aceita a recomendada: "botão de sair na barra flutuante
    **e** `Esc`, com o `Esc` ignorado quando o Excalidraw estiver com seleção ativa ou um painel
    dele aberto — sem o botão, `Esc` sozinho vira armadilha". O botão saiu na 171; aqui entra o
    `Esc` com essa guarda.
  - O motivo da guarda: "Excalidraw usa `Esc` para a própria seleção; o modo precisa de saída
    explícita além da tecla". Um `Esc` que sai da tela cheia enquanto o usuário só queria limpar a
    seleção (ou fechar o seletor de cor) arranca a pessoa do desenho.
  - "Entrada e saída não podem remontar o `ExcalidrawCanvas`: remontar recarrega `initialData`
    (`ExcalidrawCanvas.tsx:42-47`) e joga fora a cena não salva do momento. O nó tem que ser o mesmo
    nos dois modos." Continua valendo — nada aqui pode introduzir remontagem.
  - Fora: mudar autosave, cena, tema ou qualquer contrato de `src/domain/notes/canvasScene.ts`.
    Fora: `CanvasBlock` (`src/components/markdown/CanvasBlock.tsx:28`), SVG exportado e estático.
---

# 172 — Saída da tela cheia por `Esc`

## Contexto
Depende de: 171. O modo tela cheia, o contêiner `fixed inset-0 z-50`, a barra fina e o botão "Sair
da tela cheia" são da 171 — esta feature só acrescenta a saída pelo teclado.

O `Esc` não pode ser cego: o Excalidraw usa a mesma tecla para limpar a seleção, fechar o seletor de
cor, fechar a biblioteca, sair da edição de um texto e cancelar o editor de linha. Um `Esc` que sai
do modo cheio nesses momentos tira a pessoa do desenho quando ela só queria desfazer um estado
interno do editor. A guarda precisa ler o `appState` **vivo** do Excalidraw — e hoje o
`CanvasEditor` não tem acesso a ele: `toCanvasData` (`src/domain/notes/canvasScene.ts:55-71`)
descarta de propósito todo o estado volátil (seleção, ponteiro, menus) antes de entregar a cena, e
é só isso que sai de `onSceneChange`.

## Decisões
- **Ler o `appState` sob demanda, não a cada movimento.** `ExcalidrawCanvas` ganha uma prop
  opcional que devolve a API imperativa do Excalidraw (`excalidrawAPI` —
  `node_modules/@excalidraw/excalidraw/dist/types/excalidraw/types.d.ts:408`, com `getAppState` em
  `:612`), e o `CanvasEditor` guarda essa API numa **ref**. A alternativa — encaminhar o `appState`
  do `onChange` — dispararia trabalho a cada movimento do ponteiro, que é exatamente o que
  `sceneRef` evita no autosave (`CanvasEditor.tsx:109-110`: "Ref, não estado: re-render por traço
  travaria o canvas").
- **O tipo da API atravessa a fronteira estruturalmente.** A prop é tipada como
  `{ getAppState: () => Record<string, unknown> }`, não como `ExcalidrawImperativeAPI`. Quem chama
  continua sem importar nada de `@excalidraw/excalidraw` — é a mesma regra que já mantém
  `ExcalidrawCanvas.tsx` como "o único ponto do app com `import` da lib" (`:9-14`), e o que segura o
  teto de 160 KB gzip de `npm run check:bundle`.
- **A decisão de quem é o `Esc` é função pura, em `domain/`.** Vive em
  `src/domain/notes/canvasEscape.ts`, recebe `Record<string, unknown>` e devolve `boolean`. É o que
  torna a regra testável com Vitest sem carregar os 2,7 MB do Excalidraw — o mesmo arranjo de
  `canvasScene.ts`, que documenta no cabeçalho por que a lógica mora fora do componente.
- **O que conta como "o Excalidraw fica com o `Esc`"**, por campo de `appState` (referências em
  `types.d.ts`): `selectedElementIds` com qualquer id ativo (`:279`), `editingGroupId` (`:308`),
  `editingTextElement` (`:213`), `selectedLinearElement` (`:331`), `croppingElementId` (`:344`),
  `openMenu` (`:253`), `openPopup` (`:254`), `openSidebar` (`:255`), `openDialog` (`:259`) e
  `contextMenu` (`:166`).
- **`activeTool` fica de fora da guarda, de propósito.** O Excalidraw também usa `Esc` para voltar à
  ferramenta de seleção, mas com a ferramenta travada (*keep tool active*) esse estado não se
  desfaz sozinho — incluí-lo criaria um modo do qual `Esc` nunca sai. P3 fala em "seleção ativa ou
  um painel dele aberto", e é só isso que a guarda cobre. Decisão tomada nesta decomposição.
- **Sem API disponível, `Esc` sai.** Se a ref ainda está vazia (o chunk lazy do Excalidraw não
  chegou, ou a lib não entregou a API), o `Esc` sai do modo cheio. Falha aberta: o botão da 171
  continua sendo a saída garantida, e um `Esc` que não faz nada é pior que um que sai cedo demais.
- **O listener só existe enquanto o modo está ligado.** `useEffect` com `isFullscreen` na
  dependência, `keydown` em `window` na fase de bolha, `removeEventListener` no cleanup. Em modo
  normal não há listener nenhum, então `Esc` em cima do canvas continua sendo assunto exclusivo do
  Excalidraw.
- **Nada aqui pode remontar o `ExcalidrawCanvas`.** A prop nova é um callback estável (`useCallback`
  ou função de ref), não um objeto recriado a cada render que mudaria a identidade das props.

## Tarefas
- [x] Criar `src/domain/notes/canvasEscape.ts` com `excalidrawHandlesEscape(appState: Record<string,
      unknown> | null | undefined): boolean`, cobrindo os campos listados em Decisões
      (`selectedElementIds` com alguma chave ativa, `editingGroupId`, `editingTextElement`,
      `selectedLinearElement`, `croppingElementId`, `openMenu`, `openPopup`, `openSidebar`,
      `openDialog`, `contextMenu`). `appState` nulo ou vazio → `false`. Comentar no cabeçalho por
      que o arquivo não importa `@excalidraw/excalidraw` (mesmo motivo de `canvasScene.ts:6-9`).
- [x] Criar `src/domain/notes/__tests__/canvasEscape.test.ts` com um caso por campo: cada um sozinho
      devolve `true`; `appState` limpo devolve `false`; `selectedElementIds: {}` (objeto vazio)
      devolve `false`; `selectedElementIds: { a: true }` devolve `true`; `null`/`undefined`
      devolvem `false`.
- [x] Em `src/pages/admin/notes/ExcalidrawCanvas.tsx`, acrescentar ao contrato de props
      (`:19-31`) a prop opcional `onApiReady?: (api: { getAppState: () => Record<string, unknown> })
      => void` e ligá-la ao atributo `excalidrawAPI` do `<Excalidraw>` (`:39-62`). Documentar no
      JSDoc que o tipo é estrutural de propósito, para o tipo da lib não vazar para fora do módulo.
- [x] Em `src/pages/admin/notes/CanvasEditor.tsx`, criar `excalidrawApiRef` e passar um callback
      estável em `onApiReady` para o `<ExcalidrawCanvas>`, guardando a API na ref sem `setState`.
- [x] No `CanvasEditor`, acrescentar o `useEffect` do `Esc`: só registra `keydown` em `window`
      quando `isFullscreen`; ignora eventos com `event.defaultPrevented`; lê
      `excalidrawApiRef.current?.getAppState()` e, se `excalidrawHandlesEscape(...)` for `true`, não
      faz nada (deixa o Excalidraw tratar); caso contrário chama a mesma função de saída que o botão
      "Sair da tela cheia" usa — inclusive a devolução do foco ao botão "Tela cheia". Remover o
      listener no cleanup.
- [x] Estender o duplo do Excalidraw em
      `src/pages/admin/notes/__tests__/CanvasEditor.fullscreen.test.tsx` (criado na 171) para também
      chamar `onApiReady` com um `getAppState` controlável pelo teste — no mesmo molde do
      `sceneSpy` de `CanvasEditor.test.tsx:21-42` (`vi.hoisted`).
- [x] No mesmo arquivo, acrescentar os casos do `Esc`: (a) em tela cheia com
      `getAppState` devolvendo `{ selectedElementIds: { r1: true } }`, `Esc` **não** sai — a barra
      "Sair da tela cheia" continua visível; (b) com `getAppState` devolvendo `{ openPopup:
      "elementStroke" }`, `Esc` **não** sai; (c) com `appState` limpo, `Esc` sai e o botão "Tela
      cheia" volta a aparecer; (d) dois `Esc` seguidos, o primeiro com seleção e o segundo limpo,
      saem do modo no segundo (é o comportamento de duas etapas que a guarda produz).
- [x] No mesmo arquivo, os casos de borda: (e) com a ref de API vazia (duplo que não chama
      `onApiReady`), `Esc` sai do modo; (f) em modo normal, `Esc` não muda nada na tela e não lança;
      (g) depois de sair do modo, disparar `Esc` de novo não faz nada — o listener foi removido.
- [x] Rodar `npm test -- src/domain/notes/__tests__/canvasEscape.test.ts
      src/pages/admin/notes/__tests__/CanvasEditor.fullscreen.test.tsx
      src/pages/admin/notes/__tests__/CanvasEditor.test.tsx`, `npm run lint`, `npm run build` e
      `npm run check:bundle` — este último importa aqui porque a feature mexe em
      `ExcalidrawCanvas.tsx`.

## Prompts

## Notas

Desvios do desenho, decididos na implementação (nenhum pedido do usuário no meio — por isso estão
aqui e não em `## Prompts`):

- **Um teste a mais, não previsto: `src/pages/admin/notes/__tests__/ExcalidrawCanvas.api.test.tsx`.**
  O plano cobria a guarda (domínio) e o `Esc` (componente, com o Excalidraw de mentira), mas a
  **fiação** da tarefa 3 — `onApiReady` chegar ao atributo `excalidrawAPI` e o adaptador repassar o
  `getAppState` — ficava provada só pelo `tsc`, que é exatamente o que a skill `next` proíbe como
  prova única. O teste novo renderiza o `ExcalidrawCanvas` de verdade com
  `vi.mock("@excalidraw/excalidraw")`: a lib nunca é carregada (3 casos em 14 ms) e a afirmação é
  sobre a prop que a lib recebeu.
- **A saída virou uma função só, `exitFullscreen` (`useCallback`).** O plano pedia que o `Esc`
  chamasse "a mesma função de saída que o botão usa"; o botão da 171 tinha um arrow inline. Extrair
  é o que torna "a mesma" verificável — e há um teste (`o botão de sair ignora a guarda`) fixando
  que a guarda vale só para a tecla.
- **O adaptador de tipo precisou de `() => unknown` no meio do caminho.** `ExcalidrawImperativeAPI`
  é uma `interface`, e interface não é atribuível a `Record<string, unknown>` (sem index signature
  implícita): passar `onApiReady` direto em `excalidrawAPI` não compila. O `handleApiReady` de
  `ExcalidrawCanvas.tsx` recebe `{ getAppState: () => unknown }` — que a interface satisfaz — e faz
  o único cast, dentro do único módulo que pode ver o tipo da lib. A prop exportada continua
  estrutural, e nada de `@excalidraw/*` vazou (`NoteDetail` segue em 12,3 KB gzip).
- **`event.defaultPrevented` ganhou caso próprio.** Está nas tarefas, mas não na lista de testes do
  plano; sem afirmação, o `return` seria código sem prova. O caso simula um diálogo do Radix que
  fecha no `Esc` e marca o evento como tratado.
- **Duas afirmações a mais sobre a decisão "nada pode remontar / o callback é estável"**: o duplo
  conta as entregas de API (`apiReadyCalls`) num `useEffect` com `[onApiReady]` na dependência de
  propósito — prop instável apareceria aqui como entrega repetida —, e o teste do listener compara a
  **identidade do handler** passado a `addEventListener` e a `removeEventListener`. Sem essa
  segunda, "depois de sair, outro `Esc` não faz nada" passaria mesmo sem cleanup, porque sair duas
  vezes é idempotente.
- **Por que a saída em duas etapas funciona no app de verdade.** O handler do Excalidraw está em
  `document` e o nosso em `window`, na bolha: quando o nosso roda, o React ainda não aplicou o
  `setState` que limpa a seleção, então `getAppState()` devolve o estado de **antes** da tecla. É
  essa defasagem que faz o primeiro `Esc` ser dele e o segundo ser nosso — e é o que o caso "dois
  `Esc` seguidos" reproduz trocando o `appState` do duplo entre as duas teclas.
- **Cada branch foi provada por mutação, não por leitura.** Removendo a guarda: 3 casos caem;
  removendo o cleanup do listener: 1; removendo o `defaultPrevented`: 1; removendo
  `excalidrawAPI={…}`: 2; trocando o `useCallback` do `handleApiReady` por arrow inline: 1. Com a
  implementação entregue, 25 passam. Na regra pura, tratar `selectedElementIds` como verdadeiro por
  ser objeto derruba 4 casos.
- **O `describe` da 171 ficou intacto**; os casos do `Esc` entraram num segundo `describe` no mesmo
  arquivo, como o plano pedia.

## Como testar

Este roteiro só faz sentido com a **171 já implementada**: o modo tela cheia, a barra fina e o botão
"Sair da tela cheia" vêm de lá. Se não houver botão "Tela cheia" no cabeçalho do canvas, pare —
a dependência não está no ar.

1. **Pré-requisitos**
   - `npm install` feito; sem migration nova.
   - `npm run dev` de pé e login com um usuário que tenha notas.
   - Uma **nota do tipo canvas** com pelo menos dois traços desenhados (dois retângulos servem), em
     `/notes/<id>`.

2. **Verificação automatizada**
   - `npm test -- src/domain/notes/__tests__/canvasEscape.test.ts` — passou = **15 testes verdes**: a
     regra pura acerta campo a campo (um caso por campo da guarda), `selectedElementIds` vazio ou só
     com `false` conta como "sem seleção", `activeTool` travada **não** segura o `Esc`, e
     `null`/`undefined`/`{}` devolvem `false`.
   - `npm test -- src/pages/admin/notes/__tests__/CanvasEditor.fullscreen.test.tsx` — passou = **22
     testes verdes**: os 11 casos herdados da 171 (o modo, o mesmo nó do Excalidraw, autosave, trava
     de rolagem, foco) mais os do `Esc` — com seleção não sai, com `openPopup` não sai, limpo sai e
     devolve o foco ao botão "Tela cheia", dois `Esc` saem no segundo, sem API sai, `Esc` já tratado
     (`defaultPrevented`) não sai, em modo normal não faz nada, o listener de `keydown` nasce e morre
     com o modo, e o botão de sair continua ignorando a guarda.
   - `npm test -- src/pages/admin/notes/__tests__/ExcalidrawCanvas.api.test.tsx` — passou = **3
     testes verdes**: `onApiReady` está ligado ao atributo `excalidrawAPI`, o `getAppState`
     repassado lê o estado **do momento da chamada**, e sem `onApiReady` o atributo nem é ligado
     (é o caso do canvas embutido, só leitura). O `@excalidraw/excalidraw` é mockado aqui: se a
     suíte demorar segundos neste arquivo, a lib de verdade entrou — é defeito.
   - `npm test -- src/pages/admin/notes/__tests__/CanvasEditor.test.tsx` — passou = **13 testes
     verdes**, a suíte original do editor (autosave, tema, "Copiar referência") sem uma linha
     editada: a prop nova é opcional e não mudou nada do que já existia.
   - `npm run lint` — passou = `0 errors` (o projeto convive com 88 warnings de
     `react-refresh/only-export-components`, todos anteriores a esta feature).
   - `npm run build` — passou = `tsc -b` + `vite build` sem erro. Erro citando
     `ExcalidrawImperativeAPI` aqui significaria que o tipo da lib vazou para fora de
     `ExcalidrawCanvas.tsx`.
   - `npm run check:bundle` — passou = termina com `Bundle budget OK.`; a linha
     `[OK ] route ... NoteDetail-*.js` fica na casa de 12 KB gzip (teto 160 KB), ou seja, o tipo
     estrutural manteve os 2,7 MB do Excalidraw fora do chunk da rota.

3. **Verificação manual, passo a passo**
   1. Abrir a nota de canvas e clicar em "Tela cheia". Esperado: o desenho ocupa a janela inteira,
      com a barra fina no topo.
   2. Clicar num retângulo do desenho para selecioná-lo (aparecem as alças de redimensionar) e
      apertar `Esc`. Esperado: a seleção some e o app **continua em tela cheia**.
   3. Apertar `Esc` de novo, agora sem nada selecionado. Esperado: sai da tela cheia e volta a
      página normal da nota, com título, "Projeto", links e backlinks.
   4. Entrar em tela cheia outra vez, abrir o seletor de cor de traço do Excalidraw (painel da
      esquerda, quadradinho de cor) e apertar `Esc`. Esperado: o seletor fecha e o app **continua em
      tela cheia**.
   5. Repetir com a biblioteca do Excalidraw (botão no canto superior direito): abrir e apertar
      `Esc`. Esperado: a biblioteca fecha, o modo cheio permanece.
   6. Dar duplo clique numa área vazia para começar a escrever um texto, digitar algo e apertar
      `Esc`. Esperado: sai da edição do texto (o texto fica no desenho) e o modo cheio permanece.
   7. Com nada selecionado e nenhum painel aberto, apertar `Esc`. Esperado: sai do modo cheio, e o
      foco do teclado fica no botão "Tela cheia" (apertar `Enter` ali volta ao modo cheio).

4. **Casos de borda e caminhos negativos**
   - **`Esc` fora do modo cheio**: na página normal da nota, apertar `Esc` com o cursor no campo de
     título. Esperado: nada acontece de anormal — nenhum modo é ligado ou desligado, nenhum erro no
     console.
   - **Traço não salvo na hora do `Esc`**: desenhar um traço e apertar `Esc` (sem seleção) menos de
     1,5 s depois, ainda com "Salvando…" na barra. Esperado: sai do modo cheio e, em 2 s, o traço
     aparece como "Salvo" na página normal — sair do modo não remonta o editor nem descarta a cena.
   - **`Esc` antes de o canvas carregar**: entrar na nota com a rede lenta (DevTools → Network →
     Slow 3G), clicar em "Tela cheia" enquanto ainda aparece o esqueleto "Carregando o canvas" e
     apertar `Esc`. Esperado: sai do modo cheio (a API ainda não existe, e a saída é aberta) — não
     fica preso.
   - **Sair pelo botão continua funcionando**: em tela cheia com um retângulo selecionado, clicar em
     "Sair da tela cheia". Esperado: sai na hora — a guarda vale só para a tecla, nunca para o
     botão.
   - **Menu de contexto do Excalidraw**: em tela cheia, clicar com o botão direito no desenho e
     apertar `Esc`. Esperado: o menu fecha e o modo cheio permanece (`contextMenu` está na guarda).
   - **Canvas embutido em nota markdown**: abrir uma nota markdown com bloco ` ```orbyva-canvas ` e
     apertar `Esc`. Esperado: nada muda — `CanvasBlock` está fora do escopo.

5. **Sinais de que quebrou**
   - `Esc` saindo do modo cheio junto com a limpeza da seleção (uma tecla, dois efeitos): a guarda
     não está lendo o `appState` vivo — provavelmente a ref da API está vazia ou o callback de
     `onApiReady` foi recriado a cada render.
   - `Esc` nunca saindo, nem com o desenho limpo: a guarda está retornando `true` sempre — checar se
     `selectedElementIds: {}` (objeto vazio, que o Excalidraw sempre entrega) está sendo tratado
     como seleção.
   - Traço sumindo ao sair por `Esc`: o `ExcalidrawCanvas` remontou; a saída por tecla tem que
     chamar exatamente a mesma função do botão.
   - `Esc` continuando a agir depois de sair do modo (por exemplo, mexendo em outra tela de notas):
     o listener não foi removido no cleanup do `useEffect`.
   - Erro de tipo em `npm run build` apontando `ExcalidrawImperativeAPI`: o tipo da lib vazou para
     fora de `ExcalidrawCanvas.tsx` — a prop tem que ser estrutural.
