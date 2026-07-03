# FinTrack

Controle financeiro pessoal com **dashboard**, **transações**, **orçamento mensal**, **parcelas/recorrências**, **dimensões financeiras** e um módulo auxiliar de **filmes**.

Feito com **React 19 + TypeScript + Vite**, **Tailwind + shadcn/ui**, **Recharts**, **Framer Motion** e **Supabase** (auth e banco).

<p align="center">
  <img alt="FinTrack" src="public/logo.webp" width="120" />
</p>

---

## Recursos principais

### Dashboard
- KPIs de receita, despesa, saldo e **comprometido no mês** (parcelas em aberto)
- Gráficos de tendência e distribuição por tipo (Receita/Despesa)
- Transações do mês filtradas por natureza
- **Alertas de vencimento** (atrasadas e próximas) com link para Recorrências

### Transações
- CRUD completo com classificação por Dimensões (Tipo/Classe)
- **Busca e filtros no servidor** (descrição, Receita/Despesa)
- Paginação com total de páginas
- Formatação monetária brasileira (`R$ 1.234,56`)

### Recorrências / Parcelas
- Cadastro com **dia de vencimento**, **quantidade de parcelas** e **início do pagamento**
- Progresso visual de parcelas pagas/em aberto
- **Marcar parcela como paga** → cria transação automaticamente
- **Desfazer pagamento** → remove a transação vinculada
- Filtros rápidos: Todas, Em aberto, Pagas, Vencendo em breve, Atrasadas
- Alertas compactos agrupados por data de vencimento

### Orçamento mensal
- Planejado, gasto, restante e status (OK, Atenção, Crítico, Estourou)
- Alertas de estouro por tipo/classe
- Duplicação de orçamento entre meses
- Sugestões por média histórica (RPC Supabase)

### Dimensões
- **Tipos** (cor, ícone Lucide, natureza Receita/Despesa)
- **Classes** (subcategorias vinculadas a um tipo)

### Filmes
- Lista para assistir / assistidos
- Busca e cadastro via **OMDb API**
- Paginação server-side

### UI/UX
- **Dark mode** com roxo como cor principal
- Sidebar lateral, cards, tabelas, modais e tooltips em ações
- Estados vazios, loading skeletons e confirmação para ações destrutivas
- Formulários padronizados (labels com `*`, placeholders, Salvar/Salvar Alterações)

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

/scripts                    # SQL para rodar no Supabase (ver seção abaixo)
  ├─ add_recurring_due_day.sql
  ├─ add_parcel_transaction_link.sql
  ├─ normalize_recurring_status.sql
  ├─ add_performance_indexes.sql
  └─ rls_policies.sql

/src
  ├─ api/                   # I/O Supabase por domínio (finance, recurring, movies)
  ├─ domain/                # Regras de negócio puras (parcelas, alertas, filtros)
  │   └─ recurring/
  ├─ components/            # UI compartilhada (PageShell, EmptyState, ErrorBoundary, ui/)
  ├─ hooks/                 # useAuth, useDimensions, useTransactions, etc.
  ├─ layouts/               # AdminLayout, DefaultLayout
  ├─ lib/                   # supabase, currency (formatBRL), errors, utils
  ├─ pages/
  │   ├─ admin/home/        # Dashboard
  │   ├─ admin/finance/     # Transações, Recorrências, Orçamento, Dimensões
  │   ├─ admin/movies/      # Filmes
  │   └─ admin/Login.tsx
  ├─ types/                 # Tipagens por domínio + dimensions, pagination
  ├─ routes.tsx
  ├─ ProtectedRoute.tsx
  └─ main.tsx
