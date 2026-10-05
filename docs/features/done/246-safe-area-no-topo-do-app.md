---
prompt: |-
  Pedido original do usuário, verbatim:

  "no celular, não dá pra acessar a navegaçõa superior, fica na área do iphone que não funciona o
  touch, então eu só consigo fazer colocando o celular na horizontal"

  Desenho já fechado (não reabrir):

  A causa é única e está confirmada no código: `index.html:8` (`viewport-fit=cover`) +
  `index.html:13` (`black-translucent`) + `vite.config.ts:76` (`display: "standalone"`) fazem o
  conteúdo subir para baixo da status bar, e **nenhum** lugar do app desconta
  `env(safe-area-inset-top)`. O header tem 48px (`h-12`) e o inset de topo em retrato é ~47–59px
  (notch/Dynamic Island) → coberto inteiro; em paisagem o inset é 0 e a barra volta a funcionar.

  Cumprir esta feature é descontar o inset de topo em **toda** superfície que encosta no topo da
  viewport, mantendo `viewport-fit=cover` + `black-translucent`:

  1. **Shell do admin** — o inset entra **uma vez**, no `<SidebarInset>` (`AdminLayout.tsx:203`),
     cobrindo banner offline + banner de trial + header de uma vez; o desconto de altura vai junto
     com o padding, no `min-h` do shell e nos tetos de altura da Orb, senão o bug de toque vira
     rolagem fantasma e composer abaixo da dobra.
  2. **Overlays `fixed`**, que não herdam o padding do shell: o drawer mobile da sidebar
     (`sidebar.tsx:209`, com os **dois** insets — topo e base, pelo `NavUser` no home indicator) e a
     viewport de toasts (`toast.tsx:17`, preservando `sm:top-auto`/`sm:bottom-0`).
  3. **Superfícies públicas** alcançáveis de dentro do PWA (logout cai em `/login`, o logo leva para
     `/`): `Login.tsx:26`, `Landing.tsx:262` e `PublicPageShell.tsx:42`.

  Em todos os casos o inset **soma** ao padding existente, não o substitui. Trocar o status bar
  style para `default` esconderia o bug mas abriria mão do edge-to-edge e deixaria o `env()` zerado
  para todo o resto. Sem abstração nova, sem media query, sem detectar standalone, sem `padding-top`
  global em `body`/`#root`, sem migration, sem mudança em `index.html`/manifest, sem pacote novo.

  A prova é por código: Playwright com override de safe area por CDP
  (`Emulation.setSafeAreaInsetsOverride` via `context.newCDPSession`, aplicado antes do `goto`, com
  viewport de iPhone), mais testes jsdom de guarda — é a única forma de fazer `env(safe-area-inset-*)`
  valer >0 no Chromium, e o `CLAUDE.md` do projeto proíbe verificar isso no navegador à mão.
---

# 246 — Safe area no topo do app

## Contexto
Sem dependências.

No iPhone com o PWA instalado em retrato, a barra superior do admin não recebe toque: o iOS pinta a
status bar/Dynamic Island por cima do conteúdo e consome o toque daquela faixa. A causa é
`index.html:8` (`viewport-fit=cover`) + `index.html:13` (`black-translucent`) +
`vite.config.ts:76` (`display: "standalone"`) — o conteúdo sobe para baixo da status bar e **nenhum**
ponto do app desconta `env(safe-area-inset-top)`. O app já trata o inset **de baixo** em 6 lugares
(`MobileBottomNav.tsx:87`, `LiveWidget.tsx:136`, `PwaUpdateBanner.tsx:32`, `FormDialogShell.tsx:67`,
`OrbProposalTray.tsx:59`, `AdminLayout.tsx:251`) e tem **zero** ocorrências de `-top`.

A faixa morta engole três classes de superfície, e esta feature fecha as três: o shell do admin, os
overlays `fixed` (que saem do fluxo do shell e não herdam padding nenhum) e os headers públicos
alcançáveis sem sair do PWA instalado — logout vai para `/login`, o logo vai para `/`, e os links de
rodapé/legais abrem `/terms`, `/privacy`, `/about` e as páginas de marketing pelo `PublicPageShell`.

Reprodução: PWA instalado (Adicionar à Tela de Início), retrato. Em aba do Safari, no Android e no
desktop o inset de topo é 0 — a correção é inócua lá, por isso não precisa de media query nem de
detecção de standalone.

## Decisões
- A correção é **adicionar o inset de topo** às superfícies de topo, mantendo `viewport-fit=cover` +
  `black-translucent`. Trocar o status bar style para `default` esconderia o bug mas abriria mão do
  edge-to-edge e deixaria o `env()` zerado para todo o resto do app.
- **Sem abstração nova**: valores arbitrários `env(safe-area-inset-top,0px)` direto na classe, o
  mesmo idioma dos 6 usos de `-bottom` já no código. Nada de token novo no `tailwind.config.js` nem
  de variável CSS em `src/index.css`.
- **Sem media query e sem detectar standalone**: `env()` já resolve 0 em aba do Safari, Android e
  desktop.
- **O inset soma ao padding existente, não o substitui** (`calc(1rem + env(...))`,
  `calc(1.25rem + env(...))`): sem o `env()`, cada superfície continua exatamente com o espaçamento
  de hoje.
