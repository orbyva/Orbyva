---
prompt: |-
  colocar em tela cheia o excalidraw

  Fatia desta feature — o modo tela cheia inteiro, menos a saída por teclado (que é a 172):

  Hoje o canvas vive numa caixa de `70vh` dentro do `PageShell`
  (`src/pages/admin/notes/CanvasEditor.tsx:256`), com sidebar, cabeçalho de página e as seções de
  projeto/links empurrando a área útil. Desenhar é a única tarefa do app que quer a tela inteira: o
  Excalidraw já traz barra de ferramentas, zoom e painéis próprios competindo pelo mesmo espaço.

  Decidido no desenho (as respostas do usuário, verbatim onde importa):

  - P1 "Tela cheia é overlay dentro da página, ou uma rota própria (`/notes/:id/canvas`)?" →
    **Resposta: recomendado** = overlay. Rota própria remonta o editor e obriga a duplicar
    carregamento, autosave e estado de salvamento; o precedente do Orb (`/orb`) existe porque lá o
    estado vive acima do `Outlet`, o que não é o caso aqui.
  - Overlay CSS (`fixed inset-0 z-50`), **não** `element.requestFullscreen()`: Radix portalza
    `PopoverContent`/`DialogContent` para `document.body` sem `container`
    (`src/components/ui/popover.tsx:16`, `dialog.tsx:11`), e o `<Toaster />` mora em
    `src/layouts/AdminLayout.tsx:251` — num elemento fullscreen nativo, popover, diálogo e toast
    ficam invisíveis.
  - P2 "O que fica visível em tela cheia?" → **Resposta: sim** (concorda com a recomendada) = só uma
    barra fina com título, `SaveIndicator` e o botão de sair; projeto, links e backlinks são edição
    de metadado, não de desenho.
  - P3 "Como se sai?" → **Resposta: isso** = botão de sair na barra **e** `Esc`. O botão é esta
    feature; o `Esc` com guarda é a 172. Sem o botão, `Esc` sozinho vira armadilha.
  - P4 "O modo persiste entre visitas ao mesmo canvas?" → **Resposta: sim** (concorda com a
    recomendada) = **não** persiste: abre sempre em modo normal. Preferência de visualização
    persistida sem controle visível (precedente `src/lib/taskSortPreference.ts`) confundiria mais do
    que ajuda num modo que toma a tela inteira.
  - P5 "Vale em telas pequenas?" → **Resposta: sim**, e é onde mais rende — mas a barra precisa
    caber: em largura de celular ela fica só com sair e `SaveIndicator`.
  - O mesmo nó de `ExcalidrawCanvas` nos dois modos: trocar de modo é mudar classe do contêiner,
    **nunca** desmontar. Remontar recarrega `initialData` (`ExcalidrawCanvas.tsx:42-47`) e joga fora
    a cena não salva do momento.
  - O botão de entrar vai no cabeçalho que já tem "Copiar referência" (`CanvasEditor.tsx:238-249`) —
    é a barra de ações do canvas.
  - Fora: `CanvasBlock` (`src/components/markdown/CanvasBlock.tsx:28`), que é SVG exportado e
    estático, não Excalidraw vivo. Fora: mudar autosave, cena, tema ou qualquer contrato de
    `src/domain/notes/canvasScene.ts`.
---

# 171 — Canvas em tela cheia

## Contexto
Sem dependências — é a base do modo tela cheia; a 172 (saída por `Esc`) depende dela.

O canvas do Excalidraw abre numa caixa de `h-[70vh] min-h-[420px]`
(`src/pages/admin/notes/CanvasEditor.tsx:256`) dentro do `PageShell`, dividindo a tela com sidebar,
cabeçalho, título, `ProjectPicker`, `NoteLinksPanel` e `BacklinksPanel`. Esta feature acrescenta um
modo em que o canvas ocupa a viewport inteira, com uma barra fina de status/saída, e o botão que
entra nele.

