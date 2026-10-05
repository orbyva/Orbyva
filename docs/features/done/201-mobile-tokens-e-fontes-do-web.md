---
prompt: |-
  Pedido do usuário, verbatim (02/10/26):

  Eu queria também melhorar o front do mobile. To achando muito, sei lá. Deixar algo mais parecido com o web, sabe?
  Sim (fundação primeiro, telas em ondas, navegação por último)
  Vamos trabalhar só na melhora do front mobile
  pode arrochar

  O que incomoda (respostas do usuário): parece genérico, componentes com cara diferente do web,
  espaçamento/densidade, tipografia, navegação ("não sei dizer exatamente"), telas inconsistentes.
  Escopo: mesma identidade visual do web, com padrões nativos de celular — não espelho tela a tela.

  Respostas do planning (P1–P4, todas a recomendada): aparência provada por funções puras no
  Vitest atual + teste-guarda + paridade de tokens com o web; Syne em título de tela, título de
  card de destaque e valores grandes; ondas Finanças → Produtividade → Vida → Conteúdo e viagens →
  Conta, login e Orb; densidade aproximada do web, conferida com o usuário ao fim da onda 1.

  Fatia desta feature — a fundação: paleta, raio, escala tipográfica e fontes do web no mobile,
  sem tocar tela. Série: 201 (esta) → 202 primitivas → 203–207 ondas. Navegação fica para um
  planning próprio depois da 207.
---

# 201 — Mobile: tokens e fontes do web

## Contexto
Primeira da série que leva a identidade do web ao app Expo (`mobile/`). As rodadas visuais da 098
(seções 3e e 11) foram retoque tela a tela verificado só com `tsc`, e o app voltou a derivar: hoje
`mobile/src/constants/theme.ts` tem 9 cores próprias (`primary #0EA5E9` nos dois temas, fundo
claro `#F8FAFC` frio, `Radius.card 16`), nenhuma fonte é carregada (`expo-font` instalado, sem
`useFonts`) e `themed-text.tsx` usa a fonte do sistema.

O web (`src/index.css`, `tailwind.config.js`) usa Plus Jakarta Sans 400–700 no corpo, Syne
600/700 no `font-display`, `--radius: 0.625rem` e a paleta HSL de claro/escuro.

Esta feature troca a raiz. Como as telas leem cor por `useTheme()` e texto por `ThemedText` (145
arquivos), o app inteiro muda de paleta e fonte sem tocar uma tela.

## Decisões
- **Os nomes atuais de cor ficam, como apelidos**: as telas usam `theme.primary` 246×,
  `textSecondary` 199×, `backgroundSelected` 171×, `backgroundElement` 143×, `text` 110×,
  `background` 59×, `danger` 49×, `success` 35×, `surface` 24×. Renomear quebraria ~1000 usos de uma
  vez. Mapeamento: `text`→`foreground`, `surface`→`card`, `backgroundElement`→`muted`,
  `backgroundSelected`→`border`, `textSecondary`→`mutedForeground`, `danger`→`destructive`;
  `background`, `primary`, `success` mantêm o nome. Os nomes do web entram ao lado e são os que as
  primitivas (202) usam; os apelidos somem nas ondas, quando a última tela deixar de usá-los.
- **Cores em hex**, convertidas do HSL do web: `hexAlpha` (`mobile/src/lib/color.ts`) só aceita hex
  e é usado em todo lugar. A conversão não é feita em runtime — o hex vai literal em `theme.ts` e o
  teste de paridade garante que bate com o `src/index.css`.
- `ModuleColors` (hoje 5 cores fixas, sem tema) passa a ter claro/escuro com os valores de `--hub`,
  `--productivity`, `--life`, `--health`, `--cinema`, `--travel`, `--car`, e `finance` = `primary`.
  O formato de acesso que as 3 telas usam continua funcionando.
- Fontes via `@expo-google-fonts/plus-jakarta-sans` e `@expo-google-fonts/syne`, só os pesos do
  web (Plus Jakarta 400/500/600/700, Syne 600/700). Carregadas no `app/_layout.tsx`; o splash só
  some com fontes prontas.
- **Peso = família**: no Android `fontWeight` não escolhe o arquivo de uma fonte customizada. A
  escala tipográfica devolve `fontFamily` por peso (`PlusJakartaSans_600SemiBold`, …) e não usa
  `fontWeight` junto.
- Syne tem glifos que passam do em-box (nota em `src/index.css:9`): os estilos display levam
  `lineHeight` folgado (≥ 1.3× o tamanho).
- Corpo continua 16 (o web usa 14) — padrão de legibilidade do iOS/Android.

## Tarefas
- [x] Criar `mobile/src/domain/ui/color.ts` (puro): `hslToHex("199 89% 36%")` aceitando o formato
      das variáveis do `src/index.css` (três números, `%` nos dois últimos) e devolvendo `#RRGGBB`
      maiúsculo.
