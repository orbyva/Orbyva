# SEO + GEO · Orbyva (design)

**Data:** 2026-09-21  
**Aprovado:** abordagem A (prerender pós-build com Playwright)

## Objetivo

Tornar páginas públicas indexáveis por Google e mecanismos generativos (ChatGPT, Gemini, Perplexity), sem redesenhar o produto nem expor dados privados.

## Contexto técnico

- SPA Vite + React Router + Vercel (rewrite → `index.html`)
- Sem SSR nativo; metadata por rota hoje só via `useDocumentMeta` (client)
- Preço real: 7 dias grátis → Pro R$ 19,90/mês (`src/lib/plan.ts`)
- Rede oficial: Instagram `@orbyva`

## Arquitetura

1. Páginas públicas React (Markdown para blog) com conteúdo semântico no DOM.
2. Pós-build: Playwright visita rotas públicas e grava `dist/<rota>/index.html` (Vercel serve estático antes do rewrite).
3. Flag de prerender força landing a pintar below-the-fold e pular handoff.
4. Rotas privadas: `noindex, nofollow` + `Disallow` em robots.
5. Comparações: componentes + doc; páginas públicas só com fatos verificáveis.

## Fora de escopo

Redesign visual, mudança de billing, CMS, migração para Next/Vike.
