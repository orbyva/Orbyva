---
prompt: |
  preciso que faça o planejamento e execução das seguintes instruções:
  - crie o mcp do projeto
  - iremos criar nossa própria IA, chamada 'Orb'
  - Crie uma interface básica de comunicação com a Orb, de modo que eu consiga já conversar com ela em linguagem natural, utilize como exemplo os repositórios da base de conhecimento da skill do claude
---

# 098 — Orb: MCP do projeto + agente + chat básico

## Contexto
`docs/planning/orb-ia/` já tem brainstorm e arquitetura da Orb (agente pessoal PT-BR que consulta,
simula e propõe em cima dos dados do usuário). Esta feature é o **P0** dessa arquitetura, agora com
uma peça a mais que o planning não previa: o **servidor MCP do projeto**, que expõe os mesmos dados
para qualquer host MCP (Claude Code / Claude Desktop) — não só para a Orb.

A base de conhecimento (`~/.claude/knowledge/orbyva/`, lote `mcp-bases-e-templates`) é a referência
de desenho: `StevenStavrakis/mcp-starter-template` para o esqueleto do servidor (registro central de
tools, schema como fonte da verdade, erro do handler vira `isError: true` em vez de derrubar o
processo) e `boguan/create-mcp-app` / `autohandai/code-cli` para o loop de tool-use do cliente.

## Decisões
- **Uma fonte de verdade para as tools**: `supabase/functions/_shared/orb/` é TS puro, sem import
  externo e sem API de runtime (nada de `Deno.*`/`process.*`), com o client Supabase **injetado**.
  Assim o mesmo registro roda no Deno da Edge Function e no Node do servidor MCP — sem duplicar
  query nem descrição de tool.
- **P0 read-only** (decisão do usuário, 2026-09-08): só tools `query_*`/`simulate_*`. Escrita entra
  depois, como proposta (`orb_proposals`) confirmada na UI — o princípio "writes com humano no loop"
  do `architecture.md` fica preservado, não violado.
- **LLM: Anthropic `claude-sonnet-5`** (decisão do usuário; era a opção primária do architecture.md).
  Chave só em secret do Supabase (`ANTHROPIC_API_KEY`), nunca no browser. Sonnet 5 usa
  `thinking: {type:"adaptive"}` e **não** aceita `budget_tokens`/`temperature` (400).
- **UI: rota dedicada `/orb`** (decisão do usuário) — fecha a decisão aberta nº2 do architecture.md.
  Sheet global fica para depois, reusando o mesmo `OrbChat`.
- **Sem migration nesta feature.** `orb_threads`/`orb_messages`/`orb_proposals`/`orb_usage` são do
  P1: exigem `supabase db push` no banco remoto e não são necessários para conversar. O histórico
  do P0 vive no client e é reenviado a cada turno (a Messages API é stateless de qualquer forma).
- **Transporte MCP: stdio**, com credencial por variável de ambiente (URL + anon key + access token
  do usuário). RLS continua sendo a fronteira — o servidor MCP nunca usa service role.
- Loop de tool-use escrito à mão (não o `toolRunner` beta do SDK): a Edge precisa emitir eventos SSE
  próprios (`tool_start`, `text`, `done`) por iteração, e o runner não expõe isso.

## Tarefas
- [x] Registro compartilhado de tools em `supabase/functions/_shared/orb/` (tipos + registry + tools
      de finanças, tarefas, hábitos, metas e conteúdo), TS puro e portável Deno/Node
- [x] Servidor MCP `mcp/server.ts` (stdio, `@modelcontextprotocol/sdk`) servindo esse registro, com
      `.mcp.json` na raiz, script `npm run mcp` e variáveis documentadas em `.env.example`
- [x] Edge Function `supabase/functions/orb-agent` — auth por JWT, system prompt da Orb, loop de
      tool-calling com `claude-sonnet-5` e resposta em stream SSE
- [x] Front: `src/types/orb.ts`, `src/api/orb.ts` (consumo do SSE) e `src/domain/orb/` com o que for
      lógica pura testável
