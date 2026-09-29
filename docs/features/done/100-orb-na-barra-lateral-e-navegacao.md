---
prompt: |
  preciso agora então colocar pra rodar:
  - o orb vai aparecer na esquerda, na barra lateral tipo assim:

  [duas imagens: rascunho por cima do print da sidebar — rótulo "ORB", a esfera da Orb e o
  campo de conversa logo abaixo dos grupos de navegação, acima do rodapé do usuário]

  ele deve navegar também na página, e ele deve ser capaz de navegar na página, aplicando os
  devidos filtros, e pesquisas

  então se eu pergunto, quais projetos eu tenho para o sacada, ele navega para as tarefas de lá
---

# 100 — Orb operável: barra lateral, navegação, resultados em cartão, API de dados e criação

## Contexto
A [098](098-orb-ia-mcp-e-chat.md) entregou a Orb (MCP + Edge Function + tela `/orb`) e a
[099](../done/099-orb-revisao-capacidade-e-interface.md) revisou capacidade e interface. Nas duas, a Orb
**responde**; ela não leva ninguém a lugar nenhum, e só existe dentro de `/orb`.

Esta feature muda isso, em quatro frentes que chegaram em dois prompts do mesmo dia:

1. a Orb passa a morar na **barra lateral**, visível em qualquer tela, com a conversa sobrevivendo à
   navegação;
2. ganha a capacidade de **navegar o app** — abrir a tela certa já com filtro e busca aplicados;
3. os resultados deixam de sair como tabela crua e viram **cartão, carrossel, linha e barra**;
4. ganha uma **API de dados** (o mapa do banco + consulta livre) e a capacidade de **criar objetos**,
   sempre com um cartão de confirmação antes de gravar.

Arquivo próprio, e não tarefas na 099, pelo mesmo argumento que a 099 usou para não virar tarefa da
098: o `prompt:` da 099 ("revise e melhore…") já foi cumprido, e misturar tornaria impossível dizer o
que "cumprir a feature" significa em cada uma.

## Decisões
- **A conversa sobe para um contexto no `AdminLayout`.** A Orb navega; se o estado do chat morasse
  dentro da página `/orb` ou dentro da sidebar renderizada por rota, a primeira navegação apagaria a
  conversa que a causou. `OrbProvider` fica acima do `Outlet`, e a sidebar e a `/orb` são duas
  janelas para o **mesmo** turno.
- **Navegação é uma tool (`open_screen`), não um parser de texto na resposta.** O modelo já tem o
  loop de function calling; adivinhar link a partir da resposta em PT-BR seria uma segunda
  linguagem, sem schema e sem validação.
- **Catálogo de telas em `_shared/orb/navigation.ts`, uma fonte só.** Cada tela declara caminho,
  rótulo e os filtros que aceita. O servidor monta a URL a partir dele; o **client valida de novo**
  contra o mesmo catálogo antes de navegar — caminho vindo de um modelo não entra em `navigate()`
  sem passar por uma whitelist.
- **A tool resolve nome → id no banco.** "as tarefas do Sacada" tem que virar
  `/tasks?project=<uuid>`; deixar o modelo inventar o id, ou obrigá-lo a uma rodada extra de
  `query_projects`, era escolher entre erro e latência. Com mais de um casamento a tool devolve a
  lista e deixa o modelo perguntar — a regra de lacuna do prompt já manda perguntar em vez de supor.
- **Filtro na URL vira estado de verdade nas telas.** Não adianta a Orb montar `/tasks?project=x&q=y`
  se a tela ignora o parâmetro. As telas alvo passam a ler os filtros da URL **e a reagir quando ela
  muda sem remontar** (navegar de `/tasks?project=A` para `?project=B` não remonta o componente — só
  o inicializador do `useState` rodaria, e ele não roda de novo).
- **`?q=` na lista de tarefas é campo novo.** A tela não tinha busca textual nenhuma; o pedido cita
  "pesquisas" e o exemplo do usuário é justamente a tela de tarefas.

- **Resultado de tool vira componente, não tabela.** O cartão da consulta continua mostrando o
  "como"; o resultado em si passa a ser renderizado por um componente por tipo de dado (cartões de
  tarefa, carrossel de filmes, linhas de lançamento). O client escolhe o renderizador **pelo nome da
  tool** — nada de campo novo no payload: o que vai para o modelo não pode crescer para a UI ficar
  bonita. O `summary` do SSE (que só a UI lê) é que ganha teto maior.
- **Uma API de dados genérica ao lado das tools de intenção.** `describe_data` (catálogo do banco:
  tabelas, colunas, tipos, enums, relações e regra de escopo) + `query_data` (colunas, filtros
  compostos, ordenação, paginação e contagem sem baixar linha). O catálogo NÃO entra no system
  prompt: seriam dezenas de milhares de tokens em todo turno; ele é buscado sob demanda, e é isso
  que mantém a conta pagável.
- **Escrita com confirmação, executada pelo client.** A tool `propose_create` monta e valida a
  criação (resolvendo ids), mas não grava: o servidor devolve uma proposta, a UI mostra um cartão
  com "Criar" e quem grava é o `src/api/*` que a tela manual já usa — mesma validação, mesmo caminho,
  zero regra de escrita duplicada na Edge e nenhuma migration nova.
