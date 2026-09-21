---
prompt: |
  revise e melhore a capacidade/interface/interatividade/funções do orb

  utilize como base os repositórios do knowledge e identifique melhorias
---

# 099 — Orb: revisão de capacidade, interface e interatividade

## Contexto
A [098](../in-progress/098-orb-ia-mcp-e-chat.md) entregou o P0 da Orb: registro compartilhado de 13
tools read-only, servidor MCP em stdio, Edge Function `orb-agent` e a tela `/orb`. Esta feature é a
revisão dela — a partir de um levantamento que minerou os 9 repositórios da base de conhecimento
(`~/.claude/knowledge/orbyva/`) e auditou o código entregue.

O levantamento produziu 104 achados brutos, deduplicados e verificados contra o código em
**`docs/planning/orb-ia/melhorias-pos-098.md`** (311 linhas): 16 bugs confirmados relendo o fonte,
3 achados refutados, uma lista de descartes justificados e 31 itens executáveis em 4 ondas. Esse
arquivo é a referência de execução — este aqui é o rastro e o checklist.

Feature própria, e não tarefas dentro da 098, porque o `prompt:` da 098 ("crie o mcp / crie a Orb /
crie a interface") já foi cumprido e ela tem pendências manuais de deploy em aberto. Misturar as
duas tornaria impossível dizer o que "cumprir a feature" significa em cada uma.

## Decisões
- **Ondas 1, 2 e 3 entram; a Onda 4 não.** Persistência de conversa, cota e escrita com humano no
  loop exigem migration no banco **remoto** (`supabase db push`), que a CLAUDE.md manda confirmar
  com o usuário antes de rodar, e não foi o que este prompt pediu. Fica registrada como próximo
  passo, com o schema já desenhado no plano.
- **Nada de servidor MCP remoto, OAuth próprio, Valkey, conexões MCP de terceiros ou RAG.** O plano
  descarta cada um com motivo; resumo: superfície enorme de erro para um app de um usuário, e o
  projeto nem tem `pgvector` instalado (verificado). O gatilho para reabrir o MCP remoto está
  anotado no plano: querer falar com os dados pelo claude.ai ou por outra máquina.
- **Migração híbrida no servidor MCP**: `McpServer` para resources/templates/completions, mas as
  tools continuam nos handlers crus. Motivo verificado no SDK instalado: `registerTool` só aceita
  Zod (`dist/esm/server/mcp.js:869`), e `_shared/orb/` não pode importar módulo externo — migrar
  custaria 13 schemas duplicados fora do diretório compartilhado, exatamente o que a 098 evitou.
- **Janela de data em UTC, não no fuso local.** A view `vw_value_by_nature_year_month` agrupa por
  `transaction_at::date` em UTC e o resto do app usa `…T23:59:59.999Z`; divergir faria a Orb e a
  tela de Finanças darem totais diferentes — trocaria um erro por um pior.
- **Prompt caching antes das tools novas.** Cada tool nova custa ~150 tokens por rodada, até 8
  rodadas, todo turno. Ligar o cache primeiro é o que torna a expansão do catálogo pagável.
- **Tabelas-filhas sem `user_id`** (`trip_*`, `vehicle_maintenance/fuel_log/document`, `habit_log`)
  têm RLS via pai: `.eq("user_id")` nelas dá 42703 em runtime. A regra vira comentário no
  `types.ts` **e** teste que percorre o registro — é a única forma de sobreviver ao próximo
  copiar-e-colar.

## Tarefas

### Onda 1 — Consertos e economia
- [x] 1A.0 Fundação compartilhada: `helpers.ts` (`exclusiveEnd`, `monthsAgo`, `localDateInTz`,
      `ownedIds`), `types.ts` (regra das tabelas-filhas + `annotations`), `registry.ts` (validador
      de input, timeout por tool, annotations default)
- [x] 1A.1/1A.2/1A.4 `tools/finance.ts`: fim exclusivo de janela, simulação por meses de calendário,
      paginação com teto e `truncated`
- [x] 1A.3/1A.4 `tools/productivity.ts`: `query_agenda` com fuso do usuário, contagem de tarefas por
      projeto sem baixar tudo
- [x] 1A.6/1A.7/1A.8/1A.9/1A.10/1A.11 `orb-agent`: prompt caching, cancelamento real + timeouts,
      `stop_reason` completo, usage somado, conversa que não trava, heartbeat SSE, teto de corpo
- [x] 1B.1/1B.2/1B.3 `mcp/`: sessão que não morre em 1h, transporte antes da autenticação,
      `npm run mcp:login` no lugar de senha no `.env`

### Onda 2 — Capacidade
- [x] 2T.0 Guard automático de escopo por tabela (teste que percorre `orbTools`)
- [x] 2T.1–2T.9 (parcial) Tools novas entregues: notas, viagens, histórico mensal, próximos
      vencimentos, progresso de leitura, corte de gastos, e o lote barato (álbuns, compras, séries,
      tags, links, tempo, medicações, métricas de saúde) — **30 tools no catálogo**
- [x] 2T.2 `query_places` e 2T.4 `query_vehicles`/`query_vehicle_alerts`, ligadas no fim do
      `orbTools` (a ordem é contrato de cache) — **catálogo em 33 tools**. `normalizePlaceStatus` e
      a regra de alerta de veículo foram **movidas** de `src/domain/` para `_shared/orb/`, não
      copiadas
- [x] Endurecimento das tools existentes: `ilikePattern`/`ilikeOr` num lugar só (7 call sites tinham
      curinga solto), `truncated` nas quatro tools que declaravam `limit` e nunca avisavam do corte,
      ordem do array de finanças alinhada à regra documentada
- [x] 2T.10 `simulate_month_balance` movendo a expansão de parcelas de `src/domain/recurring` para
      `_shared/orb` (uma verdade só sobre o dinheiro)
- [x] 2M.1 `createOrbMcpServer` extraído + teste com `InMemoryTransport` + script do Inspector
- [x] 2M.2 `annotations`, `instructions` e `logging` no servidor MCP
- [x] 2M.3 Resources e resource templates (`orbyva://…`)
- [x] 2M.4 Prompts MCP a partir de constante compartilhada com as sugestões do front

### Onda 3 — Interface e interatividade
- [x] 3.1 Contrato do evento `tool` enriquecido (id, input, ok, summary) — parser e tipos antes do
      deploy da Edge
- [x] 3.2 Cartões de ferramenta expansíveis, status por chamada (fim da dedup por nome)
- [x] 3.3 "Tentar de novo", copiar e recuperar a última pergunta com ↑
- [x] 3.3 **Editar mensagem enviada**: barra de ações na bolha da pergunta (Copiar + Editar, mesmo
      padrão de hover da resposta) e editor inline no lugar do balão, com os atalhos do campo de
      escrever (Enter salva, Shift+Enter quebra linha, Esc cancela) e o aviso de que a conversa
      volta dali. `OrbChat` liga o `editUserMessage` do hook
- [x] 3.4 Scroll que não sequestra + `memo` + throttle do append
- [x] 3.5 Painel "o que eu sei consultar" + empty state com saudação e sugestões das três áreas
- [x] 3.6 Tabela no lugar de JSON, custo/tempo por consulta, marca do limite de memória

### Troca de provedor (prompt de 2026-09-09)
- [x] `orb-agent` migrado de Anthropic para **Gemini** (`@google/genai`), modelo
      `gemini-3.1-flash-lite`, preservando o contrato SSE e todo o endurecimento da Onda 1
- [x] `GEMINI_API_KEY` no `.env` local (gitignored) + `.env.example`, `docs/stack.md` e comentários
      atualizados
- [x] `npm run orb:smoke` — smoke de ponta a ponta contra a API real, sem Deno e sem banco
- [x] `supabase secrets set GEMINI_API_KEY=...` e `supabase functions deploy orb-agent` — feito nos
      deploys da [100](../in-progress/100-orb-na-barra-lateral-e-navegacao.md) (versões 2 e 3,
      ACTIVE). Conferido sem CLI: `POST /functions/v1/orb-agent` com a anon key devolve
      `401 {"error":"Unauthorized"}`,
      que é a resposta do **código da função** — o `503 falta GEMINI_API_KEY` vem ANTES da checagem
      de auth (`index.ts:196`), então chegar ao 401 prova as duas coisas (publicada e com a chave)

### Verificação
- [x] `npm run test` (2816 testes), `npm run lint` (0 erros), `npm run build`, `npm run check:mcp`,
      `npm run check:bundle` (`/orb` em 42,5 KB de 160) e smoke JSON-RPC do MCP (33 tools, 5
      resources, 4 templates, 5 prompts). Teste de mutação: 9 aplicadas, 9 pegas.
- [x] Fechamento da 3.3 (2026-09-18): `npm run test` (2906 testes, 263 arquivos, 0 falhas),
      `npm run test -- src/domain/orb src/components/orb` (246 testes, 19 arquivos),
      `npm run lint` (0 erros), `npm run build`, `npm run check:mcp`, `npm run check:bundle`
      (`/orb` em 53,3 KB de 160) e `npm run orb:smoke` contra o Gemini real (`OK: loop de function
      calling completo`). Teste de mutação nos 6 testes novos: 3 aplicadas (tirar o guard de texto
      igual, não passar `onEdit` na `OrbChat`, remover o `Escape` do editor), 3 pegas.

## Prompts
- 2026-09-09 — "revise e melhore a capacidade/interface/interatividade/funções do orb / utilize como
  base os repositórios do knowledge e identifique melhorias"
- 2026-09-09 — "edite para utilizar o GEMINI como provedor de LLM, pegue a chave de
  @../../../Documents/UnB/TCC/repo"

## Notas
- Dois defeitos que a verificação anotou e eu fechei depois dela: `query_places` devolvia
  `visited_count`/`to_visit_count` contando só o conjunto **filtrado**, então uma pergunta com
  `status: visited` fazia a Orb responder "você não tem nenhum lugar para visitar" — viraram
  `matched_visited`/`matched_to_visit`, com o escopo no nome. E `ORB_SUGESTOES_DE_CHAT` tinha 3
  sugestões financeiras de 4, ensinando na primeira tela que a Orb é um app de finanças; agora são 6,
  uma por área.
- **Peso morto conhecido**: `orbToolTitle` e `OrbCapabilities` importam `registry.ts`, então o chunk
  de `/orb` carrega os 33 `run` — SQL e nomes de coluna que o browser nunca executa (confirmado no
  `dist`). Está dentro do orçamento e não é furo de segurança (a fronteira é o RLS), mas o certo é um
  `catalog.ts` só com `{name, title}`. Não foi feito agora porque a saída óbvia cria uma segunda
  fonte de verdade de títulos, que é exatamente o que este projeto evita — precisa de desenho.
- **`supabase/functions/` está no `ignores` do ESLint**: todo o `_shared/orb/` passa só por `tsc`.
  O "0 warning novo na Orb" vale para `src/` e `mcp/`.
- **Troca de provedor (2026-09-09)**: a Orb saiu do Claude e passou a rodar em Gemini
  (`gemini-3.1-flash-lite`, chave reaproveitada do projeto de TCC do usuário). O contrato SSE, os
  eventos de tool, o cancelamento, o heartbeat, os tetos de corpo e os logs estruturados ficaram
  idênticos — só o miolo da chamada mudou. Três diferenças que custaram atenção e estão comentadas
  no código: `thinkingLevel` no lugar de `thinking: adaptive`; `parametersJsonSchema` (que aceita o
  JSON Schema do registro como está) no lugar de `input_schema`; e as partes do turno do modelo
  voltando ao histórico **verbatim**, porque carregam `thoughtSignature` e perder a assinatura entre
  rodadas faz o modelo esquecer o que já consultou.
- O prompt caching deixou de ser explícito: o Gemini faz cache **implícito** de prefixo. A disciplina
  que o mantém (ordem determinística de `orbTools`, volátil no fim da instrução de sistema) continua
  valendo, e o smoke confirma que funciona — `cache_read_input_tokens` veio > 0 já na 2ª rodada.
- `scripts/orb-smoke.ts` (`npm run orb:smoke`) fecha parcialmente a maior lacuna de verificação do
  projeto: a Edge Function roda em Deno e não é coberta por `tsc -b` nem pelo Vitest, então erro de
  contrato com o modelo só apareceria depois do deploy. O smoke reproduz o miolo do loop com o
  catálogo real e o `fakeDb` da suíte.
- O levantamento inteiro (achados, veredito de cada bug, descartes justificados, grafo de
  dependências) está em `docs/planning/orb-ia/melhorias-pos-098.md`. Não repetir aqui.
- **Lugares e veículos (2T.2/2T.4)**: as duas faixas caíram por erro de conexão na primeira
  tentativa e foram refeitas do zero. Na refação, cada uma moveu a regra que a tela já usava para
  `_shared/orb/` (`places.ts` e `vehicles.ts`, mesmo padrão de `recurring.ts`) em vez de replicá-la,
  então `src/domain/places` e `src/domain/car` passaram a importar de lá — a Orb e a tela não têm
  como discordar sobre o mesmo status de lugar ou o mesmo alerta de óleo. Com elas o catálogo foi de
  30 para 33 tools e a serialização de ~27,8 mil para ~32,9 mil chars (~9,4 mil tokens).
- **2026-09-18 — a interação de "editar a pergunta" (3.3) não precisava de decisão nova.** A tarefa
  estava parada como "desenho", mas o plano já tinha escolhido: "barra em hover abaixo do balão:
  assistente = copiar + regenerar; usuário = copiar + editar (editar trunca o histórico dali para
  frente — deixar explícito apagando as seguintes)"
  (`docs/planning/orb-ia/melhorias-pos-098.md:230`). O que sobrou foi seguir o padrão que os
  componentes da Orb já tinham: a barra de ações é a MESMA da resposta (escondida até o hover no
  mouse, sempre visível no toque) e o editor inline repete a gramática de teclado do `OrbComposer`
  (Enter manda, Shift+Enter quebra linha, Esc cancela) — duas gramáticas para a mesma caixa de texto
  seria uma a mais. O aviso "o que veio depois desta pergunta é descartado" fica dentro do editor,
  antes do clique, que é a parte "deixar explícito" do plano.
- Três detalhes do editor que são decisão, não acidente: o rascunho mora num componente próprio
  (`OrbQuestionEditor`), então cancelar joga fora de verdade e reabrir traz o texto da conversa;
  salvar sem mudar nada **não** gasta um turno (reenviar apagaria as respostas seguintes para
  recomprar a mesma pergunta — quem quer isso usa "Tentar de novo"); e o botão some enquanto a Orb
  responde, porque o hook ignora edição em stream e botão que não faz nada é pior que botão ausente.
- O dock da barra lateral **não** ganhou edição: ele mostra a transcrição sem markdown numa coluna
  de 16rem (decisão da 100), e um editor ali competiria com o próprio campo de escrever que fica
  logo abaixo. Quem quer editar abre a tela cheia, que é um clique.
- Três achados foram **refutados** relendo o código, e ficam registrados para ninguém "consertar" o
  que já está certo: a view `vw_value_by_nature_year_month` está versionada e **não** tem coluna
  `user_id`; já existe suíte para as tools da Orb; e `query_habits` já escopa `habit_log` por
  `.in("habit_id", …)`.

## Como testar

### 1. Pré-requisitos
- `.env` da raiz com `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` (o app) e `GEMINI_API_KEY` (só o
  `npm run orb:smoke`, que fala com a API do Gemini de verdade e gasta token).
- Edge Function publicada com o secret: `curl -s -o /dev/null -w "%{http_code}\n" -X POST
  "$VITE_SUPABASE_URL/functions/v1/orb-agent" -H "Authorization: Bearer $VITE_SUPABASE_ANON_KEY"`
  tem que responder **401**. `503` = falta `GEMINI_API_KEY` no secret; `404` = função não publicada.
- `npm ci` e login no app com a conta que tem dados (a Orb responde com o número real do RLS do
  usuário logado — conta vazia faz tudo parecer quebrado).
- Para o servidor MCP: `npm run mcp:login` uma vez (grava só o refresh token em
  `~/.orbyva/credentials.json`); `ORBYVA_PASSWORD` não é mais lido do `.env`.

### 2. Verificação automatizada
```
npm run test -- src/domain/orb src/components/orb   # 246 testes, 19 arquivos — tools, registro, stream, hook e componentes da Orb
npm run test                                        # suíte inteira: nada quebrou fora da Orb
npm run lint                                        # 0 erros (warnings de fast-refresh são o basal do repo)
npm run build                                       # tsc -b + vite build
npm run check:mcp                                   # tsc do servidor MCP e do registro (fora do tsc -b do app)
npm run check:bundle                                # orçamento de chunk; o de /orb tem que ficar abaixo de 160 KB
npm run orb:smoke                                   # ponta a ponta contra o Gemini real, sem Deno e sem banco
```
- "Passou" em `npm run test -- src/domain/orb src/components/orb`: 0 falhas. É o filtro que cobre
  esta feature — as tools (`tools.test.ts`), o guard de escopo por tabela, o parser de SSE, o
  `useOrbChat` (retry, edição, interrupção) e as bolhas/cartões.
- "Passou" no `orb:smoke`: a última linha é `OK: loop de function calling completo, com texto
  final`, depois de listar as tools chamadas (`query_spend_by_category(...) ok=true`) e a resposta
  do modelo. Ele também imprime `--- uso ---`: `cache_read_input_tokens` **pode** vir 0 — o cache do
  Gemini é implícito e best-effort, então zero numa conversa curta não é defeito; o que seria defeito
  é ele nunca passar de 0 numa conversa longa.
- A suíte inteira é instável nesta máquina sob carga (timeout de 5s em testes lentos de notas e de
  formulário de tarefa). Falhou? rode o diretório sozinho antes de chamar de regressão.

### 3. Verificação manual, passo a passo
1. Entre no app e abra **`/orb`** (item "Orb" na barra lateral, ou "Tela cheia" no dock).
   Esperado: saudação da hora com o seu primeiro nome, o selo "Conectada ao seu Orbyva", **seis**
   pílulas de sugestão (uma por área, não só finanças) e o link "Ver tudo que eu sei consultar".
2. Clique em **"O que eu sei consultar"**. Esperado: painel lateral com as tools agrupadas por área,
   cada uma com título em PT-BR e o nome técnico ao lado.
3. Pergunte **"quanto gastei em setembro?"**. Esperado: um cartão de ferramenta por chamada (duas
   consultas iguais = dois cartões, não um), com "Consultando…" enquanto roda e a duração quando
   fecha; clicar abre **Parâmetros** e **Resultado** — resultado em **tabela**, não JSON cru.
4. Olhe o rodapé da resposta. Esperado: "≈ N mil tokens de contexto" e "N rodadas" quando o turno
   usou mais de uma. "… vindos do cache" aparece quando o Gemini reporta reaproveitamento de prefixo
   — o cache dele é implícito, então numa conversa curta ele pode não aparecer.
5. Passe o mouse sobre a **resposta**. Esperado: "Copiar" (vira "Copiado" por 2s). Numa resposta que
   falhou ou foi interrompida a barra fica **sempre visível**, com "Tentar de novo" — e "Entrar de
   novo" (link para `/login`) quando o erro foi de sessão.
6. Faça uma pergunta longa e clique em **Parar** no meio. Esperado: o texto que já chegou continua na
   tela (sem moldura vermelha), nenhum cartão de ferramenta fica girando, e "Tentar de novo" aparece.
7. **Editar a pergunta (3.3)**: passe o mouse sobre a sua própria pergunta. Esperado: "Copiar" e
   "Editar". Clique em **Editar** — o balão vira um campo com o texto e o cursor no fim, com o aviso
   "Ao salvar, a conversa volta a partir daqui — o que veio depois desta pergunta é descartado".
8. Troque o texto e aperte **Enter**. Esperado: a resposta que estava abaixo **some**, a pergunta
   aparece com o texto novo (uma bolha só, não duas) e a Orb responde de novo dali.
9. Edite outra pergunta e aperte **Esc** (ou "Cancelar"). Esperado: nada muda — nem a pergunta, nem
   as respostas abaixo. Reabrindo o editor, o campo traz o texto da conversa, não o rascunho jogado
   fora.
10. Com o campo de escrever **vazio**, aperte **↑**. Esperado: a última pergunta volta para o campo
    sem ser enviada (Enter é que envia). **Esc** limpa o campo.
11. Enquanto a Orb responde, **role para cima** para reler. Esperado: a conversa **não** puxa você
    para baixo; aparece o botão redondo "Ir para a última mensagem"; clicando nele, desce.
12. Passe de **24 mensagens** na conversa. Esperado: a linha "A Orb não lembra das mensagens acima
    daqui" aparece no ponto do corte.

### 4. Casos de borda e caminhos negativos
- **Editar enquanto a Orb responde**: o botão "Editar" não aparece (o hook ignoraria a edição).
- **Salvar a edição sem mudar nada**: o editor fecha e **nada** é reenviado — as respostas abaixo
  continuam lá. Para refazer a mesma pergunta o caminho é "Tentar de novo".
- **Editor vazio**: "Salvar e enviar" fica desabilitado; Enter não faz nada.
- **Resultado grande demais**: o cartão mostra "O resultado era grande demais para caber no cartão"
  em vez de fingir que a tabela está completa; tool com corte devolve `truncated` e a Orb precisa
  dizer isso na resposta.
- **Sessão expirada** (deixe o app aberto até o token cair): a resposta falha com "Entrar de novo",
  não com "Tentar de novo" — repetir só repetiria o 401.
- **Conversa gigante**: acima do teto de corpo o servidor responde 413 com "Conversa comprida demais
  para um pedido só. Comece uma conversa nova com a Orb."
- **Pergunta fora do catálogo** ("qual a capital da França?"): a Orb responde sem inventar dado do
  app — nenhum cartão de ferramenta aparece.

### 5. Sinais de que quebrou
- Cartão de ferramenta girando "Consultando…" para sempre depois que a resposta terminou: o `done`
  não fechou a chamada (contrato do evento `tool`).
- Editar cria uma **segunda** bolha de pergunta, ou as respostas antigas sobrevivem embaixo da
  pergunta editada: o corte do histórico (`editUserMessage`) parou de truncar.
- A tela pula sozinha a cada token enquanto você tenta reler: a auto-rolagem voltou a ser
  incondicional.
- Rodapé que **nunca** mostra "vindos do cache", nem numa conversa longa: alguém mexeu na ordem de
  `orbTools` ou pôs dado volátil no começo da instrução de sistema, e o cache de prefixo morreu
  (custo sobe, sem erro na tela). Uma conversa curta sem cache é normal — o cache é implícito.
- `503 Orb não configurada: falta GEMINI_API_KEY` ou tela de chat sem resposta nenhuma: é ambiente
  (secret/deploy), não implementação.