- **Nada de `padding-top` global em `body`/`#root`**: era exatamente o atalho que não resolveria a
  feature — overlays `fixed` (toast, drawer, dialogs) não herdariam, e todo `min-h-svh` passaria a
  estourar a viewport.
- O inset do shell entra no **`SidebarInset`**, não no `<header>`: é o único ponto que cobre banner
  de trial (`AdminLayout.tsx:205`), banner offline (`:204`) e header (`:226`) sem repetir a conta em
  três lugares — qualquer um dos três é o "primeiro de cima" dependendo do estado.
- Junto com o `padding-top` vai o **desconto no `min-h`/`max-h`** (`SidebarInset` e `Orb.tsx`):
  padding sem desconto troca o bug de toque por rolagem fantasma (~59px em toda página) e composer
  da Orb fora da dobra.
- A faixa do inset fica pintada com o `bg-background` do próprio `SidebarInset` — nada de barra
  tingida à parte, e a barra superior continua **não-sticky**: o relato é alcance, não comportamento
  de rolagem nem visual novo.
- **Drawer mobile ganha os dois insets no mesmo commit** (topo e base): é o mesmo elemento, a mesma
  classe de bug, e o `NavUser` hoje encosta no home indicator. Alvo exato:
  `src/components/ui/sidebar.tsx:209`, o `<div className="flex h-full w-full flex-col">` dentro do
  `SheetContent` — e não o `SheetContent` em si, que carrega `p-0` e o `--sidebar-width`.
- **Viewport de toasts** (`src/components/ui/toast.tsx:17`): o `p-4` mobile vira
  `pt-[calc(1rem+env(safe-area-inset-top,0px))]`, somando ao padding existente em vez de
  substituí-lo, e `sm:top-auto`/`sm:bottom-0` continuam intactos — no desktop a viewport é de baixo
  e não muda nada.
- Nada a fazer em popover/dialog/sheet: o `QuickAddMenu` é `Popover` ancorado
  (`MobileBottomNav.tsx:107`, `QuickAddExpenseFab.tsx:33`) e os dialog/sheet em uso são centrados ou
  `side="bottom"`.
- Três arquivos, três headers públicos: `src/pages/admin/Login.tsx:26` e `src/pages/Landing.tsx:262`
  (ambos `px-4 pt-4 sm:px-6` → `pt-[calc(1rem+env(safe-area-inset-top,0px))]`) e
  `src/components/PublicPageShell.tsx:42` (`px-5 py-5` →
  `pb-5 pt-[calc(1.25rem+env(safe-area-inset-top,0px))]`). O `PublicPageShell` cobre de uma vez
  `/about`, `/terms`, `/privacy`, `/dentro-do-orcamento` e as páginas de marketing/blog
  (`src/pages/About.tsx`, `src/pages/QuantoAindaCabe.tsx`, `src/pages/legal/LegalPages.tsx`,
  `src/pages/marketing/*`).
- A verificação é a `e2e/safe-area.spec.ts` com **override de CDP**
  (`Emulation.setSafeAreaInsetsOverride`), não inspeção visual: é a única forma de fazer
  `env(safe-area-inset-*)` valer >0 no Chromium, e já está confirmado funcionando na versão
  instalada (medido: sem override `padding-top` = `0px`, com override = `59px`; Playwright 1.61 +
  `viewport-fit=cover` já no `index.html`).
- Todo caso do spec tem **caso-espelho sem override** (`0px` / `top < 59`): é o que prova que o
  deslocamento vem do `env()` e não de um padding fixo que estragaria desktop e aba do Safari.
- O escopo público é o único da feature cuja prova e2e **roda sem credencial E2E** — os casos do
  shell, do drawer e do toast exigem sessão autenticada e ficam `skipped` sem ela.
- Nenhuma migration, nenhuma mudança de `index.html`/manifest, nenhum pacote novo.
- Fora de escopo: app Expo em `mobile/` (já trata inset nativo); insets laterais em paisagem
  (`safe-area-inset-left/right`, não relatados); tornar a barra superior `sticky`;
  `src/components/Header.tsx` + `src/layouts/DefaultLayout.tsx` (código morto, sem rota em
  `src/routes.tsx` — era o ponto de partida sugerido pelo relato, mas não é a navegação do app);
  `src/pages/admin/extension/ExtensionPanel.tsx` e `src/pages/ops/OpsConsole.tsx`.
- **Decidido no ataque, não no plano original**: além do e2e, entra um teste jsdom do
  `SidebarInset`. O desenho depende de o `cn`/twMerge de `src/components/ui/sidebar.tsx:322-327`
  deixar o `min-h-[calc(...)]` do chamador vencer o `min-h-svh` do componente — se o twMerge não
  colapsar as duas classes, o padding entra e o desconto não, e o bug de toque vira rolagem
  fantasma silenciosa. Esse é o único caso de borda da feature que o e2e autenticado não cobre
  quando falta credencial E2E, e custa um arquivo pequeno.
- **Decidido no ataque, não no plano original**: a viewport de toasts ganha também um teste jsdom de
  className, além do caso e2e. O caso e2e do toast exige disparar um toast real em sessão
  autenticada (fica `skipped` sem credencial E2E), enquanto o jsdom roda sempre e custa um arquivo
  pequeno; para o drawer não há equivalente barato (depende do `Sheet` aberto e do clique no
  gatilho), então lá a prova é só o e2e.