- **Cartão de proposta é global, não um por página** (prompt de 2026-09-15). O pedido fala em "um
  componente específico em cada página"; a leitura adotada é UM componente — um tray montado no
  `AdminLayout`, onde a conversa já vive — que aparece sobre QUALQUER página com a proposta
  pendente para aceitar ou declinar. 27 variantes por tela seriam 27 lugares para o mesmo bug, e o
  estado da proposta já mora no `OrbProvider`. Na rota `/orb` o tray se esconde: o balão do chat já
  mostra o mesmo cartão, e dois "Criar" para a mesma proposta é convite a clique duplo.

## Tarefas

### Onda 1 — Barra lateral e navegação
- [x] Catálogo de telas + montador de URL em `_shared/orb/navigation.ts` (27 telas, TS puro), com
      validação do caminho no client (`isOrbNavigablePath`) contra a MESMA whitelist
- [x] Tool `open_screen`: resolve projeto/etiqueta/viagem/nota por nome no banco, recusa filtro que
      a tela não lê e devolve `{path, label, screen, applied}`
- [x] Client: `onNavigate` no `useOrbChat` + `OrbProvider` no `AdminLayout` (conversa sobrevive à
      navegação) + `/orb` consumindo o mesmo contexto
- [x] `OrbSidebarDock`: esfera em CSS, últimas mensagens e campo compacto na barra lateral; barra
      recolhida vira só a esfera; painel abre/fecha e a preferência fica no `localStorage`
- [x] Telas lendo filtro da URL **e reagindo à troca sem remontar**: tarefas, transações, notas,
      filmes, livros, lugares, foco (compras e recorrências já liam da URL)
- [x] Busca textual na lista de tarefas (campo novo + `filterTasksBySearch` sem acento/caixa),
      ligada ao `?q=`, valendo nas quatro abas — no Gantt, trazendo junto o pai da subtarefa que casou

### Onda 2 — Resultados em componente
- [x] Quatro formas visuais (`cards`, `carousel`, `rows`, `bars`) + adaptador por tool em
      `src/domain/orb/results.ts` (16 tools cobertas), com fallback para a tabela de antes
- [x] Convenção `ui_*`: campo que existe só para a tela (pôster, capa) é retirado do que vai para o
      modelo (`stripUiFields`, nos dois hosts) — e o teto do `summary` do SSE subiu de 4 KB para 24 KB

### Onda 3 — API de dados
- [x] `_shared/orb/schema.ts`: 27 tabelas com colunas, tipos, enums, relações, colunas padrão e a
      regra de escopo por dono (própria, herdada do pai ou global)
- [x] `describe_data` (catálogo sob demanda, fora do system prompt) e `query_data` (colunas
      escolhidas, filtros compostos com 12 operadores, ordenação, paginação e contagem exata)
- [x] Eficiência: `count_only` conta com `head: true` (nenhuma linha baixada), `select` só das
      colunas pedidas, teto de 200 linhas e aviso honesto de página cheia com o `offset` seguinte

### Onda 4 — Criação de objetos
- [x] `_shared/orb/actions.ts` (contrato da proposta + whitelist por tipo) e `propose_create` para
      tarefa, lançamento, nota, item de compra, projeto e evento — resolvendo projeto e categoria
      pelo nome, e recusando o que não existe
- [x] `OrbActionCard`: mostra cada campo, grava no clique pelo `src/api/*` da tela manual, não grava
      duas vezes e sobrevive à navegação (o estado mora no `OrbProvider`)
- [x] Fronteira redesenhada: `propose_create` e `open_screen` ficam FORA do catálogo do MCP
      (`orbMcpTools`) — host sem tela não tem onde navegar nem onde confirmar
- [x] Painel "o que eu sei consultar" e selo do chat atualizados: o selo dizia "somente leitura",
      que virou mentira, e agora diz "só cria com a sua confirmação"

### Onda 5 — proposta visível em qualquer página (prompt de 2026-09-15)
- [x] `OrbProvider` deriva e expõe as propostas pendentes da conversa (tool `propose_create` com
      `ok` + `isOrbProposal(summary)` + estado ≠ `done`), com o descarte/criação marcando o estado
      como hoje — nada novo no contrato do SSE
- [x] `OrbProposalTray` montado no `AdminLayout`: cartão flutuante com a(s) proposta(s) pendente(s)
      reusando o `OrbActionCard` (aceitar grava pelo `src/api/*`, declinar descarta), sobrevivendo à
      navegação; oculto na rota `/orb` (o balão do chat já mostra o cartão) — lazy/dinâmico para o
      chunk do layout não engordar (lição das duas armadilhas de bundle desta feature: olhar o
      `dist` depois)
- [x] Prompt da Orb: ao propor uma criação, também abrir a tela do tipo criado com `open_screen`
      quando houver tela correspondente — o exemplo do pedido: "cria uma tarefa" → navega para
      `/tasks` e o cartão de validação aparece ali
- [x] Teste de componente: tray aparece com proposta pendente, some ao criar e ao descartar, não
      renderiza em `/orb` e não grava duas vezes
- [x] **Bug achado na validação do fluxo de criação**: evento de agenda gravado no fuso errado
      (`starts_at` sem offset, castado como UTC) — `instantFromLocalTime` em `_shared/orb/helpers.ts`
      + testes de fuso e de horário de verão
