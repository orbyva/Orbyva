---
prompt: |-
  Leia o que tem em docs/planning/orb-ia/brainstorm.md e veja o que falta no que temos hj
  Sim (transformar o gap em planning em docs/features/)
---

# 107 — Orb: cobertura do brainstorm (escrita + diálogo)

## Contexto
- O [brainstorm](../../planning/orb-ia/brainstorm.md) define a Orb como **conversa** até o dado
  ficar certo (perguntar, sugerir categoria/escopo) e **criar/alterar** em todos os módulos.
- Hoje a Orb está forte em **consulta + simulação** financeira/vida e fraca em **escrita**: só
  `propose_create` com 6 kinds (tarefa, lançamento, nota, compra, projeto, evento).
- O resto do brainstorm vira handoff (`open_screen`) ou texto — categorias, orçamento, recorrência,
  check-in, mídia, lugares, metas, veículos, viagens, edição/exclusão.
- A [arquitetura](../../planning/orb-ia/architecture.md) já fatiou isso em P1–P3; esta feature é o
  planning canônico que amarra o gap ao código atual (pós-098/099/100), sem misturar com a 100.

## Definições
- **Cobertura do brainstorm:** para cada exemplo de criação/alteração do brainstorm, a Orb ou
  (a) prepara proposta com cartão + confirmação, ou (b) pergunta o slot que falta com sugestão, ou
  (c) declara limite e leva à tela — nunca inventa o dado nem grava sozinha.
- **`ask_user`:** tool (ou equivalente) de diálogo estruturado `{ question, slots?, suggestions? }`
  — o brainstorm (“Uber em Transporte?”, “só este mês?”) deixa de depender só do texto livre do
  modelo.
- **Fora desta feature (por enquanto):** proativo/digest (P4 da arch); persistência `orb_threads` /
  `orb_proposals` no Postgres (continua P1 infra se reabrir); mudar o provedor LLM.

## Estrutura

### Frente 0 — Diálogo quando falta dado (base de todas as ondas)
- Hoje: prompt `ORB_REGRA_DE_LACUNA` / `ORB_REGRA_DE_CRIACAO` + erro da tool; falha de
  `propose_create` já aparece no balão, mas não há canal tipado de pergunta.
- Passa a ser: contrato `ask_user` (SSE ou tool) alinhado à arch §5; UI mostra pergunta + chips de
  sugestão; uma pergunta por vez.
- Arquivos-âncora: `supabase/functions/_shared/orb/prompts.ts`, `orb-agent/index.ts`,
  `src/hooks/useOrbChat.ts`, `src/components/orb/OrbMessageBubble.tsx` (ou componente novo de
  clarify).

### Frente A — P1 Finanças (brainstorm: categorias, orçamento, recorrências, transação completa)
- **Categorias:** propose criar type + classes; propose subcategoria com sugestão de pai se omitido.
- **Orçamento:** propose set/delete/replicate; slots “só este mês / próximos” e “até quando?”.
- **Recorrências:** propose criar parcela/recorrência; registrar pagamento; marcar quitado;
  recorrência a partir de meta.
- **Transações:** já existe kind `transaction`; fechar lacunas (natureza receita, data relativa).
- Reuso: `src/api/finance/*`, `domain/recurring/*`, padrão
  `actions.ts` + `tools/create.ts` + `orbActions.ts` da 100.
- Arquivos-âncora: `supabase/functions/_shared/orb/actions.ts`, `tools/create.ts` (ou
  `tools/propose-finance.ts`), `src/api/orbActions.ts`.

### Frente B — P2 Conteúdo e lugares (cinema, livros, música, hábitos, lugares, metas)
- Propose: marcar filme/série assistido + nota; progresso de leitura; “quero ouvir” álbum; check-in
  de hábito; visita a lugar (+ nova visita se já existe); alterar meta / aportar.
- Resolução de entidade (arch §6): search catálogo (TMDB/Books/Spotify/Places) → 1 match / N opções
  via `ask_user` / 0 → pedir mais contexto.
- Arquivos-âncora: `src/api/movies|books|music|habits|places|goals`, tools em `_shared/orb/tools/`.

### Frente C — P3 Veículos e viagens
- Propose: abastecimento; agendar manutenção; criar viagem + paradas; gasto de viagem; avaliação de
  lugar na viagem; roteiro do dia (proposal grande vs N activities — ver Perguntas).
- Arquivos-âncora: `src/api` de car/travel, `tools/vehicles.ts`, `tools/travel.ts`.

### Frente D — Edição / exclusão (transversal, depois das creates)
- Brainstorm pede “exclua orçamento”, “alterei a meta”, “quitei”. Hoje o prompt manda para a tela.
- Ou: `propose_update` / `propose_delete` com o mesmo cartão; ou manter handoff até P1 de finanças
  estar estável. Decisão em aberto (P3 abaixo).

## Decisões
- Continua o princípio da 100: **Edge não grava módulo**; só monta proposal; `src/api/*` grava pós-clique.
- Ondas na ordem da arch: **0 (ask_user) → A (P1 finanças) → B (P2) → C (P3)**; não abrir P2/P3
  antes de A estar attackável.
- Estender o contrato `OrbProposal` / kinds (ou tools `propose_*` por domínio) em vez de um segundo
  caminho de insert na Edge.
- Consultas/simulações que já cobrem o brainstorm de **pergunta** não são retrabalho desta feature;
  só entram se um propose novo exigir tool de suporte (ex. listar categorias antes de criar).

## Perguntas em aberto
### P1 — Um `propose_create` com muitos kinds ou várias tools `propose_*`?
- Recomendada: **kinds no mesmo `propose_create` na Frente A**; fatiar em `propose_*` por domínio
  só se o schema único ficar ingovernável — menos superfície no modelo no começo.
- **Resposta:**

### P2 — `ask_user` é tool do modelo ou evento SSE gerado pelo servidor quando a proposal falha validação?
- Recomendada: **tool `ask_user`** que o modelo chama (arch §5), com fallback: se `propose_*`
  falhar por campo obrigatório, o prompt já manda perguntar; UI tipada na Frente 0.
- **Resposta:**

### P3 — Edição/exclusão entram nesta feature ou ficam só handoff?
- Recomendada: **só handoff até o fim da Frente A**; reabrir como onda D depois.
- **Resposta:**

### P4 — Roteiro de viagem (P3): uma proposal grande ou N activities?
- Recomendada: **N activities** (arch §10 item 4) — cartões menores, confirmação por passo.
- **Resposta:**

### P5 — Prioridade dentro da Frente A (primeira fatia attackável)?
- Recomendada: **recorrências + orçamento set** (casos mais citados no brainstorm e hoje só
  handoff); categorias em seguida.
- **Resposta:**

## Prompts
- 2026-09-24 — "Leia o que tem em docs/planning/orb-ia/brainstorm.md e veja o que falta no que temos hj"
- 2026-09-24 — "Sim" (transformar o gap em planning em docs/features/)