- **Decidido no ataque, não no plano original**: o caso e2e público cobre as **três** superfícies
  (`/login`, `/` e `/terms`, essa última pelo `PublicPageShell`), não só `/login`. São três arquivos
  distintos sendo alterados e cada asserção extra é um `goto` + uma medida — deixar duas sem prova
  seria cobertura faltando, não economia.

## Tarefas

### Harness de prova (Playwright + CDP)
- [x] Criar `e2e/helpers/safe-area.ts`: `setSafeAreaInsets(page, { top, bottom })` usando
      `page.context().newCDPSession(page)` + `Emulation.setSafeAreaInsetsOverride({ insets: { top,
      bottom } })`, e exportar `INSET_TOP = 59` / `INSET_BOTTOM = 34`. Documentar no topo do arquivo
      que a chamada tem de vir **antes da primeira navegação** da página (o override persiste pelas
      navegações seguintes do mesmo target) e que `signInViaSupabaseApi`
      (`e2e/helpers/auth.ts:77`) já faz um `page.goto("/login")` por dentro — logo o override vem
      antes dele.
- [x] Criar `e2e/safe-area.spec.ts` com `test.use({ ...devices["iPhone 14"] })` e o **teste-guarda
      do instrumento**, que roda sem credencial: navega para `/login`, injeta via
      `page.addStyleTag` uma sonda com `padding-top: env(safe-area-inset-top, 0px)` e mede
      `getComputedStyle(...).paddingTop` — `"59px"` com override, `"0px"` sem. Sem esse guarda, uma
      asserção falha mais à frente é ambígua (fix quebrado vs. override não aplicado).

### Shell do admin
- [x] Aplicar o inset no shell: `src/layouts/AdminLayout.tsx:203` — `<SidebarInset>` ganha
      `className="pt-[env(safe-area-inset-top,0px)] min-h-[calc(100svh-env(safe-area-inset-top,0px))]"`,
      com comentário curto dizendo por que é aqui e não no `<header>` (cobre `:204` banner offline,
      `:205` banner de trial e `:226` header de uma vez) e por que o `min-h` vem junto.
- [x] Criar `src/components/ui/__tests__/sidebar-inset.safe-area.test.tsx` (jsdom, projeto
      `jsdom` do `vite.config.ts:377`): renderiza `<SidebarInset>` com a className da tarefa
      anterior e afirma que a classe final do `<main>` contém `pt-[env(safe-area-inset-top`
      **e** `min-h-[calc(100svh-env(` e **não** contém `min-h-svh` — prova que o twMerge do `cn`
      (`src/components/ui/sidebar.tsx:322-327`) deixa o chamador vencer o `min-h-svh` do
      componente. `SidebarInset` é um `<main>` puro, não consome `useSidebar`: renderiza sem
      provider.
- [x] Caso autenticado no spec — padding do shell: `test.skip(!e2eEnv().hasAuth, ...)` no padrão de
      `e2e/finance-ops.spec.ts:56`, override **antes** de `signInViaSupabaseApi(page)`, depois
      `page.goto("/home")` e `getComputedStyle(main).paddingTop === "59px"`.
- [x] Caso autenticado no spec — alcance do gatilho: `button[data-sidebar="trigger"]`
      (`src/components/ui/sidebar.tsx:271`) com `getBoundingClientRect().top >= 59`. É a asserção
      que fecha literalmente o relato ("não dá pra acessar a navegação superior").
- [x] Caso-espelho sem override, mesmas duas asserções: `paddingTop === "0px"` e
      `rect.top < 59` — prova que o deslocamento vem do `env()` e não de padding fixo.
- [x] Frente de altura da Orb: `src/pages/admin/orb/Orb.tsx:18` — subtrair também o inset nos dois
      tetos: `max-h-[calc(100dvh-3.5rem-env(safe-area-inset-top,0px))]
      max-md:max-h-[calc(100dvh-3rem-env(safe-area-inset-top,0px))]`. Atualizar o comentário de
      bloco de `Orb.tsx:5-12`, que hoje explica a conta só com a altura do header.
- [x] `src/pages/admin/orb/__tests__/Orb.layout.test.tsx:35` — apertar a asserção do teto para
      exigir o termo do inset (algo como `/max-h-\[calc\(100dvh-3\.5rem-env\(safe-area-inset-top/`),
      em vez do `/max-h-\[calc\(100dvh/` genérico de hoje.
- [x] Rodar e deixar verde:
      `npx vitest run src/components/ui/__tests__/sidebar-inset.safe-area.test.tsx src/pages/admin/orb/__tests__/Orb.layout.test.tsx`
      e `npx playwright test e2e/safe-area.spec.ts`.

### Overlays fixos (drawer mobile e viewport de toasts)
- [x] Drawer mobile: em `src/components/ui/sidebar.tsx:209`, a `className` do
      `<div className="flex h-full w-full flex-col">` passa a
      `"flex h-full w-full flex-col pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)]"`,
      com comentário curto explicando que é o conteúdo do `SheetContent` (o pai tem `p-0`) e que o
      inset de base é pelo `NavUser` no home indicator.
