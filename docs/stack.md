# Stack — Orbyva

Decisões fixas do projeto. Muda raramente — não é aqui que fica o estado de uma feature (isso vai em `docs/features/`).

## Tech

- React 19 + TypeScript strict, Vite 6
- React Router 7
- Supabase (Postgres + Auth) — RLS estritamente por `user_id` em toda tabela nova
- Tailwind 3 + shadcn/ui (Radix)
- Vitest para testes de domínio; Playwright para e2e (`npm run test:e2e`)
- Cliente nativo: Expo em `mobile/`, mesmo Supabase

## Comandos

- `npm run dev` — dev server (Vite)
- `npm run build` — `tsc -b && vite build`
- `npm run lint` — ESLint
- `npm test` — Vitest (`npm run test:watch` para watch mode)
- `npm run test:e2e` — Playwright

## Padrão de camadas (módulos de domínio)

`supabase/migrations` (schema + RLS) → `src/types/<módulo>.ts` (contratos) → `src/domain/<módulo>/*` (regras puras, testáveis com Vitest, sem I/O) → `src/api/<módulo>/*` (I/O Supabase, chama `domain/<módulo>` quando precisa de lógica) → `src/pages/admin/<módulo>/*` (UI) → registro em `src/routes.tsx` + grupo de navegação em `src/components/app-sidebar.tsx` se for módulo novo.

Migrations são nomeadas `YYYYMMDDHHMMSS_slug.sql` — nunca duas com o mesmo timestamp (já causou um bug real de bookkeeping do Supabase CLI). `supabase db push` aplica ao banco remoto (não há Supabase local neste projeto) — sempre confirmar com o usuário antes de rodar, é uma alteração no banco em produção/dev compartilhado.

## Convenções de UI

- `PageShell`, `EmptyState`, `ConfirmDeleteDialog`, `TableLoadingSkeleton` — componentes compartilhados, seguir o padrão já usado em `Goals.tsx`/`Habits.tsx` para páginas novas.
- Toda mutação usa `useToast` (`@/hooks/use-toast`) + `getErrorMessage` (`@/lib/errors`) para erros amigáveis.
- Cor de módulo nova → `moduleColors` em `src/lib/design-tokens.ts` + variável CSS em `src/index.css` (light e dark).

## Deploy

- `npm run start` serve o build (`serve -s dist`) — via `scripts/ci-local.sh` para checagem local pré-deploy.
