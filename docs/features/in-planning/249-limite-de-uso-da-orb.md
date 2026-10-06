---
prompt: |-
  Tem request limit no orb? seria bacana colocar pra não ter uma cobrança muito cabulosa algum fdp tenta arrastar o progresso
---

# 249 — Limite de uso da Orb

## Contexto
- `supabase/functions/orb-agent/index.ts` não conta pedido por usuário: um script autenticado chama em loop e cada chamada vira cobrança no Gemini.
- O que existe hoje só limita o tamanho de cada pedido: corpo 60 KB, mensagem 8 KB, 8 rodadas de tool, 8192 tokens de saída, 90 s por turno. O próprio código diz que a "cota por dia é outra onda" (`index.ts:42`).
- A função também não confere `has_app_access()`: trial vencido ou assinatura `past_due` continua gerando chamada paga ao modelo.
- Moldes no repo: `billing_api_usage` + `billing_try_consume` (contador atômico por usuário/janela, `20260911200000_billing_stripe_guard.sql`) e a cota diária com 429 da `orb-avatar`.

## Definições
- Pedido: um POST aceito na `orb-agent` (um turno), independente de quantas rodadas de tool ele faça.
- Cota diária: pedidos por usuário por dia corrido em `America/Sao_Paulo`.
- Rajada: pedidos por usuário no minuto corrente.
- Fora: limite global de gasto do projeto, cota por plano, contador de uso visível na UI, `orb-avatar` (já tem a dela) e o servidor MCP.

## Estrutura
- Frente A — banco: contador da Orb.
  - Migration nova (timestamp único, posterior a `20261005120000`): tabela `orb_api_usage (user_id, kind check in ('day','minute'), window_start, count, pk (user_id, kind, window_start))`, RLS ligada e sem policy para `authenticated` — mesmo desenho de `billing_api_usage`.
  - RPC `orb_try_consume(p_user_id uuid, p_daily_limit int, p_minute_limit int)` `security definer`: numa transação, confere as duas janelas, só incrementa se as duas couberem e devolve `{ ok, reason ('day'|'minute'), used, limit, remaining, retry_after_seconds }`. Apaga as linhas do próprio usuário com mais de 2 dias. `execute` só para `service_role`.
  - `supabase/tests/orb_usage/` (stubs, seed, schema, behavior, `run.sh`) no padrão de `supabase/tests/billing_stripe_guard/`.
- Frente B — regras puras: `supabase/functions/_shared/orbQuotaRules.ts`.
  - Leitura dos limites por env com fallback (`ORB_DAILY_LIMIT` = 100, `ORB_MINUTE_LIMIT` = 10), mensagens PT-BR por motivo e `Retry-After`. Teste vitest em `src/domain/orb/__tests__/` (padrão de `orbAvatarRequest.test.ts`).
- Frente C — `orb-agent`: portões antes do Gemini.
  - `index.ts:212` (logo depois de `getUser`) → `db.rpc("has_app_access")` com o JWT do usuário; `false` → 402 com `{ error: "Seu acesso ao Orbyva expirou. Assine para continuar falando com a Orb." }`.
  - Depois da validação do corpo (`index.ts:252`) e antes de criar o `GoogleGenAI` → `orb_try_consume` com client `service_role`; recusado → 429 com `Retry-After`, `error` em PT-BR, `remaining: 0` e `limit`.
  - Front web (`src/api/orb.ts:42`) e mobile (`mobile/src/api/orb.ts:45`) já mostram `detail.error` de resposta não-2xx: sem mudança de UI, só teste que prova a mensagem do 429 chegando ao chat.

## Decisões
- Limite por usuário com cota diária **e** rajada por minuto.
- Cota diária padrão de 100 pedidos, ajustável por `ORB_DAILY_LIMIT` sem deploy de código.
- Rajada padrão de 10 pedidos por minuto, ajustável por `ORB_MINUTE_LIMIT`.
- Pedido sem acesso ao app (`has_app_access()` falso) é recusado antes de chamar o Gemini.
- O dia é calculado no servidor (`America/Sao_Paulo`), nunca pelo `today`/`timezone` do corpo: senão basta forjar o dia a cada chamada para zerar a cota.
- Conta o pedido aceito, não a resposta bem-sucedida: turno abortado ou com erro também consome, senão o abuso abortaria de propósito.
- Fail-closed: erro na RPC de cota → 503 "Não foi possível conferir seu limite de uso agora.", sem chamar o modelo.
- Incremento atômico na RPC (nada de contar e depois inserir pelo client), igual a `billing_try_consume`.

## Perguntas em aberto
### P1 — Que tipo de limite por usuário?
- Recomendada: cota diária + rajada por minuto — a diária segura a conta, a de minuto segura o loop.
- **Resposta:** Cota diária + limite de rajada por minuto.

### P2 — Qual a cota diária padrão?
- Recomendada: 100 por dia — folga para uso real, teto baixo para abuso.
- **Resposta:** 100 por dia.

### P3 — Bloquear também quem está sem acesso (trial vencido / sem assinatura)?
- Recomendada: sim — hoje essa pessoa ainda gera chamada paga.
- **Resposta:** Sim, checar acesso antes de chamar o Gemini.

### P4 — Seguir pela esteira ou implementar direto?
- Recomendada: esteira — mexe em banco remoto e em contrato da função.
- **Resposta:** Criar a feature na esteira (planning) e implementar via /next.

## Prompts
(vazio até haver iteração nova)