- [x] Verificação da onda: `npm run test` (2892 testes, 263 arquivos), `npm run lint` (0 erros),
      `npm run build`, `npm run check:mcp`, `npm run check:bundle` (orçamento OK; tray em 5,4 KB
      crus / 2,5 KB gzip, em chunk próprio) e `npm run orb:smoke` no caminho de criação — o modelo
      agora chama `propose_create` **e** `open_screen` na mesma rodada
- [x] Deploy da Edge com a Onda 5: `npx supabase functions deploy orb-agent` (versão 3, ACTIVE) — o
      fuso do evento e a regra nova de prompt vivem no código que roda lá

### Onda 6 — refinar uma proposta substitui o cartão (prompt de 2026-09-18)
- [x] `orbProposalIdentity` em `_shared/orb/actions.ts` (tipo + texto principal sem acento/caixa) e
      a derivação do `OrbProvider` guardando só a ÚLTIMA proposta de cada identidade — reproposta é
      substituição, não um segundo item
- [x] `OrbActionCard` desarma o cartão antigo na conversa da `/orb` ("Substituída por uma versão
      mais nova"): lá o histórico não some, e o botão dele gravaria a versão sem o ajuste
- [x] Prompt: ao ajustar o que acabou de propor, repropor com TODOS os campos e sem repetir o
      `open_screen` — a proposta nova substitui o cartão
- [x] Testes: identidade (mesma coisa com mais campos, acento/caixa, tipos diferentes com o mesmo
      nome), tray com um cartão só depois do ajuste, dois cartões para coisas diferentes, e o cartão
      antigo desarmado na conversa
- [x] Verificação: `npm run test` (2899 testes), `npm run lint` (0 erros), `npm run check:mcp`,
      `npm run build`, `npm run check:bundle`
- [x] Deploy da Onda 6: `orb-agent` está publicada na **versão 4**, carimbada 2026-09-18 11:57:29.
      A esteira tentou publicar às ~11:56 e o classificador de permissões negou o comando, então o
      deploy saiu de fora dela. Vale do mesmo jeito, e dá para afirmar por quê: um deploy empacota a
      árvore como ela está no momento, e a regra nova de prompt já estava em `prompts.ts` desde
      11:52:08 — cinco minutos antes. Conferido com `supabase functions list` (versão e `updated_at`)
      e o `mtime` do arquivo.

### Onda 7 — o que a checagem de satisfação cobrou (2026-09-18)
- [x] Teste da ponta que fecha o exemplo do pedido: a TELA de tarefas lendo `?project=` e `?q=`
      (`src/pages/admin/tasks/__tests__/TaskList.orb-url-filters.test.tsx`, 6 casos) — incluindo a
      segunda navegação, que troca o recorte **sem remontar** (provado pela contagem de `fetchTasks`
      parada). `open_screen` já tinha teste; o outro lado da URL não tinha nenhum
- [x] Banner de boot do MCP contava `orbTools` (37) e anunciava `orbMcpTools` (35): virou
      `bannerDeBoot()` em `mcp/orbMcpServer.ts`, derivado do mesmo array do handler, com teste que
      amarra o texto ao `tools/list` de verdade
- [x] `mcp/README.md` atualizado: dizia "As 33 tools" e a tabela parava em veículos — faltavam as
      duas da API de dados e a explicação de por que `open_screen`/`propose_create` NÃO aparecem lá.
      O `docs/stack.md` aponta esse arquivo como "tabela completa", então a defasagem era do
      contrato lido por quem chega
- [x] Link quebrado para a 099 no Contexto (ela foi para `done/`) — caminho corrigido
- [x] Seção `## Como testar` escrita (faltava) e a parte automatizada rodada como está escrita lá

### Verificação
- [x] `npm run test` (2880 testes), `npm run lint` (0 erros), `npm run build`, `npm run check:mcp`,
      `npm run check:bundle`
- [x] `npm run orb:smoke` contra o modelo real, nos dois caminhos novos: navegação (`open_screen`) e
      criação (`propose_create`, respondendo "preparei… é só confirmar")
- [x] Deploy: `supabase functions deploy orb-agent` (versão 2, ACTIVE)
- [x] Verificação da Onda 7: `npm run test` (2913 testes, 264 arquivos, tudo verde),
      `npm run lint` (0 erros, 88 warnings de `react-refresh`, os mesmos de antes),
      `npm run build`, `npm run check:mcp`, `npm run check:bundle` (orçamento OK) e o boot real do
      servidor MCP (`npx tsx mcp/server.ts < /dev/null`) imprimindo "35 tools"
- [x] `npm run orb:smoke` refeito contra o modelo real nos dois caminhos: "cria uma tarefa comprar
      pao para amanha" → uma rodada só com `propose_create({kind:"task", date:"2026-09-19",
      title:"Comprar pão"})` **e** `open_screen({screen:"tasks"})`, respondendo "Preparei aqui para
      amanhã, é só confirmar no cartão" (não "criei"); "me mostra as tarefas do projeto Casa" →
      `open_screen` depois de procurar, e como o `fakeDb` do script não tem projeto nenhum ela diz
      que não achou em vez de inventar id
- [x] **Convertido em cobertura automatizada (2026-09-21), como a CLAUDE.md passou a exigir.**
      A regra nova ("Verificação — Chrome bloqueado") diz que navegador não conta como verificação e
      que, se a única forma de confirmar algo fosse olhar na tela, **escrever o teste é parte da
      tarefa**. Foi o que se fez: os 11 passos de `## Como testar` → "Verificação manual" foram
      mapeados um a um contra a suíte, e as duas lacunas reais viraram teste.
      **Já estavam cobertos (9 dos 11):** passo 1 dock/esfera e passo 3 "a conversa continua no
      dock" → `OrbSidebarDock.test.tsx`; passos 3 a 5 (navegar com `?project=`, trocar de recorte
      sem remontar, `?q=` com acento e caixa) → `TaskList.orb-url-filters.test.tsx`; passo 6
      (resultado como cartão/carrossel, não tabela crua) → `results.test.ts`; passos 7, 8 e 10
      (cartão fora da `/orb`, Criar/Descartar, um cartão só depois do ajuste, nada na `/orb`) →
      `OrbProposalTray.test.tsx`; passo 9 (evento às 14h no fuso certo) → `helpers.test.ts`
      ("resolve a hora de parede pelo offset do fuso, não por UTC"); o aviso de navegação →
      `useOrbChat.test.tsx`.
      **Lacunas fechadas agora (2 dos 11):**
      - passo 2 (recolher o dock e recarregar) → **`src/hooks/__tests__/useOrb.dock-persistence.test.tsx`**,
        6 testes: padrão aberto sem preferência, recolher grava `0` e sobrevive à remontagem (que é
        o reload, já que a preferência é lida no inicializador preguiçoso do `useState`), reabrir
        grava `1` e também sobrevive, valor estranho não fecha o dock, e os dois ramos de storage
        bloqueado que o código comenta (leitura cai no padrão aberto; escrita não derruba a sessão).
      - passo 11 (painel "O que eu sei consultar") → **`src/components/orb/__tests__/OrbCapabilities.test.tsx`**,
        7 testes: o selo conta `orbTools` menos `ORB_APP_ONLY_TOOLS` (o número sai do catálogo, não
        fixo no teste — não quebra quando uma tool nasce, mas quebra se alguém voltar a contar
        `open_screen`/`propose_create` como consulta), promete confirmação e não "somente leitura",
        os grupos "Abrir telas do app" e "Criar (você confirma)" existem com as tools certas dentro,
        e nenhum cabeçalho de grupo fica sem item.
      **Esse passo 11 achou um bug de verdade — ver `## Notas`.**
      Verificação: `npm run build`, `npm run lint` (0 erros) e a suíte completa —
      **266 arquivos / 2926 testes / 0 falhas** (eram 264/2913: +2 arquivos, +13 testes).
      ~~**Do usuário, não do agente** — teste manual no app rodando: dock na barra lateral,~~
      "me mostra as tarefas do <projeto>", cartões de resultado e o botão Criar. O roteiro está em
      `## Como testar` → "Verificação manual". A esteira não abre navegador (a skill `next` proíbe),
      então esta linha só o usuário fecha.
      **Reafirmado em 2026-09-20:** continua sendo a única pendência da feature, e continua sendo do
      usuário por decisão, não por limitação técnica — teste manual de navegador fica com ele. O
      `orb-agent` **está publicado e ACTIVE na v4** (`supabase functions list`), então não há nada
      de infraestrutura faltando para o roteiro rodar: é abrir o app e seguir `## Como testar`