```

---

## Rotas

| Rota | Tela |
|------|------|
| `/` | Dashboard |
| `/finance/transactions` | Transações |
| `/finance/recurring` | Recorrências / Parcelas |
| `/finance/budget` | Orçamento |
| `/finance/dimensions` | Dimensões |
| `/finance/dashboard` | Dashboard (alternativa) |
| `/movies` | Filmes |
| `/login` | Login (Google OAuth) |

---

## Modelo de dados (Supabase)

### Tabelas principais

| Tabela | Descrição |
|--------|-----------|
| `nature` | Natureza (Receita / Despesa) |
| `type` | Tipos (nome, cor, ícone, natureza, ordem) |
| `class` | Classes (pertencem a um `type`) |
| `transaction` | Transações avulsas |
| `recurring_transaction` | Recorrências e parcelamentos |
| `monthly_budget` | Orçamento mensal por tipo/classe |
| `movie` | Catálogo pessoal de filmes |

### Colunas relevantes em `recurring_transaction`

- `due_day` — dia do mês de vencimento (1–31)
- `installment_count` — quantidade de parcelas
- `payment_start_date` — mês/ano da primeira parcela
- `paid_parcels` — array JSON com números das parcelas pagas
- `status` — `true` (ativo) / `false` (excluído logicamente)

### Colunas relevantes em `transaction`

- `recurring_transaction_id` — FK para recorrência (tipo **BIGINT** no schema atual)
- `installment_number` — parcela que originou a transação

### Views e RPC

- `vw_recurring_transaction_with_nature`
- `vw_value_by_nature_year_month`
- `vw_monthly_budget_summary`
- `get_monthly_budget_suggestions` (RPC)

> O schema completo fica no seu projeto Supabase. Os scripts em `/scripts` complementam tabelas já existentes.

---

## Scripts SQL (Supabase)

Execute **um por vez** no **SQL Editor** do Supabase, na ordem abaixo:

| Script | Obrigatório | Descrição |
|--------|-------------|-----------|
| `add_recurring_due_day.sql` | Se ainda não rodou | Dia de vencimento, parcelas e início do pagamento |
| `add_parcel_transaction_link.sql` | **Sim** | Vínculo parcela ↔ transação (desfazer pagamento) |
| `normalize_recurring_status.sql` | Recomendado | Normaliza `status` legado para boolean |
| `add_performance_indexes.sql` | Opcional | Índices para consultas frequentes |
| `rls_policies.sql` | Opcional | RLS multi-usuário — **só se** houver `user_id` nas tabelas |

**Nota:** `recurring_transaction.id` é **BIGINT** (não UUID). O script de vínculo já reflete isso.

---

## Começando

### Pré-requisitos

- **Node.js 20+** (recomendado)
- Conta no **Supabase** (URL + Anon Key)
- Chave **OMDb** (opcional, módulo Filmes)

### Variáveis de ambiente

Copie `.env.example` para `.env`:

```bash
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=sua_anon_key
VITE_OMDB_API_KEY=sua_chave_omdb   # opcional — Filmes
```

### Instalar e rodar

```bash
npm install
npm run dev
# http://localhost:5173
```

### Build, testes e lint

```bash
npm run lint
npm run test          # Vitest — regras de parcelas, moeda, filtros
npm run build
npm run preview       # preview do build
npm run start         # serve /dist em produção local
```

---

## Autenticação

- Login exclusivo via **Google OAuth** (Supabase Auth)
- Rotas protegidas por `ProtectedRoute` + `useAuth`
- Variáveis Supabase obrigatórias — app falha cedo se não configuradas (`src/lib/supabase.ts`)

---

## Fluxo de uso

1. **Login** com Google
2. **Dashboard** — visão geral, alertas de vencimento, comprometido no mês
3. **Dimensões** — cadastre Tipos e Classes
4. **Transações** — lance movimentações do dia a dia
5. **Orçamento** — planeje e acompanhe estouros
6. **Recorrências** — cadastre parcelas, marque pagamentos, use filtros
7. **Filmes** — organize sua watchlist

---

## Deploy (Vercel)

1. Importe o repositório na Vercel
2. **Environment Variables:**
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_OMDB_API_KEY` (se usar Filmes)
3. **Build Command:** `npm run build` · **Output:** `dist`
4. `vercel.json` inclui rewrite SPA (`/(.*) → /index.html`)

> Use apenas a **Anon Key** no front-end. Nunca exponha a service role key.

---

## Qualidade e arquitetura

- **TypeScript** strict, sem `any` desnecessário
- **Camada `domain/`** — regras financeiras testáveis (parcelas, alertas, filtros)
- **Camada `api/`** — apenas acesso ao Supabase
- **Componentes compartilhados** — `formatBRL`, `EmptyState`, `ActionTooltip`, `FormSection`, `ErrorBoundary`
- **CI** — `.github/workflows/ci.yml` roda lint, testes e build em PR/push
- **ESLint** + **Vitest** configurados

---

## Roadmap

- [ ] Validação de formulários com Zod
- [ ] Exportação CSV
- [ ] Projeção financeira 3–6 meses
- [ ] RLS completo com `user_id` em todas as tabelas
- [ ] Testes E2E (Playwright)
- [ ] Tema claro opcional (hoje: dark mode fixo)

---

## Contribuição

1. Fork do repositório
2. Branch: `feat/minha-feature`
3. PR com descrição das mudanças
4. Garanta `npm run lint && npm run test && npm run build` verdes

---
