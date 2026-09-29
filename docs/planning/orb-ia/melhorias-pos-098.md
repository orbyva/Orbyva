# Plano de execução — Orb (pós-098)

Verifiquei os achados contra o código real em `/Users/nobre/Developer/Personal/Orbyva`. 104 achados → **31 itens executáveis**, 4 ondas, mais uma lista explícita de descartes. Tudo abaixo cita arquivo:linha real.

---

## 0. Verificação dos achados de BUG

| # | Bug | Veredito | Evidência lida |
|---|---|---|---|
| B1 | Janela de datas em `timestamptz` corta o último dia | **CONFIRMADO (com correção do fix proposto)** | `transaction_at timestamptz` em `supabase/migrations/20240101000050_baseline_core_schema.sql:89`; `finance.ts:48-51` faz `.lte("transaction_at","2026-09-30")` → vira `2026-09-30T00:00:00Z`, perdendo o dia 30 inteiro. **Mas** a view oficial do app (`supabase/migrations/20260804150000_spend_month_sql.sql:11-12`) agrupa por `transaction_at::date` **em UTC**. Logo o fix certo NÃO é converter para meia-noite local (isso divergiria da tela de Finanças): é `.lt("transaction_at", shiftDays(endDate,1))`, que reproduz exatamente `…T23:59:59.999Z` já usado em `src/api/finance/transactions.ts:220` e `src/pages/admin/home/FinanceDashboard.tsx:266`. |
| B2 | Resposta vazia trava a conversa para sempre | **CONFIRMADO** | `orb-agent/index.ts:61-64` descarta `content` vazio; `useOrbChat.ts:86` deixa a bolha vazia no estado e `:44` a reenvia. Dois `user` seguidos → 400 `messages: roles must alternate` (documentado em `shared/error-codes.md:37,181` do skill `claude-api`). E `index.ts:69` (`firstUser <= 0 ? tail : …`) deixa passar uma lista que começa com `assistant` quando não há nenhum `user`. |
| B3 | "Parar" não para o servidor; e o `catch` estoura | **CONFIRMADO** | `index.ts:124` cria `new ReadableStream({ async start })` **sem `cancel`**; `anthropic.messages.stream` (`:138`) não recebe `signal`; o `catch` de `:187-191` chama `send()` de novo — `enqueue` em controller cancelado lança `TypeError`, e a segunda exceção escapa de `start()`. O turno segue até 8 rodadas pagas. |
| B4 | Nenhum timeout por tool nem por turno | **CONFIRMADO** | `registry.ts:32-33` (`await tool.run` sem deadline) e `index.ts:165`. O único teto é `MAX_TOOL_ROUNDS = 8` (`index.ts:28`), que conta rodadas, não tempo. |
| B5 | `stop_reason` `max_tokens`/`refusal` tratados como sucesso | **CONFIRMADO** | `index.ts:151-155`: qualquer coisa != `tool_use` vira `{type:"done"}`. Confirmei no skill `claude-api` que Sonnet 5 tem `stop_reason: "refusal"` com `stop_details` (e `stop_details` é `null` em todos os outros casos — guardar antes de ler). |
| B6 | `query_agenda` monta fronteiras sem fuso | **CONFIRMADO** | `productivity.ts:161-162` usa `${startDate}T00:00:00` numa coluna `starts_at timestamptz` (`20260820110000_project_event_project_optional.sql:20`). Sessão UTC → a janela vira 21:00 do dia anterior às 20:59 do último dia. `ctx.timezone` existe e não é usado. |
| B7 | `simulate_installment_impact` usa janela de 30×N dias | **CONFIRMADO** | `finance.ts:292-306`: `shiftDays(endDate, -30*months)` e divisão por `months`. Uma despesa fixa cai 2 ou 3 vezes na janela conforme o dia da pergunta. |
| B8 | `fetchLedger` sem paginação → truncagem silenciosa | **CONFIRMADO (estrutural)** | `finance.ts:45-52` sem `.limit()`/`.range()`; `productivity.ts:116-119` idem. O teto exato é o `db.max_rows` do projeto (default 1000 no Supabase) — confirmar no painel antes de calibrar. |
| B9 | Helper `bool()` nunca usado; booleano por identidade | **CONFIRMADO** | `productivity.ts:52` (`input.overdue === true`), `finance.ts:241` (`input.only_active !== false`), `helpers.ts:19-23` sem nenhum call site. |
| B10 | Sessão do MCP nunca renovada | **CONFIRMADO no caminho token / DUVIDOSO no caminho senha** | `mcp/server.ts:73-83`: `autoRefreshToken:false` + header `Authorization` fixo → morre em ~1h, garantido. `:87-89` usa `autoRefreshToken:true`, e o supabase-js mantém o ticker em memória mesmo com `persistSession:false` — provavelmente renova. Tratar só o primeiro caso como bug certo; o segundo, medir. |
| B11 | Parser SSE não normaliza CRLF nem junta `data:` multilinha | **CONFIRMADO (latente)** | `src/domain/orb/stream.ts:8` (`"\n\n"`) e `:11-16` (`join("")`). O servidor só emite LF hoje, então é defesa contra proxy, não bug ativo. |
| B12 | Erro cru do Postgres vai para o modelo | **CONFIRMADO** | `helpers.ts:65-68` concatena `result.error.message` → `registry.ts:36` → `index.ts:171-176` vira `tool_result`. |
| B13 | UI: dedup de tool por nome esconde chamadas repetidas | **CONFIRMADO** | `useOrbChat.ts:70-76` (`tools?.includes(event.name)`); `phase:"done"` é ignorado; `OrbMessage.tools` é `string[]` (`src/types/orb.ts:10`). |
| B14 | UI: scroll sequestrado a cada delta | **CONFIRMADO** | `OrbChat.tsx:23-25` — `scrollIntoView({behavior:"smooth"})` no `useEffect([messages])`, que dispara por token. |
| B15 | Sem keep-alive no SSE | **CONFIRMADO** | `index.ts:196-203` sem heartbeat. Agrava porque no Sonnet 5 o `thinking.display` **default é `omitted`** (confirmado no skill) — o corpo fica literalmente mudo entre rodadas. |
| B16 | Tabelas-filhas sem `user_id` quebram o padrão `.eq("user_id")` | **CONFIRMADO** | `20240101000050_baseline_core_schema.sql:169-278` — `trip_checklist_item`, `trip_expense`, `trip_itinerary_day/activity`, `trip_milestone`, `vehicle_maintenance`, `vehicle_fuel_log`, `vehicle_document`, `habit_log` não têm a coluna; `20240101000100_tenancy_rls.sql:191-210` dá RLS via pai. |
| **REFUTADOS** | | | |
| R1 | "`vw_value_by_nature_year_month` não está versionada; consultar com `.eq(user_id)`" | **FALSO nos dois pontos** | Está versionada em `20260804150000_spend_month_sql.sql:5-33`. E **não tem coluna `user_id`** (`group by 1,2`) — o `.eq("user_id", …)` proposto daria 42703 em runtime. A view é `security_invoker`; o RLS já filtra. |
| R2 | "Não há teste nenhum das tools da Orb" | **PARCIALMENTE FALSO** | `src/domain/orb/__tests__/registry.test.ts` existe: `fakeDb` encadeável com log de filtros (`:19-58`) + 3 testes de contrato do catálogo + 3 de execução. Falta cobertura por tool e a asserção anti-`user_id` em tabela-filha. |
| R3 | "`query_habits` usa `.eq(user_id)` em `habit_log`" (risco já materializado) | **FALSO** | `life.ts:37-43` já faz `.in("habit_id", …)` corretamente. O risco é só para tools novas. |