**Atenção — este cabeçalho tem dois donos.** A rodada 108 (`108-biblioteca-de-assets-e-excalidraw`,
que vira features no bloco 131–150) também mexe no cabeçalho do `CanvasEditor`
(`CanvasEditor.tsx:226-251`) para pendurar ali o acesso à biblioteca de assets. Quem implementar
esta feature deve tratar a linha de ações (`:231-250`) como espaço compartilhado: acrescente o botão
"Tela cheia" ao lado de "Copiar referência" sem reescrever a estrutura do bloco, para o outro lado
conseguir acrescentar o dele sem conflito de merge.

## Decisões
- **Overlay CSS, não Fullscreen API.** `fixed inset-0 z-50` no contêiner do canvas, na convenção de
  overlay da casa (`src/components/ui/dialog.tsx:22`, `src/components/ui/sheet.tsx:24`).
  `element.requestFullscreen()` está descartado: o Radix portalza popover e diálogo para
  `document.body` sem `container` (`src/components/ui/popover.tsx:16`, `dialog.tsx:11`) e o
  `<Toaster />` mora no `AdminLayout` (`src/layouts/AdminLayout.tsx:251`) — num elemento fullscreen
  nativo, todos eles desaparecem, inclusive o toast de erro de gravação.
- **`z-50` cobre todo o chrome e deixa o toast acima.** O chrome do `AdminLayout` vai até `z-40`
  (sidebar `z-10` em `src/components/ui/sidebar.tsx:237`, `LiveWidget` `z-30`, `MobileBottomNav`
  `z-40` e `QuickAddExpenseFab` `z-40`); o viewport de toast é `z-[100]`
  (`src/components/ui/toast.tsx:17`). `z-50` é exatamente a faixa que esconde o chrome e preserva o
  feedback de erro.
- **O `ExcalidrawCanvas` nunca desmonta ao trocar de modo.** Remontar recarrega `initialData`
  (`ExcalidrawCanvas.tsx:42-47`) e perde a cena que o debounce de 1,5 s ainda não gravou. Duas
  consequências práticas, que são regra de implementação: (a) o contêiner do canvas fica na **mesma
  posição** da árvore nos dois modos, só mudando `className`; (b) tudo que "some" em tela cheia é
  escondido com `hidden`, **nunca** desmontado condicionalmente — remover um irmão reordena o array
  de filhos e faz o React remontar o canvas, que é o defeito que se quer evitar.
- **A barra fina é a primeira linha de um flex column, não um overlay por cima do desenho.** O
  Excalidraw ocupa as quatro bordas com controles próprios em algum breakpoint (toolbar no topo no
  desktop e embaixo no mobile, biblioteca no canto superior direito, zoom no inferior esquerdo,
  ajuda no inferior direito): barra flutuante por cima cobriria um deles em alguma largura. Barra
  como linha do flex resolve em todas.
- **O título na barra é texto, não `Input`.** Editar título continua no modo normal; mover o
  `<Input id="canvas-title">` para dentro da barra o remontaria a cada troca de modo (perde o
  cursor) e duplicar o campo criaria dois controles para o mesmo estado. Decisão tomada nesta
  decomposição — P2 pediu "título" na barra, sem dizer se editável.
- **Sem persistência do modo (P4).** Nada de `localStorage`; `isFullscreen` nasce `false` a cada
  montagem do `CanvasEditor`.
- **Sem rota nova (P1).** Nenhuma alteração em `src/routes.tsx` nem em `NoteDetail.tsx`.
- **Nada muda no autosave, na cena ou no tema.** `src/domain/notes/canvasScene.ts`,
  `CANVAS_AUTOSAVE_DEBOUNCE_MS`, `saveRef`, `scheduleSave` e `useIsDarkTheme` ficam intactos: o modo
  é puramente de layout.
- **`CanvasBlock` fica de fora.** `src/components/markdown/CanvasBlock.tsx:28` é `exportToSvg`
  (`:72-79`), imagem estática dentro de uma nota markdown — não é canvas editável e não ganha modo
  nenhum.
- **`ExcalidrawCanvas.tsx` não é tocado nesta feature.** Ele se dimensiona pelo pai; o contrato de
  props (`ExcalidrawCanvas.tsx:19-31`) fica como está, e ele segue sendo o único ponto do app com
  `import` de `@excalidraw/excalidraw` (2,7 MB, teto de `npm run check:bundle`).

