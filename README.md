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

/scripts                    # Utilitários locais (bundle budget, minify SW, ci:local)
/supabase
  ├─ migrations/            # Schema / RLS / seeds — fonte da verdade do banco
  ├─ config.toml
  └─ functions/             # stripe-*, retention, digest

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

## Banco (Supabase migrations)

A fonte da verdade é `supabase/migrations/`. Aplique com o CLI (projeto linkado):

```bash
supabase db push
```

Ou cole a migration desejada no **SQL Editor** do Dashboard.

Principais gates (já versionados nas migrations):

| Tema | Migration (prefixo) |
|------|---------------------|
| Tenancy + RLS | `20240101000100_tenancy_rls` |
| Dimensões por usuário | `20240101000200_dimensions_tenancy` |
| Billing / waitlist | `20240101000300_billing` |
| Naturezas (Receita/Despesa/Investimento) | `20240101000400_seed_natures` (+ investimento) |
| Cinema / veículos / viagens | `20240101000500` … `20240101001100` |
| Security hardening | `20240101001200_security_hardening` |
| Gate trial/Pro (escritas) | `20260723120000_app_access_enforce` |
| Retenção D7 / digest | `20260725220000_retention_d7`, `20260726220000_weekly_digest` |
| Hábitos kind + meta | `20260727143000_habit_kind_goal` |

> Sem tenancy/RLS, o app filtra no cliente, mas o banco ainda pode vazar. Teste com **2 contas**.
> **Funil:** com `VITE_STRIPE_PUBLISHABLE_KEY` a landing vende **7 dias → Pro**; sem a chave, só **waitlist**.

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

### Billing (Stripe)

1. Aplique as migrations (`supabase db push`) — billing + **`app_access_enforce`**
2. Crie um Price recorrente (`price_...`, BRL) no Stripe
3. Deploy: `stripe-checkout`, `stripe-portal`, `stripe-webhook`  
   (`stripe-webhook` usa `verify_jwt = false` — Stripe não manda JWT)
4. Secrets: `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID_PRO`, `STRIPE_WEBHOOK_SECRET`, `SITE_URL` (`https://orbyva.app`)
5. Front: `VITE_STRIPE_PUBLISHABLE_KEY` (mesmo modo Test/Live da secret key)
6. Dev / bypass: `VITE_BILLING_FORCE_PRO=true`

**Live:** cobrança real só com **Cards Active** no Dashboard (conta verificada). Enquanto *Payments paused* / Cards *Pending approval*, o Checkout falha.

**PIX:** assinatura mensal no Stripe BR usa **cartão**; PIX não cobre recorrência — o checkout pede só `card`.

**Prod checklist:** `app_access_enforce` aplicado; secrets setados; webhook Live apontando para `/functions/v1/stripe-webhook`; `SITE_URL` = domínio público; CORS das edges = origin do `SITE_URL`.

**Migrations gate:** em produção, confirme tenancy → billing → security_hardening → app_access_enforce → retention. Sem tenancy/hardening, RLS e Pro não estão seguros.
Analytics: `VITE_POSTHOG_KEY` (+ opcional `VITE_POSTHOG_HOST`).  
Sentry: `VITE_SENTRY_DSN` (opcional).

### Retenção D7 (server + e-mail)

1. Migration `20260725220000_retention_d7` aplicada
2. Conta no [Resend](https://resend.com) + domínio `orbyva.app` verificado
3. Deploy: `supabase functions deploy retention-d7-email`
4. Secrets: `CRON_SECRET`, `RESEND_API_KEY`, `RESEND_FROM` (`Orbyva <noreply@orbyva.app>`), `SITE_URL`  
   Opcional: `POSTHOG_API_KEY` (+ `POSTHOG_HOST`) para evento `retention_email_sent`
5. Cron diário (Dashboard → Edge Functions → Schedules, ou GitHub Action):

```bash
curl -X POST "$SUPABASE_URL/functions/v1/retention-d7-email" \
  -H "Authorization: Bearer $CRON_SECRET"
```

Quem abre o app atualiza `profiles.last_seen_at` (RPC). O cron e-maila quem tem 7–14 dias de conta, inativo há 5+ dias, e ainda não recebeu o retorno.

### Digest semanal (e-mail)

1. Migration `20260726220000_weekly_digest` aplicada
2. Deploy: `supabase functions deploy weekly-digest-email`
3. Mesmos secrets Resend/Cron do D7
4. Cron semanal (ex.: segunda):

```bash
curl -X POST "$SUPABASE_URL/functions/v1/weekly-digest-email" \
  -H "Authorization: Bearer $CRON_SECRET"
```

Schema novo = só migrations em `supabase/migrations/` (`supabase db push`).

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
npm run check:bundle   # orçamento gzip dos chunks
npm run ci:local       # espelha o CI (lint → test → build → lhci → e2e)
npm run preview
npm run start          # serve /dist em produção local
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