---

## 1. O que foi DESCARTADO (e por quê)

Esta lista importa tanto quanto o plano — é o que outro agente não deve reabrir sem gatilho novo.

1. **Edge Function `orb-mcp` remota (Streamable HTTP, stateless)** — o `orb-agent` importa o registry direto (`index.ts:22`), e o stdio já cobre o Claude Code local. Um endpoint HTTP só serve para conectar claude.ai/celular. App pessoal de um usuário: custo (bundle do SDK no isolate, CORS, auth própria) sem ganho hoje. **Gatilho para reabrir:** o usuário querer falar com os dados dele pelo claude.ai ou pelo Claude Desktop de outra máquina.
2. **OAuth 2.1 próprio (`orb-oauth`, DCR RFC 7591, PKCE, tabelas `orb_oauth_clients/codes`, tela `/orb/authorize`)** — depende inteiramente de (1). É a peça de maior superfície de erro do lote (open redirect, code sem TTL, PKCE declarado e não verificado). Registrar apenas a **nota**: se um dia for feito, o PKCE se copia de `node_modules/@modelcontextprotocol/sdk/dist/esm/server/auth/handlers/token.js:62-73`, nunca do boilerplate `chrisleekr`, que descarta o `code_challenge` do cliente.
3. **Rewrites do Vercel para `/mcp` e `/.well-known/*`, `verify_jwt=false` para `orb-mcp`, `corsHeadersForMcp`** — todos dependem de (1). `supabase/functions/_shared/cors.ts:44-50` fica como está.
4. **Sessão replicada / Valkey / event store** — decisão registrada: as 13 tools são leitura de tiro único, não há estado entre chamadas. Se um dia houver sessão, é tabela no Postgres que já existe, não infra nova.
5. **Conexões MCP de terceiros por usuário (`orb_mcp_connection`, cifra AES-GCM, validação SSRF, probe, OAuth por provedor)** — é o maior bloco do lote inteiro e coloca credencial de Notion/Google no banco do Orbyva. Além disso o caminho barato existe e torna metade do trabalho desnecessária: a Messages API conecta em servidor MCP remoto sozinha com `mcp_servers:[{type:"url",…}]` **+** `tools:[{type:"mcp_toolset", mcp_server_name}]` sob o beta `mcp-client-2025-11-20` (confirmado no skill `claude-api`; as duas metades são obrigatórias). Não fazer agora; registrar o caminho.
6. **Portar `McpHttpConnection` do code-cli para Deno / abstração `OrbToolRunner` multi-servidor / namespacing `mcp__<server>__<tool>`** — YAGNI enquanto só existe um servidor. O prefixo, se vier, é trabalho do host: prefixar na origem produziria `mcp__orbyva__mcp__orbyva__query_tasks`.
7. **`elicitInput()` para clarify** — só faz sentido com escrita E com host que declare a capability. Vira nota de desenho na Onda 4, não código.
8. **pgvector / RAG nas notas** — a Orb hoje não lê nota nenhuma; o ganho vem de ter a tool, não de embeddings. **Gatilho:** `ilike` + FTS `portuguese` medidamente insuficientes.
9. **Tool search com `defer_loading`** — confirmei no skill que `tool_search_tool_regex_20251119` existe e que a regra "nunca deferir tudo" é real, mas ela adiciona uma rodada de busca antes da primeira tool real (latência no primeiro token, num chat com SSE) e regride em silêncio quando a description é fraca. **Gatilho:** catálogo > ~25 tools **e** `cache_read_input_tokens` já ligado não resolver o custo.
10. **Context management betas (`clear_tool_uses_20250919`, `compact_20260112`)** — dois betas, troca de `messages.stream` por `beta.messages.stream`, e o ganho real depende de persistência. Adiado para depois da Onda 4.
11. **Toggles de área (Finanças/Produtividade/Vida) na UI** — resolve um problema que o prompt caching e boas descriptions já resolvem, e cria o modo de falha "a Orb parece quebrada porque desliguei a área errada".
12. **PermissionManager completo (patterns `propose_x(arg)`, allow/deny lists, cache de sessão)** — overkill. Da lição, sobra só a regra fail-closed (Onda 4).
13. **`query_blocked_tasks`** — `task_dependency` existe (`20260803121500_tasks_projects.sql:98`), mas é o tipo de campo que fica vazio num app pessoal. Tool sobre tabela vazia é catálogo caro por zero resposta.
14. **WebSocket no lugar do SSE** — o ganho do WS é o canal de volta, e o `stop` já é coberto pelo abort do fetch. Fica SSE.
15. **Fixture de servidor MCP falso + testes de flake de cancelamento** — dependem do cliente MCP que foi descartado em (6).
16. **Teste de isolamento entre dois usuários no banco remoto** — depende de rede e de semear dois usuários. O `fakeDb` cobre escopo de query; o RLS é a fronteira e é testado pelo próprio Postgres.
17. **`query_health`** — **adiado**, não descartado: é o dado mais sensível do app (`20260816230000_medication.sql`), dose é `task` (então `query_tasks` já enxerga a linha), e `times` é `time[]` que volta `HH:MM:SS`. Entra só depois que a Onda 2 estiver estável e com retorno agregado (percentual de adesão), não lista de doses.

---

## Onda 1 — Consertos e economia

**Objetivo:** a Orb parar de dar número errado com cara de exato, parar de queimar dinheiro quando ninguém está lendo, e custar ~1/3 do que custa hoje. Nada aqui muda contrato visível.

Duas trilhas independentes: **1A (Edge + tools)** e **1B (MCP local)**. Podem ser feitas em paralelo por agentes diferentes.

### Trilha 1A — Edge Function e tools