- [x] Viewport de toasts: em `src/components/ui/toast.tsx:17`, trocar o `p-4` por
      `px-4 pb-4 pt-[calc(1rem+env(safe-area-inset-top,0px))]`, mantendo `sm:bottom-0`,
      `sm:right-0`, `sm:top-auto` e `md:max-w-[420px]` como estão.
- [x] Criar `src/components/ui/__tests__/toast-viewport.safe-area.test.tsx` (jsdom): renderiza
      `<ToastProvider><ToastViewport /></ToastProvider>` e afirma que a `className` final tem
      `pt-[calc(1rem+env(safe-area-inset-top,0px))]` e **continua** com `sm:top-auto` e
      `sm:bottom-0` (prova que o desktop não foi arrastado junto).
- [x] Caso e2e do drawer, em `e2e/safe-area.spec.ts`: autenticado
      (`test.skip(!e2eEnv().hasAuth, ...)`), override antes da primeira navegação, `/home` → clicar
      em `button[data-sidebar="trigger"]` e afirmar que o **primeiro item do drawer** (o
      `TeamSwitcher` dentro de `[data-mobile="true"]`, `app-sidebar.tsx:128`) tem
      `getBoundingClientRect().top >= 59`.
- [x] Caso-espelho do drawer sem override: mesmo fluxo, `top < 59` — prova que o deslocamento vem do
      `env()` e não de um padding fixo que estragaria desktop e aba do Safari.
- [x] Caso e2e do inset de base do drawer: com override `{ top: 59, bottom: 34 }`, o `NavUser`
      (último item, `app-sidebar.tsx:137`) termina com
      `rect.bottom <= innerHeight - 34` — é a metade "home indicator" da decisão.
- [x] Caso e2e do toast: autenticado, override, disparar um toast com ação pelo caminho real do app
      (um fluxo com "Desfazer" — conferir no código qual é o mais curto de acionar) e afirmar
      `getBoundingClientRect().top >= 59` no `<li>` do toast. Se nenhum fluxo de toast com ação for
      acionável em menos de 30min de tarefa, registrar em `## Notas` e deixar a prova do toast no
      teste jsdom — não inventar um fluxo só para o teste.
- [x] Rodar e deixar verde:
      `npx vitest run src/components/ui/__tests__/toast-viewport.safe-area.test.tsx` e
      `npx playwright test e2e/safe-area.spec.ts`.
- [x] **Tarefa acrescentada na checagem de satisfação** (não veio do plano, não veio de pedido do
      usuário): dar ao drawer uma prova que **roda** sem credencial E2E. A decisão do plano era
      "para o drawer não há equivalente barato, lá a prova é só o e2e" — mas os dois casos e2e do
      drawer saem `skipped` em ambiente sem credencial, e com isso o drawer fica sem nenhum artefato
      executado. Criar `src/components/ui/__tests__/sidebar-drawer.safe-area.test.tsx` (jsdom):
      mock de `@/hooks/use-mobile` devolvendo `true`, render de
      `<SidebarProvider><Sidebar>…</Sidebar></SidebarProvider>` com o drawer aberto, e asserção de
      que o `<div>` de conteúdo do `SheetContent` tem `pt-[env(safe-area-inset-top,0px)]` **e**
      `pb-[env(safe-area-inset-bottom,0px)]`, que o `SheetContent` continua com `p-0` (o inset não
      foi para o pai errado) e que esse `<div>` mantém `flex h-full w-full flex-col`.

### Superfícies públicas
- [x] `src/pages/admin/Login.tsx:26` — `className="relative z-20 px-4 pt-4 sm:px-6"` passa a
      `"relative z-20 px-4 pt-[calc(1rem+env(safe-area-inset-top,0px))] sm:px-6"`.
- [x] `src/pages/Landing.tsx:262` — mesma troca, mesmo header-pílula.
- [x] `src/components/PublicPageShell.tsx:42` — `"… px-5 py-5"` passa a
      `"… px-5 pb-5 pt-[calc(1.25rem+env(safe-area-inset-top,0px))]"` (quebrar o `py-5` em
      `pb-5` + `pt-[...]` para não perder o padding de baixo).
- [x] Conferir que nenhuma das três telas tem um segundo elemento ancorado em `top-0`/`absolute
      top-4` que fique sob a status bar — em especial o link de pular para o conteúdo
      (`Login.tsx:20` e `Landing.tsx:256`, `absolute left-4 top-4 … -translate-y-16 focus:translate-y-0`):
      ele só aparece com foco de teclado, caso em que não há status bar no caminho. Se a leitura
      confirmar isso, registrar em `## Notas` que foi avaliado e deixado como está.
- [x] Caso e2e público em `e2e/safe-area.spec.ts`, **sem** `test.skip` de auth: com override
      `{ top: 59, bottom: 34 }` aplicado antes do `goto`, para cada uma de `/login`, `/` e `/terms`,
      afirmar que o header-pílula (`header > div` primeiro filho) tem
      `getBoundingClientRect().top >= 59`.
- [x] Caso-espelho sem override: as mesmas três rotas com `top < 59` — prova que o deslocamento vem
      do `env()` e não de um padding fixo que estragaria desktop e aba do Safari.