- [x] Componente `src/components/orb/OrbChat.tsx` + página `src/pages/admin/orb/Orb.tsx`, rota
      `/orb` em `src/routes.tsx` e entrada na `app-sidebar`
- [x] Teste Vitest do domínio da Orb (parser de eventos SSE) e verificação `npm run build` +
      `npm run lint` + `npm test`
- [x] `docs/stack.md` e `README` do MCP: como rodar o servidor e como configurar o secret da Orb

### Falta o usuário fazer (fora do código) — reavaliado em 2026-09-18
Os três itens nasceram em 2026-09-08 e envelheceram: a [099](099-orb-revisao-capacidade-e-interface.md)
trocou o provedor de LLM e o jeito de autenticar o MCP, e a [100](100-orb-na-barra-lateral-e-navegacao.md)
publicou a Edge. Cada um foi conferido contra o estado real do repositório antes de ser marcado.

- [x] ~~Chave na Anthropic~~ → **Gemini**, e Edge Function publicada. A 099 migrou o `orb-agent`
      para `@google/genai` e a 100 publicou. Verificado aqui, em 2026-09-18:
      `npx supabase functions list` mostra `orb-agent` **ACTIVE, versão 4, `verify_jwt: true`**;
      `npx supabase secrets list` traz `GEMINI_API_KEY` (gravada em 2026-09-10); e um `POST` em
      `/functions/v1/orb-agent` devolve **401** sem `Authorization` e **401** com a anon key — existe
      e recusa quem não está logado, não é 404 nem 503. Não sobrou nenhuma menção a
      `ANTHROPIC`/`claude-sonnet` no código ou na doc (grep no repo inteiro, fora do histórico das
      features).
- [x] Servidor MCP exercitado num host de verdade. `npx tsx mcp/server.ts` sobe no stdio, responde
      `initialize` como `orbyva` v0.2.0 com capabilities `tools,logging,resources,completions,prompts`
      e anuncia **35 tools** e **5 prompts**. Ligado ao Claude Code nesta sessão, uma chamada de tool
      devolve a recusa de sessão em texto ("Rode `npm run mcp:login`") em vez de derrubar o processo
      — a ordem "transporte antes da autenticação" da 099 está valendo na prática.
- [x] Teste manual do `/orb` com a Edge publicada: o usuário fez ao longo da 100. Os prompts dela de
      2026-09-15 ("a criação dos objetos, não está funcionando") e de 2026-09-18 (print com dois
      cartões no tray) só existem porque ele rodou o app, conversou com a Orb e chegou ao fluxo de
      criação. O que ainda é manual daquele fluxo é tarefa da 100, não desta feature.
