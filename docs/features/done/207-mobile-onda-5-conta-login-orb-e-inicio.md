---
prompt: |-
  Pedido do usuário, verbatim (02/10/26):

  Eu queria também melhorar o front do mobile. To achando muito, sei lá. Deixar algo mais parecido com o web, sabe?
  Sim (fundação primeiro, telas em ondas, navegação por último)
  Vamos trabalhar só na melhora do front mobile
  pode arrochar

  Resposta P3 do planning: quinta onda é Conta, login e Orb. Navegação (home, header, sidebar,
  FABs) fica para um planning próprio depois desta série — aqui só o visual delas.

  Fatia desta feature — onda 5: Conta, login, Orb, Início e o chrome do app passam às primitivas e
  tokens; o app inteiro fica coberto pelo teste-guarda e os apelidos antigos de tema somem.
---

# 207 — Mobile, onda 5: Conta, login, Orb e Início

## Contexto
Depende de 248 (onda 4; era 206 até a renumeração de 2026-10-05).

Telas: `app/login.tsx`, `app/index.tsx`, `app/auth/*`, `app/(app)/account.tsx`,
`app/(app)/orb.tsx`, `app/(app)/home.tsx`. Componentes: `components/orb/*`, `components/hub/*`
(`HubLedgerHero` 10 ocorrências, `HubModulesGrid` 11), `components/chrome/*` (`AppSidebar`,
`HeaderChromeRight`, `StackHeaderLeft`, `QuickAddFab`, `QuickAddSheet`, `SearchSheet`,
`AlertsSheet`, `LiveWidget`, `HeaderAlertsButton`, `MenuButton`, `FormCloseButton`,
`ModuleGuideHost`, `OnboardingHost`), `BrandLogo`, `BrandWordmark`, `ModuleGuideSheet`.

Início não estava nomeado no planning; entra nesta onda porque é a única tela fora dos grupos de
módulo e os componentes do hub compartilham o chrome.

## Decisões
- Mesma definição de "migrar" e densidade da 203.
- **Só visual no chrome e no Início**: sidebar, header, FABs e a composição da home mantêm
  estrutura, ordem e comportamento. Repensar a navegação é o planning seguinte, combinado com o
  usuário.
- Bolha do Orb: mensagem do usuário em `primary`, do Orb em `card`/`muted`, como no web.
- Ao fim desta onda **todo** `mobile/src` entra no teste-guarda (exceto `components/share/*` e
  `constants/theme.ts`), e os apelidos de cor e raio da 201 são removidos de `theme.ts` — sobra
  só o vocabulário do web.

## Tarefas
- [x] Migrar `app/login.tsx`, `app/index.tsx`, `app/auth/*` e `app/(app)/account.tsx`.
- [x] Migrar `app/(app)/orb.tsx` e `components/orb/*` (`OrbChat`, `OrbComposer`,
      `OrbMessageBubble`, `OrbResultView`, `OrbToolCall`, `OrbActionCard`, `OrbClarifyCard`,
      `OrbProposalTray`, `OrbCapabilities`, `OrbAccessFab`).
- [x] Migrar `app/(app)/home.tsx` e `components/hub/*` (hero do saldo com valor em Syne,
      grade de módulos com as cores de `ModuleColors`).
- [x] Migrar `components/chrome/*`, `BrandLogo`, `BrandWordmark`, `ModuleGuideSheet` — só
      tokens, tipografia e primitivas; nenhuma mudança de estrutura.
- [x] Migrar o que sobrar fora das ondas (`rg -l '#[0-9A-Fa-f]{6}\b|fontSize: \d|fontWeight:'
      mobile/src --glob '!components/share/**' --glob '!constants/**'` deve voltar vazio).
- [x] Trocar `MIGRATED` em `styleGuard.test.ts` por "todo `mobile/src`" com as duas exceções da
      Decisão; teste passando.
- [x] Remover de `theme.ts` todos os apelidos (`text`, `surface`, `backgroundElement`,
      `backgroundSelected`, `textSecondary`, `danger`; `Radius.card|input|control|chip`) e
      `FormButton.tsx` se não tiver mais uso; `tokenParity.test.ts` continua passando.
- [x] Atualizar a seção "Convenções de UI do mobile" de `docs/stack.md`: a guarda cobre o app
      inteiro e a navegação é o próximo passo (planning a abrir).
- [x] Rodar `cd mobile && npm test`, `npm run typecheck` e `npm run lint`.

## Prompts

- 05/10/26 — "Sim" (aprovação para implementar a 207 depois da 206, hoje 248).
- 05/10/26 — "Ajuste a caixa de texto do chat aí." (print do chat da Orb no iPhone: caixa alta
  demais e "Enviar" solto ao lado, embaixo)

## Notas

