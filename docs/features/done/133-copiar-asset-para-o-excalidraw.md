---
prompt: |
  colocar um acesso rápido à biblioteca de ícones, assim como componente para fazer o upload, pra eu conseguir , copiar e colar assets para o excalidraw

  ---
  Fatia desta feature (decidida no desenho de 2026-09-24). Terceira e última das três rodadas: a
  131 extraiu a biblioteca do popover de ícone de tarefa, a 132 a colocou como painel "Orbyva
  Assets" à esquerda da tela do canvas copiando a URL do asset. **Esta** entrega o que o pedido
  quer de verdade — "copiar e colar assets para o excalidraw" —, pondo o asset no clipboard no
  formato que o `paste` do Excalidraw entende.

  Em que formato o asset vai para o clipboard? Recomendada no desenho: "PNG/JPEG/WebP como
  `ClipboardItem` de imagem (`fetch` da URL pública → blob) e SVG como texto — é o par que o
  `paste` do Excalidraw entende sem plugin". Resposta do usuário: "ISSO".

  E quando o clipboard de imagem não estiver disponível (Safari fora de gesto do usuário, contexto
  sem permissão)? Recomendada: "cair para 'Copiar link' (`writeText` da URL pública) e dizer isso
  no toast — o Excalidraw aceita a URL colada como texto". Resposta do usuário: "recomendado".

  Decisões do desenho que valem aqui:
  - Nada do Excalidraw é importado fora de `src/pages/admin/notes/ExcalidrawCanvas.tsx` (teto de
    160 KB gzip por rota, `npm run check:bundle`). A ponte entre a biblioteca e o desenho é o
    clipboard, nunca a API da lib.
  - Todo "copiar" do app até aqui é `navigator.clipboard.writeText`
    (`src/pages/admin/notes/CanvasEditor.tsx:200-222`); imagem exige `ClipboardItem`, que é API
    diferente e falha diferente.
  - Fora do escopo: editor de asset, pastas/tags na biblioteca, trocar o bucket ou o teto de 1 MB.
---

# 133 — Copiar o asset para o Excalidraw (imagem, SVG e fallback de link)

## Contexto
Depende de: 131, 132.

Com a 132 o painel "Orbyva Assets" já existe na tela do canvas e o clique copia a URL pública do
asset. Colar URL funciona, mas é o caminho de fallback: o Excalidraw precisa buscar a imagem de
novo, e em contexto sem rede/CORS o que entra no desenho é texto. O que o pedido descreve é copiar
o **asset**, não o endereço dele.

O `paste` do Excalidraw entende duas coisas sem plugin: uma imagem no clipboard (item de imagem) e
markup de SVG como texto. Os assets da biblioteca são exatamente PNG, JPEG, WebP e SVG
(`EXTENSION_BY_MIME` em `src/api/tasks/iconAssets.ts:44-48`), então o par cobre o acervo inteiro.

A armadilha que decide o desenho desta rodada: **os navegadores só aceitam `image/png` num
`clipboard.write`**. Chromium e WebKit recusam `image/jpeg` e `image/webp` com
`NotAllowedError: Type image/jpeg not supported on write` — copiar o blob "como veio" funcionaria
só para PNG e falharia silenciosamente na metade da biblioteca.

## Decisões
- **Três caminhos, decididos pela extensão da URL pública** (o `icon_asset` guarda `name` e `url`,
  não o mime — `src/types/tasks.ts:294-301`):
  - `.svg` → `writeText` do markup buscado da URL. O Excalidraw cola SVG como texto.
  - `.png` → `ClipboardItem({ "image/png": blob })`.
  - `.jpg` / `.jpeg` / `.webp` → **transcodificados para PNG** num `<canvas>` antes de ir ao
    clipboard. É a única forma de o clipboard aceitar; o bucket `task-icons` é público e responde
    com CORS liberado, então `img.crossOrigin = "anonymous"` evita o canvas "tainted".
  - Qualquer falha em qualquer um desses (sem `ClipboardItem`, `write` rejeitado, fetch falhando,
    canvas sujo) → `writeText(asset.url)` e o toast **diz** que copiou o link, não a imagem
    (resposta do usuário: "recomendado").