## Tarefas
- [x] Em `src/pages/admin/notes/CanvasEditor.tsx`, acrescentar o estado `const [isFullscreen,
      setIsFullscreen] = useState(false)` junto dos outros estados (`:92-96`), sem ler nem escrever
      `localStorage` (P4 — o modo não persiste).
- [x] Reestruturar o bloco "Desenho" (`CanvasEditor.tsx:253-281`) para o contêiner ter **sempre dois
      filhos fixos, nas mesmas posições nos dois modos**: (1) a barra de modo cheio e (2) o wrapper
      do `<Suspense>`/`<ExcalidrawCanvas>`. O contêiner ganha `flex flex-col` em ambos os modos e o
      wrapper do canvas ganha `flex-1 min-h-0`; nenhum dos dois filhos é renderizado
      condicionalmente. É esta forma fixa da árvore que garante que trocar de modo não remonta o
      Excalidraw.
- [x] Trocar a classe fixa do contêiner (`CanvasEditor.tsx:256`) por classe condicional via `cn`
      (`@/lib/utils`): modo normal mantém `h-[70vh] min-h-[420px] overflow-hidden rounded-md border`;
      tela cheia usa `fixed inset-0 z-50 overflow-hidden border-0 bg-background` (sem borda e sem
      raio, conforme o desenho). Acrescentar `role="region"` + `aria-label="Canvas em tela cheia"` no
      contêiner quando `isFullscreen`.
- [x] Escrever a barra de modo cheio como primeiro filho do contêiner: `SaveIndicator`
      (`CanvasEditor.tsx:51-72`, reaproveitado, sem duplicar), o título do canvas como texto
      truncado e o botão "Sair da tela cheia" (`Minimize2` de `lucide-react`). A barra recebe a
      classe `hidden` quando não está em tela cheia e `flex` quando está — sempre montada.
- [x] Aplicar a regra de P5 na barra: o título só aparece a partir de `sm` (`hidden sm:block` no
      texto); abaixo disso sobram `SaveIndicator` e o botão de sair. Barra fina (altura na faixa de
      `h-10`), `shrink-0`.
- [x] Acrescentar o botão "Tela cheia" (`Maximize2` de `lucide-react`, mesmo rótulo e ícone do
      precedente em `src/components/orb/OrbSidebarDock.tsx:198-207`) na linha de ações do cabeçalho,
      **ao lado** de "Copiar referência" (`CanvasEditor.tsx:240-249`), sem reescrever a estrutura do
      bloco — a rodada 108 vai acrescentar outro botão na mesma linha.
- [x] Esconder com `hidden` (nunca desmontar) tudo que não é o desenho enquanto `isFullscreen`: o
      bloco de título/ações (`CanvasEditor.tsx:226-251`), o rótulo "Desenho" (`:254`) e o bloco de
      `ProjectPicker` + `NoteLinksPanel` + `BacklinksPanel` (`:283-293`).
- [x] Travar a rolagem do `body` enquanto o modo está ligado: `useEffect` que guarda o valor
      anterior de `document.body.style.overflow`, põe `"hidden"` e restaura no cleanup (inclusive no
      unmount do componente, para não deixar a página travada ao navegar para outra nota).
- [x] Mover o foco ao trocar de modo: ao entrar, focar o botão "Sair da tela cheia"; ao sair,
      devolver o foco ao botão "Tela cheia". Usar refs nos dois botões.
- [x] Criar `src/pages/admin/notes/__tests__/CanvasEditor.fullscreen.test.tsx` reaproveitando o
      duplo do Excalidraw e os mocks de `@/api/notes/notes`, `@/api/notes/noteLinks` e
      `@/hooks/use-toast` de `src/pages/admin/notes/__tests__/CanvasEditor.test.tsx:21-58`. Casos:
      (a) o app abre em modo normal, com `ProjectPicker` visível e sem botão "Sair da tela cheia";
      (b) clicar em "Tela cheia" esconde título, projeto e painéis (`expect(...).not.toBeVisible()`)
      e mostra a barra com "Sair da tela cheia"; (c) clicar em "Sair da tela cheia" devolve tudo.
