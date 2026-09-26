# Arquitetura do Orbyva

Documento de referência da arquitetura de código. Complementa o [`README.md`](../README.md) e o [`AGENTS.md`](./AGENTS.md).

---

## 1. Visão geral

Orbyva é um **SPA multi-módulo** (life OS) com backend **BaaS Supabase**.

| Camada | Papel |
|--------|--------|
| Front (Vercel) | React 19 + TypeScript + Vite; UI PT-BR; PWA |
| Supabase Auth | Google OAuth (+ e-mail via hook) |
| Postgres + RLS | Fonte da verdade; tenancy por `user_id` |
| Storage | Capas, avatares, assets do usuário |
| Edge Functions | Segredos e integrações (Stripe, Spotify, Maps, Resend, ops) |

O browser **não** executa SQL nem guarda service role. Toda persistência passa por cliente Supabase (Anon Key + JWT) ou por Edge Functions.

```
┌─────────────┐     Anon Key + JWT      ┌──────────────────────────┐
│  React SPA  │ ───────────────────────► │  Supabase Auth/Postgres  │
│  (Vercel)   │                          │  Storage + RLS           │
└──────┬──────┘                          └────────────┬─────────────┘
       │ invoke / HTTPS                               │
       ▼                                              ▼
┌─────────────────┐                         ┌─────────────────────┐
│ Edge Functions  │ ──── secrets ─────────► │ Stripe / Google /    │
│ places-catalog  │                         │ Spotify / Resend     │
│ spotify-catalog │                         └─────────────────────┘
│ stripe-* / mail │
└─────────────────┘
```

---

## 2. Camadas em `src/`

Dependência desejada (de fora para dentro):

```
pages/  →  hooks/  →  api/  →  (Supabase)
                ↘     ↑
                 domain/   (puro, sem I/O)
lib/     → integrações HTTP / utilitários (pode chamar Edge)
types/   → contratos alinhados ao schema
components/ + layouts/  → UI compartilhada e shell
```

| Pasta | Responsabilidade | Exemplos |
|-------|------------------|----------|
| `pages/` | Telas por rota; composição fina | `pages/admin/finance/`, `travel/`, `movies/` |
| `hooks/` | Sessão, plano, cache de catálogo, dimensões | `useAuth`, `usePlan`, `useCachedCatalog` |
| `api/` | I/O Supabase (CRUD, RPC, Storage) por domínio | `api/travel.ts`, `api/finance/` |
| `domain/` | Regras puras + testes Vitest | streaks, clothing, quotaRules, filtros |
| `types/` | Tipos TS alinhados às tabelas | `types/travel.ts`, `finance.ts` |
| `lib/` | Clientes de catálogo, share, billing helpers, cache | `musicCatalog`, `googlePlaces`, `memoryCache` |
| `components/` | UI compartilhada (shadcn + app) | sidebar, dialogs, PlaceCard |
| `layouts/` | Shell autenticado | `AdminLayout` (sidebar, prefetch) |

**Regra prática**

* Precisa de `supabase` ou `fetch` → `api/` ou `lib/`.
* Dá para unit-testar sem rede → `domain/`.
* UI não concentra regra de negócio; chama `api`/`domain`/`hooks`.

---

## 3. Módulos de produto

A sidebar agrupa cinco blocos. Cada módulo tende a ter: página(s) em `pages/admin/<módulo>/`, cliente em `api/`, tipos em `types/`, regras em `domain/` quando houver lógica não trivial.

| Bloco | Módulos | Rotas principais |
|-------|---------|------------------|
| Início | Landing, hub, timeline | `/`, `/home`, `/timeline` |
| Finanças | Dashboard, transações, recorrências, orçamento, categorias | `/finance/*` |
| Produtividade | Tarefas, projetos, notas, lista de compras | `/tasks`, `/tasks/projects`, `/notes`, `/shopping-list` |
| Vida | Hábitos, saúde, metas, lugares, viagens, veículos | `/habits`, `/life/health`, `/goals`, `/places`, `/travel`, `/car` |
| Conteúdo | Cinema, livros, música, links | `/movies`, `/books`, `/music`, `/links` |

