# Orbyva

**Tudo da sua vida em uma só órbita** — finanças, metas, hábitos, viagens, lugares, veículos e cinema num só lugar.

Feito com **React 19 + TypeScript + Vite**, **Tailwind + shadcn/ui**, **Recharts**, **Framer Motion** e **Supabase** (auth, banco e Edge Functions).

<p align="center">
  <img alt="Orbyva" src="public/logo.webp" width="120" />
</p>

---

## Módulos

### Início
- **Landing** (`/`) — life OS, planos (teste 7 dias → Pro), waitlist
- **Dashboard geral** (`/home`) — resumo de metas, hábitos, viagens, saldo e alertas
- **Timeline** (`/timeline`) — eventos agregados de todos os módulos

### Finanças
- **Dashboard** (`/finance/dashboard`) — KPIs, gráficos e alertas de vencimento
- **Transações** — CRUD com dimensões (Tipo/Classe), busca e paginação
- **Parcelas** — valor total dividido automaticamente; marcar/desfazer pagamento
- **Orçamento mensal** — planejado vs gasto, alertas e duplicação entre meses
- **Dimensões** — tipos e classes com cor e ícone

### Vida
- **Metas** (`/goals`) — progresso, categorias e prazos
- **Hábitos** (`/habits`) — streak e progresso semanal
- **Lugares** (`/places`) — avaliar restaurantes, cafés, passeios etc.
- **Viagens** (`/travel`) — checklist, roteiro, gastos, lugares e prazos (`/travel/:id`)

### Cinema
- **Cinema** (`/movies`) — watchlist, opinião (nota 0–10 + comentário + recomendação), compartilhar card e import CSV (Letterboxd / TV Time)

### Carro / Moto
- **Veículos** (`/car`) — manutenções, abastecimentos, documentos e alertas (carro ou moto)

---

## Stack

| Camada | Tecnologia |
|--------|------------|
| Front-end | React 19, TypeScript, Vite 6 |
| Estilos/UX | Tailwind CSS, shadcn/ui (Radix), Lucide Icons, Framer Motion |
| Gráficos | Recharts |
| Dados/Auth | Supabase (`@supabase/supabase-js`) |
| Tabelas | TanStack Table |
| Roteamento | React Router v7 (rotas protegidas + lazy loading) |
| Testes | Vitest |
| CI | GitHub Actions (lint, test, build) |
| Deploy | Vercel (SPA) |

---

## Estrutura do projeto

```
/public
  └─ logo.webp, placeholder.svg

/scripts                    # SQL para rodar no Supabase (ver scripts/README.md)
  ├─ README.md               # ordem de execução
  ├─ tenancy_rls.sql         # P0: user_id + RLS + excluir conta
  ├─ dimensions_tenancy.sql  # tipos/classes por usuário
  ├─ billing.sql             # teste 7d / Pro + waitlist
  ├─ seed_natures.sql
  ├─ movies_opinion.sql
  ├─ vehicle_kind.sql
  ├─ fuel_log_transaction.sql
  ├─ shared_trips.sql
  ├─ shared_trips_invite_fix.sql
  └─ trip_activity_author.sql

/src
  ├─ api/                   # I/O Supabase por domínio
  ├─ domain/                # Regras de negócio puras (testáveis)
  ├─ components/            # UI compartilhada
  ├─ hooks/
  ├─ layouts/
  ├─ lib/
  ├─ pages/admin/           # Páginas por módulo
  ├─ types/
  ├─ routes.tsx
  └─ main.tsx

/supabase
  ├─ config.toml
  └─ functions/             # stripe-* (billing)
```

---

## Rotas

| Rota | Tela |
|------|------|
| `/` | Landing (life OS + planos; trial→Pro se Stripe, senão waitlist) |
| `/home` | Dashboard geral (app) |
| `/timeline` | Timeline unificada |
| `/goals` | Metas |
| `/habits` | Hábitos |
| `/places` | Lugares |
| `/travel` | Viagens |
| `/travel/:id` | Detalhe da viagem |
| `/finance/dashboard` | Dashboard financeiro |
| `/finance/transactions` | Transações |
| `/finance/recurring` | Parcelas |
| `/finance/budget` | Orçamento |
| `/finance/dimensions` | Dimensões |
| `/movies` | Filmes |
| `/car` | Veículos (carro / moto) |
| `/account` | Conta (plano, export, sair, excluir) |
| `/terms` | Termos de uso |
| `/privacy` | Privacidade / LGPD |
| `/login` | Login (Google OAuth) |

Atalhos: **⌘K** busca global · sino no header para alertas · PWA instalável após `npm run build`.


---

## Scripts SQL (Supabase)

Execute **um por vez** no **SQL Editor** do Supabase (detalhe em `scripts/README.md`):