- [x] No mesmo arquivo, o teste que prova a decisão central: guardar a referência do nó
      `data-testid="excalidraw"` antes de entrar em tela cheia e conferir, com
      `expect(screen.getByTestId("excalidraw")).toBe(noAnterior)`, que é **o mesmo nó** depois de
      entrar e de sair — se remontar, o nó muda e o teste falha.
- [x] No mesmo arquivo, o teste que prova que o modo cheio não perde o feedback de gravação: entrar
      em tela cheia, disparar `sceneSpy.onSceneChange?.(...)` com uma cena diferente e conferir que
      "Salvando…" e depois "Salvo" aparecem **dentro da barra**, e que `updateNote` foi chamado uma
      vez com o `canvas_data` novo.
- [x] No mesmo arquivo, o teste da trava de rolagem: `document.body` fica com `overflow: hidden` em
      tela cheia, volta ao valor anterior ao sair e também depois do `unmount()` feito ainda em modo
      cheio.
- [x] Rodar `npx vitest run --maxWorkers=3
      src/pages/admin/notes/__tests__/CanvasEditor.fullscreen.test.tsx
      src/pages/admin/notes/__tests__/CanvasEditor.test.tsx`, `npm run lint`, `npm run build` e
      `npm run check:bundle`; a suíte antiga do `CanvasEditor` tem que continuar verde sem edição.

## Prompts

## Notas

Desvios do desenho, decididos na implementação (nenhum pedido do usuário no meio — por isso estão
aqui e não em `## Prompts`):

- **O plano descreve o `CanvasEditor` de antes da 132.** Quando a 171 foi escrita, o bloco "Desenho"
  era uma caixa só (`h-[70vh] min-h-[420px]`); a 132 já entregou uma **linha** com o painel "Orbyva
  Assets" à esquerda e o desenho à direita. Entregue, portanto, com um nível a mais: o contêiner que
  vira `fixed inset-0 z-50` tem sempre dois filhos fixos — (1) a barra de modo cheio e (2) a linha
  da 132 (painel + caixa do desenho) —, e a caixa do desenho é quem ganha `flex-1 min-h-0` em tela
  cheia. A forma da árvore, que é o que a decisão central protege, continua a mesma nos dois modos:
  trocar de modo só troca `className`.
- **O painel "Orbyva Assets" continua visível em tela cheia.** P2 tirou do modo cheio o que é
  **edição de metadado** (projeto, vínculos, backlinks); a biblioteca de assets é ferramenta de
  desenho — some dela justo no modo feito para desenhar seria o contrário do pedido. Ela mantém o
  comportamento da 132 (nasce fechada abaixo de `sm`, recolhida vira a tira do botão). Se o usuário
  preferir escondê-la também, é acrescentar `hidden={isFullscreen}` ao `<CanvasAssetsPanel />` —
  uma linha.
- **Esconder é com o atributo `hidden`, não com a classe `hidden`.** Mesma escolha da 132 (o corpo
  do painel de assets usa `hidden={!open}`): o atributo cai no `[hidden]{display:none}` do preflight
  do Tailwind, sai da árvore de acessibilidade e — o que decide — é verificável em jsdom, onde
  nenhuma folha de estilo do Tailwind está carregada e a classe `.hidden` não esconderia nada. Com a
  classe, `expect(...).not.toBeVisible()` passaria com a tela errada. Duas exceções, por motivo
  técnico: o rótulo "Desenho" (o `FormLabel` repassa `className`, não `hidden`) e a própria barra,
  que precisa de `flex` quando aparece — e uma utilitária de `display` venceria o `[hidden]` do
  preflight, então a barra fica **sem** classe de display quando escondida.