Rotas públicas/marketing: `/`, `/dentro-do-orcamento` (aliases `/quanto-ainda-cabe` e `/cabe-no-mes`), `/login`, `/about`, `/terms`, `/privacy`, `/invite/:code`. Ops interno: `/ops` (fora do menu). Painel da extensão: `/ext` (autenticado, sem AdminLayout). Páginas `/about`, `/terms` e `/privacy` usam o shell público (`components/PublicPageShell`) alinhado à landing.

Abaixo: o que cada módulo faz, onde vive no código e **APIs externas / Edge** quando aplicável. Persistência do usuário é sempre **Supabase Postgres + RLS** (salvo indicação contrária).

### 3.1 Início e plataforma

#### Landing (`/`)

Marketing do life OS, planos (trial 7 dias → Pro) e isca **Está dentro do orçamento?**.

* **Código:** `pages/Landing` / `pages/landing/`; UI de marketing em `components/landing/` + registries Cult UI / Skiper UI / OriginKit (`components/cult-ui`, `components/ui/skiper-ui`, `components/originkit`)
* **APIs:** CTA de cadastro (`/login?mode=signup`) e checkout Pro (ver Conta / billing). Sem captura de waitlist no client.

#### Está dentro do orçamento? (`/dentro-do-orcamento`)

Ferramenta pública (sem login): renda + contas fixas + compra opcional → dentro / aperta / fora. Depois do resultado, CTA para o teste (signup). Números da calculadora não são persistidos.

* **Código:** `pages/QuantoAindaCabe`; regra em `domain/marketing/cabeNoMes.ts`
* **APIs:** nenhuma (cálculo local). Aliases `/quanto-ainda-cabe` e `/cabe-no-mes` redirecionam.

#### Painel da extensão (`/ext`)

UI estreita para o side panel do Chrome: hábitos do dia, restante do orçamento, captura da aba (cinema, livros, música, lugares) e “está dentro do orçamento?” em páginas de produto (à vista + simulação de parcelamento). Sem AdminLayout.

* **Código:** `pages/admin/extension/ExtensionPanel`; classificação em `domain/extension/`; captura em `lib/extensionCapture.ts`; bridge em `hooks/useExtensionPageContext.ts`
* **Extensão:** pasta `extension/` (Manifest V3). O painel é um iframe de `/ext` (mesma sessão Supabase). CSP de `/ext` permite `frame-ancestors chrome-extension:`.
* **Fora do v1:** Read Later, lista de compras, tarefas/projetos, coleções de sites (módulos ainda não prontos no app).

#### Dashboard / hub (`/home`)

Resumo do dia: hábitos, saldo, alertas, atalhos entre módulos.

* **Código:** `pages/admin/life/LifeDashboard` (e home); `api/hub.ts` (agrega finance, habits, travel, places, movies, car, alerts, timeline)
* **APIs:** Edge `home-bundle` (cold load em 1 request) com **fallback** para agregação local via `api/*`. Sem provedor externo próprio.

#### Timeline (`/timeline`)

Feed de eventos agregados de todos os módulos.

* **Código:** `pages/admin/life/Timeline`; `api/timeline.ts`; `types/timeline.ts`
* **APIs:** só Supabase (leituras/composições no client).

#### Conta (`/account`)

Plano, exportação de dados, preferências de e-mail.

* **Código:** `pages/admin/Account`; `api/billing.ts`, `api/account.ts`, `api/export.ts`
* **APIs:** Edge `stripe-checkout`, `stripe-portal`, `stripe-webhook` (Stripe); perfil/preferências no Postgres. Welcome: Edge `welcome-email` (`lib/welcomeEmail.ts`).

#### Convite / referral (`/invite/:code`)

Aceite de convite de indicação.

* **Código:** `pages/InviteAccept`; `api/referral.ts`
* **APIs:** só Supabase.

#### Ops (`/ops`)

Console interno (fora do menu): conceder Pro / estender trial.