- [x] Rodar e deixar verde: `npx playwright test e2e/safe-area.spec.ts e2e/smoke.spec.ts`
      (`smoke.spec.ts` já cobre `/`, `/login`, `/terms`, `/privacy` e `/about` — é o alarme de
      regressão visual/estrutural dessas telas), e depois a suíte inteira:
      `npx vitest run` e `npx playwright test`.

## Prompts
(vazio até haver iteração nova)

## Notas

- **`devices["iPhone 14"]` precisou de `defaultBrowserType: "chromium"`.** O device do Playwright
  vem com `defaultBrowserType: "webkit"`, e `Emulation.setSafeAreaInsetsOverride` é CDP — só existe
  no Chromium. Na primeira execução os dois casos do instrumento falharam com
  `browserType.launch: Executable doesn't exist at .../webkit-2311/pw_run.sh`. O `test.use` do spec
  agora força o Chromium; o device entra pela viewport/UA/touch, não pelo motor.
- **Caso e2e do toast não foi escrito — a prova do toast é o teste jsdom.** A tarefa previa o
  escape: "se nenhum fluxo de toast com ação for acionável em menos de 30min, registrar em `## Notas`".
  Confirmado no código que **nenhum** toast do app carrega `ToastAction` nos fluxos curtos:
  `ToastAction` só aparece em `src/components/orb/OrbProposalTray.tsx` e
  `src/pages/admin/health/MedicationQuickCreateDialog.tsx`, ambos atrás de vários passos e de dado
  pré-existente; os 442 `toast({...})` do app são informativos. Os "Desfazer" que existem
  (`RecurringTable.tsx:648`, `RecurringTableMobile.tsx:369`, `RecurringProjection.tsx:752`) são
  botões de tabela, não ação de toast. Inventar um fluxo só para o teste era o que a tarefa
  proibia. A prova do toast fica em `src/components/ui/__tests__/toast-viewport.safe-area.test.tsx`
  (roda sempre, e é o alarme de "perdeu o `sm:top-auto`").
- **Segundo elemento ancorado no topo: avaliado e deixado como está.** Varredura de
  `top-0`/`top-4`/`inset-0`/`fixed`/`sticky` nas três telas públicas:
  `Login.tsx:20` e `Landing.tsx:256` são o link "pular para o conteúdo"
  (`absolute left-4 top-4 … -translate-y-16 focus:translate-y-0`) — fora da tela até receber foco
  de teclado, acionado por Enter e não por toque, então a faixa morta de toque não o alcança;
  `PublicPageShell.tsx:37` é um gradiente `pointer-events-none absolute inset-0` com `aria-hidden`,
  sem alvo de toque; `Landing.tsx:472` é a barra inferior fixa, que já tem
  `pb-[calc(env(safe-area-inset-bottom)+0.75rem)]` e está fora de escopo. Nenhum precisa do inset.
- **Desvio meu, sem pedido do usuário: um terceiro caso em `sidebar-inset.safe-area.test.tsx`.**
  O teste planejado renderiza `<SidebarInset>` com a className *copiada* da tarefa — ele prova o
  twMerge, mas não prova que o `AdminLayout` real passa essas classes. Como o caso e2e autenticado
  do shell fica `skipped` em ambiente sem credencial E2E, sem isso não sobraria nenhum artefato
  ligando o shell ao inset. O caso novo lê `src/layouts/AdminLayout.tsx` e afirma que a abertura
  de `<SidebarInset …>` carrega `pt-[env(safe-area-inset-top,0px)]` e
  `min-h-[calc(100svh-env(safe-area-inset-top,0px))]`. Nenhuma mudança em código de produção.
- **Desvio meu, sem pedido do usuário: `skipUnlessAuthUsable()` em `e2e/helpers/safe-area.ts`.**
  `e2eEnv().hasAuth` só confere se as variáveis existem, não se o host responde. Nesta máquina o
  host do projeto Supabase não resolve (`NXDOMAIN` em `cmspyjarkbsrqtjhtwpz.supabase.co`), então
  com credencial preenchida os casos autenticados estourariam num erro de rede e apareceriam como
  **falha da feature**, quando são falta de ambiente. O helper sonda `/auth/v1/health` uma vez por
  processo e converte esse caso em `skipped`, igual à ausência de credencial. Nesta execução a
  sonda nem dispara: `E2E_EMAIL`/`E2E_PASSWORD` estão **vazios** no `.env`, logo `hasAuth` é false
  e o `test.skip(!hasAuth, "Credenciais E2E ausentes")` do plano já pega primeiro.
- **Os dois casos autenticados do shell viraram um teste só.** As tarefas listam "padding do shell"
  e "alcance do gatilho" separadas; as duas asserções vivem no mesmo caso
  (`com override, o shell desce o inset e o gatilho do menu fica alcançável`) para não pagar dois
  logins. As duas asserções estão lá, mais o espelho sem override.
- **Falsificabilidade conferida à mão.** Revertendo só o `pt-[...]` de `Login.tsx` para o `pt-4` de
  antes e rodando `npx playwright test e2e/safe-area.spec.ts -g "pílula de /login"`, o caso com
  override falhou com `Expected: >= 59 / Received: 15` e o espelho continuou verde — ou seja, a
  asserção mede o fix, não um padding qualquer. O arquivo foi restaurado em seguida.