- [x] Escrever `mobile/src/domain/ui/__tests__/color.test.ts`: casos conhecidos (`0 0% 100%` →
      `#FFFFFF`, `0 0% 0%` → `#000000`, `199 89% 36%` e `222 47% 6%` contra valores calculados à
      mão) e entrada inválida lançando erro.
- [x] Reescrever `Colors` em `mobile/src/constants/theme.ts`: chaves do web em camelCase
      (`background`, `foreground`, `card`, `cardForeground`, `popover`, `popoverForeground`,
      `primary`, `primaryForeground`, `secondary`, `secondaryForeground`, `muted`,
      `mutedForeground`, `accent`, `accentForeground`, `destructive`, `destructiveForeground`,
      `success`, `successForeground`, `warning`, `warningForeground`, `border`, `input`, `ring`,
      `chart1`…`chart6`) em hex literal, claro e escuro, mais os apelidos da Decisão apontando para
      o mesmo valor. `ThemeColor` continua sendo a interseção das chaves.
- [x] `ModuleColors` em `theme.ts` vira `{ light: {...}, dark: {...} }` com `hub`, `finance`,
      `productivity`, `life`, `health`, `entertainment` (= `--cinema`), `travel`, `car`; ajustar os
      3 arquivos que o importam (`rg -l ModuleColors mobile/src`) para ler pelo esquema atual.
- [x] `Radius` em `theme.ts`: `lg: 10`, `md: 8`, `sm: 6`, `full: 999`. Manter `card`, `input`,
      `control`, `chip` como apelidos (`card`/`input`/`control` → `lg`, `chip` → `full`) até as
      ondas trocarem os usos.
- [x] Criar `mobile/src/domain/ui/__tests__/tokenParity.test.ts`: lê `../../src/index.css` da raiz
      do repo com `fs` (caminho a partir de `__dirname`), extrai as variáveis de `:root` e `.dark`,
      converte com `hslToHex` e compara com `Colors.light`/`Colors.dark` chave a chave, com
      tolerância de 1 unidade por canal (arredondamento). Também confere `--radius` (0.625rem → 10)
      contra `Radius.lg`, e cada cor de módulo contra a variável correspondente.
- [x] Instalar fontes no `mobile/`: `npx expo install @expo-google-fonts/plus-jakarta-sans
      @expo-google-fonts/syne`.
- [x] Criar `mobile/src/domain/ui/typography.ts` (puro): `FontFamily` (os 6 nomes de arquivo:
      `PlusJakartaSans_400Regular`, `_500Medium`, `_600SemiBold`, `_700Bold`, `Syne_600SemiBold`,
      `Syne_700Bold`), `fontFor(weight: 400|500|600|700, display?: boolean)` (display só aceita
      600/700; pedir 400/500 em display cai em 600) e a escala `TypeScale` com `display` (28/36,
      Syne 700), `title` (22/30, Syne 700), `heading` (18/24, 600), `body` (16/24, 400),
      `bodyStrong` (16/24, 600), `label` (14/20, 500), `caption` (13/18, 500), `micro` (11/14, 600),
      `value` (28/36, Syne 700), `mono` (12/18, `Fonts.mono`). Cada entrada: `{ fontFamily,
      fontSize, lineHeight }`, sem `fontWeight`.
- [x] Escrever `mobile/src/domain/ui/__tests__/typography.test.ts`: `fontFor` devolve a família
      certa por peso e o fallback de display; nenhuma entrada de `TypeScale` tem `fontWeight`; todo
      estilo Syne tem `lineHeight >= 1.3 * fontSize`; `body.fontSize === 16`.
- [x] Carregar fontes em `mobile/src/app/_layout.tsx`: `useFonts` com os 6 arquivos no
      `RootLayout`; o `SplashGate` só chama `hideAsync` e só renderiza filhos com
      `fontsLoaded || fontError` (erro de fonte não pode prender o app no splash — cai na do
      sistema).
- [x] Reescrever os estilos de `mobile/src/components/themed-text.tsx` sobre `TypeScale`, mantendo
      os `type` existentes para não quebrar os 145 usos: `default`→`body`, `title`→`title`,
      `value`→`value`, `subtitle`→`heading`, `small`→`caption`, `smallBold`→`caption` com
      `fontFor(700)`, `link`→`caption`, `linkPrimary`→`caption` + `theme.primary` (hoje é
      `'#0EA5E9'` cravado), `code`→`mono`. Acrescentar os `type` novos `display`, `heading`,
      `body`, `bodyStrong`, `label`, `caption`, `micro`.
- [x] Rodar `cd mobile && npm test`, `npm run typecheck` e `npm run lint`. (`lint` não verifica
      nada hoje — ver Notas.)

