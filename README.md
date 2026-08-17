# Orbyva

**Tudo da sua vida em uma só órbita** — finanças, metas, hábitos, viagens, lugares, veículos, cinema, livros e música no mesmo app.

Feito com **React 19 + TypeScript + Vite**, **Tailwind + shadcn/ui**, **Recharts**, **Framer Motion** e **Supabase** (Auth, Postgres + RLS, Storage e Edge Functions).

<p align="center">
  <img alt="Orbyva" src="public/logo.webp" width="120" />
</p>

---

## Módulos (navegação)

A sidebar agrupa o app em quatro blocos:

### Início
- **Landing** (`/`) — life OS, planos (teste 7 dias → Pro), waitlist; marketing com motion OriginKit + Cult UI + Skiper UI (free); módulos por ícones (sem prints repetidos); card do cronômetro flutuante
- **Dashboard** (`/home`) — resumo do dia: hábitos, saldo, alertas, atalhos; botão **+** abre um popover compacto e formulários de criação no overlay (sem sair da tela, quando suportado)
- **Timeline** (`/timeline`) — eventos agregados de todos os módulos

### Finanças
- **Dashboard** (`/finance/dashboard`) — KPIs, gráficos e alertas de vencimento
- **Transações** — CRUD com categoria/subcategoria, busca e paginação; se não achar a categoria, CTA “Crie agora” cria categoria/subcategoria na hora (também em Recorrências e gastos de viagem no ledger)
- **Recorrências** (`/finance/recurring`) — contas/parcelas e custos previstos; aba **Projeção**; marcar/desfazer pagamento (`paid_at`)
- **Orçamento mensal** — planejado vs gasto, alertas e duplicação entre meses
- **Categorias** — categorias e subcategorias com cor e ícone; busca por nome na página; animação ao mover subcategoria entre categorias

### Entretenimento
- **Cinema** (`/movies`) — para assistir / assistindo / assistidos / abandonei; filmes e séries (TMDB → OMDb); busca ao digitar; episódios com nota; import Letterboxd / TV Time; card Stories
- **Livros** (`/books`) — para ler / lendo / lidos / abandonei; Google Books com busca ao digitar; marca-página e notas de leitura; opinião e card Stories
- **Música** (`/music`) — para ouvir / ouvidos; catálogo via Edge Function (Spotify) com fallback MusicBrainz; busca ao digitar; tracklist + nota por faixa; cadastro manual; card Stories

### Vida
- **Hábitos** (`/habits`) — check-in do dia, faixa da semana, heatmap mensal (aba **Hoje | Mês**), anti-hábitos e vínculo com metas
- **Metas** (`/goals`) — progresso, categorias e prazos
- **Lugares** (`/places`) — para visitar / visitados (fluxos separados); busca Google Places; nota e opinião; na edição, aba **Visitas** com N visitas ao mesmo lugar (`place_visit_occurrence`)
- **Viagens** (`/travel`, `/travel/:id`) — paradas multi-cidade (editar parada no lápis do dia); clima + sugestão de roupa/mala sob demanda (botão); roteiro por dia (dias passados ocultos com “ver anteriores”; mover atividades; status de visita; ícone Google Maps quando houver link; próximo destino + rotas Google; ao editar início/fim da viagem o roteiro realinha pelas datas); deslocamentos como **atividade do dia** (origem/destino obrigatórios → título Origem → Destino; modo voo/trem/ônibus/carro; saída/chegada com input `time`; ida/volta iniciais na criação; conflito de horário com visitas); gastos (incl. rateio e vínculo com finanças; lançamento em categoria Viagens pode vincular a uma viagem); lugares da viagem; prazos; convites compartilhados. GPS no Chrome exige `Permissions-Policy: geolocation=(self)` (ver `vercel.json`).
- **Veículos** (`/car`) — manutenções, abastecimentos, documentos e alertas (carro ou moto)

---

## Arquitetura

Documentação detalhada das camadas, módulos, Edge Functions e fluxos: [`.cursor/ARCHITECTURE.md`](./.cursor/ARCHITECTURE.md).

Orbyva é um **SPA multi-módulo** com backend BaaS. O front não fala SQL direto: passa por uma camada de API tipada; regras de negócio ficam em funções puras testáveis; segredos de terceiros (Stripe, Spotify, Google Maps/Places/Routes/Weather, Resend) ficam em **Edge Functions**, não em `VITE_*`.