## Prompts
- 2026-09-10 — "prepare, componentes diferentes para renderizar os conteúdos específicos, então
  imagina retornar os próprios cards de tarefas, retornar carrosel com os filmes, um card sabe.
  componentes de card para poder retornar, ao invés de lista bruta oui tabela. e melhore as
  estratégias de consultas, busque a melhor eficiência possível. o modelo deve ter controle e
  entendimento completo do banco de dados, para fazer queryes com filtros, ordenações, filtros
  complexos, etc. deve ter essa api claramente. e também ela deve ser capaz de criar objetos."
- 2026-09-10 — "preciso agora então colocar pra rodar: - o orb vai aparecer na esquerda, na barra
  lateral tipo assim: [imagens] / ele deve navegar também na página, e ele deve ser capaz de navegar
  na página, aplicando os devidos filtros, e pesquisas / então se eu pergunto, quais projetos eu
  tenho para o sacada, ele navega para as tarefas de lá"
- 2026-09-15 — "a criação dos objetos, não está funcionando. Em cada página, pode ser criado um
  componente específico para a sugestão de criação de IA, de modo que o usuário tenha que aceitar
  ou declinar. então quandoa IA navega para por exemplo criar uma tarefa. aparece um componente,
  com as informações da tarefa criada, para o usuário validar, e quando ele aceita, a tarefa por
  exemplo é criada"

- 2026-09-18 — "ao invés de ele editar, ele criou outro, quando pedi para colocar prazo"
  [print: dois cartões "Nova tarefa · Comprar cigarro" no tray, um sem prazo e outro com
  18/09/2026, os dois com o botão Criar]