**1A.1 — Janela de datas: parar de perder o último dia** *(bug B1)*
- Arquivos: `supabase/functions/_shared/orb/tools/finance.ts` (`fetchLedger` :45-52, `queryTransactions` :176-181), `supabase/functions/_shared/orb/helpers.ts`.
- O que muda: trocar `.lte("transaction_at", endDate)` por `.lt("transaction_at", shiftDays(endDate, 1))` nos dois lugares. Adicionar em `helpers.ts` um `exclusiveEnd(iso: string)` que devolve `shiftDays(iso,1)` e usar sempre ele. **Não** converter para fuso local: a view `vw_value_by_nature_year_month` (`20260804150000_spend_month_sql.sql:11-12`) agrupa por `transaction_at::date` em UTC, e o resto do app usa `…T23:59:59.999Z` (`src/api/finance/transactions.ts:220`). Divergir da convenção do app seria trocar um erro por outro, pior (a Orb e a tela dariam totais diferentes).
- Verificar: novo teste em `src/domain/orb/__tests__/registry.test.ts` com transação em `2026-09-30T22:00:00Z` — hoje some do total de setembro, depois entra. `npm run test`.

**1A.2 — `simulate_installment_impact`: meses de calendário, não 30×N dias** *(bug B7)*
- Arquivos: `supabase/functions/_shared/orb/tools/finance.ts:287-322`.
- O que muda: janela = `monthStart` do mês (corrente − N) até `monthEnd` do mês anterior; dividir pelo número real de meses fechados; devolver `start_date`/`end_date` no resultado (hoje só devolve `history_months`) para o modelo poder explicar a base.
- Verificar: teste com aluguel no dia 8 e `today = 2026-09-07`, `months_of_history: 3` — média tem que dar 1 aluguel/mês, não 2/3. `npm run test`.

**1A.3 — `query_agenda` com fuso do usuário** *(bug B6)*
- Arquivos: `supabase/functions/_shared/orb/tools/productivity.ts:149-165`.
- O que muda: buscar com folga de ±1 dia (`shiftDays(startDate,-1)`/`shiftDays(endDate,+1)`) e filtrar a data local em TS usando `Intl.DateTimeFormat("en-CA",{timeZone: ctx.timezone})` sobre `starts_at`. Offset fixo `-03:00` está proibido (quebra no horário de verão e para usuário fora do Brasil).
- Verificar: teste com evento em `2026-09-15T23:30:00-03:00` pedindo `start_date=2026-09-15, days=1`. `npm run test`.

**1A.4 — Paginação e teto de linhas nas leituras de ledger** *(bug B8)*
- Arquivos: `supabase/functions/_shared/orb/tools/finance.ts:40-52`, `supabase/functions/_shared/orb/tools/productivity.ts:112-119`.
- O que muda: `fetchLedger` ganha laço com `.range(offset, offset+999)` até vir página curta, com teto duro (ex.: 5.000 linhas) e `truncated: true` no retorno de `query_spend_by_category`/`simulate_*` quando o teto bater. Em `query_projects`, trocar o "baixa todas as tarefas do usuário" por contagem via `.select("project_id", { count: "exact", head: true })` por projeto **ou** manter a leitura única com `.range()` — medir qual é menos round-trip.
- Verificar: teste com fake db que devolve 1.000 linhas na primeira página e 3 na segunda. `npm run test`.

**1A.5 — Validação de input no `runOrbTool` + booleanos** *(bug B9 + hardening)*
- Arquivos: `supabase/functions/_shared/orb/registry.ts:24-38`, `helpers.ts`, `tools/productivity.ts:52`, `tools/finance.ts:241`.
- O que muda: antes do `tool.run`, validador puro de ~25 linhas (sem import externo — regra do cabeçalho de `types.ts:4-8`): checar `required`, rejeitar chave fora de `properties` (o schema promete `additionalProperties:false` e ninguém cumpre), coagir `"true"`/`"false"`/`"12"` antes de rejeitar por tipo, validar `enum`. Erro sai como `{ ok:false, result:{ error } }`, formato que os dois hosts já exibem. Trocar `input.overdue === true` por `bool(input,"overdue") === true` e `input.only_active !== false` por `bool(input,"only_active") !== false`.
- Não fazer: `strict: true` nas definições enviadas ao modelo — exige `required` em todo schema e a maioria das tools não tem; revisitar junto com a Onda 2.
- Verificar: `npm run test` com casos `{overdue:"true"}`, `{foo:1}`, `{limit:"5"}`.

**1A.6 — Prompt caching (o item de maior razão ganho/esforço do plano inteiro)**
- Arquivos: `supabase/functions/orb-agent/index.ts:112-146`, `supabase/functions/orb-agent/prompt.ts:23-46`.
- O que muda (ordem de renderização é **tools → system → messages**, confirmado no skill `claude-api`):
  1. `cache_control:{type:"ephemeral"}` na **última** definição de `toolDefinitions` (`index.ts:117-121`) — a ordem de `orbTools` (`registry.ts:14`) é determinística, condição necessária.
  2. `system` vira array de dois blocos: `[{type:"text", text: BLOCO_ESTAVEL, cache_control:{type:"ephemeral"}}, {type:"text", text: "Hoje é …"}]`. Hoje `prompt.ts:24-28` interpola nome e data **dentro** do bloco estável, o que invalida tudo depois — o volátil tem que vir **depois** do breakpoint.
  3. Logar `usage.cache_read_input_tokens` (ver 1A.8).
- Cuidado documentado: mínimo ~1024 tokens de prefixo para cachear. As 13 descriptions somam ~3.6k caracteres, o catálogo serializado ~6.9k — passa com folga, mas se alguém reduzir o catálogo o cache para em silêncio.
- Verificar: **não dá para verificar por teste unitário.** Verificação = fazer duas perguntas seguidas com a função publicada e checar `cache_read_input_tokens > 0` a partir da 2ª rodada, no log. Se der 0 em requests repetidos, sobrou invalidador no prefixo.

**1A.7 — Cancelamento de verdade + timeouts** *(bugs B3 e B4)*
- Arquivos: `supabase/functions/orb-agent/index.ts:124-193`, `supabase/functions/_shared/orb/registry.ts`.
- O que muda:
  - `const turnController = new AbortController()`; `req.signal.addEventListener("abort", …)`; `cancel(reason){ turnController.abort(reason) }` no objeto do `ReadableStream`.
  - Passar `{ signal: turnController.signal }` como request options do `anthropic.messages.stream`.
  - `send()` guardado por flag `closed` + try/catch que engole `TypeError` — hoje o `catch` de `:187` chama `send` de novo e a exceção escapa.
  - Checar `turnController.signal.aborted` no topo do `for` (`:137`) e antes de cada `runOrbTool` (`:165`).
  - `TOOL_TIMEOUT_MS = 15_000` por tool via `Promise.race` no `runOrbTool` → estouro vira `{ok:false}` com mensagem em PT-BR e **segue** como `tool_result` com `is_error:true`; `TURN_BUDGET_MS = 90_000` por turno → evento `error` e fecha.
