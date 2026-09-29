---
prompt: |-
  Leia o que tem em docs/planning/orb-ia/brainstorm.md e veja o que falta no que temos hj
  Sim (transformar o gap em planning em docs/features/)
  Quero responder / P1-A P2-A P3-A P4-A P5-A
  Pode aplicar
---

# 107 — Orb: cobertura do brainstorm (escrita + diálogo)

## Contexto

O [brainstorm](../planning/orb-ia/brainstorm.md) pede uma Orb que **conversa até o dado ficar
certo** e **cria/altera** em todos os módulos. Hoje a leitura/simulação está avançada; a escrita
para em `propose_create` com 6 kinds (tarefa, lançamento, nota, compra, projeto, evento). Esta
feature fecha o gap em ondas, na ordem da [arquitetura](../planning/orb-ia/architecture.md)
(P1→P2→P3), começando por diálogo tipado e finanças.

Origem: planning `in-planning/107-…` (2026-09-24), com P1–P5 respondidos pelo usuário (todas A).

## Decisões

- Edge **não grava** módulo: só monta proposal; `src/api/*` grava pós-clique (mesmo padrão da 100).
- Ondas: **0 `ask_user` → A finanças → B conteúdo/lugares → C veículos/viagens**. Não abrir B/C
  antes de A estar utilizável.
- Kinds novos no **mesmo** `propose_create` na Frente A; fatiar em `propose_*` só se o schema único
  ficar ingovernável.
- Diálogo: tool **`ask_user`** chamada pelo modelo (`{ question, suggestions? }`); UI com pergunta +
  chips; uma pergunta por vez.
- Edição/exclusão: **handoff** (`open_screen` + texto) até o fim da Frente A; onda D depois.
- Roteiro de viagem (onda C): **N activities**, não proposal monolítica.
- Primeira fatia da Frente A: **recorrências + orçamento set**; categorias em seguida; depois
  orçamento delete/replicate e fluxo de pagamento/quitar.
- Sem migration de `orb_threads` / `orb_proposals` nesta feature (proposta continua na mensagem).
- Fora: digest proativo (P4 arch); trocar LLM.

## Tarefas

### Onda 0 — `ask_user` (base)

- [x] Contrato da tool `ask_user` em `_shared/orb/` (TS puro): input `{ question: string,
      suggestions?: string[] }`, resultado `{ status: "awaiting_user", question, suggestions }`,
      `ORB_APP_ONLY_TOOLS`, título PT-BR; **não** grava nada
- [x] Registrar no `orbTools` + descrição que manda usar **antes** de `propose_create` quando faltar
      slot (horário, categoria, escopo de orçamento…); atualizar `ORB_REGRA_DE_LACUNA` /
      `ORB_REGRA_DE_CRIACAO` apontando para a tool
- [x] Client: evento/tool no stream → bolha ou cartão de pergunta com chips clicáveis que enviam a
      sugestão como próxima mensagem do usuário (`OrbClarify` ou extensão do bubble)
- [x] Testes: tool run + render do cartão; smoke de prompt citando `ask_user`
- [x] Deploy `orb-agent`

### Onda 1 — Frente A fatia 1: recorrência + orçamento set

- [x] Extender `OrbCreateKind` + whitelist em `actions.ts`: `recurring` e `budget` (campos mínimos
      alinhados a `RecurringCreateRequest` / `createMonthlyBudgetApi`)
- [x] `propose_create` monta esses kinds: resolve categoria por nome; recorrência exige valor +
      categoria + validade/parcelas conforme o caso; orçamento exige categoria + valor + mês; se
      faltar escopo “só este mês / próximos”, **não** inventar — o modelo chama `ask_user` antes
- [x] `executeOrbProposal` em `src/api/orbActions.ts`: `createRecurringApi` e
      `createMonthlyBudgetApi` (mesmo caminho das telas)
- [x] Prompt: tirar recorrência/orçamento-set da lista “ainda não consigo”; exemplos do brainstorm
- [x] Cartão de resultado / labels; testes em `create.test.ts` + `orbActions`; deploy `orb-agent`
- [x] Atualizar `docs/stack.md` (kinds cobertos)

### Onda 2 — Frente A fatia 2: categorias + orçamento delete/replicate + pagamento/quitar