- **O `ClipboardItem` é construído com a `Promise<Blob>`, sem `await` antes.** Safari invalida a
  escrita se a chamada sair do gesto do usuário; passar a promessa para dentro do `ClipboardItem`
  (que a especificação aceita) é o que mantém o gesto vivo enquanto o `fetch` acontece. Esse
  detalhe some numa refatoração desatenta e o sintoma é "só quebra no Safari".
- **A decisão de formato é regra pura, em `src/domain/notes/assetClipboard.ts`**, separada da
  execução. Fica em `domain/notes` e não em `domain/tasks` porque o que ela modela é *o que o
  canvas cola*, não o que a biblioteca guarda — e é `domain/notes` que já hospeda
  `canvasScene.ts`.
- **A execução mora em `src/lib/assetClipboard.ts` com as dependências injetáveis**
  (`fetch`, `clipboard`, `ClipboardItem`, transcodificador). É o que permite testar os quatro
  caminhos e os modos de falha sem navegador — a skill `next` e o `CLAUDE.md` proíbem verificação
  por Chrome, e clipboard de imagem não existe em jsdom.
- **Uma função, um resultado tipado**: `copyAssetToClipboard` devolve
  `"image" | "svg-text" | "link"`, e é o painel que escolhe o toast. Assim o texto que o usuário lê
  nunca diverge do que de fato foi para o clipboard — o defeito clássico dessa tela é o toast dizer
  "copiado" quando o `write` foi rejeitado.
- **O painel não ganha botão novo**: o clique no asset continua sendo o gesto, só muda o que ele
  copia. O `aria-label` passa de "Copiar" a `Copiar ${asset.name}` com o formato entre parênteses
  quando ajudar o leitor de tela.
- **Nada de importar Excalidraw para "inserir direto no desenho".** Existiria API para isso, mas
  ela puxaria 2,7 MB para o chunk do painel; o clipboard é a ponte decidida no desenho.

## Tarefas
- [x] `src/domain/notes/assetClipboard.ts` — regra pura: `assetClipboardKind(url: string):
      "svg" | "png" | "raster" | "unknown"` pela extensão (ignorando query string e caixa), mais as
      frases de cada resultado (`ASSET_COPY_MESSAGE.image` / `.svgText` / `.link`), com a do link
      dizendo que a imagem não pôde ser copiada e que o link foi copiado no lugar.
      Verificação: `npm run build`
- [x] Testar a regra em `src/domain/notes/__tests__/assetClipboard.test.ts`: `.png`, `.PNG`,
      `.svg`, `.jpg`, `.jpeg`, `.webp`, URL com `?token=…`, URL sem extensão (→ `unknown`, que vai
      pelo caminho de fallback). Verificação: `npm test src/domain/notes/__tests__/assetClipboard.test.ts`
- [x] `src/lib/assetClipboard.ts` — `copyAssetToClipboard(asset: { name: string; url: string },
      deps?)` devolvendo `"image" | "svg-text" | "link"`. Assinatura com `deps` opcional
      (`fetchFn`, `clipboard`, `clipboardItem`, `toPngBlob`) caindo nos globais do navegador por
      padrão. Caminho SVG: `fetch` → `text()` → `writeText`. Caminho PNG: `ClipboardItem` montado
      **sem `await`**, com a promessa do blob dentro. Verificação: `npm run build`
- [x] Transcodificação de JPEG/WebP para PNG no mesmo arquivo: `<img crossOrigin="anonymous">` →
      `canvas.drawImage` → `canvas.toBlob("image/png")`, embrulhada na promessa entregue ao
      `ClipboardItem` (de novo: sem `await` antes de construí-lo). Verificação: `npm run build`
- [x] Fallback único e explícito: qualquer `throw`/rejeição dos caminhos acima, ou
      `typeof ClipboardItem === "undefined"`, cai em `writeText(asset.url)` e devolve `"link"`. Se
      **isso** também falhar, o erro sobe para quem chamou (é o único caso em que o usuário precisa
      ver toast destrutivo). Verificação: `npm run build && npm run lint`