### Camadas (`src/`)

```
pages/          UI por módulo (rotas lazy)
  └─ chama
hooks/          Estado de sessão, plano, cache de catálogo, etc.
  └─ chama
api/            I/O Supabase (CRUD, RPC, Storage) — um arquivo/pasta por domínio
  └─ usa
domain/         Regras puras (ordenar, filtrar, streaks, alertas, labels…)
types/          Contratos TypeScript alinhados ao schema
lib/            Integrações e utilitários (TMDB, Spotify client, share cards, auth helper…)
components/     UI compartilhada (shadcn + app shell)
layouts/        AdminLayout (sidebar, outlet, prefetch)
```

**Regra prática:** se a lógica precisa de `supabase` ou `fetch`, vai em `api/` ou `lib/`. Se dá para unit-testar sem rede, vai em `domain/`.

### Fluxo de dados (exemplo Música)

1. `Music.tsx` carrega a lista com `useCachedCatalog` + `fetchAllAlbums` (`api/albums.ts`)
2. Filtros de status/artista/tipo/nota e paginação rodam **no cliente** (troca de aba instantânea)
3. Busca no catálogo: `lib/musicCatalog.ts` tenta Spotify (`lib/spotify.ts` → Edge `spotify-catalog`) e cai para MusicBrainz
4. Capas externas passam por proxies Vite/Vercel (`/spotify-media`, `/caa-media`, `/books-media`) para CORS e canvas do share
5. Opinião / track ratings persistem em `album.track_ratings` (jsonb) via `updateAlbum`

Cinema e Livros seguem o mesmo padrão de catálogo + cache + share card.

### Segurança e tenancy

- Toda tabela de usuário tem `user_id` + **RLS** (migrations `tenancy_rls` / hardening)
- Front usa só **Anon Key**; service role nunca no browser
- Escrita gated por trial/Pro (`app_access_enforce`)
- CORS das Edge Functions: origin de `SITE_URL` + localhost em dev (`supabase/functions/_shared/cors.ts`)

### Front: rotas e performance

- `routes.tsx` — React Router v7; app atrás de `ProtectedRoute`
- Landing (`/`) no grafo estático (sem waterfall de `React.lazy`); demais módulos em lazy
- First paint da home: shell HTML + CSS crítico; LCP (`/marketing/hub.webp`) com preload e sem `opacity: 0`
- Fontes latin-only; PWA registra o SW em idle
- Listas de Cinema/Livros/Música: cache em memória (`memoryCache` + `useCachedCatalog`) com revalidação
- Bundle budget em `npm run check:bundle`

### Backend: Supabase

| Peça | Papel |
|------|--------|
| Postgres + migrations | Schema versionado em `supabase/migrations/` |
| Auth | Google OAuth (+ e-mail via hook `auth-send-email`) |
| Storage | Capas manuais (`album-covers`), avatares, etc. |
| Edge Functions | Stripe, e-mails lifecycle/retenção/digest, `spotify-catalog`, `places-catalog`, convites de viagem |

---

## Stack

| Camada | Tecnologia |
|--------|------------|
| Front-end | React 19, TypeScript (strict), Vite 6 |
| Estilos/UX | Tailwind CSS, shadcn/ui (Radix), Lucide, Framer Motion |
| Gráficos | Recharts |
| Dados/Auth | Supabase JS |
| Tabelas | TanStack Table |
| Roteamento | React Router v7 |
| Testes | Vitest (unit) · Playwright (E2E) |
| CI | GitHub Actions + `npm run ci:local` |
| Deploy | Vercel (SPA + rewrites de proxy de mídia) |

---

## Estrutura do repositório

```
/public                 Assets estáticos (logo, marketing)
/e2e                    Playwright + helpers (auth, cleanup E2E*)
/scripts                ci-local, bundle budget, minify SW
/supabase
  ├─ migrations/        Schema / RLS / seeds (fonte da verdade)
  ├─ config.toml
  └─ functions/         stripe-*, spotify-catalog, places-catalog, e-mails, waitlist…
/src
  ├─ api/               Cliente Supabase por domínio
  ├─ domain/            Regras puras + testes
  ├─ components/        UI compartilhada
  ├─ hooks/
  ├─ layouts/
  ├─ lib/               Integrações (cinema, livros, música, share, billing…)
  ├─ pages/
  │   ├─ admin/         App autenticado (finance, movies, books, music, life…)
  │   └─ landing/       Marketing
  ├─ types/
  ├─ routes.tsx
  └─ main.tsx
```