* **Código:** `pages/ops/OpsConsole`; `api/ops.ts`
* **APIs:** Edge `ops-admin` (allowlist `OPS_ADMIN_EMAILS` no servidor).

### 3.2 Finanças

#### Dashboard financeiro (`/finance/dashboard`)

KPIs, gráficos (Recharts) e alertas de vencimento.

* **Código:** `pages/admin/home/FinanceDashboard`; `api/finance.ts` / `api/finance/*`; `domain/finance/`
* **APIs:** só Supabase (+ dados de recorrências via `api/recurring`).

#### Transações

CRUD com categoria/subcategoria, busca e paginação.

* **Código:** `pages/admin/finance/Transactions`; `api/finance/transactions.ts`; `types/finance.ts`
* **APIs:** só Supabase.

#### Recorrências (`/finance/recurring`)

Contas/parcelas, custos previstos, aba **Projeção**, marcar/desfazer pagamento (`paid_at`).

* **Código:** `pages/admin/finance/Recurring`; `api/recurring.ts`; `domain/recurring/`
* **APIs:** só Supabase.

#### Orçamento mensal

Planejado vs gasto, alertas e duplicação entre meses.

* **Código:** `pages/admin/finance/Budget`; `api/finance/budget.ts`; `domain/budget/`
* **APIs:** só Supabase.

#### Categorias (dimensões)

Categorias e subcategorias com cor e ícone; naturezas de lançamento.

* **Código:** `pages/admin/finance/Categories`; `api/finance/dimensions.ts`; `hooks/useDimensions`; `domain/dimensions/`
* **APIs:** só Supabase.

### 3.3 Produtividade

Tarefas (`/tasks`), projetos (`/tasks/projects`), notas (`/notes`) e lista de compras (`/shopping-list`). Timer Live, agenda e Gantt moram no módulo de tarefas (rotas `/tasks/live`, `/tasks/agenda`; Gantt é aba de `/tasks`).

* **Código:** `pages/admin/tasks/`, `pages/admin/notes/`, `pages/admin/shopping/`; `api/tasks/`, `api/notes/`, `api/shopping/`; `domain/tasks/`, `domain/notes/`, `domain/shopping/`
* **APIs:** só Supabase (exceto ícones SVG da biblioteca local).

### 3.4 Conteúdo

#### Cinema (`/movies`)

Filas para assistir / assistindo / assistidos / abandonei; filmes e séries; episódios com nota; import Letterboxd / TV Time; card Stories.

* **Código:** `pages/admin/movies/`; `api/movies.ts`, `api/movieEpisodes.ts`; `lib/cinema.ts`, `lib/tmdb.ts`, `lib/omdb.ts`, `lib/movieShare.ts`; `domain/movies/`
* **APIs externas:** **TMDB** (`VITE_TMDB_API_KEY`, pt-BR) com fallback **OMDb** (`VITE_OMDB_API_KEY`). Persistência da lista do usuário: Supabase.

#### Livros (`/books`)

Para ler / lendo / lidos / abandonei; marca-página, notas, opinião; card Stories.

* **Código:** `pages/admin/books/`; `api/books.ts`; `lib/googleBooks.ts`, `lib/bookShare.ts`; `domain/books/`
* **APIs externas:** **Google Books** (`VITE_GOOGLE_BOOKS_API_KEY`). Capas via proxy `/books-media` quando necessário. Persistência: Supabase.

#### Música (`/music`)

Para ouvir / ouvidos; tracklist + nota por faixa; cadastro manual; card Stories.

* **Código:** `pages/admin/music/`; `api/albums.ts`; `lib/musicCatalog.ts`, `lib/spotify.ts`, `lib/musicbrainz.ts`, `lib/albumShare.ts`; `domain/music/`
* **APIs:** Edge **`spotify-catalog`** (Client Credentials no servidor) com fallback **MusicBrainz** + Cover Art Archive. Proxies `/spotify-media`, `/caa-media`, `/mb-api`. Persistência (incl. `track_ratings` jsonb): Supabase Storage para capas manuais.

#### Links (`/links`)

Artigos, vídeos e sites para consumir depois.