- Verificar: teste unitário do timeout de tool no `runOrbTool` (fake com `run` que nunca resolve — `npm run test`). O cancelamento em si só verifica manualmente: clicar em Parar e conferir nos logs da função que o turno encerrou.

**1A.8 — `stop_reason` completo, usage somado e log estruturado** *(bug B5)*
- Arquivos: `supabase/functions/orb-agent/index.ts:148-155, :188-192`.
- O que muda: `switch (message.stop_reason)` — `tool_use` segue o loop; `end_turn` fecha; `max_tokens` emite `{type:"error", message:"A resposta foi cortada…"}` e marca a bolha incompleta; `refusal` lê `stop_details?.category` (**só existe quando `stop_reason === "refusal"`; é `null` no resto — guardar antes de ler**) e emite mensagem própria; `end_turn` sem nenhum bloco de texto → erro, não `done` vazio (é a origem do B2). Acumular `usage` de **todas** as rodadas num objeto fora do `for` (hoje `:152` reporta só a última, subestimando 2-8x) e emitir no `done`, incluindo `cache_read_input_tokens` e `rounds`. Uma linha `console.log(JSON.stringify({requestId,userId,tool,durationMs,ok}))` por tool — nunca `input` nem `result`.
- Verificar: `npm run build` + teste manual das duas ramificações difíceis é inviável (não dá para forçar `refusal`); cobrir por revisão de código e por um teste do reducer de usage se ele for extraído como função pura.

**1A.9 — Conversa não pode mais travar** *(bug B2)*
- Arquivos: `supabase/functions/orb-agent/index.ts:55-70`, `src/hooks/useOrbChat.ts:86-102`.
- O que muda: no servidor, depois do filtro, **colapsar mensagens consecutivas do mesmo papel concatenando com `\n\n`** (não descartar) e garantir que a lista final comece com `user` (corrigir `firstUser <= 0 ? tail : …` para tratar `-1`). No client, nunca deixar bolha de assistant com `content` vazio no estado: se o turno terminou sem texto, substituir por mensagem de erro com `failed: true`.
- Verificar: teste do `parseMessages` extraído como função exportada + `npm run test`. Manual: forçar uma bolha vazia e mandar a pergunta seguinte.

**1A.10 — Erro de tool não vaza schema; heartbeat no SSE** *(bugs B12 e B15)*
- Arquivos: `supabase/functions/_shared/orb/helpers.ts:65-68`, `supabase/functions/orb-agent/index.ts:124-203`.
- O que muda: `unwrap` passa a lançar `OrbToolError` com mensagem estável em PT-BR (`Não consegui ler ${what} agora.`) e o detalhe do Postgrest vai só para `console.error` com o `requestId`. Truncar `JSON.stringify(result)` do `tool_result` (`:171-176`) em ~20 KB com marca de truncagem. Heartbeat `: ping\n\n` a cada 10s enquanto o turno roda, limpo no `finally` **e** no `cancel` — o parser já ignora comentário (`src/domain/orb/__tests__/stream.test.ts:40`). Opcional e recomendado: `thinking:{type:"adaptive", display:"summarized"}`, porque no Sonnet 5 o default é `omitted` e é isso que produz o silêncio de 20-40s.
- Verificar: `npm run test` (parser já cobre comentário); manual para o heartbeat.

**1A.11 — Teto de corpo por requisição**
- Arquivos: `supabase/functions/orb-agent/index.ts:96-107`.
- O que muda: recusar com 413 corpo acima de ~60 KB ou mensagem individual acima de 8 KB. É a metade barata do rate limit; a cota por dia depende de tabela e vai para a Onda 4.
- Verificar: `curl` com corpo grande contra a função publicada.

### Trilha 1B — Servidor MCP local

**1B.1 — Sessão que não morre em 1h** *(bug B10)*
- Arquivos: `mcp/server.ts:67-95, :107-143`.
- O que muda: `authenticate()` vira promise memoizada resolvida na **primeira** `CallTool`, não no boot; `ListTools` passa a responder sem sessão (só lê `orbTools`). No caminho `ORBYVA_ACCESS_TOKEN`, detectar 401/JWT expirado dentro do handler e reautenticar **uma vez** por janela antes de devolver erro. Erro de login vira `{content:[…], isError:true}` em PT-BR, nunca rejeição que derruba o stdio.
- Verificar: `npm run check:mcp` + teste do novo `createOrbMcpServer` (item 2.M1) com um fake que falha o login.

**1B.2 — Conectar o transporte antes de autenticar**
- Arquivos: `mcp/server.ts:107-143`.
- O que muda: `createOrbMcpServer(...)` → `server.connect(new StdioServerTransport())` **primeiro**; `Promise.race` de ~10s no login. Hoje, se o Supabase demorar, o host nunca recebe resposta ao `initialize` e mostra "servidor desconectado" quando o problema é só credencial errada (a mensagem real morre no stderr de `:92`).
- Verificar: `npm run mcp` com `.env` inválido — o servidor tem que subir e a falha aparecer só na primeira tool.

**1B.3 — Tirar `ORBYVA_PASSWORD` do `.env`**
- Arquivos: `mcp/server.ts:85-94`, `mcp/README.md:30-45`, novo `scripts/mcp-login.mjs`, `package.json`.
- O que muda: `npm run mcp:login` pergunta e-mail/senha no terminal, faz um `signInWithPassword` e grava só `{refresh_token, user_id}` em `~/.orbyva/credentials.json` com `mode: 0o600`; `authenticate()` passa a usar `auth.refreshSession({refresh_token})`, regravando o token rotacionado. `ORBYVA_ACCESS_TOKEN` continua como override para CI; `ORBYVA_EMAIL`/`ORBYVA_PASSWORD` saem do README. Motivo: o `.env` guarda hoje a credencial mais poderosa do sistema (permite trocar e-mail e senha) num servidor que se declara somente leitura.
- Verificar: manual — apagar as variáveis, rodar `mcp:login`, rodar `npm run mcp` e chamar uma tool pelo Claude Code.

**Dependências da Onda 1:** 1A.9 (servidor) e 1A.9 (client) podem ir juntas. 1A.6 é independente de tudo. 1A.7 deve vir antes de 1A.8 (compartilham o `send` guardado). 1B é 100% paralelo a 1A.

---

## Onda 2 — Capacidade

**Objetivo:** a Orb deixar de responder "não tenho essa informação" sobre metade do app, e o servidor MCP deixar de ser 13 tools sem contexto.

Duas trilhas paralelas: **2T (tools novas)** e **2M (MCP)**.

**Pré-requisito único e obrigatório para 2T:**

