---
prompt: |-
  Pedido do usuário, verbatim (02/10/26):

  Eu queria também melhorar o front do mobile. To achando muito, sei lá. Deixar algo mais parecido com o web, sabe?
  Sim (fundação primeiro, telas em ondas, navegação por último)
  Vamos trabalhar só na melhora do front mobile
  pode arrochar

  Escopo: mesma identidade visual do web, com padrões nativos de celular — não espelho tela a tela.
  Resposta P1 do planning: aparência provada por funções puras no Vitest atual (sem novo runner).

  Fatia desta feature — as primitivas: componentes de `mobile/src/components/ui` espelhando o
  shadcn do web em nome, variantes e aparência, com o estilo de cada variante numa função pura
  testável. Não migra tela (isso é 203–207).
---

# 202 — Mobile: primitivas espelhando o shadcn do web

## Contexto
Depende de 201 (tokens, `TypeScale`, `fontFor`).

Hoje `mobile/src/components/ui` tem 6 peças (`Banner`, `Card` de 29 linhas, `CollapsibleChrome`,
`FormButton`, `FormSection`, `ModuleSection`) e o resto do app monta botão, input, chip e card à
mão — 253 hex literais em 99 arquivos. O web tem `button`, `card`, `badge`, `input`, `tabs`,
`separator`, `skeleton`, `sheet` em `src/components/ui/` com variantes `cva`.

Referência das variantes do web: `button.tsx` (default / destructive / outline / secondary / ghost /
link; default `h-9 px-4`, sm `h-8 px-3 text-xs`, lg `h-10 px-8`, icon `h-9 w-9`; `rounded-md`
`text-sm font-medium`), `card.tsx` (`rounded-xl border-border/60 bg-card shadow-sm`, header/content
`p-4`, title `text-base font-semibold`), `badge.tsx` (`rounded-full px-2.5 py-0.5 text-xs
font-semibold`; default / secondary / destructive / outline), `input.tsx` (`h-10 rounded-md border
border-input px-3 text-base`).

## Decisões
- Estilo de cada primitiva sai de `resolve<Nome>Style(props, scheme)` em
  `mobile/src/domain/ui/variants/` — puro, sem import de `react-native` (devolve objetos de estilo
  planos). O componente só aplica. É o que torna a aparência testável no Vitest node atual.
- Mesmos nomes de variante do web, para quem conhece um lado reconhecer o outro.
- **Padrão nativo** onde o web é desktop: área de toque mínima 44pt (botão `sm` tem altura visual
  32 mas `hitSlop` até 44), feedback de pressão por opacidade/fundo em vez de hover, haptic leve em
  ação primária e destrutiva (`mobile/src/lib/haptics.ts`), `Sheet` (modal de baixo) no papel de
  dialog/popover/select.
- Alturas: o web usa 36 no botão default; no mobile o default é 44 (toque) e `sm` 36. O resto da
  proporção (padding, raio `md` 8, fonte `label`) segue o web.
- `FormButton` vira um wrapper fino sobre `Button` (`tone` → `variant`: `primary`→`default`,
  `danger`→`destructive`, `neutral`→`outline`) e fica marcado para sumir nas ondas. `Card` atual é
  substituído pelo novo (mesmo nome, mesmo import), com `CardHeader`/`CardTitle`/`CardContent`/…
  ao lado.
- Sombra: só `shadow-sm` equivalente e só no `Card`/`Button default` — a 098 (3f) já tirou sombra
  pesada de iOS por performance.

## Tarefas
- [x] Criar `mobile/src/domain/ui/variants/button.ts`: `resolveButtonStyle({ variant, size,
      disabled, pressed }, scheme)` → `{ container, label, hitSlop }`. Variantes `default`,
      `destructive`, `outline`, `secondary`, `ghost`, `link`; tamanhos `sm` (36), `default` (44),
      `lg` (48), `icon` (44×44). Cores dos tokens da 201 (`primary`/`primaryForeground`, …),
      `disabled` → opacidade 0.5, `pressed` → fundo do web em hover (`primary` a 90%, `accent` no
      outline/ghost) via `hexAlpha`.