- [x] `src/lib/__tests__/assetClipboard.test.ts` com dependências falsas (roda em ambiente "node",
      sem jsdom): PNG escreve um `ClipboardItem` com a chave `image/png` e o blob buscado; SVG
      escreve **texto** com o markup (e não a URL); JPEG passa pelo transcodificador antes de
      escrever `image/png`; sem `ClipboardItem` no ambiente → escreve a URL e devolve `"link"`;
      `write` rejeitado → escreve a URL e devolve `"link"`; `fetch` falhando → devolve `"link"`;
      `writeText` do fallback falhando → a função lança.
      Verificação: `npm test src/lib/__tests__/assetClipboard.test.ts`
- [x] Trocar o `onSelect` do `CanvasAssetsPanel` (132) por `copyAssetToClipboard`, com estado de
      "copiando" no item clicado (evita clique duplo disparar duas escritas) e um toast por
      resultado, tirado de `ASSET_COPY_MESSAGE`. O toast do caminho `"link"` **não** pode dizer que
      copiou a imagem. Verificação: `npm run build && npm run lint`
- [x] Atualizar `src/pages/admin/notes/__tests__/CanvasAssetsPanel.test.tsx`: clicar num asset PNG
      escreve imagem no clipboard falso e mostra o toast de imagem copiada; asset `.svg` escreve o
      markup como texto; ambiente sem `ClipboardItem` mostra o toast de link copiado (e o clipboard
      recebeu a URL); dois cliques rápidos no mesmo item não disparam duas escritas. O teste de que
      o clique copia a URL "crua" (da 132) é substituído por estes — registre isso nas Notas.
      Verificação: `npm test src/pages/admin/notes/__tests__/CanvasAssetsPanel.test.tsx`
- [x] Fechar a rodada: `npm run build && npm run lint && npm test && npm run check:bundle`, com a
      contagem de arquivos/testes registrada nesta linha e `Bundle budget OK.` confirmado.
      **Resultado (2026-09-24)**: build `✓ built in 1m 9s` + `precache 507 entries`;
      lint `✖ 88 problems (0 errors, 88 warnings)` (a linha de base do repo);
      suíte inteira `Test Files 293 passed (293)` / `Tests 3239 passed (3239)`, contra a base de
      291/3208 — +2 arquivos e +31 testes, todos desta feature (11 no domínio, 17 na `lib`, +3
      líquidos no painel); `Bundle budget OK.` confirmado, ou seja o chunk de `/notes` não engordou.
      A suíte roda com `--maxWorkers=3` (`npx vitest run --maxWorkers=3`): a paralelização padrão
      tem flakiness de ambiente já confirmada na base limpa.
      Verificação: `npm run build && npm run lint && npm test && npm run check:bundle`

## Prompts

Nenhum pedido novo do usuário durante a implementação — só o `prompt:` do frontmatter.

## Notas

- **Os dois testes de "o clique copia a URL crua" da 132 saíram**, como a própria tarefa previa:
  `CanvasAssetsPanel.test.tsx` agora prova imagem (`image/png`), SVG como texto, o fallback de link
  e o clique duplo. O caso de "clipboard que rejeita" sobreviveu, mas com outro significado: agora
  ele exige que **até o `writeText` do fallback** falhe para virar toast destrutivo — antes bastava
  uma rejeição qualquer.
- Junto com eles saíram os exports `ASSET_COPIED_TITLE` / `ASSET_COPIED_HINT` do painel: as frases
  passaram a viver em `ASSET_COPY_MESSAGE` (`src/domain/notes/assetClipboard.ts`). Ninguém mais os
  importava (`ASSETS_PANEL_TITLE`, que `CanvasEditor.test.tsx` usa, continua exportado).
