# Stack — Orbyva

Decisões fixas do projeto. Muda raramente — não é aqui que fica o estado de uma feature (isso vai em `docs/features/`).

## Tech

- React 19 + TypeScript strict, Vite 6
- React Router 7
- Supabase (Postgres + Auth) — RLS estritamente por `user_id` em toda tabela nova
- Tailwind 3 + shadcn/ui (Radix)
- Vitest para testes de domínio; Playwright para e2e (`npm run test:e2e`)

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