- [x] Criar `variants/card.ts` (`resolveCardStyle(scheme)` + estilos de header, title, description,
      content, footer: padding 16, raio `lg` 10 — o `rounded-xl` do web é 12, mas o raio-base é o
      `--radius`; usar 12 só se a paridade visual pedir e registrar em Notas), `variants/badge.ts`
      (4 variantes do web + `success` e `warning`), `variants/input.ts` (estados `default`,
      `focused` → borda `ring`, `invalid` → borda `destructive`, `disabled`), `variants/chip.ts`
      (`selected` / não selecionado, com cor de módulo opcional), `variants/tabs.ts` (segmento:
      trilho `muted`, aba ativa `background` + sombra leve, igual ao `TabsList` do web).
- [x] Escrever `mobile/src/domain/ui/__tests__/variants.test.ts`: para cada resolver, nos dois
      temas — cor de fundo/texto/borda batem com o token esperado; `button` de todo tamanho tem
      altura + `hitSlop` ≥ 44; `disabled` reduz opacidade; nenhum estilo devolvido tem cor hex que
      não esteja em `Colors[scheme]` (ou derivada por `hexAlpha` de uma que esteja); toda fonte vem
      de `TypeScale`.
- [x] Criar os componentes em `mobile/src/components/ui/`: `Button.tsx` (com `loading` →
      `ActivityIndicator`, `leftIcon`/`rightIcon`, haptic em `default`/`destructive`), `Card.tsx`
      (substitui o atual; exporta `Card`, `CardHeader`, `CardTitle`, `CardDescription`,
      `CardContent`, `CardFooter`), `Badge.tsx`, `Input.tsx` + `Textarea.tsx` (sobre `TextInput`,
      com `label`, `error` e `hint` opcionais), `Label.tsx`, `Chip.tsx`, `Separator.tsx`,
      `Skeleton.tsx` (pulso com `react-native-reanimated`), `Tabs.tsx` (segmento controlado:
      `value`, `onValueChange`, `items`).
- [x] Criar `mobile/src/components/ui/ListRow.tsx` (linha de lista: ícone/thumb opcional, título
      `bodyStrong`, subtítulo `caption` `mutedForeground`, trailing opcional, chevron opcional,
      pressable com feedback), `ScreenHeader.tsx` (título `title` em Syne + subtítulo opcional +
      ações à direita — só o bloco de conteúdo; o header nativo do stack não muda nesta série),
      `EmptyState.tsx` (ícone, título, descrição, ação opcional — mesmo papel do `EmptyState` do
      web) e `Sheet.tsx` (modal de baixo com alça, título e conteúdo rolável; sobre `Modal` com
      `presentationStyle="pageSheet"` no iOS).
- [x] Reescrever `FormButton.tsx` como wrapper de `Button` (mapeamento da Decisão), mantendo a
      assinatura atual para os usos existentes continuarem compilando.
- [x] Revisar `FormSection.tsx`, `ModuleSection.tsx` e `Banner.tsx` para usarem tokens e
      `TypeScale` (sem hex, sem `fontSize` solto) — eles já são usados em muitas telas e entram
      prontos nas ondas.
- [x] Criar `mobile/src/components/ui/index.ts` exportando todas as primitivas.
- [x] Acrescentar em `docs/stack.md`, depois de "Convenções de UI", a seção "Convenções de UI do
      mobile": tokens em `mobile/src/constants/theme.ts` (paridade testada com o web), tipografia
      por `TypeScale`/`ThemedText`, primitivas em `mobile/src/components/ui` com estilo em
      `domain/ui/variants`, e a regra "tela não escreve hex, `fontSize` nem `fontFamily`" (o
      teste-guarda chega na 203).
- [x] Rodar `cd mobile && npm test`, `npm run typecheck` e `npm run lint`. (`lint` segue sem
      analisar arquivo nenhum — ver Notas da 201.)

## Prompts

