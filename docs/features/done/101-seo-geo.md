---
prompt: |
  Melhorar significativamente o SEO tradicional e o GEO do Orbyva (orbyva.app):
  auditoria, landing indexável, metadata, Schema.org, robots, sitemap, páginas
  públicas de intenção, blog, página GEO, comparações (estrutura), semântica,
  internal linking, FAQ, llms.txt, docs/SEO-GEO.md — sem redesenhar o produto
  nem expor dados privados. Abordagem A: prerender pós-build com Playwright.
---

# 101 — SEO e GEO

## Contexto
A home é uma SPA Vite: crawlers sem JS não veem o produto. Metadata por rota é
client-only. Faltam páginas de intenção, Schema de Organization/WebApplication
e cobertura completa de robots para rotas privadas.

## Decisões
- Prerender pós-build com Playwright (não migrar para Next/Vike).
- Blog em Markdown estático (`content/blog/`) + `react-markdown`.
- Comparações: estrutura + documentação; sem claims inventados sobre concorrentes.
- Preço/planos só a partir de `PLANS` / `BRAND`.
- `/login` com noindex e fora do sitemap.

## Tarefas
- [x] Lib SEO + robots/sitemap/llms + metadata base
- [x] Landing indexável + Schema Organization/WebApplication + FAQ visível
- [x] Páginas públicas de intenção + GEO + internal linking
- [x] Blog (infra + 2 artigos) + Article JSON-LD
- [x] Scaffold comparações + noindex no app privado
- [x] Script prerender + build hook
- [x] docs/SEO-GEO.md + verificação build/lint/test

## Prompts
- 2026-09-21 — Pedido completo de auditoria + implementação SEO/GEO (16 itens).
- 2026-09-21 — Aprovação da abordagem A (prerender Playwright).

## Notas
- Feature criada já em in-progress após aprovação do design em chat.
- Prerender estático (sem Playwright) para funcionar na Vercel; Playwright quebrava por falta de `libnspr4.so`.
- Comparações Notion/Organizze ficam só em scaffold até pesquisa factual.
- `npm run build:app` = build sem prerender (e2e local); `npm run build` inclui prerender estático.