- **Desvios meus, sem pedido do usuário:**
  - `AssetCopyResult` (`"image" | "svg-text" | "link"`) foi declarado no **domínio**, não em
    `src/lib`. O `lib` importa o tipo de lá. Motivo: o painel precisa do vocabulário para escolher
    a frase, e assim ele importa `domain` para texto e `lib` para ação, sem inverter a camada.
  - Acrescentei `assetCopyMessage(result)` ao domínio — o plano previa só as três frases em
    `ASSET_COPY_MESSAGE`. Com o mapa `resultado → frase` em função, o painel não tem como escolher
    o texto por conta própria, que é o defeito que a decisão "uma função, um resultado tipado"
    queria impedir.
  - `transcodeToPngBlob` ficou **exportada e testada direto**, com `Image` e `<canvas>` falsos
    (`vi.stubGlobal`) no teste de `lib`. O plano só pedia o transcodificador injetável; testá-lo
    por dentro é o que trava o `crossOrigin = "anonymous"`, cuja perda só apareceria como
    `SecurityError` no navegador — verificação proibida aqui.
  - O guarda de clique duplo é um `useRef`, com o `useState` só para o rótulo. Dois cliques no
    mesmo tick leem o mesmo estado (o novo só chega no render seguinte), então um guarda por
    `useState` deixaria as duas escritas passarem. O teste dispara dois `fireEvent.click` no mesmo
    tick exatamente por isso.

## Como testar

Este roteiro só faz sentido com a **131** e a **132** implementadas — é o painel "Orbyva Assets" da
132, na tela do canvas, que ganha o comportamento novo.

As três frases que o toast pode mostrar são as de `ASSET_COPY_MESSAGE`
(`src/domain/notes/assetClipboard.ts`), e é por elas que se distingue o que foi copiado:

| Título do toast | Descrição | Significa |
| --- | --- | --- |
| **Asset copiado** | Cole no desenho (Ctrl/Cmd+V). | a **imagem** foi para o clipboard (PNG, JPEG ou WebP) |
| **SVG copiado** | Cole no desenho (Ctrl/Cmd+V). | o **markup** do SVG foi para o clipboard, como texto |
| **Link copiado** | Não foi possível copiar a imagem — copiamos o link no lugar. Cole no desenho (Ctrl/Cmd+V) e a imagem vem pela URL. | caiu no fallback |
| **Não foi possível copiar** (vermelho) | a mensagem do erro | nem o link foi escrito — é o único toast destrutivo |

1. **Pré-requisitos**
   - Nenhuma migration nova.
   - `npm run dev`, login normal, em **https** ou `localhost`. A API de clipboard só existe em
     contexto seguro: em `http://` de rede local não há `navigator.clipboard`, e aí nem o fallback
     de link tem onde escrever — o toast é o vermelho. Não é defeito da feature, é o navegador.
   - A aba precisa estar **em foco** na hora do clique: o navegador recusa escrever no clipboard de
     um documento sem foco, e aí o toast é o vermelho, não o de link.
   - Um canvas em `/notes/<id>` (crie com "Novo canvas" em `/notes`).
   - Quatro assets na biblioteca, um de cada tipo: um PNG, um JPEG, um WebP e um SVG. Envie pelo
     próprio painel ("Enviar imagem" / "Colar SVG") — o seletor aceita exatamente
     `image/png,image/jpeg,image/webp,image/svg+xml`, e o JPEG é gravado no bucket com a extensão
     `.jpg`, que é o que faz o caminho de transcodificação ser exercitado.
   - Navegador baseado em Chromium para o caminho feliz; Safari para o caso de borda.

2. **Verificação automatizada** — um comando por linha:
   - `npm test src/domain/notes/__tests__/assetClipboard.test.ts` — passou = `11 passed (11)`: a
     extensão da URL escolhe o caminho certo, inclusive com query string, com `.PNG` maiúsculo e
     sem extensão, e cada resultado tem a sua frase.
   - `npm test src/lib/__tests__/assetClipboard.test.ts` — passou = `17 passed (17)`: os quatro
     caminhos e os modos de falha se comportam como descrito (PNG vai como `image/png`, SVG vai
     como texto, JPEG é transcodificado, toda falha cai no link, e o `ClipboardItem` é construído
     **antes** do blob chegar — o teste com `fetch` que nunca resolve é o que trava isso).
   - `npm test src/pages/admin/notes/__tests__/CanvasAssetsPanel.test.tsx` — passou =
     `13 passed (13)`: o painel chama a função certa, o toast corresponde ao resultado real da
     escrita, e dois cliques no mesmo tick geram uma escrita só.
   - `npm run build && npm run lint && npm run check:bundle` — passou = `tsc` sem erro, lint com
     `0 errors` (88 warnings é a linha de base do repo) e `Bundle budget OK.`.
   - A suíte inteira roda com `npx vitest run --maxWorkers=3` — hoje `293 passed` arquivos /
     `3239 passed` testes.