## Prompts

## Notas
- 02/10/26 — conferência no aparelho feita junto com a onda de Finanças (203), que usa os tokens, as fontes e as primitivas; o usuário aprovou: "Agora ficou bom demais. Bora avançar".
- 2026-10-02 — `ModuleColors` com tema exigiu `useModuleColors()` em `hooks/use-theme.ts`: os
  dois consumidores (`HubUpcoming`, `HubModulesGrid`) liam a cor fora do componente. Em
  `HubModulesGrid` o campo virou `tint` (chave de módulo ou hex); Saúde, Viagens e Veículos
  passaram a usar `health`/`travel`/`car` do web, os outros tiles seguem com hex até a 207.
- 2026-10-02 — `weightToFamily` (em `domain/ui/typography.ts`, com teste): o `ThemedText` traduz
  `fontWeight` passado no `style` para a família do mesmo peso. Sem isso, os textos que as telas
  deixam em negrito via `style` perderiam o negrito no Android e poderiam cair na fonte do sistema
  no iOS até cada onda migrar.
- 2026-10-02 — Fontes importadas por peso (`@expo-google-fonts/.../600SemiBold`): importar pela
  raiz do pacote colocava os 19 arquivos (todos os pesos e itálicos, ~1,7 MB) no bundle.
  Conferido com `npx expo export --platform ios`: só os 6 `.ttf` do web entram.
- 2026-10-02 — Hex dos tokens gerados pela própria `hslToHex` a partir do `src/index.css`, não à
  mão. Escala: `display`/`value` com `lineHeight` 38 (não 36) para passar a regra de 1.3× da Syne.
- 2026-10-02 — `npm run lint` no `mobile/` não analisa nenhum arquivo ("all of the files matching
  the glob pattern … are ignored"). Já era assim antes desta feature; não há config de ESLint em
  `mobile/`. Fica registrado, fora do escopo.
- 2026-10-02 — Prova da paridade: `--primary` do web trocado para `199 89% 40%` derrubou
  `light.primary` e `light.module.finance` no `tokenParity.test.ts`; CSS restaurado.
- Verificação: `npm test` 181/181 (24 arquivos), `npm run typecheck` limpo, bundle iOS exportado.
  Falta a conferência visual no aparelho (passo 3 do Como testar).
- 2026-10-05 — movida para `done/` na limpeza dos `.md`: todas as tarefas `[x]` e conferência no
  aparelho já aprovada pelo usuário em 02/10 ("Agora ficou bom demais. Bora avançar").

## Como testar

1. **Pré-requisitos**
   - `cd mobile && npm install` (puxa os dois pacotes de fonte).
   - Simulador iOS ou Android com Expo Go / dev build (`npm run ios` ou `npm run android`).

2. **Verificação automatizada**
   - `cd mobile && npm test` — passam `color.test.ts`, `tokenParity.test.ts` e
     `typography.test.ts`, além da suíte que já existia.
   - `npm run typecheck` e `npm run lint` sem erro.
   - Prova de que a paridade morde: no `src/index.css` do web, mude `--primary` do `:root` para
     `199 89% 40%` e rode `npm test` no `mobile/` → `tokenParity.test.ts` falha apontando
     `primary`. Desfaça a mudança.

3. **Verificação manual, passo a passo**
   1. Abra o app logado no tema claro → o fundo é off-white levemente quente (não cinza-azulado) e
      os botões primários são um azul mais escuro e sóbrio que antes.
   2. Compare uma tela qualquer com a mesma tela do web lado a lado → o azul principal e o fundo
      batem.
   3. Títulos de tela (ex.: "Finanças") aparecem na Syne — letras largas e geométricas, a mesma
      dos títulos do web; textos de lista e de formulário em Plus Jakarta Sans.
   4. Troque para o tema escuro em Conta → fundo azul-marinho profundo do web, primário mais claro.
   5. Feche o app por completo e abra de novo → o splash some só com as fontes prontas; nenhum texto
      pisca trocando de fonte.

4. **Casos de borda e caminhos negativos**
   - Valor grande (saldo no Início) em Syne → não corta topo nem base dos dígitos.
   - Android: títulos em negrito aparecem realmente em negrito (se aparecerem finos, o peso caiu no
     `fontWeight` em vez da família).
   - Modo avião no primeiro boot depois da instalação → o app abre normalmente (as fontes vêm no
     bundle, não da rede).

5. **Sinais de que quebrou**
   - App preso no splash → `SplashGate` esperando fonte que falhou sem tratar `fontError`.
   - Texto em fonte do sistema no Android e certo no iOS → estilo usando `fontWeight` com família
     base em vez de `fontFor`.
   - Alguma tela com cor "sumida" (texto invisível, borda some) → um apelido antigo ficou sem valor
     em um dos temas.
