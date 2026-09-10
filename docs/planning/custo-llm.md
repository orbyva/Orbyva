# Custo de LLM no Orb — qual é o modelo mínimo viável

Data: 2026-08-27. Pergunta que originou o documento: o Nobre comentou que há
modelos muito baratos do Gemini. Antes de escolher um, é preciso saber **qual é
o piso** — o que um modelo precisa ter para o Orb funcionar. Só depois vale
procurar o mais barato acima desse piso.

Estado atual: `ORB_MODEL` cai em `claude-sonnet-5` por padrão
(`supabase/functions/orb-agent/index.ts`).

> **Achado que muda o ponto de partida:** a Edge estava pinada no
> `@anthropic-ai/sdk@0.32.1` (nov/2024) rodando um modelo de 2026. Nessa versão o
> prompt caching só existe no namespace `beta.promptCaching` e o `usage` **não
> tem** os campos de cache — ou seja, não havia como cachear nem como medir. O
> pin foi subido para `0.121.0`. Além do caching, isso destrava `effort`,
> adaptive thinking, structured outputs e o conector MCP da API (§8 do estudo de
> MCP), todos indisponíveis no 0.32.x.

---

## 1. O piso: o que o Orb realmente exige de um modelo

O requisito não é "inteligência" genérica. Dá para ler exatamente o que o Orb
precisa olhando `prompt.ts` e o loop de `index.ts`. São seis exigências, e todas
são testáveis:

| # | Exigência | De onde vem | O que quebra se faltar |
|---|---|---|---|
| 1 | **Tool calling multi-round** — até 8 rodadas, 11 tools, chamadas paralelas | `index.ts:34`, registry | o agente para no meio: busca no catálogo e nunca propõe |
| 2 | **Aderência estrita a JSON Schema**, incluindo enums e `required` | `input_schema` de cada tool | payload inválido chega em `orb_proposal` e a confirmação quebra |
| 3 | **Não inventar identificador** — só usar `imdb_id`/`google_id` vindos da busca | regra 2 do prompt | grava obra errada; em Finanças, categoria/classe inexistente |
| 4 | **Seguir prompt longo com ~15 regras numeradas e restrições negativas** | prompt inteiro, regras 3d0, 7b | é aqui que modelo barato falha primeiro |
| 5 | **Desambiguação semântica em PT-BR** — "assisti" vs. "quero assistir" define o status | regra 4 | marca como concluído o que o usuário só queria começar |
| 6 | **Saber quando não agir** — pergunta ≠ pedido de registro; catálogo fora do ar ≠ item inexistente | regras 3d0 e 8 | propõe escrita não pedida — inaceitável em Finanças |

Traduzindo para o que dá para comparar no mercado: o piso é **confiabilidade de
tool calling em benchmark tipo BFCL / τ²-bench**, e não MMLU. Contexto grande é
irrelevante (o turno inteiro cabe em 64k). Latência importa (chat), mas menos
que a exigência 6.

**Os itens 4 e 6 são o filtro real.** Modelos da faixa Flash-Lite/nano acertam
o caminho feliz e falham na restrição negativa e no bom senso de não escrever.
Em Entretenimento isso era um filme errado; em Finanças é um lançamento errado.

### Duas exigências não-funcionais

7. **Prompt caching**, porque o system prompt + as tools se repetem em toda
   rodada do loop (§3).
8. **Tier de batch/flex barato**, para o que não é interativo — os jobs
   `weekly-digest-email`, `lifecycle-email`, `habit-reminder-email` são
   candidatos naturais e costumam custar metade do preço.

---

## 2. Quanto custa hoje, de verdade

Já existe medição própria em `quality/evals/orb/README.md`: **~$0,01 por turno
com `claude-haiku-4-5`**. Esse é o número âncora — melhor que qualquer
estimativa. E agora o próprio runner de evals mede e reporta custo, rodadas por
turno e taxa de cache a cada execução, então o número deixa de ser folclore. Escalando pelo preço de tabela:

| Modelo | US$/1M in | US$/1M out | ~US$/turno | vs. Sonnet 5 |
|---|---|---|---|---|
| Claude Sonnet 5 *(atual)* | 2,00 | 10,00 | ~0,020 | — |
| Claude Haiku 4.5 | 1,00 | 5,00 | ~0,010 | 2× mais barato |
| GPT-5.4 mini | 0,75 | 4,50 | ~0,008 | 2,5× |
| Gemini 3.5 Flash-Lite | 0,30 | 2,50 | ~0,004 | 5× |
| **Gemini 3.1 Flash-Lite** | **0,25** | **1,50** | **~0,0026** | **~8×** |
| GPT-5.4 nano | 0,20 | 1,25 | ~0,002 | 10× |
| Gemini 2.5 Flash-Lite | 0,10 | 0,40 | ~0,001 | 20× — **descontinuado 16/10/2026** |

Ordem de grandeza que importa mais que o preço unitário — 100 usuários ativos
× 10 turnos/dia = 1.000 turnos/dia:

| Modelo | por dia | por mês |
|---|---|---|
| Sonnet 5 | ~US$ 20 | ~US$ 600 |
| Haiku 4.5 | ~US$ 10 | ~US$ 300 |
| Gemini 3.1 Flash-Lite | ~US$ 2,60 | ~US$ 78 |

---

## 3. Antes de trocar de modelo: os ganhos que não custam qualidade

Trocar de modelo é a alavanca com risco. Estas três vêm antes, valem ~50% e não
alteram uma linha de comportamento:

**a) Prompt caching — e o invalidador silencioso que existia.** *(feito, não commitado)*
No loop, o system prompt e as 11 tools são reenviados em toda rodada (até 8 por
turno). São ~2,8k tokens repetidos. O problema é que `buildSystemPrompt` injeta
`todayIso` **e** os contadores do bootstrap *dentro* do system prompt
(`prompt.ts:9-18`) — conteúdo volátil no prefixo, que é o jeito clássico de
matar cache sem perceber. Correção: as regras estáticas primeiro, com breakpoint
de cache; data e bootstrap depois do breakpoint (ou na primeira mensagem do
usuário). A ordem de render é `tools` → `system` → `messages`, então as tools,
que são 100% estáticas, cacheiam sempre.

**b) Enxugar o prompt e a lista de tools.** 4,5k caracteres de regras e 11 tools
em todo turno. Quando o Orb ganhar Finanças, a lista cresce — e lista grande
piora tanto o custo quanto a precisão de escolha da tool. Vale carregar tools
por módulo conforme a intenção do turno.

**c) Teto de rodadas.** `MAX_TOOL_ROUNDS = 8` com histórico de 20 mensagens é o
pior caso de custo. Medir a distribuição real de rodadas por turno antes de
manter 8.

Só depois disso a troca de modelo passa a ser uma decisão limpa.

---

## 4. Recomendação

**Curto prazo — trocar Sonnet 5 por Haiku 4.5.** Metade do custo, mesmo SDK,
mesmo formato de tool, caching já suportado, migração zero. Os evals já rodam
nesse modelo. É a decisão de menor atrito e deveria ser feita junto com o §3.

**Melhor custo-benefício absoluto — Gemini 3.1 Flash-Lite (US$ 0,25 / 1,50).**
É o candidato mais barato que ainda é *crível* para o piso do §1: ~8× mais
barato que o Sonnet 5, contexto de 1M, function calling nativo, e da faixa
Flash-Lite os números públicos de tool calling (BFCL v3 ~76,5) ficam no limite
inferior aceitável — não confortável, aceitável.

Três ressalvas honestas:

1. **Não é drop-in.** Sai o `@anthropic-ai/sdk`, entra outro formato de tool
   (`functionDeclarations`) e outro modelo de cache. É trabalho real de
   migração da Edge, não uma variável de ambiente.
2. **Exigências 4 e 6 são onde ele pode cair.** Precisa passar nos evals antes,
   especialmente `livro-fora-do-catalogo` e `desambiguacao-converge`.
3. **Fica pior em Finanças que em Entretenimento.** A tolerância a erro cai.
   Se o eval de Finanças não for tão bom quanto o de Entretenimento, a economia
   não compensa.

**Não usar o Gemini 2.5 Flash-Lite**, apesar de ser o mais barato da tabela
(US$ 0,10/0,40): **é descontinuado em 16/10/2026**. Adotar agora é migrar duas
vezes.

**Se a migração de SDK não valer o esforço:** GPT-5.4 mini (US$ 0,75/4,50) tem
os melhores números agênticos da faixa barata (τ²-bench 93,4; OSWorld 72,2
contra 57 do Haiku 4.5) — mas custa quase o mesmo que o Haiku e também exige
migração. Nesse caso, Haiku 4.5 é a escolha racional.

**Roteamento em duas camadas** (barato para o simples, caro para o ambíguo) é
tentador e deve ficar para depois: o cache é por modelo, então a cascata perde
reúso de cache, e ainda adiciona uma chamada de classificação. Só depois de
medir.

### O critério de decisão não é a tabela, é o eval

O ativo mais valioso aqui é `quality/evals/orb` — 20 casos, cada um amarrado a
um bug real, e o runner agora imprime custo e taxa de cache junto do resultado. **A decisão de modelo deve sair de rodar a
suíte, não de benchmark de terceiro.** Antes de trocar, vale ampliá-la com casos
de Finanças, que é onde o custo de erro mora.

## 5. Tarefas

- [x] Subir o pin do `@anthropic-ai/sdk` de `0.32.1` para `0.121.0` — pré-requisito de tudo abaixo *(working tree, sem commit)*
- [x] Reestruturar `prompt.ts`: `ORB_STATIC_SYSTEM` (cacheável) + `buildVolatileContext` (data e bootstrap) *(working tree)*
- [x] Ligar `cache_control` no bloco estático de `system` — arrasta as tools junto, que renderizam antes *(working tree)*
- [x] Instrumentar `usage` por turno em `orb_message.meta` (jsonb já existente — sem migration nova) e devolvê-lo em `OrbAgentResponse` *(working tree)*
- [x] Runner de evals reporta custo, rodadas/turno e cache hit *(working tree)*
- [ ] **Validar tudo acima com `npm run eval:orb`** — nada disso foi executado ainda
- [ ] Medir a distribuição real de rodadas por turno e reavaliar `MAX_TOOL_ROUNDS = 8`
- [ ] Trocar o default de `ORB_MODEL` para `claude-haiku-4-5` após os evals passarem
- [ ] Ampliar `quality/evals/orb` com casos de Finanças (inclusive casos de "não escrever")
- [ ] Rodar a suíte contra Gemini 3.1 Flash-Lite num spike de migração antes de decidir
- [ ] Avaliar tier batch/flex (~50%) para `weekly-digest-email` e `lifecycle-email`

---

## Fontes

- [Preços da API Gemini (oficial)](https://ai.google.dev/gemini-api/docs/pricing)
- [Gemini API Pricing, agosto 2026 — BenchLM](https://benchlm.ai/google/api-pricing)
- [Best Budget LLMs 2026 — BenchLM](https://benchlm.ai/blog/posts/best-budget-llms-2026)
- [Gemini API Pricing Breakdown, ago/2026](https://developer.puter.com/tutorials/gemini-api-pricing/)
- Preços Anthropic: tabela de modelos atuais (Sonnet 5 US$ 2/10; Haiku 4.5 US$ 1/5)
- Medição própria: `quality/evals/orb/README.md`