3. **Verificação manual, passo a passo**
   1. Abra `/notes/<id>` de um canvas. **Esperado**: painel "Orbyva Assets" à esquerda, com os
      quatro assets.
   2. Clique no asset **PNG**. **Esperado**: toast **"Asset copiado"** com "Cole no desenho
      (Ctrl/Cmd+V)." — e **não** "Link copiado".
   3. Clique dentro do desenho e cole (Ctrl/Cmd+V). **Esperado**: a imagem aparece como elemento do
      desenho, já posicionada — **sem** aparecer texto de URL.
   4. Desenhe/arraste qualquer coisa e espere ~2 s. **Esperado**: o indicador vai para "Salvando…" e
      "Salvo"; recarregar a página mostra a imagem colada ainda lá (ela virou parte da cena).
   5. Clique no asset **SVG** e cole no desenho. **Esperado**: toast **"SVG copiado"** (título
      diferente do passo 2, de propósito) e o desenho recebe o SVG como elemento/imagem, não um
      bloco de texto com `<svg …>`.
   6. Clique no asset **JPEG** e cole. **Esperado**: toast **"Asset copiado"**, igual ao PNG — a
      conversão para PNG é invisível para quem usa.
   7. Repita com o **WebP**. **Esperado**: idem.
   8. Cole fora do Orbyva (num editor de texto qualquer) logo depois de copiar o SVG. **Esperado**:
      aparece o markup `<svg …>` — é a confirmação de que o SVG vai como texto, por decisão.

4. **Casos de borda e caminhos negativos**
   - **Safari**: repita os passos 2-3. **Esperado**: ou a imagem cola normalmente ("Asset
     copiado"), ou o toast é **"Link copiado"** e colar no desenho traz a imagem pela URL. O que
     não pode acontecer é "Asset copiado" com clipboard vazio.
   - **Sem permissão de clipboard** (negue a permissão nas configurações do site e recarregue):
     clicar num asset mostra **"Link copiado"**; colar no desenho traz a imagem pela URL.
   - **Contexto inseguro** (`http://` no IP da máquina): sem `navigator.clipboard` o toast é o
     vermelho **"Não foi possível copiar"** — é o único caso em que o erro sobe, porque nem o link
     dá para escrever. Com clipboard mas sem `ClipboardItem`, o toast é "Link copiado".
   - **Asset apagado do bucket** (caso raro: linha existe, arquivo não): o `fetch` volta 404, o
     clique cai em **"Link copiado"**; colar no desenho não traz imagem nenhuma, o que é o
     comportamento esperado para um arquivo que não existe mais.
   - **Clique duplo rápido** no mesmo asset: um toast só, uma escrita só. Durante a cópia o rótulo
     do botão vira "Copiando <nome>" (leitor de tela).
   - **Offline**: clicar num asset cai em **"Link copiado"** (o `fetch` falha).

5. **Sinais de que quebrou**
   - Colar no desenho produz o **texto da URL** em vez da imagem, com toast dizendo "Asset copiado"
     → o `write` foi rejeitado e o resultado não foi propagado para o toast (o contrato
     `"image" | "svg-text" | "link"` existe para impedir exatamente isso).
   - `NotAllowedError: Type image/jpeg not supported on write` no console → a transcodificação para
     PNG deixou de acontecer para JPEG/WebP.
   - `SecurityError` / canvas "tainted" no console ao copiar JPEG ou WebP → o
     `img.crossOrigin = "anonymous"` sumiu do transcodificador.
   - Funciona no Chrome e falha só no Safari → alguém pôs um `await` antes de construir o
     `ClipboardItem` e o gesto do usuário se perdeu (o teste "monta o ClipboardItem sem esperar o
     blob" é o que deveria ter pegado isso).
   - Dois toasts ou duas escritas num clique duplo → o guarda de clique duplo virou `useState` em
     vez de `useRef` e o segundo clique passou a ler o estado antigo.
   - `npm run check:bundle` acusando o chunk de `/notes` → alguém importou o Excalidraw para
     "inserir direto no desenho".