| Ordem | Script | Descrição |
|-------|--------|-----------|
| 1 | `tenancy_rls.sql` | **Obrigatório** — `user_id` + RLS + RPC excluir conta |
| 2 | `dimensions_tenancy.sql` | Tipos/classes por usuário |
| 3 | `billing.sql` | `profiles` (teste 7 dias → Pro) + `waitlist` |
| 4 | `seed_natures.sql` | Naturezas Receita/Despesa (onboarding) |
| 5 | `movies_opinion.sql` | Colunas de opinião em `movie` |
| 6 | `vehicle_kind.sql` | Coluna `kind` em `vehicle` |
| 7 | `fuel_log_transaction.sql` | `transaction_id` em `vehicle_fuel_log` |
| 8 | `shared_trips.sql` | Viagem compartilhada (membros, convites, opiniões, splits) |
| 9 | `shared_trips_invite_fix.sql` | Aceite de convite + policies |
| 10 | `trip_activity_author.sql` | Autor da atividade no itinerário |
| 11 | **`security_hardening.sql`** | **Obrigatório** — trava Pro no profiles, convites, roles, despesas |

> Rode `tenancy_rls.sql` antes de convidar outro usuário. Sem isso, o app filtra no cliente, mas o banco ainda pode vazar dados. Depois teste com **2 contas Google**.
> Para planejar viagem juntos, rode também `shared_trips.sql` → `shared_trips_invite_fix.sql`.
> Se você já rodou 1–10 antes, rode **`security_hardening.sql`** agora — fecha bypass de Pro e leaks de convite.

**Funil de conversão:** com `VITE_STRIPE_PUBLISHABLE_KEY` a landing vende **7 dias → Assinar Pro**; sem a chave, vende só **waitlist** (sem misturar as duas histórias).

---

## Começando

### Pré-requisitos

- **Node.js 20+**
- Conta no **Supabase** (URL + Anon Key)
- Chave **OMDb** (opcional — módulo Filmes)

### Variáveis de ambiente

Copie `.env.example` para `.env` (o `.env` **não** vai para o git):

```bash
cp .env.example .env
```

```bash
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=sua_anon_key
VITE_TMDB_API_KEY=sua_chave_tmdb   # Cinema em pt-BR (recomendado)
VITE_OMDB_API_KEY=sua_chave_omdb   # fallback opcional
```

Chave TMDB: [themoviedb.org/settings/api](https://www.themoviedb.org/settings/api) (API Key v3).

### Billing (opcional — Stripe depois)

1. Rode `scripts/billing.sql` (ou migrations)
2. **P0 acesso:** rode `scripts/app_access_enforce.sql` (bloqueia escrita sem trial/Pro)
3. Crie um Price recorrente no Stripe e anote o `price_...`
4. Deploy: `stripe-checkout`, `stripe-portal`, `stripe-webhook`
5. Secrets: `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID_PRO`, `STRIPE_WEBHOOK_SECRET`, `SITE_URL`
6. Front: `VITE_STRIPE_PUBLISHABLE_KEY`
7. Dev / bypass do teste: `VITE_BILLING_FORCE_PRO=true`

Analytics: `VITE_POSTHOG_KEY` (+ opcional `VITE_POSTHOG_HOST`).  
Sentry: `VITE_SENTRY_DSN` (opcional).

Migrations versionadas: ver `supabase/migrations/` e `scripts/README.md`.

### Instalar e rodar

```bash
npm install
npm run dev
# http://localhost:5173
```

### Build, testes e lint

```bash
npm run lint
npm run test
npm run build
npm run preview
npm run start         # serve /dist em produção local
```

---

## Autenticação

- Login via **Google OAuth** (Supabase Auth)
- Rotas protegidas por `ProtectedRoute` + `useAuth`
- Variáveis Supabase obrigatórias — app falha cedo se não configuradas

---

## Deploy (Vercel)

1. Importe o repositório na Vercel
2. **Environment Variables:**
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_TMDB_API_KEY` (Cinema em pt-BR)
   - `VITE_OMDB_API_KEY` (fallback opcional)
3. **Build Command:** `npm run build` · **Output:** `dist`
4. Deploy das Edge Functions Stripe quando for cobrar (opcional)

> Use apenas a **Anon Key** no front-end. Nunca exponha a service role key.

---

## Segurança

- `.env` está no `.gitignore` — use sempre `.env.example` como referência
- Se alguma chave foi exposta no git, **rotacione** no Supabase/OMDb/Stripe
- `supabase/.temp/` (cache local do CLI) também é ignorado

---

## Qualidade

- TypeScript strict
- Camada `domain/` com regras testáveis (parcelas, alertas, carro, etc.)
- CI em `.github/workflows/ci.yml` — lint, testes e build

---

## Contribuição

1. Fork do repositório
2. Branch: `feat/minha-feature`
3. PR com descrição das mudanças
4. Garanta `npm run lint && npm run test && npm run build` verdes
