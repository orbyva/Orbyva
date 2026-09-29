# Servidor MCP do Orbyva

Expõe os dados do usuário (finanças, tarefas, hábitos, metas, cinema, livros) como tools
[MCP](https://modelcontextprotocol.io) para qualquer host: Claude Code, Claude Desktop, ou a própria
Orb (`supabase/functions/orb-agent`).

**Somente leitura.** Nenhuma tool escreve no banco. A fronteira de segurança é o RLS: o servidor usa
a *anon key* mais o JWT do usuário — nunca a service role.

## Onde as tools moram

Não neste diretório. Elas ficam em `supabase/functions/_shared/orb/`, que é a **fonte de verdade**
consumida por dois runtimes:

```
supabase/functions/_shared/orb/     TS puro, sem import externo, sem Deno.*/process.*
  types.ts        contratos (OrbTool, OrbToolContext, OrbDb) + regra de escopo por tabela
  helpers.ts      parsing de input, datas, paginação, ownedIds
  prompts.ts      política compartilhada (instructions do MCP = policy do orb-agent)
  tools/*.ts      uma área por arquivo (finance, productivity, life, travel, …)
  registry.ts     orbTools[] + runOrbTool() + orbToolAnnotations()/orbToolTitle()
         |
         +--> mcp/orbMcpServer.ts              (Node, protocolo MCP — testável)
         |      `-- mcp/server.ts              (Node, ambiente: .env, sessão, stdio)
         +--> supabase/functions/orb-agent/    (Deno, Edge Function)
```

`orbMcpServer.ts` é o protocolo puro (`createOrbMcpServer(getCtx)`): os dois handlers, as
annotations, o `instructions` e o logging, sem tocar em `.env`, `node:fs` ou Supabase. `server.ts` é
o que resolve ambiente e sessão e conecta o stdio. A separação existe para o protocolo ter teste —
`src/domain/orb/__tests__/mcpServer.test.ts` sobe um cliente MCP de verdade em cima de
`InMemoryTransport`, sem processo e sem banco.

Por isso o diretório compartilhado não pode importar nada nem tocar em API de runtime: o client
Supabase entra **injetado** via `OrbToolContext`. Tool nova = arquivo em `tools/` + uma linha em
`registry.ts`; ela aparece nos dois lados sozinha.

## Configuração

No `.env` da raiz (ou no ambiente do host MCP), só o endereço do projeto:

```bash
ORBYVA_SUPABASE_URL=        # opcional: cai para VITE_SUPABASE_URL
ORBYVA_SUPABASE_ANON_KEY=   # opcional: cai para VITE_SUPABASE_ANON_KEY
ORBYVA_TIMEZONE=America/Sao_Paulo
```

O servidor lê o `.env` da raiz por conta própria — um host MCP não passa pelo shell do usuário,
então herdar `process.env` não bastaria.

### Entrar (recomendado)

```bash
npm run mcp:login   # pergunta e-mail e senha uma vez
```

Grava **só** o refresh token em `~/.orbyva/credentials.json`, com permissão `0600` dentro de um
diretório `0700`. A senha não vai para disco em lugar nenhum, e o access token (que expira em ~1h)
também não: o servidor troca o refresh token por um access token novo a cada sessão e regrava o
token rotacionado.

**Por que não deixar a senha no `.env`:** `ORBYVA_PASSWORD` é a credencial mais poderosa da conta —
com ela dá para trocar o e-mail e a própria senha do usuário. Guardá-la em texto puro, num arquivo
lido no boot por um servidor que se declara somente leitura, é dar poder de escrita total a um
processo que não precisa de nenhum. O refresh token é revogável e só serve para obter o mesmo JWT
que o app do navegador já usa, com o mesmo RLS por trás.

O arquivo fica em `$HOME`, fora do repositório — não precisa entrar no `.gitignore` — e o conteúdo
nunca é impresso no log: o servidor só cita o caminho.

### As outras duas formas de entrar

O servidor resolve a sessão nesta ordem:

1. `ORBYVA_ACCESS_TOKEN` — override para CI. JWT pronto, expira em ~1h e não renova sozinho.
2. `~/.orbyva/credentials.json` — o caminho acima.
3. `ORBYVA_EMAIL` + `ORBYVA_PASSWORD` — **legado**, mantido só para quem já tinha o `.env` montado.
   Avisa no stderr toda vez. Rode `npm run mcp:login` e apague as duas variáveis.

A sessão é resolvida na **primeira chamada de tool**, não no boot: o transporte stdio conecta antes,
para o host receber a resposta do `initialize` e conseguir listar as tools mesmo com credencial
errada. Erro de login aparece como resultado da tool, em português — nunca como "servidor
desconectado" com a causa real perdida no stderr. Quando o JWT expira no meio do uso, o servidor
reautentica uma vez e repete a chamada antes de devolver erro — o sinal é `code: "auth_expirada"` no
resultado da tool (contrato de `OrbToolErrorCode`), não o texto da mensagem, que é apresentação e
muda.

## Rodar

```bash
npm run inspector  # abre o MCP Inspector no navegador e fala com o servidor na mão
npm run mcp        # sobe no stdio (o host é quem fala com ele; sozinho ele só fica esperando)
npm run check:mcp  # typecheck do servidor + do registro compartilhado
npx vitest run src/domain/orb   # contrato do protocolo + das tools, sem banco
```

No Claude Code, o `.mcp.json` da raiz já registra o servidor como `orbyva` — basta aprovar na
primeira execução. Em outro host, aponte o comando `npx tsx mcp/server.ts` com o cwd no repositório.

### Testar na mão com o Inspector

`npm run mcp` sozinho **não serve para testar**: ele fica esperando um host falar JSON-RPC no stdin.
Para exercitar uma tool sem gastar token de modelo nenhum, use o
[Inspector](https://github.com/modelcontextprotocol/inspector):

```bash
npm run inspector
```

Ele sobe uma UI no navegador, conecta pelo mesmo `npx tsx mcp/server.ts` e abre três coisas úteis:

- **Tools** — lista o catálogo com `title` e `annotations`, e deixa preencher o input campo a campo
  e ver o JSON de volta. É o caminho do smoke manual contra o banco **real**: o `fakeDb` dos testes
  prova a query que a tool monta, não que a coluna existe no projeto remoto.
- **Server notifications** — mostra o que sai por `notifications/message` (ver *Logging* abaixo).
- A resposta do `initialize`, com o `instructions` e as capabilities declaradas.

A primeira chamada de tool é a que dispara o login; erro de credencial aparece ali como resultado da
tool, em português, não como "servidor desconectado".

## O que o host recebe além das tools

- **`title` e `annotations` por tool.** O `title` é o rótulo em PT-BR ("Orçamento do mês"); o `name`
  continua sendo o id. As annotations saem de `orbToolAnnotations()` (registry), nunca de
  `tool.annotations` cru — o default (`readOnlyHint: true`, `destructiveHint: false`,
  `idempotentHint: true`, `openWorldHint: false`) mora na função, e ler o campo direto faria toda
  tool aparecer no host como possivelmente destrutiva.
- **`instructions` no `initialize`.** Gerado por `buildMcpInstructions()`, em
  `_shared/orb/prompts.ts` — a **mesma** política que o `orb-agent` injeta no system prompt da Orb:
  é só leitura, nunca invente número, consulte a categoria antes de afirmar que ela existe, toda
  lista tem teto, e como ler um `{"error", "code"}`. Antes disso a política vivia só dentro da Edge
  Function, e o Claude Code falando com as mesmas tools não sabia de nada dela.
- **Logging (`notifications/message`).** O servidor declara a capability `logging` e emite evento
  para tool desconhecida, falha de tool e latência acima de `LIMIAR_DE_LATENCIA_MS` (5s, abaixo do
  timeout de 15s por tool). O payload é sempre `{tool, code, message}` — **nunca** o resultado nem o
  input, que são extrato bancário, medicação e nota pessoal.
- **Nada de `resources`.** Não declaramos a capability (nem `subscribe`): este servidor não escuta
  Realtime, então prometer notificação de mudança seria mentir. Entra em 2M.3, se entrar.

## Tools

As **35 tools** que este servidor anuncia são somente leitura e vêm todas do mesmo registro
(`supabase/functions/_shared/orb/registry.ts`), na ordem em que aparecem aqui — a mesma que o
`tools/list` do MCP e o catálogo enviado à API usam. Cada linha traz o `name` (o que o host chama) e
o `title` (o rótulo em PT-BR que a UI mostra).

**35, e não as 37 do registro** (feature 100): `orbMcpTools` = `orbTools` menos
`ORB_APP_ONLY_TOOLS` — `open_screen` e `propose_create` ficam de fora porque um host MCP não tem
tela do Orbyva: não há para onde navegar nem onde confirmar uma criação. É por isso que o catálogo
daqui continua sendo leitura e simulação, e é o que o teste "anuncia o catálogo inteiro" em
`src/domain/orb/__tests__/mcpServer.test.ts` segura. O banner de boot imprime esse mesmo número.

### Finanças (`tools/finance.ts` — 9)

| Tool | Título | O que responde |
|---|---|---|
| `query_budget_status` | Orçamento do mês | orçamento do mês: planejado, gasto, restante, status |
| `query_spend_by_category` | Gastos por categoria | receita/despesa de um período agrupadas por tipo e classe |
| `query_transactions` | Lançamentos | lançamentos de um período, com busca por descrição |
| `query_recurring` | Recorrências e parcelas | recorrências e parcelamentos, com parcelas pagas e restantes |
| `simulate_installment_impact` | Simulação de parcelamento | impacto de uma compra parcelada (só cálculo, não grava) |
| `query_finance_categories` | Categorias financeiras | árvore natureza → tipo → classe |
| `query_monthly_history` | Histórico mensal | série de até 24 meses de receita/despesa/saldo com variação mês a mês ("gastei mais que mês passado?") |
| `simulate_budget_cut` | Onde cortar gasto | onde cortar para sobrar X%, separando gasto comprometido (recorrência ativa) de discricionário |
| `simulate_month_balance` | Projeção de saldo mensal | saldo projetado dos próximos meses com as parcelas já em curso, com e sem uma compra nova |

### Produtividade (`tools/productivity.ts` — 6)

| Tool | Título | O que responde |
|---|---|---|
| `query_tasks` | Tarefas | tarefas por status, prazo, projeto, texto |
| `query_projects` | Projetos | projetos com contagem de tarefas abertas/concluídas |
| `query_agenda` | Agenda | eventos + tarefas com prazo num intervalo de dias |
| `query_tags` | Tags | catálogo de tags, opcionalmente com quanto cada uma é usada |
| `query_content_links` | Links salvos | links salvos por status, tipo, tag, favorito ou texto |
| `query_time_tracking` | Tempo registrado | tempo por tarefa/projeto num período, e se há timer rodando agora |

### Vida (`tools/life.ts` — 7)

| Tool | Título | O que responde |
|---|---|---|
| `query_habits` | Hábitos | hábitos com check-in de hoje e progresso de 7 dias |
| `query_goals` | Metas | metas com progresso, percentual e atraso |
| `query_movies` | Filmes e séries | filmes/séries por status, gênero e título |
| `query_books` | Livros | livros por status e título |
| `query_reading_progress` | Progresso de leitura | páginas lidas num período ou ano, contra uma meta ("meta de 1000 páginas") |
| `query_albums` | Álbuns | álbuns por status, artista, favorito ou busca |
| `query_series_progress` | Progresso de séries | episódios assistidos/restantes por série, e de onde retomar |

### Viagens (`tools/travel.ts` — 3)

| Tool | Título | O que responde |
|---|---|---|
| `query_trips` | Viagens | viagens do usuário com paradas, datas, orçamento e status efetivo |
| `query_trip_day_plan` | Roteiro do dia | o que está planejado num dia da viagem, casando também por cidade |
| `query_trip_expenses` | Gastos de viagem | gastos de uma viagem, com o filtro de visibilidade pessoal/compartilhado |

### Compras (`tools/shopping.ts` — 1)

| Tool | Título | O que responde |
|---|---|---|
| `query_shopping_list` | Lista de compras | itens da lista agrupados por categoria (a lista não tem preço) |

### Saúde (`tools/health.ts` — 2)

| Tool | Título | O que responde |
|---|---|---|
| `query_medications` | Medicações | tratamentos com posologia, próximas doses e adesão do período |
| `query_health_metrics` | Medições corporais | peso/altura/medidas por período, com variação e IMC derivado |

### Notas (`tools/notes.ts` — 1)

| Tool | Título | O que responde |
|---|---|---|
| `query_notes` | Notas | notas por busca textual ou vínculo com projeto/viagem/tarefa (conteúdo truncado) |

### Linha do tempo (`tools/timeline.ts` — 1)

| Tool | Título | O que responde |
|---|---|---|
| `query_upcoming` | O que vem por aí | o que vence nos próximos dias em 6 módulos de uma vez (finanças, tarefas, agenda, veículos, viagens, metas) |

### Lugares (`tools/places.ts` — 1)

| Tool | Título | O que responde |
|---|---|---|
| `query_places` | Lugares | lugares visitados (nota, opinião, valor, se voltaria) e a lista de vontades, com histórico de idas |

### Veículos (`tools/vehicles.ts` — 2)

| Tool | Título | O que responde |
|---|---|---|
| `query_vehicles` | Veículos | garagem com km atual, últimos abastecimentos (km/l estimado) e últimas manutenções |
| `query_vehicle_alerts` | Alertas do veículo | documento não pago e manutenção vencida ou próxima, na mesma regra da tela de Carro |

### API de dados (`tools/data.ts` — 2)

O par genérico ao lado das tools de intenção (feature 100). Quando existe tool de intenção para o
assunto, ela ganha: já traz o cálculo pronto e custa menos token. O mapa das tabelas mora em
`_shared/orb/schema.ts` e **não** entra no `instructions` — seriam dezenas de milhares de tokens em
todo turno; é buscado sob demanda, e é isso que mantém a conta pagável.

| Tool | Título | O que responde |
|---|---|---|
| `describe_data` | Estrutura dos dados | tabelas, colunas, tipos, valores aceitos, relações e a regra de escopo por dono; sem argumento, lista as tabelas com uma linha cada |
| `query_data` | Consulta livre | consulta sobre uma tabela, com colunas escolhidas, filtros compostos (12 operadores), ordenação, paginação e `count_only` (conta com `head: true`, sem baixar linha) |

### Fora deste catálogo (só dentro do app)

Duas tools do registro **não** são anunciadas aqui, e isso é decisão de desenho, não esquecimento:

| Tool | Título | Por que fica de fora |
|---|---|---|
| `open_screen` (`tools/navigation.ts`) | Abrir tela | navega o app do Orbyva de verdade; um host MCP não tem essa tela para trocar |
| `propose_create` (`tools/create.ts`) | Criar (com confirmação) | devolve uma proposta que vira cartão com "Criar"; sem tela não há onde confirmar, e nenhuma tool grava sozinha |

A lista mora em `ORB_APP_ONLY_TOOLS` (registry). Tool nova que precise de tela entra ali junto —
senão ela aparece num host que não consegue executá-la.
