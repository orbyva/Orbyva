# Orb — Arquitetura e stack

Agente pessoal do Orbyva: conversa em PT-BR que **consulta**, **simula**, **esclarece** e **propõe criações/edições** em todos os módulos, com base nos dados do usuário (ver `brainstorm.md`).

---

## 1. Princípios

| Princípio | Decisão |
|-----------|---------|
| Segredos fora do browser | Chave do LLM só em Supabase secrets (igual Stripe/Spotify) |
| Tenancy | Toda leitura/escrita no contexto do JWT do usuário + RLS |
| Uma fonte de verdade | Persistência continua no Postgres; Orb não tem “banco paralelo” |
| Writes com humano no loop | Mutations viram **propostas**; o client confirma e executa via `src/api/*` |
| Reads no servidor | Tools de consulta rodam na Edge (o modelo precisa dos dados para responder) |
| Domínio reutilizável | Cálculos/insights em `domain/`; I/O em `api/` / tools da Edge |
| Menos alucinação | Tools tipadas + pergunta de esclarecimento quando faltar slot |

---

## 2. Visão do fluxo

```
┌──────────────────────────────┐
│  React SPA                   │
│  OrbChat (sheet / rota)      │
│  - stream SSE/NDJSON         │
│  - ActionCard (confirmar)    │
│  - ClarifyPrompt             │
└──────────────┬───────────────┘
               │ POST + JWT
               ▼
┌──────────────────────────────┐     ┌─────────────────────┐
│  Edge Function: orb-agent    │────►│  LLM (tool calling) │
│  - auth + plan gate          │◄────│  Anthropic / OpenAI │
│  - loop: model ↔ tools       │     └─────────────────────┘
│  - read tools → Postgres RLS │
│  - write tools → proposals   │
│  - simulate → domain puro    │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│  Postgres                    │
│  dados dos módulos (RLS)     │
│  orb_threads / orb_messages  │
│  orb_proposals / orb_usage   │
└──────────────────────────────┘

Após confirmar no UI:
  ActionCard → src/api/<domínio> → Postgres (mesmo caminho do CRUD manual)
```

### Turno típico

1. Usuário envia mensagem (e opcionalmente `thread_id`, `locale`, `timezone`).
2. `orb-agent` autentica (padrão `home-bundle`: Anon + `Authorization` → `getUser()`).
3. Carrega histórico curto + **bootstrap context** (resumo do dia/mês, não o banco inteiro).
4. Chama o LLM com system prompt do Orb + catálogo de tools.
5. Loop tool-calling:
   - **query_*** → executa na Edge com client RLS; devolve JSON ao modelo.
   - **simulate_*** → calcula em memória (domínio); não grava.
   - **propose_*** → valida schema, persiste `orb_proposals` (`pending`), devolve card ao UI; **não** grava no módulo ainda.
   - **clarify_*** → devolve pergunta estruturada (slots faltantes).
6. Stream da resposta textual + eventos (`tool_start`, `proposal`, `clarify`, `done`).
7. Usuário confirma proposta → front chama `src/api/*` → marca proposal `applied` (ou `dismissed`).

---

## 3. Stack recomendada

### Já existe (manter)

| Camada | Tech |
|--------|------|
| Front | React 19 + TS + Vite, Tailwind, shadcn |
| Backend | Supabase Auth, Postgres + RLS, Edge Functions (Deno) |
| Deploy front | Vercel |
| Qualidade | Vitest (`domain/`), Playwright |

### Novo

| Peça | Escolha | Por quê |
|------|---------|---------|
| Runtime do agente | **Supabase Edge Function `orb-agent`** | Mesmo padrão de secrets/CORS/auth das outras Edges; JWT + RLS como `home-bundle` |
| LLM | **Anthropic Claude Sonnet** (primário) ou **OpenAI GPT-4.1/4o** | Tool calling estável, bom PT-BR; chave só no secret |
| Protocolo UI↔Edge | **SSE** (ou NDJSON stream) | Resposta progressiva + eventos de proposal/clarify |
| Schemas das tools | **Zod** (front) + JSON Schema espelho na Edge | Validar proposals antes de mostrar/aplicar |
| Persistência do chat | Tabelas `orb_*` no Postgres | Histórico, auditoria, billing de uso |
| Execução de writes | **Client `src/api/*` pós-confirm** | Reusa validação, gates de plano, UI existente; evita duplicar CRUD na Edge |
| Observabilidade | Sentry (já no front) + logs Edge sem PII + `orb_usage` | Custo/latência/erros por usuário |
| Feature gate | Trial/Pro (`usePlan` / `app_access_enforce`) + cota diária de turns | Controla custo de tokens |

### O que não usar (neste desenho)

- Chamar LLM do browser com chave exposta.
- LangChain/LlamaIndex pesados na Edge (overhead; preferir loop fino tool-calling).
- Service role para “facilitar” queries do usuário (quebra o modelo mental de RLS; só se houver job batch futuro bem isolado).
- Auto-aplicar writes financeiros sem confirmação.

### Alternativa descartada (por ora)

**Agent na Vercel (Node) + AI SDK** — DX de streaming excelente, mas cria segundo runtime de secrets/auth. Só revisitar se a Edge ficar limitada em timeout/CPU no loop multi-tool.

---

## 4. Componentes lógicos

### 4.1 Front (`src/`)

```
pages/admin/orb/          (opcional: rota dedicada /orb)
components/orb/
  OrbSheet.tsx            # entrada global (AdminLayout)
  OrbChat.tsx             # lista de mensagens + composer
  OrbActionCard.tsx       # proposal pendente → Confirmar / Editar / Descartar
  OrbClarify.tsx          # chips / perguntas de slot
hooks/useOrbChat.ts       # stream, thread, apply proposal
api/orb.ts                # invoke orb-agent + update proposal status
domain/orb/               # formatação de proposals, labels, guards puros
types/orb.ts
```