- **Compositor da Orb (05/10/26):** o `Input` multiline do design system fixa 96px de altura
  mínima, então a caixa nascia com três linhas e o botão ficava solto. Agora espelha o web: cartão
  arredondado com `TextInput` de uma linha (36px, cresce até 120px) e botão redondo de seta dentro,
  alinhado à última linha; "Parar" no mesmo lugar durante o streaming. Meta-teste
  `components/orb/__tests__/OrbComposer.layout.test.ts` falha contra a versão anterior.

- **Guarda no app inteiro**: `MIGRATED` virou varredura recursiva de `mobile/src`. Além das duas
  exceções da Decisão, ficam fora as fontes de token (`domain/ui/typography.ts`,
  `domain/ui/variants`, `domain/ui/color.ts`) — são elas que definem os números. Cor que é dado
  (paleta de categorias/tags, seed do onboarding, tabela de tipos de lugar espelhada do web, CSS
  da impressão de nota) recebeu marcador `token-livre` de linha ou de bloco (`token-livre-início`
  … `token-livre-fim`); a varredura (`scanLines`) tem teste próprio das duas formas.
- **`rg` da tarefa "o que sobrar"**: não volta literalmente vazio — casa só arquivos com marcador
  `token-livre` e as fontes de token acima. É o que a guarda aceita; nenhum é tela.
- `BRAND_COLORS` (arte dos cards de story) saiu de `lib/brand.ts` para
  `components/share/brandColors.ts`, dentro da exceção da arte.
- `NavGroup.color` virou `NavGroup.module` (`ModuleColorKey`): sidebar e grade do Início pegam a
  cor do grupo em `useModuleColors()`, igual ao web. Ordem e itens intactos (`nav.groups.test.ts`).
- Hero do saldo: fundo `primary`, texto em `primaryForeground`, saldo em `TypeScale.display`
  (Syne); barra de orçamento usa `lighten(destructive|warning)` para contrastar com o azul
  (`domain/hub/heroColors.ts`, testado). Severidade de alerta virou `alertSeverityTone`.
- Tema escuro na Conta virou `ToggleRow`; "Excluir conta" é `Button variant="destructive"`.
- Teste-guarda novo: todo `_layout.tsx` com `headerTintColor` precisa de `headerTitleStyle:
  HeaderTitle` — pegou o stack raiz `app/(app)/_layout.tsx`, que estava sem.
- Provas de que morde: `color: "#000000"` em `MenuButton.tsx` → falha apontando a linha; tirar
  `HeaderTitle` de `goals/_layout.tsx` → falha. Desfeito, 693 testes passam; typecheck limpo;
  `expo export --platform ios` gera o bundle. Lint roda mas continua analisando zero arquivo
  (config do ESLint fora do base path — anterior à série).
- Diff do chrome e do Início conferido: só linhas de estilo; nenhum handler, rota ou animação.
- 2026-10-05 — concluída na limpeza dos `.md` a pedido do usuário ("Pode concluir direto"); conferência no celular fica com o usuário (ver Como testar).

## Como testar

1. **Pré-requisitos**
   - 248 implementada.
   - Conta com dados em vários módulos (o Início mostra resumo do dia, saldo e próximos itens).

2. **Verificação automatizada**
   - `cd mobile && npm test` — `styleGuard.test.ts` cobre todo `mobile/src` menos
     `components/share` e `constants`, e passa; `tokenParity.test.ts` passa sem os apelidos.
   - `rg -n 'textSecondary|backgroundSelected|backgroundElement' mobile/src` → só o próprio
     `styleGuard.test.ts` (os padrões que ele proíbe).
   - Prova de que a guarda morde em qualquer lugar: acrescente `color: "#000000"` em
     `components/chrome/MenuButton.tsx` → falha. Desfaça.
   - `npm run typecheck` e `npm run lint` sem erro.

3. **Verificação manual, passo a passo**
   1. Saia da conta → tela de login com logo, Syne no título, campos e botão das primitivas.
   2. Entre → Início com hero do saldo em Syne, grade de módulos com as cores de cada grupo do
      web, cards uniformes.
   3. Abra a sidebar → mesmos itens e ordem de antes, com tipografia e cores novas.
   4. Abra o Orb, mande "quanto gastei esse mês?" → bolha sua azul, resposta em card; peça para
      cadastrar uma despesa → cartão de confirmação com botões das primitivas; confirmar grava.
   5. Conta → troque o tema; o app inteiro troca, sem nenhuma tela com cor antiga.
   6. Percorra rapidamente todos os módulos da sidebar → nenhuma tela com fonte do sistema,
      cantos de 16 ou azul antigo.

4. **Casos de borda e caminhos negativos**
   - Login com erro (senha errada) → mensagem no estilo de erro das primitivas.
   - Orb com resposta longa e tabela → rola sem estourar a largura.
   - Card de story (compartilhar mês/viagem) → continua com a arte própria, igual a antes.

5. **Sinais de que quebrou**
   - Alguma tela sem cor depois da remoção dos apelidos → uso esquecido que o typecheck não pegou
     (ex.: chave acessada por string dinâmica).
   - Sidebar ou FAB mudou de lugar/comportamento → esta onda saiu do escopo visual.