**2T.0 — Regra de escopo das tabelas-filhas + guard automático** *(bug B16)*
- Arquivos: `supabase/functions/_shared/orb/types.ts` (cabeçalho), `helpers.ts`, `src/domain/orb/__tests__/registry.test.ts`.
- O que muda: documentar no cabeçalho de `types.ts`, ao lado da regra de "nada de import externo", os três grupos de tabela: (a) com `user_id` + RLS própria → `.eq("user_id", ctx.userId)` obrigatório (defesa em profundidade); (b) **sem** `user_id`, RLS via pai (`trip_stop`, `trip_checklist_item`, `trip_expense`, `trip_expense_split`, `trip_itinerary_day`, `trip_itinerary_activity`, `trip_milestone`, `vehicle_maintenance`, `vehicle_fuel_log`, `vehicle_document`, `habit_log`) → escopo por `.in("<pai>_id", ids)`, e `.eq("user_id")` dá **42703 em runtime**, engolido por `registry.ts:34-37` e convertido em "não consegui consultar"; (c) `trip_expense`, que além disso exige filtro de visibilidade em código. Helper `ownedIds(ctx, "trip"|"vehicle"|"habit", filtro?)`. **Teste que percorre `orbTools`, roda cada uma com o `fakeDb` e falha se alguma chamar `eq:user_id` numa tabela do grupo (b)** — é a única forma de a regra sobreviver ao próximo copiar-e-colar.
- Verificar: `npm run test`.

### 2T — Tools novas (ordem de prioridade; cada uma entregável sozinha)

Todas seguem o mesmo checklist: arquivo em `supabase/functions/_shared/orb/tools/`, uma linha em `registry.ts:14`, rótulo PT-BR em `src/domain/orb/stream.ts:64-80`, linha na tabela de `mcp/README.md:57-73`, teste no `registry.test.ts`.

| # | Tool(s) | Arquivo | Ponto crítico |
|---|---|---|---|
| 2T.1 | `query_notes` | novo `tools/notes.ts` | Único texto livre do app (`20260816160000_notes_core.sql`). `limit` padrão **5**, máx 20; `content` truncado em ~2.000 chars com `content_truncated`; excluir `kind='canvas'` do corpo (jsonb do Excalidraw) mas listar título com flag. Filtro por `note_link` (`20260816170000_note_links.sql`) quando vier `linked_entity_type`. Sem truncagem, 30 notas envenenam o turno. |
| 2T.2 | `query_places` | novo `tools/places.ts` | `place_visit` **tem** `user_id`. Normalizar `status` **em memória** (`row.status ?? (visited_date ? "visited" : "to_visit")`) — filtrar status no banco esconde linhas legadas, exatamente como `src/domain/places.ts` já trata. `include_occurrences` lê `place_visit_occurrence` (tem `user_id`). |
| 2T.3 | `query_trips`, `query_trip_day_plan`, `query_trip_expenses` | novo `tools/travel.ts` | `trip` tem `user_id`; **todo o resto não** (2T.0). `query_trip_day_plan` cobre um dos oito casos do brainstorm ("o que irei fazer amanhã em São Paulo") — aceitar também `city`, casando contra `trip_stop.name`, senão a Orb devolve o roteiro do dia certo na cidade errada. **`query_trip_expenses` só entra com o filtro de visibilidade replicado de `src/api/travel.ts:242-248`** (manter se `visibility==="shared"` ou `created_by_user_id === ctx.userId`): o RLS libera a linha para qualquer membro da viagem, quem separa pessoal de compartilhado é código de aplicação. É a única tool do plano com risco real de vazar dado de outra pessoa. |
| 2T.4 | `query_vehicles`, `query_vehicle_alerts` | novo `tools/vehicles.ts` | `vehicle` tem `user_id`; `vehicle_maintenance/fuel_log/document` não (`baseline:239,255,267`). O apelido ("o Goleta") mora em `model`/`notes` → `.or("brand.ilike…,model.ilike…,plate.ilike…,notes.ilike…")`, com fallback de listar os veículos e perguntar. A regra de alerta já existe em `src/domain/car`; **extrair a função pura para `_shared/orb/` e o front importar de lá**, nunca duplicar. `query_vehicle_costs` (km/l tanque-a-tanque) entra como sub-tarefa opcional, com `n_fuel_logs` no retorno e a description dizendo que é estimativa — não há coluna `full_tank`. |
| 2T.5 | `query_monthly_history` | `tools/finance.ts` | Lê `vw_value_by_nature_year_month` — **sem `.eq("user_id")`** (a view não tem a coluna; ver R1). Resolve o caso "gastei mais que mês passado?", que hoje exigiria 12 chamadas dentro de um loop com teto de 8 rodadas — ou seja, hoje é literalmente irrespondível. |
| 2T.6 | `query_upcoming` | novo `tools/timeline.ts` | Cross-módulo ("o que vence essa semana"), `Promise.all` de recorrências + tasks + `vehicle_document` + `vehicle_maintenance.next_date` + `trip_milestone` + `trip` + `personal_goal`. Teto duro de 20 itens por módulo. A description precisa dizer **quando não usar** (pergunta de um módulo só → tool específica), senão o modelo chama por reflexo. Depende de 2T.4 para o helper `ownedIds`. |
| 2T.7 | `query_reading_progress` | `tools/life.ts` | Caso explícito do brainstorm ("meta de 1000 páginas"). `read_dates` é `date[]`: **decidir e documentar na description** que cada releitura conta (é o que o array modela), senão a Orb e a tela divergem. `page_count` nullable → devolver `books_without_page_count`, não zero. |
| 2T.8 | `simulate_budget_cut` | `tools/finance.ts` | Caso do brainstorm "quais gastos cortar para sobrar 10% a mais", listado no `architecture.md §5` e nunca implementado. Separar **comprometido** (`recurring_transaction` ativa) de **discricionário** — é o que impede a Orb de sugerir "corte o financiamento". Devolver contagem de meses com lançamento por classe, para o modelo relativizar sazonalidade (IPVA, viagem). |
| 2T.9 | Lote barato: `query_albums`, `query_shopping_list`, `query_series_progress`, `query_tags`, `query_content_links`, `query_time_tracking` | `tools/life.ts`, novo `tools/shopping.ts`, `tools/productivity.ts` | `album`: PK composta `(user_id, musicbrainz_id)` — o id é o `musicbrainz_id`; `artists` é `text[]`, `ilike` não funciona (casar em memória). `shopping_item.shopping_category_id` é nullable desde `20260819090000` → grupo "Sem categoria". `movie_episode`: distinguir `episodes_tracked: 0` de "não assistiu nada". `query_tags` resolve `tag_ids uuid[]` para nomes — **é pré-requisito de `query_content_links`**, que sem isso devolve uuid cru ao modelo. `query_time_tracking`: entradas com `ended_at` nulo vão em `running`, **nunca somadas** (o total mudaria a cada chamada na mesma conversa). |
| 2T.10 | `simulate_month_balance` | `tools/finance.ts` | Caso 11 do brainstorm. A tool atual compara a parcela nova contra a média e ignora que já existem 38 parcelas correndo — responde "cabe" num mês em que não cabe. **A regra de expansão de parcelas já existe e está testada em `src/domain/recurring/{installments,projection}.ts`; a instrução é MOVER a função pura para `_shared/orb/` e fazer o front importar de lá**, não reimplementar — reimplementar cria uma segunda verdade sobre o dinheiro do usuário, que diverge no primeiro `due_day > 30`. Último item da onda por causa disso. |