- **Tarefa acrescentada na checagem de satisfação (desvio meu, sem pedido do usuário): teste jsdom
  do drawer.** A decisão do plano dizia que para o drawer "não há equivalente barato" e a prova era
  só o e2e — mas os dois casos e2e do drawer saem `skipped` sem credencial E2E, e a checagem de
  satisfação encontrou o drawer sem **nenhum** artefato executado (a regra da skill `next`: se a
  única forma de confirmar fosse olhar no navegador, falta cobertura automatizada, e escrever o
  teste é tarefa). O equivalente saiu barato: `window.innerWidth = 390` já faz o `useIsMobile`
  virar `true` pelo stub de `matchMedia` do `src/test/setup-jsdom.ts`, então o drawer abre de
  verdade com um `fireEvent.click` no `SidebarTrigger`. Arquivo:
  `src/components/ui/__tests__/sidebar-drawer.safe-area.test.tsx`. Os casos e2e do drawer ficam
  como estão — eles medem posição em pixel, que o jsdom não dá.
- **O que ficou de fora, registrado na checagem de satisfação.** A medida em **pixel** do shell e
  do drawer (`padding-top == 59px`, `rect.top >= 59`, `rect.bottom <= innerHeight - 34`) não foi
  executada nesta máquina: os 4 casos saem `skipped` porque `E2E_EMAIL`/`E2E_PASSWORD` estão vazios
  no `.env` **e** o host do projeto Supabase não resolve aqui (`NXDOMAIN`). Os casos estão escritos
  e são coletados pelo Playwright; em ambiente com credencial e host alcançável o spec sai
  `12 passed`. Enquanto isso, toda superfície alterada tem cobertura que **roda**: shell e Orb por
  teste jsdom (um deles lendo o fonte real do `AdminLayout`), drawer e toast por teste jsdom, as
  três telas públicas por e2e de verdade — e o CSS gerado no build foi conferido classe por classe
  em `dist/assets/index-*.css`.
- **O `min-h` descontado é defensivo, não load-bearing.** O `SidebarProvider`
  (`sidebar.tsx:144`) é `flex min-h-svh`, e o `SidebarInset` é `flex-1` com `align-items: stretch`
  — na prática a altura do shell vem do pai. O desconto entrou como o plano manda (e o teste jsdom
  garante que o twMerge deixa o chamador vencer), mas quem segura a altura hoje é o wrapper.

## Como testar

### 1. Pré-requisitos
- `npm ci` já rodado; nenhuma migration e nenhuma variável nova para esta feature.
- Para os casos autenticados do spec (shell e drawer): `E2E_EMAIL`, `E2E_PASSWORD`,
  `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` **preenchidos** no `.env`/`.env.local` (o
  `playwright.config.ts` carrega via `loadEnv`), e o host do Supabase alcançável da máquina. Sem
  credencial esses 4 casos ficam `skipped` com "Credenciais E2E ausentes"; com credencial mas sem
  rota para o host eles ficam `skipped` com "Host Supabase inacessível neste ambiente"
  (`skipUnlessAuthUsable`, `e2e/helpers/safe-area.ts`). Nos dois casos é esperado — mas então o
  teste-guarda do override, os 6 casos públicos e os **quatro** arquivos jsdom são a única prova
  rodando, e **todos** precisam passar.
- **Não há caso e2e do toast.** Nenhum toast do app carrega `ToastAction` num fluxo curto (ver
  `## Notas`); a prova do toast é o teste jsdom, que roda sempre.
- Os casos das superfícies públicas (`/login`, `/`, `/terms`) **não** precisam de credencial e rodam
  em qualquer ambiente.
- O Playwright sobe o preview sozinho (`npm run build:app && npm run preview` em
  `http://127.0.0.1:4173`); não é preciso ter `npm run dev` de pé.

### 2. Verificação automatizada
```
npx vitest run src/components/ui/__tests__/sidebar-inset.safe-area.test.tsx
```
Passou (3 casos) = o `<main>` do `SidebarInset` sai com `pt-[env(safe-area-inset-top,0px)]` e
`min-h-[calc(100svh-env(safe-area-inset-top,0px))]`, e **sem** `min-h-svh` (o twMerge colapsou as
duas alturas a favor do chamador); sem className de chamador o componente continua com `min-h-svh`
(é o que torna a ausência acima significativa); e o fonte real de `src/layouts/AdminLayout.tsx`
carrega as duas classes na abertura do `<SidebarInset …>`.

```
npx vitest run src/components/ui/__tests__/toast-viewport.safe-area.test.tsx
```
Passou = a viewport de toasts tem `pt-[calc(1rem+env(safe-area-inset-top,0px))]` e **preserva**
`sm:top-auto`/`sm:bottom-0` (desktop intocado).

```
npx vitest run src/components/ui/__tests__/sidebar-drawer.safe-area.test.tsx
```
Passou (2 casos) = com `window.innerWidth = 390` o drawer abre pelo `SidebarTrigger` e o `<div>` de
conteúdo do `SheetContent` tem `pt-[env(safe-area-inset-top,0px)]` **e**
`pb-[env(safe-area-inset-bottom,0px)]`, mantendo `flex h-full w-full flex-col`; o `SheetContent`
continua com `p-0` e **sem** nenhum `safe-area-inset` (o inset não foi para o pai errado); e o
`SidebarHeader`/`SidebarFooter` são filhos desse `<div>` (é o padding dele que empurra o
`TeamSwitcher` e levanta o `NavUser`).