* **Código:** `pages/admin/content/Links`; `api/contentLinks.ts`; `domain/contentLinks/`
* **APIs:** só Supabase.

### 3.5 Vida

#### Hábitos (`/habits`)

Check-in do dia, faixa da semana, heatmap mensal (Hoje | Mês), anti-hábitos e vínculo com metas.

* **Código:** `pages/admin/habits/`; `api/habits.ts`; `domain/habits/`
* **APIs:** Supabase. Lembretes: Edge **`habit-reminder-email`** (cron + preferências na Conta).

#### Saúde (`/life/health`)

Medicações, consultas, métricas corporais e hábitos de saúde. Lista de tratamentos em `/life/health/medications`.

* **Código:** `pages/admin/life/HealthDashboard`, `pages/admin/health/`; `api/health/`; `domain/health/`
* **APIs:** só Supabase.

#### Metas (`/goals`)

Progresso, categorias e prazos; vínculo com hábitos/finanças quando aplicável.

* **Código:** `pages/admin/goals/`; `api/goals.ts`; `domain/goals/`
* **APIs:** só Supabase.

#### Lugares (`/places`)

Para visitar / visitados (fluxos de UI separados); nota e opinião; busca de catálogo; N visitas por lugar.

* **Código:** `pages/admin/places/`; `api/places.ts`; `lib/googlePlaces.ts`, `lib/placesCatalog.ts`; `domain/places/`; `components/PlaceFormDialog`, `PlaceVisitsPanel`
* **APIs:** Edge **`places-catalog`** → **Google Places** (Autocomplete New). Cotas mensais fail-closed. Persistência: `place_visit` (local) + `place_visit_occurrence` (cada ida).

#### Viagens (`/travel`, `/travel/:id`)

Paradas multi-cidade (`trip_stop`); clima + sugestão de roupa/mala sob demanda; roteiro por dia (dias passados ocultáveis, mover atividades, status de visita, ícone Google Maps, próximo destino + rotas Google); deslocamentos (incl. ida/volta na criação); gastos com rateio e vínculo ao ledger (também a partir de lançamentos de categoria Viagens); lugares da viagem; prazos; convites compartilhados.

* **Código:** `pages/admin/travel/`; `api/travel.ts`, `api/tripMembers.ts`; `lib/googleRoutes.ts`, `lib/googleWeather.ts`; `domain/travel/` (incl. deslocamentos do roteiro + `transportModes`), `domain/itinerary/`, `domain/maps/`; componentes `TripWeatherPanels`, `TripWeatherProvider`, `ItineraryNextRoutePanel`
* **APIs:** Edge **`places-catalog`** → Google **Places**, **Routes** (WALK/BICYCLE/TRANSIT Essentials; DRIVE Pro; também estimativa de chegada em deslocamentos carro/trem/ônibus) e **Weather** (diário + horário). Convites: Edge **`trip-invite-email`**. Excluir viagem faz cascade dos lugares com aquele `trip_id` (não confundir com “Para visitar” global).

#### Veículos (`/car`)

Manutenções, abastecimentos, documentos e alertas (carro ou moto).

* **Código:** `pages/admin/car/`; `api/car.ts`; `domain/car/`; `types/car.ts`
* **APIs:** só Supabase.

### 3.6 Transversal (não é item de sidebar, mas afeta módulos)

| Peça | Uso | APIs |
|------|-----|------|
| Auth / login | `ProtectedRoute`, `useAuth`, `pages/admin/Login` | Supabase Auth (Google OAuth); e-mail via Edge `auth-send-email` (Resend) |
| Alertas / busca global | `api/alerts`, `api/search`, ⌘K | Supabase (agregação client) |
| E-mails lifecycle | welcome, trial, digest, retenção D7 | Edges `lifecycle-email`, `retention-d7-email`, `weekly-digest-email` (Resend + cron) |
| Billing gate | `usePlan`, `app_access_enforce` | Stripe via Edges + perfil no Postgres |

Detalhe de produto/UX por tela: [`README.md`](../README.md) (seção Módulos).

---

## 4. Front: rotas e performance