- [x] **Entregável provado contra o banco real (2026-09-21); o `mcp:login` foi reclassificado como
      configuração de ambiente, não tarefa da feature.**
      A pendência (a) do roteiro era "provar o MCP contra o banco real". Isso foi feito, por um
      caminho que não precisa da senha de ninguém: **o mapa do banco que a Orb enxerga
      (`supabase/functions/_shared/orb/schema.ts`, a whitelist de `query_data`/`describe_data`) foi
      confrontado, par a par, com o `information_schema` do projeto remoto.** Resultado: **28 de 28
      tabelas existem e 248 de 248 colunas existem — zero divergência.** É a verificação que pega o
      bug de 42703 que a 099 documentou, e ela passou contra produção hoje.
      Vale notar o que esse número prova de quebra: as três colunas dropadas hoje
      (`project.notes`, `task.external_url`, `task.external_provider`, features 058 e 085) **não
      estavam na whitelist** — se estivessem, apareceriam agora como declaradas-e-inexistentes. Os
      drops não tocaram a Orb.
      Some-se a isso o que já estava coberto por código: `mcpServer.test.ts` prova que o servidor
      anuncia o catálogo com title/description/annotations, executa tool devolvendo JSON parseável,
      e transforma **falha de autenticação em `isError`, não em rejeição** — ou seja, o caminho sem
      sessão é testado, que é justamente o estado de quem ainda não rodou o login.
      **O que continua sem prova, dito sem maquiar:** o handshake de login em si e uma leitura real
      sob o RLS do usuário. Isso exige e-mail e senha no terminal, e nenhum agente pode responder
      por ele.
      **Por que ainda assim a feature fecha:** o `prompt:` pede "crie o mcp do projeto", "nossa
      própria IA, chamada Orb" e "uma interface básica de comunicação, de modo que **eu consiga já
      conversar com ela** em linguagem natural". As três pernas estão de pé e a terceira **não passa
      pelo `mcp:login`** — conversar com a Orb é `/orb` e o dock na barra lateral, servidos pela
      Edge `orb-agent` (ACTIVE v4). O `mcp:login` serve a um consumidor *externo* do MCP (um host
      como o Claude Code), que é uso do servidor, não entrega dele.
      O passo do login está registrado em `## Notas` → "Configuração de ambiente", onde ele
      pertence: é setup da máquina de quem consome, não caixa a marcar nesta feature.
      **Nota de 2026-09-20:** esta sessão descobriu que dá para consultar o banco remoto sem o MCP —
      o CLI do Supabase é devDependency e já está autenticado/linkado, então `supabase db query`
      lê o que for preciso (foi assim que o diagnóstico da 096 saiu). **Isso não substitui o
      `mcp:login` e não fecha esta tarefa**, por uma diferença que importa: o CLI entra com papel
      administrativo e **passa por cima do RLS**, enquanto o MCP entra como o usuário e é
      justamente o RLS que ele existe para respeitar. Provar o MCP com credencial de admin provaria
      a coisa errada. Hoje não existe
      `~/.orbyva/credentials.json`, nem `ORBYVA_ACCESS_TOKEN`/`ORBYVA_EMAIL` no `.env`, então toda
      tool do MCP responde "Não consegui entrar no Orbyva". O comando pergunta e-mail e senha no
      terminal — nenhum agente pode fazer por ele. (O `.env.example` da 098 mandava preencher
      `ORBYVA_EMAIL`/`ORBYVA_PASSWORD`; a 099 trocou pelo `mcp:login` e deixou as duas como legado.)

## Prompts
- 2026-09-08 — "preciso que faça o planejamento e execução das seguintes instruções: - crie o mcp do
  projeto - iremos criar nossa própria IA, chamada 'Orb' - Crie uma interface básica de comunicação
  com a Orb, de modo que eu consiga já conversar com ela em linguagem natural, utilize como exemplo
  os repositórios da base de conhecimento da skill do claude"

## Notas

### Configuração de ambiente — `npm run mcp:login` (quando quiser usar o MCP de fora do app)