- **Um `SaveIndicator` de cada vez.** A barra e o cabeçalho usam o mesmo componente, mas só um é
  renderizado por vez (`isFullscreen ? … : …`). Dois `role="status"` com o mesmo texto no DOM
  anunciariam a gravação em dobro no leitor de tela — e quebrariam os `findByText("Salvando…")` da
  suíte antiga, que a tarefa manda manter verde sem edição. Isso **não** é renderização condicional
  de irmão do canvas: o `SaveIndicator` vive em outra subárvore, e filho condicional em lista
  estática de JSX não desloca irmão nenhum (confirmado por mutação — ver abaixo).
- **A identidade do nó foi provada por mutação, não por leitura.** Com o desenho duplicado em dois
  ramos de JSX (um `<section>` só no modo cheio), o teste "entrar e sair do modo NÃO remonta o
  Excalidraw" falha; com a implementação entregue, passa. O mesmo exercício derrubou 3 testes ao
  remover o cleanup da trava de rolagem e o retorno de foco.
- **`role="region"` + `aria-label` só existem em tela cheia.** No modo normal o contêiner é um `div`
  sem papel — um marco de navegação permanente chamado "Canvas em tela cheia" numa tela que não
  está em tela cheia seria ruído no leitor de tela.

## Como testar

1. **Pré-requisitos**
   - `npm install` feito; sem migration nova (esta feature não toca no banco).
   - `npm run dev` de pé e login com um usuário que já tenha notas.
   - Precisa existir uma **nota do tipo canvas** com algum traço desenhado. Se não houver: em
     `/notes`, criar uma nota de canvas ("Novo canvas"), abrir e desenhar dois ou três retângulos (o
     autosave grava sozinho 1,5 s depois do último movimento).
   - Janela larga (≥ 640 px) para os passos 1–7; o caso estreito está nos casos de borda.

2. **Verificação automatizada** — um comando por linha. `--maxWorkers=3` não é preciosismo: com o
   paralelismo padrão esta máquina derruba testes por timeout, sempre outros (ver Notas da 131/132).
   - `npx vitest run --maxWorkers=3 src/pages/admin/notes/__tests__/CanvasEditor.fullscreen.test.tsx`
     — passou (11 testes) = a tela abre em modo normal e sem botão de sair; entrar esconde título,
     projeto, "Vínculos" e "Mencionada em" (`not.toBeVisible()`, com os nós ainda no documento) e
     mostra a barra; sair devolve tudo; **o nó `data-testid="excalidraw"` é o mesmo objeto antes,
     durante e depois** (`sceneSpy.mounts` parado em 1 — é o que prova que o Excalidraw não
     remonta); o autosave grava em tela cheia com "Salvando…" e "Salvo" **dentro da barra**; a trava
     de `overflow` do `body` é posta e desfeita, inclusive depois de `unmount()` feito ainda em modo
     cheio; o foco vai para "Sair da tela cheia" ao entrar e volta para "Tela cheia" ao sair.
   - `npx vitest run --maxWorkers=3 src/pages/admin/notes/__tests__/CanvasEditor.test.tsx` — passou
     (13 testes) = a suíte antiga do editor (autosave, tema, "Copiar referência", painel de assets
     da 132) continua verde **sem ter sido editada**.
   - `npm run lint` — passou = `88 problems (0 errors, 88 warnings)`, a linha de base do projeto.
   - `npm run build` — passou = `tsc -b` + `vite build` sem erro de tipo.
   - `npm run check:bundle` — passou = imprime `Bundle budget OK`, ou seja, nenhuma rota estourou o
     teto de 160 KB gzip e o Excalidraw continua fora do chunk das rotas.

