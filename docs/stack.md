# Stack — Orbyva

Decisões fixas do projeto. Muda raramente — não é aqui que fica o estado de uma feature (isso vai em `docs/features/`).

## Tech

- React 19 + TypeScript strict, Vite 6
- React Router 7
- Supabase (Postgres + Auth) — RLS estritamente por `user_id` em toda tabela nova
- Tailwind 3 + shadcn/ui (Radix)
- Vitest para testes de domínio; Playwright para e2e (`npm run test:e2e`)
- Cliente nativo: Expo em `mobile/`, mesmo Supabase

## Comandos

- `npm run dev` — dev server (Vite)
- `npm run build` — `tsc -b && vite build`
- `npm run lint` — ESLint
- `npm test` — Vitest (`npm run test:watch` para watch mode)
- `npm run test:e2e` — Playwright
- `npm run mcp` — servidor MCP do projeto no stdio (ver "Orb e MCP")
- `npm run check:mcp` — typecheck do servidor MCP + do registro de tools (fora do `tsc -b` do app)

## Padrão de camadas (módulos de domínio)

`supabase/migrations` (schema + RLS) → `src/types/<módulo>.ts` (contratos) → `src/domain/<módulo>/*` (regras puras, testáveis com Vitest, sem I/O) → `src/api/<módulo>/*` (I/O Supabase, chama `domain/<módulo>` quando precisa de lógica) → `src/pages/admin/<módulo>/*` (UI) → registro em `src/routes.tsx` + grupo de navegação em `src/components/app-sidebar.tsx` se for módulo novo.

Migrations são nomeadas `YYYYMMDDHHMMSS_slug.sql` — nunca duas com o mesmo timestamp (já causou um bug real de bookkeeping do Supabase CLI). `supabase db push` aplica ao banco remoto (não há Supabase local neste projeto) — sempre confirmar com o usuário antes de rodar, é uma alteração no banco em produção/dev compartilhado.

## Convenções de UI

- `PageShell`, `EmptyState`, `ConfirmDeleteDialog`, `TableLoadingSkeleton` — componentes compartilhados, seguir o padrão já usado em `Goals.tsx`/`Habits.tsx` para páginas novas.
- Toda mutação usa `useToast` (`@/hooks/use-toast`) + `getErrorMessage` (`@/lib/errors`) para erros amigáveis.
- Cor de módulo nova → `moduleColors` em `src/lib/design-tokens.ts` + variável CSS em `src/index.css` (light e dark).

## Convenções de UI do mobile

O app Expo (`mobile/`) usa a identidade do web com padrões nativos (features 201–207).

- **Tokens**: `mobile/src/constants/theme.ts` — `Colors` (paleta do `src/index.css` em hex, claro e
  escuro), `ModuleColors`, `Radius`, `Spacing`. `tokenParity.test.ts` lê o CSS do web e falha se um
  lado mudar sem o outro: cor nova ou alterada no web vai para o `theme.ts` no mesmo commit.
- **Tipografia**: Plus Jakarta Sans (texto) e Syne (título de tela, título de destaque, valores
  grandes), carregadas no `app/_layout.tsx`. Estilo de texto sai de `TypeScale`
  (`mobile/src/domain/ui/typography.ts`) ou de `ThemedText type=…`. Peso = família (`fontFor`):
  no Android `fontWeight` não escolhe o arquivo de uma fonte customizada.
- **Primitivas**: `mobile/src/components/ui` (`Button`, `Card`, `Badge`, `Input`, `Chip`, `Tabs`,
  `ListRow`, `ScreenHeader`, `EmptyState`, `Sheet`…), com os nomes de variante do shadcn do web.
  O estilo de cada uma sai de `resolve*Style` em `mobile/src/domain/ui/variants/` — puro, testado
  em `variants.test.ts` (cor só dos tokens, alvo de toque ≥ 44, fonte carregada).