Verificação de toda a trilha 2T: `npm run test` (contrato + fake db + guard de `user_id`), `npm run lint`, `npm run build`. **O que o teste com fake db NÃO prova é que a coluna existe no banco remoto** — várias tabelas nasceram no SQL Editor (ver o cabeçalho de `20260730190000_reconstructed_missing_views.sql`). Fechar essa lacuna com smoke manual: `npm run mcp` e chamar cada tool nova pelo Claude Code contra o banco real, sem gastar token de modelo.

### 2M — Servidor MCP

**2M.1 — Extrair `createOrbMcpServer` + teste com `InMemoryTransport` + Inspector**
- Arquivos: `mcp/server.ts:107-143`, novo `src/domain/orb/__tests__/mcpServer.test.ts`, `package.json:14-15`.
- O que muda: `export function createOrbMcpServer(ctx: OrbToolContext): Server` com os dois handlers; `main()` vira env → auth preguiçosa → create → connect. Teste com `InMemoryTransport.createLinkedPair()` (já disponível em `node_modules/@modelcontextprotocol/sdk/dist/esm/inMemory.js`): `listTools()` devolve N tools todas com `inputSchema.type === "object"` e description não vazia; `callTool("query_tasks")` com o `fakeDb` devolve `content[0].type === "text"` e JSON parseável; **`callTool("nao_existe")` devolve `isError:true` e NÃO rejeita** — que é a garantia prometida no comentário de `mcp/server.ts:11-12` e nunca verificada (uma rejeição aqui derruba o processo stdio e o host mostra só "servidor desconectado"). Script `"inspector": "npx @modelcontextprotocol/inspector npx tsx mcp/server.ts"` + seção no README: hoje o README só oferece `npm run mcp`, que "sozinho só fica esperando" — inusável para testar.
- Verificar: `npm run test` (o arquivo cai em `src/**`, coberto pelo include de `vite.config.ts:325`) e `npm run check:mcp`.
- **É pré-requisito de 2M.2/2M.3/2M.4.**

**2M.2 — `annotations`, `instructions` e `logging` (sem migrar de API)**
- Arquivos: `supabase/functions/_shared/orb/types.ts:35`, `registry.ts`, `mcp/server.ts:112-142`, `supabase/functions/orb-agent/prompt.ts`.
- O que muda: campo opcional `annotations` em `OrbTool` (tipo puro, não viola a regra do diretório) com default `{readOnlyHint:true, destructiveHint:false, idempotentHint:true, openWorldHint:false}` aplicado no registry e `title` PT-BR por tool; propagar no `ListTools`. `instructions` no `ServerOptions` gerado por uma função `buildMcpInstructions()` compartilhada com `buildOrbSystemPrompt` — hoje a política ("é só leitura", "nunca invente número", "consulte a categoria antes") existe **só** dentro do `orb-agent`, então o Claude Code falando com as mesmas tools não sabe de nada disso. `logging:{}` nas capabilities + `sendLoggingMessage` para tool desconhecida, erro de tool e latência acima do limiar — filtrando o payload a `{tool, code, message}`, nunca o resultado. Não declarar `resources.subscribe`: o stdio não escuta Realtime, seria mentir na capability.
- Verificar: `npm run check:mcp` + Inspector (2M.1) mostrando as annotations e o `instructions` no `initialize`.

**2M.3 — Resources e resource templates**
- Arquivos: novo `mcp/resources.ts`, `mcp/server.ts`.
- O que muda: migração **híbrida** — `new McpServer(...)` para ganhar roteamento de URI template, `resources/templates/list` e `completion/complete`, mas **as tools continuam nos handlers crus via `mcp.server.setRequestHandler(...)`**. Motivo verificado: `McpServer.registerTool` só aceita Zod (`dist/esm/server/mcp.js:869` lança em schema não-Zod), `zod` não é dependência direta do projeto e `_shared/orb` não pode importar módulo externo — migrar as tools custaria 13 schemas duplicados fora do diretório compartilhado, exatamente o que a 098 evitou. `mcp.server.registerCapabilities({tools:{listChanged:false}})` **antes** do `connect`, senão o SDK derruba o registro.
  - URIs fixas (em `resources/list`): `orbyva://financas/categorias`, `orbyva://projetos`, `orbyva://habitos`, `orbyva://metas`, `orbyva://hoje` (snapshot do dia).
  - Templates (em `resources/templates/list`, **nunca** em `resources/list` — o boilerplate `boguan` erra isso e um host correto tentaria ler literalmente `orbyva://{mes}`): `orbyva://orcamento/{mes}`, `orbyva://agenda/{data}`, `orbyva://projeto/{id}/tarefas`, `orbyva://gastos/{mes}`. Extração de variável pelo `UriTemplate` do SDK, nunca regex manual (não trata percent-encoding).
  - `list` **real** onde o domínio é finito (projetos por nome, últimos 12 meses, próximos 7 dias) — sem isso o usuário teria que adivinhar UUID. `{list: undefined}` só onde for infinito, com comentário do porquê.
  - `complete` para `{mes}` (derivado de `ctx.today`, zero I/O) e `{id}` de projeto (com cache de alguns segundos no processo).
- Por que vale: hoje toda pergunta financeira gasta uma rodada só para descobrir a categoria — o próprio prompt manda (`prompt.ts:34`). Com o catálogo como resource, o host entrega a árvore no contexto inicial e o turno cai de 2 rodadas para 1.
- Verificar: Inspector (2M.1) — ler cada URI e cada template; nenhum teste automático cobre isso.

**2M.4 — Prompts MCP a partir de uma constante compartilhada**
- Arquivos: novo `supabase/functions/_shared/orb/prompts.ts`, `mcp/prompts.ts`, `src/components/orb/OrbChat.tsx:10-15`.
- O que muda: mover o array `SUGGESTIONS` do front para `_shared/orb/prompts.ts` (TS puro, uma fonte só) e registrar `prompts` no MCP: `revisao-do-mes(mes?)`, `posso-parcelar(valor,parcelas?)`, `fechar-o-dia()`, `o-que-assistir(genero?)`, `cortar-gastos(percentual)`. Textos referindo **capacidades** ("simule o impacto"), não nomes de tool — senão o prompt vira mentira quando a tool for renomeada. No Claude Code/Desktop cada um vira comando; no front, a mesma constante alimenta as pílulas.
- Verificar: `npm run test` (constante compartilhada), Inspector para `prompts/list` + `prompts/get`.