* Entrada: `main.tsx` → `routes.tsx` (React Router v7 + `createBrowserRouter`).
* App autenticado atrás de `AuthRoot` (lazy) + `ProtectedRoute` + `useAuth`.
* Landing (`/`) sem Supabase no grafo; `/marketing/hub.webp` em preload, o print do hero é o `<img>` do carrossel (sem overlay HTML).
* Listas de cinema/livros/música: cache em memória (`lib/memoryCache` + `useCachedCatalog`) com revalidação.
* PWA: `vite-plugin-pwa`; budget de bundle: `npm run check:bundle`.
* `/llms.txt` estático em `public/llms.txt` (Markdown: H1 + listas com links). O SW não faz fallback da SPA nesse path.
* `/sitemap.xml` e `/robots.txt` estáticos em `public/` (só rotas públicas; app autenticado fica fora).
* GTM (`GTM-5H8MT38X`): loader em `public/gtm.js` + `noscript` no `index.html`. CSP libera `*.googletagmanager.com`, `*.google-analytics.com` e `*.analytics.google.com` (sem `'unsafe-inline'` em `script-src`).
* Proxies Vite/Vercel para mídia externa (CORS + canvas de share): `/spotify-media`, `/caa-media`, `/books-media`, etc. (`vercel.json`).

---

## 5. Backend Supabase

### 5.1 Postgres

* Schema versionado em `supabase/migrations/` (fonte da verdade).
* Tenancy: `user_id` + **RLS** (`tenancy_rls` / security hardening).
* Escrita gated por trial/Pro (`app_access_enforce`).
* `supabase db push` só com aprovação explícita do usuário.

### 5.2 Auth e Storage

* Auth: Google OAuth; e-mail via Edge `auth-send-email` (Resend) quando o hook está ativo.
* Storage: capas manuais (`album-covers`), avatares, etc.

### 5.3 Edge Functions

Código em `supabase/functions/`. Shared: `_shared/cors.ts`, e-mail, cotas Maps, cron auth.

| Função | Papel |
|--------|--------|
| `places-catalog` | Google Places / Routes / Weather + cotas mensais fail-closed |
| `spotify-catalog` | Client Credentials Spotify (busca/capa/tracklist) |
| `stripe-checkout` / `stripe-portal` / `stripe-webhook` | Billing Pro |
| `auth-send-email` | Templates Auth (confirm, magic link, reset) |
| `welcome-email` / `lifecycle-email` / `retention-d7-email` / `weekly-digest-email` | Lifecycle e retenção |
| `habit-reminder-email` / `trip-invite-email` | Produto / growth |
| `ops-admin` | Console interno `/ops` (allowlist `OPS_ADMIN_EMAILS`) |
| `home-bundle` | Agregação para hub (quando usada) |

CORS: origin de `SITE_URL` + localhost em dev.

Deploy de Edge e secrets: somente com aprovação do usuário. Ver README (env, billing, e-mails).

---

## 6. Fluxos de dados (exemplos)

### 6.1 Entretenimento (Música)

1. `Music.tsx` carrega lista com `useCachedCatalog` + `fetchAllAlbums` (`api/albums.ts`).
2. Filtros/status/paginação no **cliente** (troca de aba instantânea).
3. Busca de catálogo: `lib/musicCatalog.ts` → Spotify (Edge `spotify-catalog`) com fallback MusicBrainz.
4. Capas via proxies; opinião/track ratings em jsonb via `updateAlbum`.

Cinema e Livros seguem o mesmo padrão: catálogo + cache + share card (`lib/*Share.ts`).

### 6.2 Lugares / roteiro / clima

1. UI (`Places`, `TripDetail`, `ItineraryNextRoutePanel`, `TripWeatherPanels`) chama `lib/googlePlaces|Routes|Weather` / `placesCatalog`.
2. Esses clients **invocam** a Edge `places-catalog` (chave Google só no servidor).
3. Cotas mensais (Places / Routes Essentials|Pro / Weather) fail-closed; regras espelhadas em `domain/maps/quotaRules` e `_shared/mapsQuota*`.
4. Domínio de viagem: `trip_stop`, `stopForDate`, clothing (`domain/travel/clothing.ts`), links externos (`domain/itinerary/externalMaps.ts`).
5. Excluir viagem: cascade de lugares com aquele `trip_id` (`api/travel.ts`) — distinto de “Para visitar” global.