## Notas
- 02/10/26 — conferência no aparelho feita junto com a onda de Finanças (203), que usa os tokens, as fontes e as primitivas; o usuário aprovou: "Agora ficou bom demais. Bora avançar".
- 2026-10-02 — Card com raio 12 (`Radius.xl`), não 10: o `Card` do web usa `rounded-xl`, que é o
  12 padrão do Tailwind e não deriva do `--radius`. Era o caso previsto na tarefa ("usar 12 só se a
  paridade visual pedir").
- 2026-10-02 — O `Card` novo tem sombra equivalente ao `shadow-sm` (opacidade 0.06, raio 2) nos 32
  usos existentes — o antigo não tinha nenhuma. É leve de propósito (a 098/3f tirou sombra pesada
  de iOS); se algum card em lista longa pesar, a sombra sai do `shadowSm` em `variants/shared.ts`.
- 2026-10-02 — Botões em semibold (600), não o `font-medium` (500) do web: a reclamação de 14/09
  na 098 era justamente botão que "nem parece clicável".
- 2026-10-02 — `FormBlock`/`FormSection`/`ModuleSection`/`Banner`: além dos tokens, padding 14 → 16
  (densidade da P4). O título de `FormBlock` virou `micro` em `mutedForeground` (antes 11px na cor
  do texto).
- 2026-10-02 — `Sheet` sobre `Modal` `pageSheet`: no iOS tem o gesto nativo de arrastar para
  fechar; no Android vira tela cheia com a mesma estrutura (não há bottom sheet nativo sem
  dependência nova).
- 2026-10-02 — Prova do teste: `destructive` do botão trocado por `#FF0000` derrubou 4 casos de
  `variants.test.ts` (token esperado e checagem de paleta); revertido.
- Verificação: `npm test` 249/249 (25 arquivos), `npm run typecheck` limpo, bundles iOS e Android
  exportados. `Button` e `Card` entram no bundle pelos usos atuais; as primitivas ainda sem uso em
  tela (`Tabs`, `Sheet`, `Skeleton`, `Chip`, `Badge`, `Input`, `ListRow`, `ScreenHeader`,
  `EmptyState`) só ficam provadas no bundle quando a 203 as usar.
- 2026-10-05 — movida para `done/` na limpeza dos `.md`: todas as tarefas `[x]` e conferência no
  aparelho já aprovada pelo usuário em 02/10 ("Agora ficou bom demais. Bora avançar").

## Como testar

1. **Pré-requisitos**
   - 201 implementada.
   - Simulador com o app (`cd mobile && npm run ios` ou `npm run android`).

2. **Verificação automatizada**
   - `cd mobile && npm test` — `variants.test.ts` passa (cores por tema, alvo de toque ≥ 44,
     opacidade de desabilitado, nenhuma cor fora dos tokens).
   - `npm run typecheck` — os usos antigos de `FormButton` e `Card` continuam compilando.
   - Prova de que o teste morde: em `variants/button.ts`, troque a cor do `destructive` por
     `"#FF0000"` → `variants.test.ts` falha. Desfaça.

3. **Verificação manual, passo a passo**
   1. Abra qualquer formulário com botões Salvar/Cancelar (ex.: novo lançamento em Finanças) → o
      Salvar é um botão azul cheio com texto branco em Plus Jakarta Sans semibold; o Cancelar é
      contornado. Os dois parecem clicáveis (a reclamação de 14/09 na 098 era o contrário).
   2. Toque e segure um botão → ele escurece levemente enquanto pressionado; no primário, vibra
      de leve.
   3. Abra uma tela com card (ex.: Finanças) → cantos de 10, borda fina, fundo branco sobre o
      off-white no claro.
   4. Troque para o escuro em Conta e repita 1–3 → as cores seguem o tema escuro do web.

4. **Casos de borda e caminhos negativos**
   - Botão desabilitado → meio transparente e sem vibrar ao toque.
   - Botão com `loading` → spinner no lugar do texto, largura não pula.
   - Botão `sm` em uma linha apertada → ainda responde a toques um pouco fora da borda visual.

5. **Sinais de que quebrou**
   - Botão de formulário antigo sumiu ou ficou sem cor → o mapeamento `tone`→`variant` do
     `FormButton` está errado.
   - Cards com cantos de 16 em algumas telas → a tela usa `Radius.card` direto (apelido ok) ou
     estilo próprio — esperado até a onda dela; anote, não corrija aqui.