## Notas
- **2026-09-21 — o rodapé do painel de capacidades desmentia a própria tela.** Ao escrever o teste
  do passo 11, apareceu que `OrbCapabilities.tsx` ainda fechava com "Não crio, não edito e não apago
  nada" — **a mesma frase que esta feature já tinha corrigido no selo**, e pelo mesmo motivo: com
  `propose_create` no catálogo ela virou mentira. Pior que no selo, aqui ela ficava a poucos pixels
  do grupo "Criar (você confirma)", renderizado logo acima na mesma lista: a tela afirmava e negava
  a mesma coisa. A correção do selo, na Onda em que a Orb ganhou criação, não desceu até o rodapé.
  Texto novo: "Não edito e não apago nada — o que precisar mudar, você muda no Orbyva. Criar, eu só
  preparo: a linha só passa a existir depois que você confirma no cartão." Mantém a garantia que é
  real (nada grava sem clique) e para de negar o que a própria lista mostra. O teste
  `"o rodapé não desmente o grupo de criação que ele tem logo acima"` trava as duas pontas: afirma a
  frase nova e afirma a **ausência** da antiga, então reverter quebra.
  Vale o registro de método: este bug não saiu de ler o código procurando erro — saiu de traduzir
  um passo de roteiro manual em assertiva. É o argumento da regra nova da CLAUDE.md em miniatura.
- **2026-09-15 — por que "a criação não funciona"**: o motor está inteiro (o `orb:smoke` com "cria
  uma tarefa…" fez o modelo chamar `propose_create` e montar a proposta certa), mas o cartão de
  confirmação só renderiza no `OrbMessageBubble` da `/orb`. O `OrbSidebarDock` mostra só texto —
  quem pede criação de qualquer outra página recebe "é só confirmar" sem ter onde confirmar. A
  Onda 5 fecha esse furo com o tray global.
- **2026-09-18 — "ele criou outro em vez de editar".** `propose_create` não edita (de propósito: a
  proposta não existe no banco, só na mensagem), então pedir "com prazo para sexta" faz o modelo
  repropor a tarefa INTEIRA — e a UI mostrava as duas. O risco não é o cartão a mais: é confirmar o
  de cima, que é o desatualizado, e gravar a tarefa sem o prazo que a pessoa acabou de pedir. A
  correção é identidade de proposta (`orbProposalIdentity`: tipo + texto principal normalizado), com
  o provider guardando só a última de cada uma; na `/orb`, onde o histórico da conversa não some, o
  cartão antigo fica visível mas desarmado. Só a identidade — e não "última proposta do mesmo tipo"
  — porque "cria a tarefa A" seguido de "cria a tarefa B" são duas coisas de verdade, e engolir a
  primeira em silêncio seria pior que o cartão duplicado. O prompt também passou a dizer que
  repropor substitui o cartão e que não é para repetir o `open_screen`.
- **O "sexta = 18/09/2026" da mesma conversa estava certo**: hoje é sexta-feira, e o dia da semana
  já vai no bloco volátil do system prompt (`orbSystemContext`). Não mexer.
- **2026-09-18 — evento de agenda nascia 3 horas atrasado.** Na validação do fluxo de criação de
  ponta a ponta (proposta → `sanitizeOrbProposalPayload` → `src/api/*` → coluna do banco), o único
  descasamento real apareceu no evento: `propose_create` montava `starts_at` como
  `"2026-09-20T14:00:00"`, sem offset, e `project_event.starts_at` é `timestamptz` — o Postgres
  casta sem fuso usando o da SESSÃO (UTC no Supabase), então o evento que a pessoa confirmou para as
  14:00 entrava como 14:00Z e aparecia na agenda às 11:00. A tela manual não tem o problema porque
  grava `new Date(<datetime-local>).toISOString()`, ou seja, o browser já resolve o offset; a Orb
  roda no servidor e precisava resolver na tool. `instantFromLocalTime(dia, hora, ctx.timezone)`
  resolve pelo `Intl` (duas passadas, para a virada do horário de verão convergir). O lançamento
  financeiro **não** foi mexido: ele já usa `T12:00:00.000Z` de propósito, alinhado à convenção de
  dia em UTC da view de finanças (ver `exclusiveEnd`).
- **2026-09-18 — o resto do fluxo de criação conferiu.** Ficam registrados para não serem
  reauditados: a whitelist é a mesma nos dois lados e o payload é reconstruído campo a campo antes
  do `insert`; os enums propostos existem (`task.status: "todo"`, prioridade `low|medium|high`,
  `project.status: "active"`, `shopping_item.status: "pending"`); o lançamento vai com valor
  **positivo** e `class_id` resolvido pelo nome, igual ao formulário manual (a natureza vem do
  `class → type → nature`, não do sinal); todo `insert` passa pelo `src/api/*` da tela, que é quem
  carimba `user_id`; e os links de "ver" apontam para rotas que existem e leem `?q=`.
- **Custo do tray no bundle**: o chunk sempre carregado da Orb (provider + composer + sugestões)
  subiu de 15,5 KB para 19,9 KB crus (8,0 KB gzip) porque o `OrbProvider` passou a importar
  `_shared/orb/actions.ts` para derivar as propostas pendentes. É o preço de uma validação só: sem
  `isOrbProposal` no provider, um `summary` truncado pelo teto do SSE viraria cartão com botão que
  falha no clique. O tray em si (5,4 KB crus / 2,5 KB gzip) é `lazy` e só desce quando existe
  proposta — `src/api/orbActions` e as funções de gravação ficam nele, fora do chunk do layout.
- A Edge Function `orb-agent` **já está publicada e com `GEMINI_API_KEY` configurada** (verificado:
  `POST /functions/v1/orb-agent` sem JWT devolve 401, não 503 nem 404). Como a tool nova entra no
  catálogo que a Edge serve, a navegação só funciona depois de um `functions deploy`.

- **A barra lateral quase levou o catálogo inteiro junto.** Com o dock na sidebar, o chunk
  compartilhado `useOrb` foi para 158 KB crus (~49 KB gzip) e passou a ser baixado em TODA página do
  app — dentro do orçamento, mas 49 KB de SQL e nome de coluna que o browser nunca executa. A causa
  era uma linha: `domain/orb/stream.ts` (parser de SSE, caminho carregado sempre) importava
  `orbToolTitle` do `registry.ts`. O rótulo saiu para `domain/orb/toolLabel.ts`, importado só por
  quem já é lazy; o chunk caiu para 7,2 KB e o peso voltou para o chunk da `/orb` (54,1 KB de 160).
  É o mesmo "peso morto" que a 099 anotou — agora resolvido sem criar uma segunda fonte de títulos.
- **Bug pego no caminho**: `escopar()` era `async` e devolvia o builder do PostgREST, que é
  *thenable* — o `await` EXECUTAVA a consulta e devolvia `{data, error}` no lugar do builder, com o
  escopo pela metade. Os ids do pai passaram a ser buscados antes, e o teste de `habit_log` (escopo
  por `habit_id`, nunca por `user_id`) é o que segura isso.
- **`ORB_MODEL` no `.env` local apontava para `gemini-3.7-flash-lite`, que não existe** (a API
  responde 404; existe `gemini-3.7-flash`, sem o `-lite`). Trocado para `gemini-3.5-flash-lite`, que
  é o `lite` mais novo disponível para esta chave. O deploy NÃO tem esse secret, então a função
  publicada segue no default `gemini-3.1-flash-lite` — que existe e funciona.
- **Custo do catálogo**: 37 tools serializam em 44,1 mil chars (~12,6 mil tokens), contra ~32,9 mil
  chars das 33 anteriores. As quatro novas custam ~3,2 mil tokens por turno; `describe_data` é o que
  evita que isso seja muito pior — o mapa das 27 tabelas ficaria em dezenas de milhares de tokens se
  entrasse no system prompt em vez de ser buscado sob demanda.
- **A suíte completa é instável nesta máquina sob carga**: cada execução falha um punhado diferente
  de testes lentos (editor de notas, formulário de tarefa) por estouro do timeout de 5s, e todos
  passam quando rodados sozinhos ou por diretório (686 testes de tarefas, 111 de notas). Não é
  regressão desta feature — nenhuma das falhas toca código dela.
- **Segunda armadilha de bundle, mesma família**: reusar `ORB_SUGESTOES_DE_CHAT` no dock (em vez de
  repetir duas strings) trouxe os ~18 KB de `prompts.ts` — política + catálogo de prompts do MCP —
  para o chunk do `AdminLayout`. As sugestões viraram `_shared/orb/suggestions.ts`, com `prompts.ts`
  reexportando: uma fonte só, e o chunk do layout ficou em 15,5 KB. A lição das duas: neste projeto,
  importar do `_shared/orb/` a partir de código que carrega sempre exige olhar o `dist` depois.
- `docs/stack.md` atualizado (37 tools, fronteira app × MCP, navegação, API de dados, criação e o
  porquê do `toolLabel.ts` separado).
- **2026-09-18 — a checagem de satisfação achou um buraco de cobertura, não um bug.** Rastreando o
  `prompt:` item a item, "ele navega para as tarefas de lá **aplicando os devidos filtros e
  pesquisas**" tinha artefato só da metade do servidor (`open_screen` monta a URL certa, 20 testes em
  `navigation.test.ts`) e da validação no client (`isOrbNavigablePath`). A outra metade — a tela
  **lendo** `?project=`/`?q=` — não tinha nenhum: era o único pedaço do pedido cuja prova dependia de
  abrir o navegador. Daí `TaskList.orb-url-filters.test.tsx`. Confirmado que o teste morde: trocando
  `searchParams.get("project")` por `null` em `TaskList.tsx`, 3 dos 6 casos falham (incluindo o da
  segunda navegação); revertido em seguida.