- **Regra**: tela não escreve cor hex, `rgba(`, `fontSize`, `fontWeight`, `fontFamily` nem
  `borderRadius` numérico ≥ 6 — usa token, `ThemedText`/`TypeScale`, `Radius` e primitiva. O
  teste-guarda (`styleGuard.test.ts`) varre **todo** `mobile/src`, menos `components/share` (arte
  própria dos cards de story), `constants` e as fontes de token (`domain/ui/typography.ts`,
  `domain/ui/variants`, `domain/ui/color.ts`). Exceção legítima (cor que é dado, espelho de tabela
  do web) é marcada: `// token-livre: <motivo>` na linha ou `// token-livre-início: <motivo>` …
  `// token-livre-fim` no bloco. Todo `_layout.tsx` com header nativo usa `HeaderTitle`.
- **Sem apelidos**: o tema só tem o vocabulário do web (`foreground`, `card`, `muted`, `border`,
  `destructive`…; `Radius.xl|lg|md|sm|full`). `FormButton` saiu — botão é `Button`.
- **Cor com significado** (status de orçamento e de tarefa, natureza, saldo, prioridade) sai do
  domínio como nome de token (`domain/ui/semanticTone.ts`, `PRIORITY_TONE`); a tela resolve com
  `theme[tone]`. Cor escolhida pelo usuário é dado e fica como veio; cor inicial gravada no banco
  vira constante ao lado da paleta (`domain/dimensions/listView.ts`). Vencimento vira `Badge`
  (`carAlertBadge`); cor de módulo vem de `useModuleColors()` e tons dela por `hexAlpha`
  (ex.: heatmap de hábitos, `domain/habits/habitColors.ts`).
- **Tipografia fora da escala**: `weightStyle(peso)` e `MonoInline` para trecho dentro de outro
  `Text`; `TypeScale.nano` só em grade densa (calendário, legenda sobre capa); véu de modal é `SCRIM`;
  véu e texto sobre capa/foto são `scrim(alpha)` e `ON_MEDIA` (não seguem o tema); variação
  clara de um token sobre fundo colorido é `lighten(hex, amount)` (`lib/color.ts`).
- **Navegação** (feature 208): sem barra inferior nem faixa de abas — chrome fixo novo foi vetado
  por ocupar tela. Em tela raiz (item exato da sidebar, `navLeafForPath` em `lib/nav.ts`) o título
  do header é `GroupHeaderTitle` (`headerTitle: groupHeaderTitle` em todo stack) e abre as páginas
  do grupo; arrastar da borda esquerda abre a sidebar (`SidebarEdgeSwipe`). Por isso tela raiz não
  tem voltar por gesto (`gestureEnabled: false` no stack raiz e nas raízes empilhadas do módulo);
  detalhe e formulário mantêm o gesto nativo. Header: busca · Orb · sino. Único FAB é o `+`, na cor
  do grupo da tela (`quickAddModuleForPath`) com o texto de `ModuleForegrounds`.
  `lib/__tests__/nav.layouts.test.ts` trava as três regras nos layouts.
- **Busca** é `SearchField` (lupa + visual do `Input`); liga/desliga é `ToggleRow` (`Switch`
  nativo); título do header nativo usa `HeaderTitle` (Syne) no `headerTitleStyle` do stack.
- **Migração de uma onda**: scripts em `mobile/scripts/` (`codemod-theme-names.py`,
  `codemod-forms.py`, `codemod-literal-colors.py`, `codemod-text-inputs.py`, `codemod-radius.py`,
  `codemod-empty-states.py`) fazem o grosso mecânico; `tidy-file.py` remove estilo morto e junta
  imports de `@/components/ui`; `prune-unused-imports.py` tira o import que o `tsc` aponta.
  O `tsconfig` do mobile tem `noUnusedLocals` — import que sobra de uma troca quebra o typecheck.

## Orb e MCP

A Orb é a IA do Orbyva. Desenho completo em `docs/planning/orb-ia/`; o que está no ar veio das
features 098 (base), 099 (revisão) e 100 (barra lateral, navegação, cartões, API de dados e criação).

