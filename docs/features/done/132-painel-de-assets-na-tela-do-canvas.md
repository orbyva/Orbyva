---
prompt: |
  colocar um acesso rápido à biblioteca de ícones, assim como componente para fazer o upload, pra eu conseguir , copiar e colar assets para o excalidraw

  ---
  Fatia desta feature (decidida no desenho de 2026-09-24). Segunda das três rodadas: a 131 extraiu
  a biblioteca do popover de ícone de tarefa para `src/components/assets/`; **esta** dá a ela o
  lugar pedido — a porta de acesso rápido dentro da tela onde o Excalidraw é editado; a 133 troca o
  que o clique copia (link → imagem/SVG no formato que o Excalidraw cola).

  Onde fica o acesso rápido? Resposta do usuário, verbatim: "PENSEI EM NA TELA DO CANVAS, ONDE
  EDITO O EXCALIDRAW, TER DO LADO ESQUERDO ABAIXO DAS PASTAS. UM ACESSO RÁPIDO PARA OS ÍCONES, OS
  MESMO QUE PODEM SER UTILIZADOS COMO MARCADORES EM TASKS ETC". Isso **substitui** a recomendação
  do desenho (rota própria `/assets` na sidebar + botão de diálogo no cabeçalho): não há rota nova,
  não há item novo na sidebar — o acesso é um painel à esquerda, na própria tela do canvas, e a
  biblioteca é a mesma dos ícones de tarefa, não uma paralela.

  Como se chama? Resposta do usuário: "orbyva assets".

  Decisões do desenho que valem aqui:
  - Nada do Excalidraw é importado fora de `src/pages/admin/notes/ExcalidrawCanvas.tsx`: o teto de
    160 KB gzip por rota (`npm run check:bundle`) é o motivo. A ponte entre a biblioteca e o
    desenho é o clipboard/DOM, nunca a API da lib.
  - Reusar `icon_asset` e o bucket `task-icons`, com a sanitização de SVG seguindo dentro de
    `uploadIconAsset`.
  - Teto de 1 MB por arquivo mantido, com o motivo dito na recusa (resposta do usuário:
    "recomendado").
---

# 132 — Painel "Orbyva Assets" na tela do canvas

## Contexto
Depende de: 131.

O canvas (`src/pages/admin/notes/CanvasEditor.tsx`) não tem nenhum acesso à biblioteca: quem desenha
precisa sair da nota, achar o arquivo original no disco e arrastar. O editor hoje é uma coluna só —
título + "Copiar referência" (`:227-250`), a caixa do desenho (`:252-280`, `h-[70vh] min-h-[420px]`)
e, embaixo, projeto, links e backlinks (`:283-293`).