---

## Onda 3 — Interface e interatividade

**Objetivo:** o usuário conseguir auditar de onde veio o número e sair de um erro sem redigitar. Depende de **1A.8** (evento `tool` enriquecido) para os dois primeiros itens; o resto é paralelo.

**3.1 — Contrato do evento `tool` enriquecido** *(pré-requisito, mas é backend)*
- Arquivos: `supabase/functions/orb-agent/index.ts:164-176`, `src/types/orb.ts:18-22`, `src/domain/orb/stream.ts:26-28`.
- O que muda: `start` → `{type:"tool", id: call.id, name, phase:"start", input}`; `done` → `{type:"tool", id, name, phase:"done", ok, summary}`, com `summary` serializável e truncado (`{rows: 12}` ou o objeto quando `< 4 KB`, com `truncated:true` acima disso). **Nunca o resultado bruto**: `query_transactions` pode devolver centenas de linhas e estourar o SSE. O `input` sai por whitelist do `inputSchema` da tool, não por spread cego. **Ordem obrigatória:** o parser (`stream.ts:26-28` descarta tipo desconhecido, mas campos novos passam) e os tipos vão **antes** do deploy da função, senão evento novo cai no chão.
- Verificar: `npm run test` (`stream.test.ts` ganha caso com `ok`/`input`).

**3.2 — Cartões de ferramenta expansíveis, com status por chamada** *(bug B13)*
- Arquivos: novo `src/components/orb/OrbToolCall.tsx`, `src/components/orb/OrbMessageBubble.tsx:31-36`, `src/hooks/useOrbChat.ts:70-76`, `src/types/orb.ts:10`.
- O que muda: `OrbMessage.tools` deixa de ser `string[]` e vira `{id, name, input, status:"running"|"ok"|"error", summary?}[]`; `start` faz push por `event.id` (acaba a dedup por nome, que hoje esconde a segunda chamada da mesma tool), `done` faz patch por id. Cartão com `Collapsible` (`src/components/ui/collapsible.tsx` já existe): fechado = ícone + rótulo `orbToolLabel` + nome técnico em mono + status; aberto = `Parâmetros` e `Resultado` em `<pre>` com `overflow-x-auto`. Erro em âmbar (`border-amber-500/40`), não vermelho: a tool falhou, a resposta ainda pode ter vindo. No `catch` do abort, marcar toda chamada `running` como `error`, senão fica presa girando.
- Verificar: `npm run test` + `npm run build`; conferência visual é manual (teste manual de navegador fica com o usuário).

**3.3 — Botão "Tentar de novo" e barra de ações**
- Arquivos: `src/components/orb/OrbMessageBubble.tsx:44-48`, `src/hooks/useOrbChat.ts`.
- O que muda: expor `retry(messageId)` no hook (remove a resposta falha, mantém a pergunta, re-executa `send` sem duplicar a bolha do usuário). Botão no ramo `failed` **e** na resposta interrompida (`useOrbChat.ts:93`, que hoje também é beco sem saída). Barra em hover abaixo do balão: assistente = copiar + regenerar; usuário = copiar + editar (editar trunca o histórico dali para frente — deixar explícito apagando as seguintes). Quando o erro for de sessão (`src/api/orb.ts:29`), o botão vira "Entrar de novo", não "Tentar de novo".
- Verificar: `npm run test` (teste do hook para `retry`), `npm run build`.

**3.4 — Scroll que não sequestra** *(bug B14)*
- Arquivos: `src/components/orb/OrbChat.tsx:23-25`.
- O que muda: rastrear `isAtBottom` (`scrollTop + clientHeight >= scrollHeight - 80`), auto-rolar só quando verdadeiro, botão flutuante `ChevronDown` quando falso. Trocar `scrollIntoView` (que rola os ancestrais) por `container.scrollTop = scrollHeight`. Junto: `memo` em `OrbMessageBubble` e throttle de ~50ms no append de texto — hoje cada token reparseia o markdown acumulado inteiro (custo quadrático) e reinicia um smooth scroll.
- Verificar: `npm run build`; comportamento é manual.

**3.5 — Painel "o que eu sei consultar" + empty state**
- Arquivos: `src/components/orb/OrbChat.tsx:37-57`, novo `src/components/orb/OrbCapabilities.tsx`.
- O que muda: painel derivado de `orbToolLabel`/constante compartilhada (nunca lista escrita à mão — diverge na primeira tool nova), agrupado por área, com o selo `● Conectada ao seu Orbyva · N consultas · somente leitura`. Empty state vira saudação (`Boa tarde, {nome}`) + 6 sugestões cobrindo as três áreas (hoje 3 das 4 são financeiras, o que ensina errado o que a Orb faz) — sem fetch bloqueante para o nome. Placeholder longo (`OrbChat.tsx:83`) encolhe para "Fale com a Orb…" e o atalho vira rodapé dentro da caixa.
- Verificar: `npm run build`, `npm run lint`.

**3.6 — Tabela em vez de JSON + contexto/tempo**
- Arquivos: `src/components/orb/OrbToolCall.tsx`, `src/hooks/useOrbChat.ts`.
- O que muda: quando `summary` for array de objetos homogêneos, renderizar com `table.tsx`, `tabular-nums`, valores em BRL, teto de 20 linhas com "+N", rolagem no próprio contêiner. Exibir o `usage` do `done` (hoje `src/types/orb.ts:21` tipa como `unknown` e o client ignora) como `≈ 12,4 mil tokens de contexto`, e o tempo por tool medido entre `start` e `done`. Separador "A Orb não lembra das mensagens acima daqui" quando passar de `MAX_HISTORY_MESSAGES = 24` (`index.ts:30`) — hoje o truncamento é invisível e o usuário atribui o esquecimento a burrice do modelo.
- Verificar: `npm run test` (validar o shape do `usage` antes de exibir), `npm run build`.

---

## Onda 4 — Persistência, cota e escrita com humano no loop

**Objetivo:** a conversa sobreviver ao F5, o custo ter teto, e existir um caminho seguro para a Orb gravar. Depende da Onda 1 inteira (contrato do SSE e do loop já estáveis) e, para 4.4, da Onda 3.

**4.1 — Migration `orb_thread` / `orb_message` / `orb_tool_call` / `orb_usage_day`**
- Arquivos: nova migration em `supabase/migrations/` (**timestamp exclusivo — migrations nunca compartilham timestamp; já causou bug real de bookkeeping, ver Notas de `docs/features/done/002`**), `supabase/migrations/20260816160000_notes_core.sql` (`wipe_own_data`).
- O que muda: as 4 tabelas com RLS `user_id = auth.uid()` no padrão de `20260816160000_notes_core.sql:25-46`; `orb_message` carrega `user_id` **desnormalizado** (a policy precisa dele sem join); `orb_tool_call` guarda `result_summary` (contagem/período), **nunca o resultado inteiro**; `orb_usage_day` é agregado diário `(user_id, day)` com upsert atômico. FK para `auth.users` com `on delete cascade` e **as 4 tabelas entram no `wipe_own_data()` na mesma migration**, senão a exclusão de conta deixa resíduo de conversa sobre finanças pessoais (LGPD, `architecture.md:226`).
- Verificar: `supabase db push` vai no **banco remoto** — **confirmar com o usuário antes de rodar**. Depois: inserir e ler pelo app com dois papéis.