---

## Rotas

| Rota | Tela |
|------|------|
| `/` | Landing |
| `/about` | Sobre |
| `/login` | Login |
| `/home` | Hub / dashboard geral |
| `/timeline` | Timeline |
| `/account` | Conta (plano, export, preferências de e-mail) |
| `/finance/*` | Dashboard, transações, recorrências, orçamento, categorias |
| `/movies` | Cinema |
| `/books` | Livros |
| `/music` | Música |
| `/habits` | Hábitos |
| `/goals` | Metas |
| `/places` | Lugares |
| `/travel` · `/travel/:id` | Viagens |
| `/car` | Veículos |
| `/terms` · `/privacy` | Legal |

Atalhos: **⌘K** busca global · sino de alertas · PWA após `npm run build`.

---

## Banco (migrations)

```bash
supabase db push
```

Gates importantes:

| Tema | Migration (prefixo) |
|------|---------------------|
| Tenancy + RLS | `20240101000100_tenancy_rls` |
| Categorias / billing / naturezas | `20240101000200` … `00400` |
| Cinema / veículos / viagens | `20240101000500` … `01100` |
| Security hardening | `20240101001200_security_hardening` |
| Gate trial/Pro | `20260723120000_app_access_enforce` |
| Retenção / digest / lifecycle e-mail | `20260725220000` … `20260727180000` |
| Hábitos kind + meta | `20260727143000_habit_kind_goal` |
| Livros | `20260728120000_books` (+ bookmark, notes, score) |
| Música (álbum + faixas + Spotify source) | `20260728160000_albums` … `20260728210000_album_source_spotify` |
| Cinema watching/abandoned | `20260728200000_movie_watching_abandoned` |
| Roteiro (link / reservado / categoria) | `20260804120000_improve_md_features` |
| Lugares geo + checklist de visita | `20260804200000_place_visit_geo` |
| N visitas por lugar | `20260811140000_place_visit_occurrences` |
| Quota Maps (Places / Routes / Weather) | `20260804210000` … `20260806120000_maps_google_providers` |

> Sem tenancy/RLS, o app filtra no cliente, mas o banco ainda pode vazar. Teste com **2 contas** (E2E RLS opcional).

---

## Começando

### Pré-requisitos

- **Node.js 20+**
- Projeto **Supabase** (URL + Anon Key)
- Opcionais: TMDB / OMDb (cinema), Google Books, Spotify (música), Google Places + Routes + Weather (lugares/roteiro/clima), Stripe, Resend

### Variáveis

```bash
cp .env.example .env
```

Mínimo para o app:

```bash
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=sua_anon_key
```

Catálogos (front):

```bash
VITE_TMDB_API_KEY=…          # Cinema pt-BR (recomendado)
VITE_OMDB_API_KEY=…          # fallback
VITE_GOOGLE_BOOKS_API_KEY=…  # Livros
```

**Música — secrets no Supabase (não no Vite):**

```bash
supabase secrets set SPOTIFY_CLIENT_ID=… SPOTIFY_CLIENT_SECRET=…
supabase functions deploy spotify-catalog
supabase db push
```

Fluxo: Client Credentials na Edge `spotify-catalog` → busca/capa/tracklist **sem login Spotify do usuário**. Fallback: MusicBrainz + Cover Art Archive (`/mb-api`, `/caa-media`). Capas Spotify: `/spotify-media`. Em Development Mode a cota é limitada; produção comercial precisa de Extended Quota. Depois de mudar proxies no Vite, reinicie `npm run dev`.

**Lugares / rotas / clima — secrets no Supabase (não no Vite):**