- **Registro de tools**: `supabase/functions/_shared/orb/` — TS puro, **sem import externo e sem
  API de runtime** (`Deno.*`, `process.*`), com o client Supabase injetado via `OrbToolContext`.
  Essa restrição é o que permite o mesmo código rodar no Deno da Edge e no Node do MCP. Tool nova =
  arquivo em `tools/` + uma linha em `registry.ts`; aparece nos dois lados sozinha.
  **38 tools hoje**, agrupadas por área na ordem do array `orbTools`: finanças (9), produtividade
  (6), vida (7), viagens (3), compras (1), saúde (2), notas (1), linha do tempo (1), lugares (1),
  veículos (2), navegação (1), API de dados (2), criação (1), diálogo (1 — `ask_user`, feature 107).
  Tabela completa em `mcp/README.md`. A
  **ordem do array é contrato**: o catálogo serializado abre o prefixo de toda requisição, então
  reordenar invalida o cache de todas elas — área nova entra no fim (foi assim que lugares, veículos,
  as três da feature 100 e o `ask_user` da 107 entraram). Catálogo serializado (name + description + input_schema):
  ~44,1 mil chars, ~12,6 mil tokens.
- **Fronteira app × MCP** (features 100/107): `orbMcpTools` = `orbTools` menos `ORB_APP_ONLY_TOOLS`
  (`open_screen`, `propose_create`, `ask_user`). Host MCP não tem tela do Orbyva: não há para onde
  navegar, confirmar criação nem coletar resposta em chips, então o catálogo dele continua sendo
  leitura e simulação.
- **Versões da Orb** (feature 152): Edge Function própria `orb-avatar` (não ramo do `orb-agent`,
  não tool do registro) recebe prompt + até 3 referências em base64, gera um PNG no modelo de
  imagem do Gemini e **grava ela mesma** — arquivo em `orb-avatars/{userId}/{uuid}.png` e linha em
  `orb_avatar` com `is_active: false`. É a única peça da Orb que grava fora do fluxo de proposta:
  a cota diária conta as linhas do dia do usuário (fuso dele), então quem gera tem de deixar rastro.
  Secrets: `ORB_IMAGE_MODEL` (padrão `gemini-2.5-flash-image`) e `ORB_IMAGE_DAILY_LIMIT` (padrão
  10). Lógica pura em `request.ts`/`prompt.ts`/`gemini.ts` (testada em
  `src/domain/orb/__tests__/orbAvatarRequest.test.ts`); contrato com o modelo provado por
  `npm run orb:avatar-smoke`. O modelo devolve RGB sem alfa: pedir "transparente" vira xadrez
  desenhado, por isso a instrução pede fundo liso.
- **Navegação** (`open_screen`): catálogo de telas em `_shared/orb/navigation.ts` — caminho, filtros
  aceitos e valores de cada tela. O servidor monta a URL; o client **valida de novo** contra o mesmo
  catálogo (`isOrbNavigablePath`) antes de chamar `navigate()`. Filtro na URL só funciona porque as
  telas alvo leem os parâmetros e reagem à troca sem remontar.
- **API de dados** (`describe_data` + `query_data`): mapa das tabelas em `_shared/orb/schema.ts`
  (colunas, tipos, enums, relações e regra de escopo por dono). O mapa NÃO entra no system prompt —
  é buscado sob demanda, senão seriam dezenas de milhares de tokens por turno.
- **Criação** (`propose_create`): a tool valida e resolve ids, mas **não grava** — devolve uma
  proposta que vira cartão na tela; quem grava é o `src/api/*` da tela manual, depois do clique
  (`src/api/orbActions.ts`). Kinds: tarefa, lançamento, nota, item de compra, projeto, evento,
  recorrência, orçamento (set/delete/replicate), tipo/subcategoria financeira, pagamento e
  quitação de recorrência, check-in e criação de hábito (incl. saúde), marcar filme/série,
  episódio de série (com série nova via OMDb), progresso/adição de livro (Google Books), álbum
  (quero ouvir), visita a lugar, atualizar meta, medicação, consulta, veículo novo,
  abastecimento, manutenção, viagem, gasto de viagem, atividade de roteiro, roteiro do dia
  (feature 107). Sem migration: a proposta vive na mensagem.