- [x] Kinds (ou campos) para: criar type+classes; criar class sob type existente (com sugestão de pai
      via `ask_user` se omitido)
- [x] Orçamento: propose delete; propose replicate/duplicate (`duplicateMonthlyBudgetApi`) com slot
      “até quando?” via `ask_user`
- [x] Recorrência: registrar pagamento de parcela / marcar quitado — via as APIs já usadas na tela
      (`updateRecurringParcelPayment`, soft-delete/quitar conforme o fluxo real do módulo)
- [x] Testes + deploy + stack

### Onda 3 — Frente B (P2): conteúdo, hábitos, lugares, metas

- [x] Kinds: mark movie/series + nota; book progress; album “quero ouvir”; habit check-in; place
      visit (+ nova visita se já existe); goal update / aporte
- [x] Resolução de entidade: search catálogo existente → 1 match preenche / N → `ask_user` com
      opções / 0 → pedir contexto (arch §6)
- [x] `orbActions` → `src/api` de movies/books/music/habits/places/goals
- [x] Testes + deploy

### Onda 4 — Frente C (P3): veículos e viagens

- [x] Kinds: fuel log; agendar manutenção; criar viagem (+ paradas em passos); trip expense
- [x] Roteiro do dia: **N** proposals de activity (não um blob único)
- [x] `orbActions` → APIs car/travel
- [x] Testes + deploy

### Onda 5 — Fechamento

- [x] Prompt final: o que ainda é handoff (edição/exclusão genérica) fica explícito; remover
      handoffs que as ondas já cobriram
- [x] `## Como testar` exercitado nas ondas 0–1 no mínimo; checklist das ondas 2–4 no texto
- [x] Notas: desvios e decisões de schema que surgirem na implementação

## Prompts

- 2026-09-24 — "Leia o que tem em docs/planning/orb-ia/brainstorm.md e veja o que falta no que temos hj"
- 2026-09-24 — "Sim" (transformar o gap em planning em docs/features/)
- 2026-09-24 — "Quero responder" / "P1 - A, P2 - A, P3 - A, P4 - A, P5 - A"
- 2026-09-24 — "Pode aplicar"
- 2026-09-24 — "Pode ir aplicando os pontos"
- 2026-09-24 — "Sim" (seguir na Onda 3)
- 2026-09-24 — "Sim!" (seguir na Onda 4)
- 2026-09-24 — prompt de viagem Teresina/Valparaíso/Elesbão Veloso: cadastrou cidade errada
  (parágrafo no campo), sem ida/volta, inventou Carro sem perguntar
- 2026-09-24 — "Pode" (implementar gaps restantes: livro novo, hábito, veículo, episódio/série,
  medicação, consulta)

## Notas

- Planning original em `in-planning/`; ataques para `todo/` sem começar implementação — `/next`
  puxa a Onda 0.
- Frente D (update/delete genérico) **não** está nas tarefas desta feature por decisão P3=A.
- 2026-09-24 — Ondas 0–5 concluídas na feature: diálogo `ask_user`, Frente A financeira, Frente B
  conteúdo/hábitos/lugares/metas, Frente C veículos/viagens (`fuel_log`, `maintenance`, `trip`,
  `trip_expense`, `trip_activity`). Handoff restante: edição genérica e episódios de série.
  Paradas multi-cidade da viagem ficam no destino inicial + atividades; kind `trip_stop` separado
  não entrou nesta fatia.
- 2026-09-24 — Pós-onda: `trip` enriquecido com paradas (`stop2`/`stop2_start`), `origin` +
  `outbound_depart`, `transport_mode` com `ask_user` obrigatório se houver origem/horário sem
  meio; client grava stops + atividades de ida/volta. `category` = cidade curta (rejeita dump).
- 2026-09-24 — Kind `trip_day_plan`: um cartão para o roteiro inteiro do dia (linhas
  `HH:MM|título|categoria`); confirmação única grava N atividades. Prompt: não dizer "confirme"
  sem ter chamado `propose_create`.
- 2026-09-24 — Ao confirmar viagem multi-parada: além de ida/volta casa, grava deslocamento
  entre cidades (Teresina → Elesbão) no dia de chegada; geocodifica paradas e estima
  saída/chegada via Routes quando o modo permitir (âncora: horário informado ou 08:00 no trecho).