```bash
supabase secrets set \
  GOOGLE_MAPS_API_KEY=… \
  MAPS_QUOTA_ENFORCE=true \
  GOOGLE_PLACES_MONTHLY_LIMIT=9000 \
  GOOGLE_ROUTES_ESSENTIALS_MONTHLY_LIMIT=9000 \
  GOOGLE_ROUTES_PRO_MONTHLY_LIMIT=4500 \
  GOOGLE_WEATHER_MONTHLY_LIMIT=9000
supabase functions deploy places-catalog
supabase db push
```

Edge `places-catalog`: Google Places Autocomplete (New) + Routes + Weather. WALK/BICYCLE/TRANSIT usam cota Essentials; DRIVE com tráfego usa Pro. Cotas mensais fail-closed abaixo do free cap oficial. Ver `.env.example`.

### Instalar e rodar

```bash
npm install
npm run dev          # http://localhost:5173
npm run lint
npm run test         # Vitest
npm run test:e2e     # Playwright (precisa E2E_* + Supabase)
npm run build
npm run ci:local     # espelha o CI
```

**E2E:** os specs marcam dados com `E2E…` e fazem teardown por id (e restauram orçamento patchado). O sweep `description like E2E*` roda só no **global teardown** — não no cleanup por teste, para não apagar txs de specs paralelos na mesma conta. Ideal: conta dedicada (`E2E_EMAIL`).

---

## Billing (Stripe)

1. `supabase db push` (billing + `app_access_enforce`)
2. Price recorrente BRL no Stripe
3. Deploy: `stripe-checkout`, `stripe-portal`, `stripe-webhook` (`verify_jwt = false` no webhook)
4. Secrets: `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID_PRO`, `STRIPE_WEBHOOK_SECRET`, `SITE_URL`
5. Front: `VITE_STRIPE_PUBLISHABLE_KEY` · bypass: `VITE_BILLING_FORCE_PRO=true`

Assinatura mensal BR: **cartão** (PIX não cobre recorrência no Checkout).

### Ops interno (não é produto)

Console em `/ops` (fora do menu): conceder Pro / estender teste. Requer migration `trial_ends_at`, deploy da Edge `ops-admin` e secret `OPS_ADMIN_EMAILS` (csv). Allowlist só no servidor.

---

## E-mails

| Função | Uso |
|--------|-----|
| `auth-send-email` | Confirmação, magic link, reset (Auth Hook + Resend) |
| `welcome-email` | Welcome no primeiro acesso (JWT do usuário) |
| `lifecycle-email` | Welcome (fallback), trial, nudges (cron + `CRON_SECRET`) |
| `retention-d7-email` | Retorno D7 |
| `weekly-digest-email` | Digest semanal |
| `habit-reminder-email` / `trip-invite-email` / `waitlist-email` | Produto / growth |

Secrets comuns: `RESEND_API_KEY`, `RESEND_FROM`, `SITE_URL`, `CRON_SECRET`. Preferências na Conta.

---

## Autenticação

- Google OAuth (Supabase Auth) + e-mail quando o hook está ativo
- `ProtectedRoute` + `useAuth`
- Sem URL/Anon Key válidas o app falha cedo

---

## Deploy (Vercel)

1. Importar o repo
2. Env: `VITE_SUPABASE_*`, chaves de catálogo, Stripe publishable se cobrar
3. Build: `npm run build` · Output: `dist`
4. `vercel.json` — SPA rewrite + proxies de mídia + CSP + Permissions-Policy (`geolocation=(self)` para Places/roteiro; camera/mic bloqueados)
5. Deploy das Edge Functions no Supabase (Stripe / Spotify / places-catalog / e-mails)

> Só **Anon Key** no front. Nunca service role no browser.

---

## Qualidade

- TypeScript strict · ESLint
- `domain/**/__tests__` e `lib/__tests__` (Vitest)
- Playwright em `e2e/` com cleanup de dados de teste
- CI: `.github/workflows/ci.yml` · local: `npm run ci:local`

---

## Contribuição

1. Fork → branch `feat/…`
2. PR com o *porquê* da mudança
3. `npm run lint && npm run test && npm run build` verdes (ideal: `ci:local`)

Agentes de IA e revisão multidisciplinar: ver [`.cursor/AGENTS.md`](./.cursor/AGENTS.md) (ler [`.cursor/ARCHITECTURE.md`](./.cursor/ARCHITECTURE.md) antes de qualquer mudança; plano + aprovação antes de mudanças relevantes; manter este README sincronizado com o produto).