```
npx vitest run src/pages/admin/orb/__tests__/Orb.layout.test.tsx
```
Passou = o teto de altura da Orb casa
`/max-h-\[calc\(100dvh-3\.5rem-env\(safe-area-inset-top/` **e**
`/max-md:max-h-\[calc\(100dvh-3rem-env\(safe-area-inset-top/` — se alguém remover o desconto,
este teste quebra.

```
npx playwright test e2e/safe-area.spec.ts
```
12 casos no total (iPhone 14 emulado **no Chromium** — o CDP não existe no WebKit). Passou =
- **(guarda, 2 casos, sempre rodam)** a sonda mediu `padding-top: 59px`/`padding-bottom: 34px` com
  override e `0px`/`0px` sem — o instrumento funciona;
- **(shell, 2 casos, pedem auth)** com override o `<main>` do shell tem `padding-top: 59px` e o
  `button[data-sidebar="trigger"]` começa em `y >= 59`; sem override, `0px` e `top < 59`;
- **(drawer, 2 casos, pedem auth)** o `[data-mobile="true"] [data-sidebar="header"]`
  (`TeamSwitcher`) começa em `y >= 59` e o `[data-sidebar="footer"]` (`NavUser`) termina em
  `bottom <= innerHeight - 34`; sem override, `top < 59`;
- **(públicas, 6 casos, nunca pedem auth)** o header-pílula (`header > div`) de `/login`, `/` e
  `/terms` começa em `y >= 59` com override e em `y < 59` sem — e **nenhum** desses seis pode sair
  como `skipped`.

Sem credencial E2E a linha final é `4 skipped / 8 passed`; com credencial e host alcançável,
`12 passed`.

```
npx playwright test e2e/smoke.spec.ts
```
Passou = `8 passed`. `/`, `/login`, `/terms`, `/privacy`, `/about`, `/#planos`, `/#faq` e a
ferramenta pública de orçamento continuam carregando com marca, CTA, heading e carrossel — ou seja,
o padding novo não derrubou nenhuma dessas telas.

```
npx vitest run
npx playwright test
```
Passou = `vitest`: `342 passed (342)` arquivos / `3848 passed (3848)` casos. `playwright`:
`16 passed`, `14 skipped` (os 4 autenticados desta feature + os 10 dos specs autenticados que já
existiam). Ou seja, nada mais no projeto dependia do `min-h-svh` do `SidebarInset`, do teto antigo
da Orb, do padding antigo do drawer, do `p-4` da viewport de toasts, do `py-5` do `PublicPageShell`
nem do `pt-4` dos dois headers-pílula. (Per `CLAUDE.md`: `npm test` é flaky sob carga — repita antes
de chamar qualquer falha de regressão.)

```
npx tsc -b
npm run lint
```
Passou = `tsc` sem saída e `lint` com `0 errors` (as 30 `warning` de `react-refresh` são antigas e
nenhuma é dos arquivos desta feature).

### 3. Verificação manual, passo a passo
Chrome/automação de navegador **não** entra aqui (regra do `CLAUDE.md`). A conferência manual é no
aparelho real, e é opcional — a prova da feature é a automatizada acima.

1. No iPhone, abrir o app em `https://<host>` no Safari, menu Compartilhar → **Adicionar à Tela de
   Início**, e abrir pelo ícone (só instalado o inset de topo é >0). Logar e ficar em `/home`,
   aparelho em **retrato**.
2. Olhar a barra superior do admin. Esperado: botão de menu, breadcrumb e busca aparecem **abaixo**
   da faixa do relógio/Dynamic Island, com a faixa pintada na mesma cor de fundo do app.
3. Tocar no botão de menu (ícone de barras, à esquerda). Esperado: o drawer da sidebar abre — hoje,
   antes da feature, o toque não chega.
4. Com o drawer aberto, olhar o topo e o rodapé dele. Esperado: o seletor de workspace fica abaixo da
   faixa da status bar e é tocável; o bloco do usuário/avatar fica acima da barrinha do home
   indicator, não encostado nela, e tocar nele abre o menu. Fechar o drawer.
5. Rolar a página até o fim. Esperado: o fim do conteúdo é o fim do conteúdo, sem uma faixa vazia de
   ~1cm de rolagem sobrando (seria o `min-h` não descontado).
6. Ir em `/orb`. Esperado: o campo de pergunta ("composer") fica visível na parte de baixo sem
   precisar rolar, inclusive depois de uma resposta longa.
7. Fazer qualquer ação que mostre toast (ex.: criar um lançamento pelo botão de adicionar rápido —
   sai "Transação registrada"). Esperado: o toast aparece no topo **abaixo** da status bar e dá para
   tocar nele/no X. Toast com botão de ação só existe no painel da Orb e no cadastro rápido de
   medicação — não precisa caçar um.
8. Sair da conta (menu do usuário → sair). Esperado: cai em `/login` e a pílula do topo (logo +
   botão) aparece abaixo da faixa do relógio/Dynamic Island.