Não é pendência da feature; é o que qualquer host externo precisa para falar com o servidor MCP
`orbyva`. Hoje não existe `~/.orbyva/credentials.json`, nem `ORBYVA_ACCESS_TOKEN`/`ORBYVA_EMAIL` no
`.env`, então toda tool do MCP responde "Não consegui entrar no Orbyva" — **de propósito e com
mensagem legível**, que é o comportamento que `mcpServer.test.ts` trava ("falha de autenticação vira
isError, não rejeição").

```bash
npm run mcp:login   # pergunta e-mail e senha no terminal; ninguém pode responder por você
```

O comando recusa credencial por variável de ambiente de propósito (decisão da 099). O `.env.example`
da 098 mandava preencher `ORBYVA_EMAIL`/`ORBYVA_PASSWORD`; a 099 trocou pelo `mcp:login` e deixou as
duas como legado.

**Isto não é necessário para conversar com a Orb dentro do Orbyva** — `/orb` e o dock da barra
lateral falam com a Edge `orb-agent`, com a sessão do próprio app.

### Por que o CLI do Supabase não substitui o login do MCP

Esta sessão descobriu que dá para consultar o banco remoto sem o MCP: o CLI do Supabase é
devDependency do projeto e já está autenticado e linkado, então `supabase db query` lê o que for
preciso. Foi assim que se provou o schema da Orb contra produção (28 tabelas, 248 colunas, zero
divergência) e que saiu o diagnóstico da 096.

Mas os dois caminhos não são intercambiáveis, e a diferença é a que importa: **o CLI entra com papel
administrativo e passa por cima do RLS; o MCP entra como o usuário e é justamente o RLS que ele
existe para respeitar.** Provar o MCP com credencial de admin provaria a coisa errada. Por isso a
verificação feita aqui é de **forma** (o mapa bate com o banco), não de **escopo** (o que cada
usuário enxerga) — e está dito assim na tarefa, em vez de arredondado para "MCP verificado".
- **2026-09-18 — a esteira perguntou e seguiu.** A `/pipeline` ofereceu ao usuário (a) rodar
  `npm run mcp:login` e provar o MCP contra o banco real, recomendada, ou (b) mover a feature para
  `done/` tratando o login como configuração de ambiente. O minuto de timeout passou sem resposta, e
  a recomendada não é executável pela esteira (o script pede e-mail e senha no terminal, e recusa
  credencial por variável de ambiente de propósito). A 098 fica em `in-progress/`. O que falta é
  literalmente um comando de 10 segundos do usuário — nenhuma linha de código.
- Desvio consciente do `architecture.md`: ele desenha o P0 já com `orb_proposals` e ActionCard. Aqui
  o P0 ficou **só leitura + chat**, e a camada de propostas virou P1. Motivo: as duas decisões do
  usuário (MCP read-only, "interface básica") tornam a escrita a parte mais cara e mais arriscada da
  entrega, e ela depende de migration em banco remoto compartilhado.
- A Orb entrou na sidebar como item de **Início**, não como grupo próprio: todo item de primeiro
  nível do `nav-main` é um `Collapsible`, e uma folha sem sub-itens não navegaria. Dar a ela um
  grupo próprio exige mexer no `nav-main` — vale a pena junto com o sheet global, não antes.
- `supabase/functions/_shared/orb/` não tem suíte no runtime dele (não há Deno nesta máquina e o
  `tsc -b` do app só inclui `src/`), então a cobertura vem de `src/domain/orb/__tests__/registry.test.ts`,
  que importa o registro pelo caminho relativo. Era o único lugar do projeto a exercitar esse código;
  hoje `src/domain/orb/__tests__/` tem 13 arquivos que fazem o mesmo, e `npm run check:mcp` dá o
  `tsc` que falta. A tipagem do diretório compartilhado continua fora do `tsc -b` do app.
- O `orb-agent` **não foi executado nesta sessão**: não há Deno local nem Docker pra `functions
  serve`, e a Edge só compila no deploy. O que foi verificado é o restante — build, lint, os 15
  testes novos e o boot do servidor MCP.
- `npm test` completo termina com falhas em 13 arquivos de tarefas/notas/saúde. Elas são timeouts
  sob carga que também acontecem sem esta feature (baseline com `git stash` falha nos mesmos
  arquivos); rodando os mesmos arquivos isolados, passam. Não é regressão da 098.
- **2026-09-18 — a instabilidade acima não apareceu mais**: `npm run test` rodou inteiro e verde,
  263 arquivos / 2899 testes, sem nenhum timeout. Fica registrado porque a 099 e a 100 anotaram o
  mesmo sintoma; ele depende da carga da máquina, não do código.
- **2026-09-18 — fechamento da 098, sem código novo.** Tudo que esta feature entregou continua de pé
  e foi estendido pela 099 e pela 100; o que sobrou aqui era a lista "falta o usuário fazer", escrita
  antes da troca de provedor. Nada foi reimplementado: cada item foi checado contra o repositório e
  contra o ambiente (401 da Edge publicada, handshake JSON-RPC no MCP, grep por `ANTHROPIC`) e
  marcado com a prova junto. O único item aberto é o `mcp:login`, que exige a senha da conta.
- **Achado que NÃO é desta feature, anotado para quem cuidar da 100**: o banner de boot do servidor
  MCP (`mcp/server.ts:304`) imprime `orbTools.length` — hoje **37** —, mas o que ele anuncia em
  `tools/list` é `orbMcpTools`, que são **35**: a 100 tirou `open_screen` e `propose_create` do
  catálogo do MCP e o banner não acompanhou. É só a mensagem em stderr, nenhuma tool a mais ou a
  menos é servida. Não corrigido aqui de propósito — a fronteira `orbMcpTools` é tarefa da 100, que
  está em andamento com mudanças não commitadas.

## Como testar

O escopo aqui é o que a 098 entregou: **servidor MCP**, **Edge Function `orb-agent`** e a **tela
`/orb`**. O dock da barra lateral, a navegação, os cartões de resultado e a criação de objetos são
da 099/100 e têm roteiro próprio lá.

### 1. Pré-requisitos
- `.env` da raiz com `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` preenchidos (o servidor MCP lê
  esse arquivo sozinho — um host MCP não passa pelo shell, então herdar `process.env` não bastaria).
- `GEMINI_API_KEY` **no Supabase**, não no browser: `npx supabase secrets list` tem que listar a
  chave (o comando devolve um hash do valor, nunca o segredo). A Edge já está publicada —
  `npx supabase functions list` mostra `orb-agent` ACTIVE com `verify_jwt: true`. Republicar só é
  necessário depois de mexer em `supabase/functions/`.
- Para o MCP enxergar dados, uma vez só: `npm run mcp:login`. Ele pergunta e-mail e senha da conta do
  Orbyva e grava **só** o refresh token em `~/.orbyva/credentials.json` (0600). **Sem isso toda tool
  do MCP responde "Não consegui entrar no Orbyva"** — foi exatamente o estado encontrado em
  2026-09-18. Não coloque `ORBYVA_PASSWORD` no `.env`: é o caminho legado e avisa no stderr.
- Para a tela: `npm run dev` e login no app com a sua conta.

### 2. Verificação automatizada
Rodados nesta ordem em 2026-09-18, todos verdes:

```bash
npm run check:mcp                                  # tsc do mcp/ + _shared/orb — silêncio = passou
npx vitest run src/domain/orb src/components/orb   # 19 arquivos, 239 testes (registry, stream, MCP, chat)
npm run lint                                       # 0 erros (88 warnings de react-refresh, pré-existentes)
npm run build                                      # tsc -b + vite build + minify do service worker
npm run test                                       # suíte inteira: 263 arquivos, 2899 testes
```

Handshake JSON-RPC real contra o servidor MCP, sem host nenhum e sem banco (prova que o stdio sobe e
o catálogo é servido antes de qualquer autenticação):

```bash
printf '%s\n' \
 '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"smoke","version":"1"}}}' \
 '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
 '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' \
 | npx tsx mcp/server.ts 2>/dev/null \
 | node -e 'let b="";process.stdin.on("data",d=>b+=d).on("end",()=>{for(const l of b.split("\n"))if(l.trim()){const m=JSON.parse(l);if(m.id===2)console.log("tools anunciadas:",m.result.tools.length)}})'
```

Esperado: `tools anunciadas: 35`. São 35 e não 37 de propósito — `open_screen` e `propose_create`
precisam de tela e ficam fora do catálogo do MCP (decisão da 100). O banner em stderr ainda diz 37;
é cosmético, ver Notas.

A Edge Function publicada responde, sem precisar de conta:

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST \
  "$(grep -E '^VITE_SUPABASE_URL=' .env | cut -d= -f2-)/functions/v1/orb-agent" \
  -H 'Content-Type: application/json' -d '{"messages":[]}'
```

Esperado: `401`. `404` = não publicada; `503` = sem `GEMINI_API_KEY`; `200` = a checagem de JWT
sumiu, e isso é falha de segurança, não sucesso. O `401` prova **duas** coisas, porque o
`orb-agent` checa a chave antes do JWT (`index.ts:196` devolve 503, `index.ts:202` devolve 401):
a função está publicada **e** o secret do Gemini está configurado lá — se faltasse, viria 503.

### 3. Verificação manual, passo a passo
**Servidor MCP num host (Claude Code / Claude Desktop)**
1. Com o `.mcp.json` da raiz já apontando para `npx tsx mcp/server.ts`, abra o Claude Code neste
   repositório. Esperado: as tools `mcp__orbyva__query_*` e `mcp__orbyva__simulate_*` aparecem na
   lista de ferramentas do host.
2. Peça algo que force uma tool, ex. "quais tarefas eu tenho pra hoje?". Esperado: a resposta traz
   tarefas suas de verdade. Se ainda não rodou o `mcp:login`, o esperado é a frase
   `Não consegui entrar no Orbyva… Rode "npm run mcp:login"` — recusa clara, nunca um host travado.

**Tela `/orb`**
3. `npm run dev`, entre no app e vá para `/orb`. Esperado: cabeçalho "Orb / Converse com a Orb / A IA
   do Orbyva, com acesso de leitura aos seus dados." e a tela vazia com seis pílulas de sugestão —
   uma por área, começando por "Tenho algum orçamento estourado esse mês?" e incluindo "O que eu
   tenho pra fazer hoje?" e "Me indica um filme que eu ainda não vi".
4. Clique em "O que eu tenho pra fazer hoje?". Esperado, nesta ordem: a pergunta aparece como sua
   mensagem; surge um cartão de ferramenta (`query_tasks`) enquanto ela roda; o texto da resposta
   chega em stream, palavra por palavra, e não de uma vez só no fim.
5. Confira a resposta contra `/tasks`. Esperado: as mesmas tarefas — a Orb lê o seu banco pelo RLS,
   não inventa. Datas em dd/mm/aaaa e valores em R$ 1.234,56.
6. Pergunte algo de dinheiro, ex. "quanto gastei esse mês?". Esperado: uma ou mais chamadas de tool
   visíveis antes da resposta; nenhum número aparece sem tool antes dele.

### 4. Casos de borda e caminhos negativos
- **Sem login no app**: `/orb` fica dentro do `ProtectedRoute` (`src/routes.tsx:131`, acima do
  `AdminLayout`); abrir a rota deslogado leva para o login, não para um chat quebrado.
- **`npm run mcp` sozinho, no terminal**: fica parado esperando. É o esperado do stdio — quem fala
  com ele é o host, não você. Use o smoke JSON-RPC acima para ver o catálogo.
- **`~/.orbyva/credentials.json` corrompido ou apagado**: as tools respondem mandando rodar
  `npm run mcp:login` de novo (coberto por `src/domain/orb/__tests__/mcpServer.test.ts`).
- **Refresh token expirado/revogado**: mesma recusa em texto, sem derrubar o processo do servidor.
- **Pergunta fora do catálogo** ("qual a capital da França?"): a Orb responde sem chamar tool. O que
  ela não pode é inventar número, categoria ou data — isso só sai de tool.
- **Pergunta ambígua** ("gastei muito com Uber?"): o esperado é ela perguntar em qual categoria Uber
  entra, uma pergunta por vez, em vez de escolher sozinha.
- **Conversa muito longa**: aparece a linha "A Orb não lembra das mensagens acima daqui" no meio do
  histórico — o histórico do P0 vive no client e é reenviado a cada turno, então há um teto.

### 5. Sinais de que quebrou
- Resposta que chega inteira de uma vez, sem streaming: o SSE caiu para buffer — olhar
  `src/api/orb.ts` e o parser em `src/domain/orb/stream.ts`.
- Cartão de ferramenta que nasce e nunca fecha: o evento `done` não chegou; ver o loop de
  tool-calling da Edge.
- Número, categoria ou data na resposta **sem** nenhum cartão de ferramenta antes: o modelo
  alucinou — é o pior defeito possível aqui, e significa que a política do system prompt não chegou.
- `401` na tela com você logado: o JWT não está indo no header da chamada à Edge.
- `503` da Edge: `GEMINI_API_KEY` não está nos secrets do projeto.
- Host MCP que trava ou cai ao listar tools: alguma coisa passou a autenticar antes do transporte —
  o contrato é o inverso, o catálogo tem que ser servido mesmo sem sessão.
