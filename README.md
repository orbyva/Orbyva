# FinTrack

Gerenciador pessoal com **finanças**, **metas**, **hábitos**, **casa**, **viagens**, **lugares**, **carro**, **filmes** e **assistente IA**.

Feito com **React 19 + TypeScript + Vite**, **Tailwind + shadcn/ui**, **Recharts**, **Framer Motion** e **Supabase** (auth, banco e Edge Functions).

<p align="center">
  <img alt="FinTrack" src="public/logo.webp" width="120" />
</p>

---

## Módulos

### Início
- **Dashboard geral** (`/`) — resumo de metas, hábitos, viagens, saldo e alertas
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
- **Casa** (`/home`) — manutenções com alertas de vencimento
- **Viagens** (`/travel`) — checklist, roteiro, gastos, lugares e prazos (`/travel/:id`)

### Cinema
- **Filmes** (`/movies`) — watchlist com busca via OMDb API

### Carro
- **Meu Carro** (`/car`) — manutenções, abastecimentos, documentos e alertas

### Assistente IA
- Chat integrado (Edge Function `fintrack-agent`) com Groq ou Gemini
- Propostas de transação/parcela com confirmação do usuário

---

## Stack

| Camada | Tecnologia |
|--------|------------|
| Front-end | React 19, TypeScript, Vite 6 |
| Estilos/UX | Tailwind CSS, shadcn/ui (Radix), Lucide Icons, Framer Motion |
| Gráficos | Recharts |
| Dados/Auth | Supabase (`@supabase/supabase-js`) |
| Assistente | Supabase Edge Functions (Deno) |
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

/scripts                    # SQL para rodar no Supabase (ver seção abaixo)
  ├─ agent_tables.sql
  ├─ car_tables.sql
  ├─ life_tables.sql
  └─ places_travel_expand.sql

/src
  ├─ api/                   # I/O Supabase por domínio
  ├─ domain/                # Regras de negócio puras (testáveis)
  ├─ components/            # UI compartilhada + agent/
  ├─ hooks/
  ├─ layouts/
  ├─ lib/
  ├─ pages/admin/           # Páginas por módulo
  ├─ types/
  ├─ routes.tsx
  └─ main.tsx

/supabase
  ├─ config.toml
  └─ functions/fintrack-agent/   # Edge Function do assistente
```

---

## Rotas

| Rota | Tela |
|------|------|
| `/` | Dashboard geral |
| `/timeline` | Timeline unificada |
| `/goals` | Metas |
| `/habits` | Hábitos |
| `/places` | Lugares |
| `/home` | Casa |
| `/travel` | Viagens |
| `/travel/:id` | Detalhe da viagem |
| `/finance/dashboard` | Dashboard financeiro |
| `/finance/transactions` | Transações |
| `/finance/recurring` | Parcelas |
| `/finance/budget` | Orçamento |
| `/finance/dimensions` | Dimensões |
| `/movies` | Filmes |
| `/car` | Carro |
| `/login` | Login (Google OAuth) |

---

## Scripts SQL (Supabase)

Execute **um por vez** no **SQL Editor** do Supabase, nesta ordem:

| Script | Descrição |
|--------|-----------|
| `agent_tables.sql` | Tabelas do assistente IA (auditoria e ações pendentes) |
| `car_tables.sql` | Veículo, manutenções, abastecimentos e documentos |
| `life_tables.sql` | Metas, hábitos, casa e viagens (básico) |
| `places_travel_expand.sql` | Lugares, gastos, roteiro e prazos de viagem |

> O schema financeiro e de filmes já deve existir no seu projeto Supabase. Os scripts acima criam os módulos novos.

---

## Começando

### Pré-requisitos

- **Node.js 20+**
- Conta no **Supabase** (URL + Anon Key)
- Chave **OMDb** (opcional — módulo Filmes)
- Chave **Groq** ou **Gemini** (opcional — assistente IA, configurada na Edge Function)

### Variáveis de ambiente

Copie `.env.example` para `.env` (o `.env` **não** vai para o git):

```bash
cp .env.example .env
```

```bash
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=sua_anon_key
VITE_OMDB_API_KEY=sua_chave_omdb   # opcional
```

As variáveis do assistente (`GROQ_API_KEY`, `GEMINI_API_KEY`, etc.) ficam nos **secrets da Edge Function** no Supabase, não no front-end.

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
   - `VITE_OMDB_API_KEY` (se usar Filmes)
3. **Build Command:** `npm run build` · **Output:** `dist`
4. Deploy da Edge Function: `supabase functions deploy fintrack-agent`

> Use apenas a **Anon Key** no front-end. Nunca exponha a service role key.

---

## Segurança

- `.env` está no `.gitignore` — use sempre `.env.example` como referência
- Se alguma chave foi exposta no git, **rotacione** no Supabase/OMDb/Groq/Gemini
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