O painel entra como coluna à esquerda da caixa do desenho, que é o "lado esquerdo" da tela do
canvas. Ele monta o `AssetLibrary` da 131 com `title="Orbyva Assets"` — a mesma lista que aparece no
popover de ícone de tarefa, porque é isso que o pedido diz ("os mesmos que podem ser utilizados como
marcadores em tasks").

**Espaço compartilhado com a rodada de tela cheia do canvas** (features 171 e 172, decompostas em
paralelo): ela mexe no mesmo contêiner (`CanvasEditor.tsx:252-280`) para virar `fixed inset-0`, e a
linha de ações do cabeçalho (`:231-250`) é dona dela. Esta feature **não** acrescenta nada ao
cabeçalho — o acesso é o painel —, então o conflito se resume ao contêiner do desenho: mantenha a
estrutura de irmãos estável (ver Decisões) e as duas convivem.

Nesta rodada o clique num asset copia a **URL pública** dele (`navigator.clipboard.writeText`, o
mesmo caminho de `CanvasEditor.tsx:200-222`). É de propósito: é o caminho de fallback já decidido no
desenho ("cair para 'Copiar link' e dizer isso no toast"), ele funciona em todo navegador e deixa o
painel útil desde o primeiro dia. A 133 põe a imagem no clipboard por `ClipboardItem` e rebaixa o
link a fallback, sem mexer no painel.

## Decisões
- **O painel é uma coluna dentro da área do canvas, não uma seção da barra lateral do app.** Duas
  razões: o pedido ancora o acesso "na tela do canvas, onde edito o excalidraw" (a sidebar aparece
  em todas as telas); e há uma rodada de "canvas em tela cheia" sendo desenhada em paralelo
  (overlay `fixed inset-0` por cima de tudo), que esconde a sidebar do app justamente no modo em
  que mais se desenha — um acesso que morasse lá sumiria na hora errada. Ficando dentro do mesmo
  contêiner do desenho, o painel acompanha o canvas se/quando a tela cheia existir.
- **Sem rota nova e sem item novo na sidebar.** A recomendação do desenho (`/assets` em
  Produtividade) foi substituída pela resposta do usuário. Gerenciar a biblioteca (renomear,
  excluir, enviar) acontece dentro do próprio painel, que já traz o modo "Gerenciar" da 131.
- **O estado aberto/fechado não é persistido.** Mesmo critério que a 171 aplica ao modo tela
  cheia: preferência de visualização gravada sem controle visível confunde mais do que ajuda.
  Abre aberto em tela larga, fechado abaixo de `sm`.
- **A lista só é buscada quando o painel está aberto** (`enabled` do `useAssetLibrary`). Abrir um
  canvas não pode disparar consulta de assets para quem nunca usa a biblioteca.
- **O painel não importa nada do Excalidraw** — nem tipo. Ele fala com o desenho pelo clipboard.
  `npm run check:bundle` é o teste dessa regra.
- **Clique copia o link nesta rodada**, com o toast dizendo exatamente isso ("Link copiado — cole no
  desenho"). Prometer "imagem" antes de a 133 existir seria mentir no toast.
- **Recolher o painel esconde (`hidden`), nunca desmonta — e o nó do `ExcalidrawCanvas` não muda de
  posição na árvore.** Remontar o Excalidraw recarrega `initialData` (`ExcalidrawCanvas.tsx:42-47`)
  e joga fora a cena que o debounce de 1,5 s ainda não gravou; e remover/acrescentar um irmão
  reordena o array de filhos, que é o suficiente para o React remontar o canvas. É a mesma regra
  que a rodada de tela cheia (171) aplica ao que some no modo cheio, e vale aqui pelo mesmo motivo.
- **A caixa do desenho não encolhe em tela larga por causa do painel**: o painel tem largura fixa
  (`w-56`) e o canvas fica com `flex-1`; a altura (`h-[70vh] min-h-[420px]`) passa para a linha
  inteira, e o painel rola por dentro (`overflow-y-auto`). Sem altura explícita no contêiner o
  Excalidraw colapsa — o comentário de `CanvasEditor.tsx:255` existe por isso.

## Tarefas
- [x] `src/pages/admin/notes/CanvasAssetsPanel.tsx` — o painel: cabeçalho "Orbyva Assets" com botão
      de recolher (`aria-expanded`, `aria-controls`), corpo montando `AssetLibrary` da 131 com
      `enabled={open}` e `title` já no cabeçalho (não repetir o rótulo duas vezes). Nenhum import
      de `@excalidraw/*` nem do barril `@/api/tasks`. Verificação: `npm run build && npm run lint`
- [x] Ligar o clique: `onSelect={(asset) => copiar a URL}` com
      `navigator.clipboard.writeText(asset.url)` e toast "Link copiado — cole no desenho
      (Ctrl/Cmd+V)."; falha do clipboard vira toast destrutivo com `getErrorMessage`, no mesmo
      molde de `CanvasEditor.tsx:200-222`. Cada item precisa de `aria-label` dizendo
      `Copiar ${asset.name}`. Verificação: `npm run build`
- [x] Layout em `CanvasEditor.tsx:252-280`: a caixa do desenho vira uma linha
      (`flex gap-2 h-[70vh] min-h-[420px]`) com o painel (`w-56 shrink-0`, borda e rolagem própria)
      e o `<Suspense>`/`ExcalidrawCanvas` em `flex-1` dentro do mesmo `overflow-hidden rounded-md
      border` de hoje. Conferir que o canvas continua com altura explícita — sem ela ele colapsa.
      Verificação: `npm run build`
- [x] Recolher/expandir sem remontar o desenho: o painel é sempre renderizado e apenas escondido
      (`hidden`) quando fechado, e o `<Suspense>`/`ExcalidrawCanvas` fica **na mesma posição da
      árvore** nos dois estados. Verificação: `npm test src/pages/admin/notes/__tests__/CanvasEditor.test.tsx`
- [x] Responsivo: abaixo de `sm` a linha vira coluna, o painel vai para cima do desenho e nasce
      **fechado** (só o cabeçalho com o botão de abrir), para não comer a altura do desenho no
      celular. Verificação: `npm run build && npm run lint`
- [x] Ligar o atalho de colar: `onPaste` no painel usando `pastedSvgFromEvent` (131) — colar markup
      de SVG com o painel aberto e nenhum campo focado abre o campo de colar já preenchido, como no
      popover de tarefa. Verificação: `npm run build`
- [x] `src/pages/admin/notes/__tests__/CanvasAssetsPanel.test.tsx` — painel montado direto, com
      `@/api/tasks/iconAssets` mockado: fechado não busca nada; abrir busca uma vez e lista os
      assets; clicar num asset chama `navigator.clipboard.writeText` **com a URL pública dele** e
      mostra o toast de link copiado; clipboard que rejeita vira toast destrutivo; enviar imagem
      pelo painel acrescenta o asset à lista sem recarregar; "Gerenciar" abre renomear/excluir.
      Verificação: `npm test src/pages/admin/notes/__tests__/CanvasAssetsPanel.test.tsx`
- [x] Estender `src/pages/admin/notes/__tests__/CanvasEditor.test.tsx` (o Excalidraw falso do
      arquivo já existe, `:25-41`): o painel aparece ao lado do canvas numa nota `kind: "canvas"`;
      abrir um canvas **não** dispara `fetchIconAssets`; o autosave continua igual depois da
      mudança de layout (um `onSceneChange` ainda vira um `updateNote` com o `canvas_data`); e
      **recolher/expandir o painel não remonta o canvas** — o Excalidraw falso do arquivo pode
      contar montagens para provar isso. Os dois últimos são os testes de regressão da mudança de
      layout.
      Verificação: `npm test src/pages/admin/notes/__tests__/CanvasEditor.test.tsx`
- [x] Fechar a rodada: `npm run build && npm run lint && npm test && npm run check:bundle`, com a
      contagem de arquivos/testes registrada nesta linha. O `check:bundle` precisa seguir
      `Bundle budget OK.` — se o chunk de `/notes` crescer para a casa de centenas de KB, o painel
      arrastou o Excalidraw ou o barril de tarefas.
      Verificação: `npm run build && npm run lint && npm test && npm run check:bundle`
      **Rodado (2026-09-24)**: 290 arquivos / 3195 testes antes (fim da 131) → **291 arquivos /
      3208 testes, 0 falhas** depois (`npx vitest run --maxWorkers=3`; o paralelismo padrão tem
      flakiness de ambiente registrada nas Notas da 131). Lint `0 errors, 88 warnings` — idêntico
      à base. `npm run build` verde (`✓ built in 25.69s`) e `npm run check:bundle` →
      `Bundle budget OK.`, sem chunk novo nem crescimento em `/notes`.

## Prompts

## Notas

Desvios do desenho, decididos na implementação (nenhum pedido do usuário no meio — por isso estão
aqui e não em `## Prompts`):

- **`AssetLibrary` (131) ganhou duas props aditivas**: `title` virou opcional e apareceu
  `selectLabel?: (asset) => string`. As duas vêm de exigências das tarefas desta feature: o rótulo
  "Orbyva Assets" mora no cabeçalho do painel, e repeti-lo dentro da biblioteca mostraria o mesmo
  nome duas vezes um abaixo do outro; e o `aria-label` de cada item precisa dizer `Copiar <nome>`,
  porque aqui o clique copia a URL em vez de escolher o ícone de uma tarefa. Nenhum chamador
  existente mudou — os 14 testes de `src/components/assets` e os 38 do `TaskIconPicker` seguem
  verdes sem asserção reescrita.
- **`aria-pressed` só sai onde existe "asset em uso".** Ele era fixo em cada item da grade; no
  painel do canvas seria um estado de seleção que não existe, anunciado em toda leitura de tela.
  Passou a depender de `selectedUrl` ter sido passado (`undefined` → atributo ausente). O picker de
  tarefa passa `icon_url`, que pode ser `null`, e continua com `aria-pressed` nos dois estados.
- **Recolhido, o painel vira uma tira com o botão, não some.** "O desenho ocupa a largura toda" é
  aproximado: sobra a coluna do botão de abrir — sem ela não haveria como reabrir o painel, já que
  o estado não é persistido e a feature não acrescenta nada ao cabeçalho da tela (o cabeçalho é da
  rodada de tela cheia, 171).
- **A altura explícita do desenho ficou no filho, não na linha.** A tarefa dizia
  `flex gap-2 h-[70vh] min-h-[420px]` na linha; abaixo de `sm` isso espremeria o desenho ao abrir o
  painel (a linha vira coluna e os dois dividiriam a mesma altura fixa), contrariando o caso de
  borda "abrir mostra a lista sem espremer o canvas abaixo de `min-h-[420px]`". Entregue:
  `flex flex-col gap-2 sm:h-[70vh] sm:min-h-[420px] sm:flex-row` na linha e
  `h-[70vh] min-h-[420px] sm:h-auto sm:min-h-0 sm:flex-1` na caixa do desenho — em tela larga quem
  dá a altura é a linha (o filho estica), no celular a altura é do próprio desenho e o painel
  aberto rola por dentro (`max-h-64`).
- **A largura da janela é lida uma vez, na montagem** (`matchMedia("(min-width: 640px)")`), sem
  assinar mudança: depois do primeiro clique quem manda é a pessoa, não a janela. Redimensionar não
  reabre nem fecha o painel.
- **O Excalidraw falso de `CanvasEditor.test.tsx` virou função nomeada.** Ele passou a contar
  montagens com `useEffect`, e `react-hooks/rules-of-hooks` reprova hook dentro de arrow anônima em
  `default:` — dava 1 error no lint, acima da base de `0 errors, 88 warnings`.

## Como testar

Este roteiro só faz sentido com a **131** implementada (é dela que vêm `AssetLibrary`,
`AssetUploadControls` e `useAssetLibrary`). Copiar a **imagem** para o Excalidraw é a 133: aqui o
clique copia o **link**.

1. **Pré-requisitos**
   - Nenhuma migration nova (`public.icon_asset` e o bucket `task-icons` existem desde a 086).
   - `npm run dev`, login normal.
   - Ter pelo menos um canvas: `/notes` → botão "Novo canvas". Guarde a URL (`/notes/<id>`).
   - Ter dois ou três assets na biblioteca — se não tiver, o passo 4 deste roteiro cria.
   - Janela larga (≥ 640 px) para os passos 1–9; o passo de celular está nos casos de borda.

2. **Verificação automatizada** — um comando por linha. `--maxWorkers=3` não é preciosismo: com o
   paralelismo padrão esta máquina derruba testes por timeout, sempre outros (ver Notas da 131).
   - `npx vitest run --maxWorkers=3 src/pages/admin/notes/__tests__/CanvasAssetsPanel.test.tsx` —
     passou (10 testes) = o painel só consulta a biblioteca quando está aberto, lista os assets,
     copia a **URL pública** no clique, avisa quando o clipboard falha, aceita upload e colagem de
     SVG, e recolher esconde a lista sem descartá-la.
   - `npx vitest run --maxWorkers=3 src/pages/admin/notes/__tests__/CanvasEditor.test.tsx` — passou
     (13 testes) = o painel aparece ao lado do desenho, abrir um canvas **não** dispara
     `fetchIconAssets`, o autosave continua gravando `canvas_data` depois da troca de layout e
     recolher/expandir **não remonta** o canvas (o Excalidraw falso conta montagens).
   - `npx vitest run --maxWorkers=3 src/components/assets` — passou (2 arquivos / 14 testes) = a
     biblioteca da 131 segue verde com o consumidor novo e com as props novas (`title` opcional,
     `selectLabel`).
   - `npx vitest run --maxWorkers=3 src/pages/admin/tasks/__tests__/TaskIconPicker.test.tsx` —
     passou (38 testes) = o outro consumidor da biblioteca não mudou de comportamento.
   - `npm run build && npm run lint && npm run check:bundle` — passou = `tsc` sem erro, lint
     `0 errors, 88 warnings` (88 é a base, não 0) e `Bundle budget OK.` — a prova de que o painel
     não puxou o Excalidraw nem o barril `@/api/tasks` para o chunk de `/notes`.

3. **Verificação manual, passo a passo**
   1. Abra `/notes` e clique num canvas (ou crie um com "Novo canvas"). **Esperado**: a tela abre
      com o painel "Orbyva Assets" à esquerda (título no cabeçalho do painel + botão de recolher) e
      o desenho à direita, na mesma altura de antes.
   2. Olhe a aba Network **antes** de abrir o painel numa janela nova: recolha o painel pelo botão
      do cabeçalho, recarregue a página e observe. **Esperado**: com o painel recolhido não há
      requisição para `icon_asset`; ao abrir, aparece uma (e só uma).
   3. Com o painel aberto: **esperado** ver os mesmos assets que aparecem no popover de ícone de uma
      tarefa em `/tasks` — é a mesma biblioteca, não uma cópia.
   4. Clique em "Enviar imagem" no painel e escolha um PNG pequeno. **Esperado**: ele entra na lista
      na hora, sem recarregar a página e sem nova consulta, e passa a aparecer também no popover de
      ícone de tarefa.
   5. Clique num asset da lista. **Esperado**: toast com título "Link copiado" e a linha "Cole no
      desenho (Ctrl/Cmd+V).". (O botão de cada asset se chama "Copiar <nome>" para quem navega por
      leitor de tela.)
   6. Clique dentro do desenho e cole (Ctrl/Cmd+V). **Esperado**: o Excalidraw insere a imagem a
      partir da URL colada. (Se o navegador bloquear a busca da URL, o texto do link é colado — é o
      limite conhecido desta rodada; a imagem no clipboard é a 133.)
   7. Desenhe qualquer coisa e espere ~2 s. **Esperado**: o indicador ao lado do título vai para
      "Salvando…" e depois "Salvo" — o painel não interferiu no autosave.
   8. Clique em "Gerenciar" no painel, renomeie um asset e exclua outro. **Esperado**: mesmo
      comportamento do popover de tarefa, incluindo o aviso de que quem já usa o ícone continua com
      ele.
   9. Desenhe um traço novo e, **antes** de o indicador dizer "Salvo", recolha o painel pelo botão
      do cabeçalho. **Esperado**: o desenho ocupa o resto da largura (sobra só a tira com o botão de
      abrir), o traço continua lá — o canvas não remontou — e o "Salvo" aparece logo em seguida; ao
      abrir o painel de novo, a lista continua lá sem nova busca.

4. **Casos de borda e caminhos negativos**
   - **Biblioteca vazia** (conta sem assets): o painel mostra "Nenhum ícone seu ainda — envie uma
     imagem ou cole um SVG." e o botão de enviar continua acessível.
   - **Erro de carregamento** (desligue a rede e abra o painel): linha "Não foi possível carregar
     seus ícones."; o desenho continua funcionando e salvando normalmente. Reabrir com a rede de
     volta tenta de novo.
   - **Clipboard bloqueado** (janela sem foco, ou permissão negada): toast **destrutivo** "Não foi
     possível copiar" com o motivo — nunca o toast de sucesso com a área de transferência vazia.
   - **Arquivo acima de 1 MB** enviado pelo painel: toast dizendo tamanho e limite, sem upload (a
     regra da 131 vale nos dois lugares).
   - **Celular / janela estreita** (largura ~390 px): o painel aparece **fechado** acima do desenho,
     como uma faixa com o botão "Abrir Orbyva Assets"; abrir mostra a lista (com rolagem própria)
     sem espremer o canvas abaixo de `min-h-[420px]`.
   - **Nota markdown comum** (`/notes/<id>` de uma nota que não é canvas): nenhum painel aparece —
     ele é da tela do canvas, não do editor de texto.
   - **Colar SVG no painel**: com o painel **aberto** e nenhum campo focado, Ctrl/Cmd+V de um markup
     de SVG abre o campo de colar já preenchido, com a prévia sanitizada. Com o painel recolhido o
     atalho não faz nada.

5. **Sinais de que quebrou**
   - Desenho sumido ou com altura zero → a caixa do desenho ficou sem altura explícita; o Excalidraw
     se posiciona em absoluto dentro do pai e colapsa.
   - Traço recém-feito desaparecendo ao recolher/abrir o painel → o canvas remontou (irmão
     desmontado ou posição na árvore mudada) e recarregou o `initialData` do banco.
   - Indicador travado em "Salvando…" ou nenhum `update` no Network ao desenhar → a mudança de
     layout mexeu no `onSceneChange`/debounce.
   - `/notes/<id>` demorando muito mais para abrir, ou `npm run check:bundle` acusando o chunk da
     rota → o painel importou o Excalidraw ou o barril `@/api/tasks`.
   - Uma requisição de `icon_asset` a cada traço do desenho → o `enabled`/`loadedRef` está sendo
     recriado a cada render do editor.
   - Toast dizendo que copiou, mas o clipboard vazio → o `writeText` falhou em silêncio (o toast
     destrutivo é o caminho certo nesse caso).
   - No celular, o desenho com menos de 420 px de altura quando o painel abre → a altura voltou para
     a linha em vez de ficar na caixa do desenho.