- 2026-09-24 — `trip_day_plan` no mesmo turno que viagem nova: se a viagem ainda não existe,
  devolve cartão com `pending_trip_title` (selo “aguardando criar a viagem”) em vez de erro;
  após Criar na viagem, o roteiro libera e resolve id/dia no execute.
- 2026-09-24 — `movie_mark`: se o filme não está na lista, propõe adição (`is_new`) e no
  confirmar busca OMDb; padrão to_watch. Já na lista continua atualizando status.
- 2026-09-24 — Cobertura extra pós-ondas: `book_progress` com livro novo (Google Books);
  `habit_create` (incl. `is_health`); `vehicle_create`; `series_episode` (+ série nova OMDb);
  `medication_create`; `consultation_create`. Handoff restante: edição/exclusão genérica.

## Como testar

Roteiro para **outra pessoa** avaliar. Chrome/automação de navegador fora; prova por teste + chamada
real à Edge quando couber.

### 1. Pré-requisitos
- Logar com a conta de sempre; ter ao menos uma categoria financeira (type/class), um hábito e um
  filme na lista se for testar ondas 2–3.
- `GEMINI_API_KEY` no secret do Supabase; `orb-agent` ACTIVE após cada deploy da onda.
- `npm run dev` para o app.

### 2. Verificação automatizada
```
npx vitest run src/domain/orb/__tests__/create.test.ts
npx vitest run src/domain/orb src/components/orb
npx vitest run src/api/__tests__/orbActions.task-link.test.ts
```
(Estender com testes novos de `ask_user`, `recurring`, `budget` conforme a onda.)

### 3. Verificação manual — Onda 0
1. Em `/orb`: "Coloca o jogo do Flamengo dia 27/09 na agenda" **sem** horário.
2. Esperado: a Orb **pergunta** o horário (cartão/chips `ask_user` ou pergunta clara), **não**
   inventa 09:00 e **não** mostra só a barra amarela de tool falha.
3. Responder "20:00" → aparece cartão **Criar** de evento → ao confirmar, evento na agenda.

### 4. Verificação manual — Onda 1
1. "Crie uma parcela do iPhone de R$2000 em 12x começando hoje na categoria X" (usar categoria que
   existe) → cartão recorrência → Criar → aparece em Recorrências.
2. "Defina o orçamento de [subcategoria existente] desse mês para R$ 800" → se a Orb perguntar só
   este mês vs próximos, responder → cartão → Criar → bate com a tela de Orçamento.
3. Sem clicar Criar, nada grava (conferir lista antes/depois).

### 5. Ondas 2–4 + cobertura extra
- Onda 2: criar subcategoria; excluir/replicar orçamento; pagar parcela / quitar.
- Onda 3: "marquei Duna como visto nota 9"; "cheguei na pág. 120 de 1984"; "check-in meditar";
  "visiteí o Café Central"; "aportei 200 na meta Viagem".
- Onda 4: "abasteci o Goleta 40L por 280 com 45200 km"; "troca de óleo no Goleta"; "cria viagem
  Férias RJ 01–07/10"; "gasto de 80 em comida na viagem Férias RJ"; "no dia 02 coloca Cristo às 10h"
  (uma activity por vez).
- Extra: livro novo (fora da estante); "cria hábito beber água todo dia" (saúde); "adiciona Fiat Uno
  45 mil km"; "marquei S02E05 de Breaking Bad"; "cadastra Losartana 08h e 20h"; "consulta clínico
  dia 20 às 14h".
Cada create passa pelo cartão; falta de slot → `ask_user`; entidade ambígua → chips.

### 6. Casos negativos
- Categoria inexistente → pergunta ou erro visível, não insert.
- Descartar cartão → não grava.
- Pedido de exclusão/edição genérica (ainda) → handoff para a tela, sem fingir que gravou.

### 7. Sinais de que quebrou
- Barra amarela `propose_create` 0ms sem pergunta nem cartão.
- Modelo diz "já criei" sem cartão.
- Insert na Edge (não deve existir) ou dado criado sem clique em Criar.