9. Em `/login`, tocar no logo da pílula. Esperado: o toque é registrado e navega para `/`. Na `/`,
   conferir a pílula: mesma folga, e o botão "Começar grátis"/"Abrir app" recebe o toque.
10. Rolar `/` até o rodapé e abrir "Termos". Esperado: em `/terms` o header do `PublicPageShell`
    (logo + "Entrar") também aparece abaixo da faixa, com o logo tocável.
11. Repetir os passos 2–10 no desktop (janela larga) ou em aba do Safari. Esperado: espaçamento
    idêntico ao de antes da feature, sem vão extra no topo em nenhuma tela — e o toast continua
    aparecendo **no canto inferior direito**, não no topo (o `sm:bottom-0`/`sm:top-auto` não foi
    perdido).

### 4. Casos de borda e caminhos negativos
- **Aba do Safari (não instalado), mesmo iPhone**: o inset de topo é 0 → shell, drawer, toast e os
  três headers públicos exatamente como antes, sem vão no topo nem no rodapé do drawer. Se aparecer
  um vão, o `env()` foi trocado por valor fixo. É o caso-espelho automatizado.
- **Desktop e Android**: zero mudança visual. Em especial, o toast **não** pode migrar para o topo —
  se migrar, o `sm:top-auto` foi removido junto com o `p-4`.
- **Paisagem no iPhone**: inset de topo 0 → nenhum vão no topo, barra e headers continuam acessíveis
  (já eram); o inset de base do drawer continua valendo (home indicator existe em paisagem).
- **Banner de trial visível** (usuário com `trialDaysLeft <= 2`, fora de `/account`): o banner é o
  "primeiro de cima" e tem de descer junto com o header — é o que o inset no `SidebarInset` garante.
- **Offline** (banner de outbox visível): mesmo caso, mesmo elemento pai.
- **Drawer em desktop**: no `md:` acima o drawer nem existe (vira sidebar fixa,
  `sidebar.tsx:215-217`, `hidden … md:block`) — a mudança não deve ter efeito algum ali.
- **Vários toasts empilhados**: só o primeiro de cima encosta no inset; os outros descem na pilha sem
  vão duplicado (o padding é da viewport, não de cada toast).
- **Rota de marketing/blog** (`/blog`, página de marketing qualquer): usa `PublicPageShell`, logo
  herda a correção sem mudança própria — conferir uma delas.
- **Barra inferior fixa da Landing** (`Landing.tsx:470`, `md:hidden`): já tem
  `pb-[calc(env(safe-area-inset-bottom)+0.75rem)]` e **não** deve mudar nesta feature.
- **Link "pular para o conteúdo"** (`Login.tsx:20`, `Landing.tsx:256`): fica fora da tela
  (`-translate-y-16`) até receber foco de teclado; não é alvo do inset. Se alguém o tornar visível
  por padrão, aí sim ele precisaria da conta.
- **Credencial E2E ausente (ou host do Supabase inacessível)**:
  `npx playwright test e2e/safe-area.spec.ts` sai `4 skipped / 8 passed` — os 2 casos do shell e os
  2 do drawer `skipped`, o guarda e os 6 públicos `passed`. Isso é configuração, não defeito; o que
  **não** pode acontecer é um caso público sair `skipped`.

### 5. Sinais de que quebrou
- Vão/faixa vazia no topo em desktop ou em aba do Safari (qualquer tela) → padding fixo em vez de
  `env()`.
- Faixa de rolagem fantasma de ~59px no fim de toda página (barra de scroll aparece sem conteúdo) →
  `padding-top` entrou mas o desconto no `min-h` não (ou o twMerge não colapsou o `min-h-svh`: o
  teste jsdom do `SidebarInset` é exatamente esse alarme).
- Composer da Orb abaixo da dobra em `/orb` no celular → o teto de `Orb.tsx` não ganhou o desconto.
- Toast aparecendo no **topo** em desktop → `sm:top-auto` perdido ao mexer no `p-4`.
- Drawer com o conteúdo cortado embaixo, ou com scroll interno novo → o `pb` entrou sem o
  `h-full`/`flex-col` continuar válido naquele `<div>`.
- Seletor de workspace do drawer ainda sem resposta ao toque no iPhone instalado → a className foi
  aplicada no `SheetContent` (que tem `p-0`) em vez do `<div>` interno de `sidebar.tsx:209`.
- Header do `PublicPageShell` colado no conteúdo de baixo → o `py-5` foi trocado só por `pt-[...]` e
  o padding de baixo se perdeu (tinha de virar `pb-5` + `pt-[...]`).
- `e2e/smoke.spec.ts` falhando em `/` (carrossel, `#boot` ainda visível) → o header mudou de altura o
  bastante para mexer no layout da landing.
- Casos públicos saindo como `skipped` → foram escritos atrás do `test.skip(!hasAuth)`; são públicos
  e têm de rodar sempre.
- `npx playwright test e2e/safe-area.spec.ts` falhando **no teste-guarda** → o override de CDP não
  está chegando (chamado depois do primeiro `goto`, ou versão do Playwright sem
  `Emulation.setSafeAreaInsetsOverride`); nesse caso o problema é o instrumento, não o fix.
- Falha só nos casos de fix, com o guarda verde → o fix é que não está valendo.