- **Diálogo** (`ask_user`, feature 107): pergunta tipada + sugestões; vira cartão com chips no chat.
  Usar antes de `propose_create` quando faltar slot (horário, categoria, escopo…).
- **Campos `ui_*`**: resultado de tool pode trazer campo só para a tela (pôster, capa). Os dois hosts
  passam o resultado por `stripUiFields` antes de mandá-lo ao modelo.
- **Rótulo na UI**: cada tool declara `title` em PT-BR e `orbToolTitle` (registry) é a fonte única —
  `orbToolLabel` em `src/domain/orb/toolLabel.ts` só delega. Nada de mapa paralelo escrito à mão.
  Ele mora em arquivo separado do parser de SSE **de propósito**: importar `registry.ts` de dentro
  de `domain/orb/stream.ts` levava as tools para o chunk carregado em toda página do app.
- **Agente**: Edge Function `orb-agent` (Deno) — JWT obrigatório, client anon + `Authorization`
  (mesmo padrão de `home-bundle`, RLS do usuário), loop de function calling com **Gemini**
  (`@google/genai`) e resposta em SSE. `GEMINI_API_KEY` só como secret do Supabase, nunca no Vite.
- **Servidor MCP**: `mcp/server.ts` (Node, stdio, `@modelcontextprotocol/sdk`), registrado em
  `.mcp.json`. Ver `mcp/README.md` para as variáveis de ambiente.
- **Front**: `/orb` (`src/pages/admin/orb/`) e o dock da barra lateral (`OrbSidebarDock`) são duas
  janelas para a MESMA conversa — o estado vive no `OrbProvider`, acima do `Outlet` do `AdminLayout`,
  porque a Orb navega e um estado dentro da página morreria na navegação que ela mesma pediu.
  Resultados viram cartão/carrossel/linha/barra por `src/domain/orb/results.ts` (adaptador por nome
  de tool), com a tabela de antes como fallback.
- **Escrita**: nenhuma tool grava sozinha. `propose_create` prepara; a pessoa confirma no cartão e o
  `src/api/*` grava — nunca aplicada direto pelo modelo. O cartão aparece em QUALQUER tela pelo
  `OrbProposalTray` (montado no `AdminLayout`, `lazy`, escondido na `/orb` onde o balão já o mostra);
  a lista de pendentes é derivada da conversa pelo `OrbProvider`, não guardada à parte.
- **Hora de parede**: data + hora que a pessoa falou viram instante pelo fuso dela
  (`instantFromLocalTime`, `_shared/orb/helpers.ts`) antes de ir para coluna `timestamptz`. Sem
  offset o Postgres casta no fuso da sessão (UTC) e o evento nasce com horas de diferença.

Modelo padrão `gemini-3.1-flash-lite` (`ORB_MODEL` sobrescreve). Três detalhes que só aparecem
quando quebram:

- O raciocínio da família Gemini 3 se controla por `thinkingConfig.thinkingLevel`
  (`MINIMAL`/`LOW`/`MEDIUM`/`HIGH`, via secret `ORB_THINKING`), não pelo `thinkingBudget` em tokens
  da 2.5.
- As tools vão em `functionDeclarations` com `parametersJsonSchema`, que aceita o JSON Schema do
  registro como está — inclusive `additionalProperties`. O campo `parameters` (Schema no formato
  OpenAPI) é mutuamente exclusivo com ele e **não** aceita.
- As partes do turno do modelo voltam para o histórico **como chegaram**, sem fundir texto: elas
  carregam `thoughtSignature`, e perder a assinatura entre rodadas faz o modelo esquecer o que já
  consultou no meio de uma sequência de function calls.

O cache de prefixo do Gemini é **implícito** — não há marcador para pedir. O que o mantém vivo é a
ordem determinística de `orbTools` e o volátil (data, fuso, nome) ficar no fim da instrução de
sistema. Confirmação: `cache_read_input_tokens > 0` no log do turno, a partir da 2ª pergunta.

## Deploy

- `npm run start` serve o build (`serve -s dist`) — via `scripts/ci-local.sh` para checagem local pré-deploy.