UX alinhada ao brainstorm: Orb pergunta quando falta categoria, escopo de orçamento, “até quando?”, etc.

### 4.2 Edge `orb-agent`

```
supabase/functions/orb-agent/
  index.ts                 # HTTP, auth, stream
  prompt.ts                # system + política Orb
  tools/
    registry.ts            # nome → handler + json schema
    finance/*.ts           # query/propose/simulate
    habits/*.ts
    goals/*.ts
    entertainment/*.ts
    places/*.ts
    travel/*.ts
    car/*.ts
  context/bootstrap.ts     # resumo hub-like (mês atual, alertas, streaks)
  proposals.ts             # insert pending
_shared/                   # cors, (futuro) orbRateLimit
```

Padrão de client: igual `home-bundle` — `createClient(url, anon, { global: { headers: { Authorization } } })`.

### 4.3 Dados

```sql
-- esboço (migration futura)
orb_threads (
  id, user_id, title, created_at, updated_at
)

orb_messages (
  id, thread_id, user_id,
  role,              -- user | assistant | system | tool
  content,           -- texto
  meta jsonb,        -- tool calls, citations
  created_at
)

orb_proposals (
  id, thread_id, message_id, user_id,
  tool_name,
  payload jsonb,     -- draft tipado (ex.: create_transaction)
  status,            -- pending | applied | dismissed | expired
  applied_entity_id, -- id criado após confirm
  created_at, resolved_at
)

orb_usage (
  user_id, day, turns, input_tokens, output_tokens
)
```

RLS por `user_id` em todas.

---

## 5. Catálogo de tools (contrato)

Três famílias — espelham o brainstorm:

### Query (executa na Edge)

Exemplos: `query_budget_status`, `query_spend_by_class`, `query_unwatched_movies`, `query_habit_today`, `query_goal_progress`, `query_trip_day_plan`, `query_recurring_remaining`.

### Simulate (não grava)

Exemplos: `simulate_installment_impact`, `simulate_next_month_balance`, `simulate_budget_cut`.

### Propose (grava só em `orb_proposals`)

Exemplos: `propose_create_category`, `propose_set_budget`, `propose_create_recurring`, `propose_create_transaction`, `propose_mark_movie`, `propose_habit_checkin`, `propose_place_visit`, `propose_fuel_log`, `propose_trip_itinerary`.

### Clarify (controle de diálogo)

`ask_user` com `{ question, slots[], suggestions[] }` — ex.: “Uber em Transporte?”, “Só este mês ou repetir?”.

Cada `propose_*` declara schema estrito (campos obrigatórios). Se faltar dado → `ask_user`, não inventar.

---

## 6. Resolução de entidades

Casos do brainstorm (filme, livro, álbum, lugar, veículo “Goleta”):

1. Tool de **search** no catálogo já existente (TMDB / Books / Spotify Edge / Places / `car` do user).
2. Se 1 match confiável → preenche proposal.
3. Se N matches → `ask_user` com opções.
4. Se 0 → pede mais contexto ou cadastro manual mínimo.

Não inventar título/ID de catálogo.

---

## 7. Segurança, custo, privacidade

- Auth obrigatória; sem JWT → 401.
- Gate Pro/trial + **rate limit** (`orb_usage`).
- Minimizar PII no prompt: preferir agregados; IDs internos só quando necessário à tool.
- Não logar conteúdo completo de mensagens em providers de log; secrets só Supabase.
- Proposals expiram (ex.: 24h).
- LGPD: threads apagáveis na Conta / com exportação futura.
- Timeout: limitar iterações do loop (ex.: máx. 8 tool rounds) e tamanho de contexto.

---

## 8. Fases de entrega

| Fase | Escopo | Risco |
|------|--------|-------|
| **P0** | Chat + query finance/habits/goals + simulate parcela/saldo + 3–5 proposes com ActionCard | Baixo |
| **P1** | Categorias/orçamento/recorrências/transações completas (clarificações do brainstorm) | Médio |
| **P2** | Cinema/livros/música/lugares (search + entity resolve) | Médio |
| **P3** | Veículos + viagens (roteiro sugerido multi-step) | Alto |
| **P4** | Proativo (digest Orb, alertas conversacionais) | Médio |

---

## 9. Mapa para o código atual

| Necessidade Orb | Reuso |
|-----------------|--------|
| Auth + RLS na Edge | `home-bundle` |
| Resumo do dia | `api/hub.ts` / lógica do bundle |
| CRUD pós-confirm | `src/api/finance`, `habits`, `goals`, `movies`, … |
| Insights financeiros | `domain/finance/insights.ts` |
| Projeção/parcelas | `domain/recurring/*` |
| CORS Edge | `_shared/cors.ts` |
| Gate de plano | `usePlan` + enforce existente |

---

## 10. Decisões em aberto (para fechar antes do P0)

1. ✅ Provider LLM definitivo (Anthropic vs OpenAI) e modelo default. — Anthropic Claude (Sonnet).
2. ✅ Orb só no sheet global ou também rota `/orb`. — Sheet flutuante global (sem rota dedicada no P0).
3. Cota: turns/dia vs tokens/mês no Pro. — adiado; sem `orb_usage` no P0 (ver `docs/planning/orb-ia/p0-entretenimento.md`).
4. Roteiro de viagem (P3): proposal única grande vs N activities propostas.

---

## Referências

- Casos de uso: `docs/planning/orb-ia/brainstorm.md`
- Arquitetura do app: `.cursor/ARCHITECTURE.md`
- Camadas e gates: `.cursor/AGENTS.md`