### 6.3 Billing (Stripe)

1. Front: `VITE_STRIPE_PUBLISHABLE_KEY` + `api/billing` / helpers em `lib/`.
2. Checkout/portal via Edge; webhook aplica estado da assinatura no Postgres.
3. `usePlan` + gate `app_access_enforce` controlam escrita no app.

---

## 7. Segurança e tenancy

* Front: apenas **Anon Key** (`VITE_SUPABASE_*`). Service role nunca no browser.
* Toda tabela de usuário com RLS; validar com 2 contas quando tenancy estiver em jogo (E2E opcional).
* Segredos de terceiros só em Supabase secrets / CI — não em `VITE_*` de produção sensível.
* `/ops`: allowlist no servidor (`OPS_ADMIN_EMAILS`).
* Logs sem tokens, PII desnecessária ou payloads de pagamento completos.

---

## 8. Estrutura do repositório

```
/public                 Assets estáticos (logo, marketing)
/extension              Extensão Chrome (side panel → `/ext`)
/e2e                    Playwright + helpers (auth, cleanup E2E*)
/scripts                ci-local, bundle budget, minify SW
/docs                   Planejamento (improve, planning-features, …)
/supabase
  ├─ migrations/        Schema / RLS / seeds
  ├─ config.toml
  └─ functions/         Edge (stripe-*, catalogs, e-mails, ops)
/src
  ├─ api/               Cliente Supabase por domínio
  ├─ domain/            Regras puras + __tests__
  ├─ components/        UI compartilhada (+ ui/ shadcn)
  ├─ hooks/
  ├─ layouts/
  ├─ lib/               Integrações e utilitários
  ├─ pages/
  │   ├─ admin/         App autenticado
  │   ├─ landing/       Marketing (quando separado)
  │   ├─ legal/         Terms / Privacy
  │   └─ ops/           Console interno
  ├─ types/
  ├─ routes.tsx
  ├─ ProtectedRoute.tsx
  └─ main.tsx
```

---

## 9. Qualidade e CI

| Tipo | Onde / comando |
|------|----------------|
| Unit | Vitest — `domain/**/__tests__`, `lib/__tests__` → `npm run test` |
| E2E | Playwright — `e2e/` → `npm run test:e2e` (conta `E2E_*`) |
| Lint / types | ESLint + TypeScript strict |
| Espelho CI | `npm run ci:local` |
| CI remoto | `.github/workflows/ci.yml` |

Hooks React **nunca** após early return. Mudanças grandes: preferir `ci:local` verde antes de considerar pronto.

---

## 10. Limites e evolução

**Não fazer**

* Expor API keys Google/Spotify/Stripe secret no client.
* Colocar regra de negócio pesada só em componentes de página.
* Contornar RLS no client “porque filtra na UI”.
* `db push` / deploy Edge sem aprovação.

**Evoluir com cuidado**

* Novos módulos: seguir o mesmo padrão `pages` + `api` + `types` (+ `domain` se houver regra).
* Novas integrações: Edge + shared CORS/auth; documentar env no README.
* Indicadores/BI futuros: preferir dados já confiáveis no Postgres (RLS) e regras em `domain/`.

---

## 11. Onde olhar primeiro

| Pergunta | Comece por |
|----------|------------|
| O que o produto faz / como rodar | `README.md` |
| Onde colocar código novo | Este arquivo (`.cursor/ARCHITECTURE.md`) + skill Orbyva |
| Plano e aprovação de mudanças | `.cursor/AGENTS.md` |
| Tarefas / backlog fonte | `docs/improve.md`, `docs/planning-features.md`, … |
| Schema | `supabase/migrations/` |
| Rotas | `src/routes.tsx` |
| Shell do app | `src/layouts/AdminLayout.tsx`, `src/components/app-sidebar.tsx` |