- **2026-09-18 — banner do MCP dizia 37, servidor anunciava 35.** `mcp/server.ts` imprimia
  `orbTools.length` no stderr do boot, mas `tools/list` responde `orbMcpTools` desde que a Onda 4
  tirou `open_screen` e `propose_create` do catálogo do host. Só mensagem, nada funcional — e
  exatamente por isso ninguém ia perceber. A linha virou `bannerDeBoot()` dentro de
  `mcp/orbMcpServer.ts` (que é onde o handler vive, então o número sai da mesma fonte) e ganhou teste
  em `mcpServer.test.ts` comparando o texto com o `tools.length` que o cliente MCP recebe de verdade.
- **A instabilidade da suíte não apareceu nesta rodada**: `npm run test` fechou 2913/2913 em 264
  arquivos, de uma vez. A anotação de cima continua valendo como aviso sob carga, não como falha
  conhecida.

## Como testar

### 1. Pré-requisitos
- Sem migration nesta feature: a proposta de criação vive na mensagem, não no banco. Nada a aplicar.
- Logar no app com a conta de sempre (a Orb roda com o JWT do usuário e o RLS é a fronteira — dado de
  outra conta não aparece por definição).
- A conta precisa ter **pelo menos um projeto com tarefas** (o exemplo do pedido é "as tarefas do
  Sacada"); sem projeto nenhum, `open_screen` responde que não achou e não há o que ver.
- `npm run dev` para o app. A Orb chama a Edge Function publicada — a `orb-agent` está na **versão
  4** (2026-09-18 11:57), que já inclui a regra de fuso e as regras de proposta das Ondas 5 e 6.
  Conferir com `npx supabase functions list` se desconfiar de comportamento antigo.
- Só para o `orb:smoke`: `GEMINI_API_KEY` no `.env` da raiz (ele fala com o modelo de verdade e
  **não** toca no banco — usa `fakeDb`). `ORB_MODEL` é opcional; sem ele vale
  `gemini-3.1-flash-lite`, o mesmo default da função publicada.

### 2. Verificação automatizada
Da raiz do repositório, um comando por linha:

```
npx vitest run src/domain/orb src/components/orb
npx vitest run src/pages/admin/tasks/__tests__/TaskList.orb-url-filters.test.tsx
npm run check:mcp
npm run lint
npm run build
npm run check:bundle
npm run test
```

O que cada um prova:
- `vitest run src/domain/orb src/components/orb` — **247 testes em 19 arquivos**. É o núcleo da
  feature: catálogo de telas e montagem de URL (`navigation.test.ts`), fronteira app × MCP e banner
  de boot (`mcpServer.test.ts`), API de dados (`data.test.ts`), proposta e identidade de proposta
  (`create.test.ts`, `helpers.test.ts`), adaptadores de resultado (`results.test.ts`), dock, tray e
  cartão (`OrbSidebarDock`, `OrbProposalTray`, `OrbActionCard`). Passou = 19 arquivos verdes.
- `vitest run …/TaskList.orb-url-filters.test.tsx` — **6 testes**: a tela de tarefas abrindo já
  recortada por `?project=`, por `?q=` (sem acento/caixa), pelos dois juntos, trocando o recorte na
  segunda navegação **sem remontar**, não fazendo faxina nos filtros quando o parâmetro some, e
  ficando vazia quando a busca não casa com nada. É a metade cliente do "navega aplicando filtros e
  pesquisas".
- `npm run check:mcp` — typecheck do servidor MCP e do registro compartilhado, que ficam fora do
  `tsc -b` do app. Passou = nenhuma saída.
- `npm run lint` — **0 erros**. Os 88 `warning` de `react-refresh/only-export-components` são o
  baseline do repositório, não desta feature.
- `npm run build` e `npm run check:bundle` — o segundo termina em `Bundle budget OK.`; é ele que
  segura as duas armadilhas de bundle anotadas em Notas (o catálogo de tools vazando para o chunk
  carregado em toda página).
- `npm run test` — suíte inteira: **2913 testes em 264 arquivos**. Se algum teste lento de nota ou de
  formulário de tarefa estourar 5s sob carga, rode o diretório sozinho antes de tratar como
  regressão (ver Notas).

Opcional, porque gasta chamada real ao modelo:

```
npm run orb:smoke -- "me mostra as tarefas do <um projeto seu>"
npm run orb:smoke -- "cria uma tarefa comprar cigarro para amanhã"
```

Atenção ao que o smoke é: ele fala com o **modelo de verdade** mas contra o `fakeDb` do script, que
só semeia três lançamentos — não há projeto nenhum lá. Então o que ele prova é a **escolha de tool**,
não a resolução de nome (essa quem prova é `navigation.test.ts`, com projetos no fake).

Passou = na primeira o modelo chama `open_screen` (depois de procurar o projeto) e, como o nome não
existe no fake, responde que não achou em vez de inventar id; na segunda ele chama `propose_create`
**e** `open_screen` na mesma rodada, e a resposta diz que preparou e é só confirmar (não que criou).
No fim das duas sai `OK: loop de function calling completo, com texto final.`

Ainda dá para conferir o banner do servidor MCP sem host nenhum:

```
npx tsx mcp/server.ts < /dev/null
```

Passou = a linha no stderr diz `35 tools` (o catálogo do MCP), não 37 (o registro inteiro, que
inclui `open_screen` e `propose_create`, que só existem dentro do app).

### 3. Verificação manual, passo a passo
1. Abra qualquer tela do app (ex.: `/finance/transactions`). Na barra lateral, **abaixo dos grupos de
   navegação e acima do rodapé do usuário**, aparece o dock da Orb: a esfera, o rótulo "Orb" e um
   campo de conversa. Recolha a barra lateral: sobra só a esfera, com o título "Falar com a Orb".
2. Clique no botão de recolher/abrir do dock ("Recolher a Orb" / "Abrir a Orb") e recarregue a
   página. **Esperado**: ele volta no mesmo estado — a preferência fica no `localStorage`.
3. No campo do dock, pergunte **"me mostra as tarefas do \<seu projeto\>"**. **Esperado**: o app
   navega sozinho para `/tasks?project=<uuid>`, a lista já abre recortada nesse projeto e o
   `<Select>` "Projeto" da barra mostra o nome dele. A conversa **continua no dock** depois da
   navegação (é o ponto do `OrbProvider` acima do `Outlet`).
4. Sem sair da tela, peça **"agora as do \<outro projeto\>"**. **Esperado**: a URL muda, a lista
   troca de recorte e a tela **não** pisca recarregando do zero.
5. Peça uma busca textual: **"procura \<palavra de um título\> nas minhas tarefas"**. **Esperado**:
   a URL ganha `?q=`, o campo "Buscar tarefa" aparece preenchido e a lista recorta — inclusive nas
   abas Kanban, Gantt e Agenda.
6. Pergunte algo que devolva lista — **"quais filmes eu tenho para ver"**, **"meus últimos
   lançamentos"**. **Esperado**: o resultado sai como cartão/carrossel/linha/barra, não como tabela
   crua. O cartão da consulta continua mostrando qual tool rodou, com rótulo em PT-BR.
7. Ainda **fora** da `/orb`, peça **"cria uma tarefa comprar pão para amanhã"**. **Esperado**: a Orb
   navega para `/tasks` e aparece um cartão flutuante (região "Criação proposta pela Orb") com os
   campos da tarefa e os botões **Criar** e **Descartar**. Clique em **Criar**: a tarefa é gravada,
   sai um toast e o cartão some.
8. Repita o pedido e, antes de confirmar, diga **"coloca prazo para sexta"**. **Esperado**: continua
   **um** cartão só, o novo, já com o prazo — não dois. (Onda 6.)
9. Peça a criação de um **evento com hora** ("cria um evento reunião amanhã às 14h"). Confirme e
   abra a Agenda. **Esperado**: o evento está às **14:00**, não com horas de diferença — é o bug de
   fuso corrigido com `instantFromLocalTime`.
10. Vá para `/orb`. **Esperado**: é a **mesma** conversa do dock (as mensagens dos passos anteriores
    estão lá), e o cartão flutuante **não** aparece nessa rota — o balão do chat já mostra o mesmo
    cartão.
11. Em `/orb`, abra "O que eu sei consultar". **Esperado**: o selo diz **"35 consultas
    disponíveis · só cria com a sua confirmação"** — não "somente leitura", e não 37: navegar e
    propor criação não são consulta. No painel existem os grupos **"Abrir telas do app"** e
    **"Criar (você confirma)"**, com `open_screen` e `propose_create` dentro deles.

### 4. Casos de borda e caminhos negativos
- **Nome ambíguo** — "as tarefas do \<prefixo que casa com dois projetos\>". Esperado: a Orb
  **pergunta qual**, em vez de escolher sozinha ou navegar para o errado. Com um nome exato entre os
  candidatos, ela desempata sozinha.
- **Nome que não existe** — "as tarefas do projeto Zimbábue". Esperado: ela diz que não achou. Não
  navega para uma URL com id inventado.
- **Filtro que a tela não lê** — peça um recorte que a tela alvo não aceita (ex.: prioridade numa
  tela sem prioridade). Esperado: ela diz o que aquela tela aceita; nada de `?campo=` inventado na
  URL.
- **Criação com dado que não existe** — "cria um lançamento de R$ 50 na categoria Foguetes".
  Esperado: recusa dizendo que a categoria não existe, sem propor nada.
- **Clique duplo em "Criar"** — o botão vira "Criando…" e a segunda batida não grava de novo (uma
  tarefa só na lista).
- **Descartar** — o cartão some e nada é gravado; a conversa continua.
- **Host MCP (Claude Code, `npm run mcp`)** — `open_screen` e `propose_create` **não** existem lá:
  não há tela para navegar nem onde confirmar. Pedir para criar algo por lá deve resultar em "não
  tenho essa ferramenta", não em escrita silenciosa.
- **Sem sessão** — `POST /functions/v1/orb-agent` sem JWT responde **401** (não 404 nem 503).

### 5. Sinais de que quebrou
- A Orb responde "abri a tela X" **mas a URL não muda**: o `onNavigate` não chegou no client, ou o
  caminho foi barrado por `isOrbNavigablePath` (é a whitelist fazendo o trabalho dela — olhe o
  console).
- A URL muda para `/tasks?project=…` **mas a lista mostra tudo**: a tela parou de ler a query
  string. É exatamente o que `TaskList.orb-url-filters.test.tsx` cobre — rode-o primeiro.
- A segunda navegação não troca o recorte (a primeira funciona): alguém trocou o `useEffect` que
  escuta `searchParams` por um inicializador de `useState`. O teste da "segunda navegação" quebra.
- A conversa **some ao navegar**: o `OrbProvider` saiu de cima do `Outlet` no `AdminLayout`.
- O cartão de criação **não aparece fora da `/orb`**: o `OrbProposalTray` não montou (ou montou e
  está escondido pela regra da rota `/orb`).
- **Dois cartões** para a mesma coisa depois de um ajuste: a identidade de proposta
  (`orbProposalIdentity`) parou de casar — risco real é confirmar o cartão velho e gravar sem o
  ajuste.
- Evento criado com **horas de diferença**: `instantFromLocalTime` saiu do caminho e o `timestamptz`
  voltou a ser castado no fuso da sessão (UTC).
- Toda página do app ficou mais pesada / `npm run check:bundle` reprova: algum import de
  `_shared/orb/` voltou para um caminho carregado sempre (foi assim duas vezes — ver Notas).
- A Edge responde com tool desconhecida: falta `npx supabase functions deploy orb-agent` depois de
  mexer em `_shared/orb/`.