**4.2 — Histórico sai do browser**
- Arquivos: `supabase/functions/orb-agent/index.ts:55-70, :96-107`, `src/hooks/useOrbChat.ts:44,63`, `src/api/orb.ts:39`, `src/types/orb.ts:24-29`.
- O que muda: corpo passa de `{messages[]}` para `{thread_id?, message, today, timezone}`; o servidor resolve/cria a thread, carrega as N últimas de `orb_message` e emite `{type:"thread", id}` como primeiro evento. Persistir a mensagem do usuário **antes** de chamar o modelo e a do assistente no fim, ambas best-effort com try/catch que só loga — falha de persistência não pode derrubar a resposta que já está na tela. Enquanto o front antigo estiver em cache, aceitar os dois formatos por uma versão.
- Por que: enquanto o histórico vem do client, qualquer um com o JWT reescreve o que a Orb "disse" antes e induz a resposta seguinte — o servidor não tem como distinguir.
- Verificar: `npm run test` (parse dos dois formatos), manual de F5 no meio da conversa.

**4.3 — Cota diária + sidebar de conversas**
- Arquivos: novo `supabase/functions/_shared/orb/quota.ts`, `orb-agent/index.ts`, `src/pages/admin/orb/Orb.tsx`.
- O que muda: `checkOrbQuota(db, userId)` com `insert … on conflict (user_id, day) do update set turns = turns + 1 returning turns`, 429 com `Retry-After` e mensagem PT-BR; contar por `user_id`, **não por IP** (o proxy do Supabase mascara). Começar com teto folgado, medir alguns dias, só então apertar. Sidebar com `+ Nova conversa`, busca e lista por recência; título gerado por uma chamada barata a `claude-haiku-4-5` **fire-and-forget**, nunca bloqueando o stream.
- Verificar: `npm run test` para a função de cota (pura sobre fake db); manual para o 429.

**4.4 — Escrita: `propose_*` com aprovação inline (decisão de desenho + primeira tool)**
- Arquivos: `docs/planning/orb-ia/architecture.md`, novo `src/domain/orb/permissions.ts`, `src/components/orb/OrbToolCall.tsx`.
- O que muda, e o que **não** muda: nada de modal (`dialog.tsx`) — a aprovação é o mesmo cartão da Onda 3 em estado `aguardando`, com `Cancelar (Esc)` / `Executar (⌘↵)` na linha e o conteúdo exato do que será gravado no corpo expandido. A decisão **nunca** é booleano: `'allow' | 'prompt' | 'deny'`, fail-closed — resposta que não é objeto, sem `allowed` booleano, ou com `reason` fora da lista conhecida → `deny`; `reason:"default"` → `prompt`. Uma proposta só sai de `pending` com decisão que traduza para `allow`. Falso negativo (proposta que fica pendente) é aceitável; o erro inverso é dinheiro gravado sem consentimento, explicitamente vetado em `architecture.md:99`. `simulate_*` nasce `readOnlyHint:true`; `propose_*` nasce `false` (ver 2M.2). Nota registrada: em host MCP, o caminho nativo disso seria `server.elicitInput()` (existe em `dist/esm/server/index.d.ts:158`), com fallback obrigatório para host que não declara a capability — mas isso não resolve o front do Orbyva, que continua precisando do cartão.
- Aviso de arquitetura: o loop atual executa a tool direto no servidor (`index.ts:163`), sem ponto de pausa. Introduzir aprovação exige encerrar o turno com um evento `{type:"clarify"|"proposal", …}` e retomar com um turno novo carregando a decisão — **não** tentar bloquear o SSE esperando resposta.
- Verificar: `npm run test` para `permissions.ts` (todos os ramos fail-closed).

---

## Grafo de dependências e paralelismo

```
Onda 1A (Edge/tools) ─┬─ 1A.1 1A.2 1A.3 1A.4 1A.5   ← paralelos entre si
                      ├─ 1A.6 (caching)             ← independente
                      ├─ 1A.7 → 1A.8 → 1A.10        ← em série (compartilham send/loop)
                      └─ 1A.9 (servidor + client juntos), 1A.11
Onda 1B (MCP local)  ─── 1B.1 → 1B.2, 1B.3          ← 100% paralelo à 1A

Onda 2T ── 2T.0 (regra + guard)  ← BLOQUEIA todas as tools novas
             ├─ 2T.1 2T.2 2T.5 2T.7 2T.9  ← paralelos
             ├─ 2T.3 2T.4 → 2T.6          ← 2T.6 usa ownedIds
             ├─ 2T.8                       ← independente
             └─ 2T.10                      ← por último (move código de src/domain)
Onda 2M ── 2M.1 → 2M.2, 2M.3, 2M.4          ← paralelo a 2T

Onda 3 ─── 3.1 (backend) → 3.2 → 3.6
           3.3 3.4 3.5                      ← paralelos, não dependem de 3.1

Onda 4 ─── 4.1 → 4.2 → 4.3;  4.4 depende de 3.2
```

Regras de sequência que não podem ser invertidas:
- **1A.6 antes de 2T**: cada tool nova custa ~150 tokens × até 8 rodadas × todo turno. Ligar o cache antes é o que torna a expansão do catálogo pagável.
- **3.1 (parser + tipos) antes do deploy da Edge** que emite os campos novos.
- **4.1 antes de 4.2**; **4.2 antes de 4.3**.
- **2T.0 antes de qualquer tool nova** — sem o guard, metade delas nasce com `.eq("user_id")` numa tabela que não tem a coluna e falha em runtime, engolida por `registry.ts:34-37` como "não consegui consultar".

Comandos de verificação padrão de toda tarefa: `npm run test`, `npm run lint`, `npm run build`, e `npm run check:mcp` quando tocar `mcp/` ou `_shared/orb/`. Só marcar `- [x]` depois que passarem.

---

## A única melhoria que mais aumenta a utilidade

**Dar à Orb leitura dos módulos que ela hoje não enxerga — notas, lugares, viagens, veículos, compras, música, e o transversal `query_upcoming` (Onda 2T)** — porque o pior modo de falha de um assistente pessoal não é errar, é responder "não tenho essa informação" sobre metade do app que o próprio usuário alimentou; corrigir a janela de datas (1A.1) é o que torna essa resposta confiável, mas é a cobertura que decide se existe resposta.