# Testes E2E — Orbyva

Playwright sobre o build de produção (`vite build` + `vite preview`), Supabase
real. Não há mock de backend: o que o teste vê é o que o usuário vê.

## Como rodar

```bash
npm run test:e2e                      # suíte inteira
npm run test:e2e:ui                   # modo interativo
npx playwright test --grep @smoke     # só o barato
npx playwright test e2e/public        # só o que não exige credencial
```

O `webServer` do `playwright.config.ts` faz `build && preview` sozinho em local
e reaproveita servidor já de pé. No CI o build já aconteceu, então só sobe o
preview.

## Variáveis

| Variável                              | Sem ela                                    |
| ------------------------------------- | ------------------------------------------ |
| `VITE_SUPABASE_URL` / `..._ANON_KEY`   | Nada autenticado roda                      |
| `E2E_EMAIL` / `E2E_PASSWORD`           | Specs de `e2e/app` e `e2e/security` pulam  |
| `E2E_EMAIL_B` / `E2E_PASSWORD_B`       | Spec de RLS pula                           |

Ficam no `.env` local (lido pelo config via `loadEnv`) e em secrets do GitHub
Actions. Specs que dependem delas usam `test.skip(!env.hasAuth, ...)`: falta de
credencial pula, nunca falha vermelho.

## Estrutura

```
e2e/
├── fixtures/test.ts      # test estendido: session, authedPage, cleanup, diagnostics
├── helpers/
│   ├── auth.ts           # login por API + acesso REST ao PostgREST
│   ├── cleanup.ts        # rastreio e remoção da massa criada
│   └── routes.ts         # tabela de rotas — fonte dos specs parametrizados
├── public/               # sem sessão: landing, legal, guarda de rota, 404
├── app/                  # autenticado: smoke de rotas, ativação, finanças, offline
├── security/             # isolamento entre contas (RLS)
└── global-teardown.ts    # varre sobras `E2E*` uma vez, no fim
```

## Fixtures

```ts
import { test, expect } from "../fixtures/test";

test("cria e vê lançamento", async ({ authedPage, session, cleanup }) => {
  // authedPage: já logado (sessão gravada no localStorage antes do 1º goto)
  // session:    access_token + user.id para chamadas REST
  // cleanup:    trackTx/trackBudget/... — roda sozinho no teardown
});
```

`diagnostics` é automática: toda página coleta `pageerror` e `console.error`
(com allowlist justificada). Use `expectNoPageErrors(diagnostics)` para assertar.

## Regras da casa

- **Login por API, nunca pelo formulário.** O formulário é testado uma vez, em
  `public/landing.spec.ts`. Repetir login por UL em cada spec só compra
  lentidão e intermitência.
- **Massa criada é massa rastreada.** Todo `POST` acompanha um `cleanup.track*`.
  Descrição sempre com `e2eStamp()` — o `global-teardown` varre `E2E*`.
- **Seletor por papel e nome acessível**, nunca por classe do Tailwind. `<h1>` de
  tela vem do `PageShell`, então `getByRole("heading", { level: 1 })` é estável.
- **Sem `waitForTimeout`.** `expect(...).toBeVisible({ timeout })` já espera.
- **Rota nova entra em `helpers/routes.ts`** — é o que dá cobertura de smoke e de
  guarda de graça.

Estratégia, critérios e backlog priorizado: [`quality/`](../quality/).