3. **Verificação manual, passo a passo**
   1. Ir em `/notes` e abrir a nota de canvas dos pré-requisitos (`/notes/<id>`). Esperado: a tela
      de hoje — título, a linha com "Orbyva Assets" à esquerda e o desenho à direita, e "Projeto",
      "Vínculos" e "Mencionada em" abaixo.
   2. Olhar a linha do título. Esperado: ao lado de "Copiar referência" existe agora um botão
      **"Tela cheia"** com ícone de expandir.
   3. Clicar em "Tela cheia". Esperado: o desenho passa a ocupar a janela inteira — some a sidebar
      esquerda, some o cabeçalho da página, somem o campo de título, "Projeto", "Vínculos" e
      "Mencionada em". No topo fica uma barra fina com o título do canvas à esquerda e, à direita, o
      botão **"Sair da tela cheia"**. O painel "Orbyva Assets" **continua** ao lado do desenho — ele
      é ferramenta de desenho, não metadado (ver `## Notas`).
   4. Sem tocar no mouse, apertar `Enter` ou `Espaço`. Esperado: sai da tela cheia — o foco foi para
      o botão "Sair da tela cheia" ao entrar. (Voltar a entrar antes do passo 5.)
   5. Desenhar um traço novo em tela cheia e esperar ~2 s. Esperado: na barra fina aparece
      "Salvando…" e depois "Salvo".
   6. Rolar a roda do mouse fora da área do desenho (por exemplo na barra fina). Esperado: a página
      atrás **não** rola — nada do conteúdo escondido aparece por baixo.
   7. Clicar em "Sair da tela cheia". Esperado: volta exatamente a tela do passo 1, com o traço do
      passo 5 já no desenho, e o foco do teclado no botão "Tela cheia" (um `Enter` entra de novo).
   8. Recarregar a página (F5). Esperado: a nota abre em **modo normal**, não em tela cheia — o modo
      não persiste (P4). O traço do passo 5 continua lá.

4. **Casos de borda e caminhos negativos**
   - **Canvas vazio**: criar uma nota de canvas sem nenhum traço e entrar em tela cheia. Esperado:
     tela em branco do Excalidraw ocupando tudo, barra fina com o título e "Sair da tela cheia" —
     nenhum erro no console.
   - **Erro de gravação em tela cheia**: com a aba em tela cheia, desconectar a rede (DevTools →
     Network → Offline) e desenhar. Esperado: a barra fina mostra "Não salvo" **e** o toast
     vermelho "Não foi possível salvar o canvas" aparece por cima do modo cheio — é o motivo de a
     decisão ter sido overlay CSS em vez da Fullscreen API.
   - **Celular / janela estreita**: reduzir a janela para menos de 640 px de largura e entrar em tela
     cheia. Esperado: a barra fina continua cabendo, com o indicador de gravação e "Sair da tela
     cheia"; o título some (P5). O "Orbyva Assets" fica **acima** do desenho, recolhido na tira do
     botão. Nada de scroll horizontal.
   - **Sair da nota em tela cheia**: entrar em tela cheia e, sem sair do modo, navegar para
     `/notes` pelo histórico do navegador (botão voltar). Esperado: a lista de notas aparece normal
     e **rola** — a trava de rolagem do `body` foi desfeita.
   - **Canvas embutido numa nota markdown**: abrir uma nota markdown que tenha um bloco
     ` ```orbyva-canvas `. Esperado: nada mudou ali — o embed continua imagem estática, sem botão de
     tela cheia (`CanvasBlock` está fora do escopo).
   - **`Esc` ainda não sai**: apertar `Esc` em tela cheia. Esperado: **nada acontece** — a saída por
     teclado é a feature 172, e sair pelo botão é o que esta entrega garante.

5. **Sinais de que quebrou**
   - Entrar em tela cheia e o desenho **piscar / voltar ao estado salvo**, perdendo o último traço:
     o Excalidraw remontou — é a falha que o teste de identidade do nó cobre.
   - Sidebar, cabeçalho ou a barra inferior do celular aparecendo por cima do modo cheio: `z-index`
     errado (o chrome vai até `z-40`).
   - Toast de erro invisível em tela cheia: alguém trocou o overlay CSS por `requestFullscreen()`.
   - Página atrás continuar rolando, ou ficar travada depois de sair do modo: o `useEffect` da trava
     de `overflow` não restaura.
   - Caixa do desenho com altura zero (canvas some) ao sair da tela cheia: a caixa perdeu
     `flex-1 min-h-0` em cheio ou `h-[70vh]` no normal — o Excalidraw se posiciona em absoluto e
     colapsa sem altura explícita do pai.
   - O leitor de tela anunciar "Salvando…" duas vezes: voltaram os dois `SaveIndicator` no DOM ao
     mesmo tempo (ver `## Notas`).
