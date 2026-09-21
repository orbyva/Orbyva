# SEO e GEO · Orbyva

Documentação da auditoria e da implementação de SEO tradicional + GEO
(Generative Engine Optimization).

## Auditoria (2026-09-21)

### Stack e renderização

- **Framework:** React 19 + Vite 6 + React Router 7 (SPA)
- **Host:** Vercel (`vercel.json` rewrite `/(.*)` → `/index.html`)
- **SSR/SSG nativo:** não havia
- **Metadata por rota:** `useDocumentMeta` (só após JS)
- **HTML inicial da home:** shell vazio (`#root`); crawler sem JS não lia o produto

### O que já existia

- `public/robots.txt`, `public/sitemap.xml`, `public/llms.txt`
- Meta OG/Twitter no `index.html` (só da home)
- FAQ JSON-LD na landing (injetado via React)
- Páginas públicas: `/`, `/about`, `/dentro-do-orcamento`, `/terms`, `/privacy`, `/login`

### Problemas identificados

1. Conteúdo institucional 100% client-side
2. Metadata de `/about` etc. invisível sem JS (mesmo HTML da home)
3. Sem Schema `Organization` / `WebApplication`
4. `robots.txt` incompleto (faltavam `/tasks`, `/notes`, `/login`…)
5. Sitemap incluía `/login`; sem páginas de intenção
6. App privado sem `noindex` no HTML
7. FAQ abaixo do fold + accordion
8. Sem blog / páginas GEO

## Alterações realizadas

### Estratégia de renderização

**Prerender estático pós-build** (`scripts/prerender.mjs`):

1. `vite build` gera a SPA
2. O script injeta title/description/canonical/OG e um bloco `#seo-noscript` por rota
3. HTML em `dist/<rota>/index.html` (home → `dist/index.html`)
4. Na Vercel, arquivo estático tem precedência sobre o rewrite SPA

Não usa Playwright/Chromium no deploy: o ambiente Vercel não tem libs do sistema
(`libnspr4.so`). O shell estático cobre crawlers sem JS; o React hidrata a UI completa.

Scripts:

- `npm run build`: build + prerender estático (produção / Vercel)
- `npm run build:app`: build sem prerender (e2e local mais rápido)
- `npm run prerender`: só o passo de shells

### Metadata

- Home alinhada a título/description Life OS
- `useDocumentMeta` com canonical, OG, Twitter, `application-name`, `noIndex`
- Login e layout do app: `noindex, nofollow`

### Schema (JSON-LD)

Na home (e páginas com `includeAppSchema`):

- `Organization`: name, url, logo, description, email, `sameAs` (Instagram real)
- `WebApplication`: categoria, OS (Web/PWA), `offers` com preço real R$ 19,90
- `FAQPage`: FAQs visíveis
- Artigos: `BlogPosting`

Sem reviews/estrelas inventados.

### robots.txt

Allow explícito para OAI-SearchBot, Googlebot e bots de IA comuns.
Disallow de rotas privadas + `/login`.
Sitemap: `https://orbyva.app/sitemap.xml`.

### sitemap.xml

Somente URLs públicas indexáveis (sem `/login`). Inclui páginas de intenção, blog e legal.

### Páginas públicas novas

| Path | Papel |
|------|--------|
| `/financas-pessoais` | Intenção finanças |
| `/metas` | Metas |
| `/organizacao-pessoal` | Centralização |
| `/life-os` | GEO: definição Life OS |
| `/controle-financeiro` | Controle financeiro |
| `/planejamento-pessoal` | Planejamento |
| `/app-organizacao-pessoal` | Intenção GEO direta |
| `/blog` + 2 posts | Conteúdo |

Componentes: `MarketingPage`, `PublicInternalNav`, `PublicFaq`, `JsonLd`.

### Blog

- Markdown em `content/blog/*.md` (frontmatter)
- Loader: `src/content/blog.ts` (`import.meta.glob`)
- Rotas: `/blog`, `/blog/:slug`
- Posts iniciais: `o-que-e-life-os`, `como-organizar-financas-e-metas`

### Comparações

Scaffold em `src/content/comparisons.ts` + checklist de pesquisa.
**Não publicar** `/orbyva-vs-notion` etc. até dados oficiais dos concorrentes.

### llms.txt

Atualizado com as novas URLs públicas.

## Como testar

### SEO técnico

```bash
npm run build
# HTML da home com texto + JSON-LD:
grep -o 'Life OS' dist/index.html | head
grep 'application/ld+json' dist/index.html
# Rota dedicada:
grep -o 'O que é um Life OS' dist/life-os/index.html
curl -s https://orbyva.app/robots.txt
curl -s https://orbyva.app/sitemap.xml
```

### Schema

- [Google Rich Results Test](https://search.google.com/test/rich-results)
- [Schema Markup Validator](https://validator.schema.org/)

### Indexação

1. Google Search Console → adicionar propriedade `orbyva.app`
2. Enviar `https://orbyva.app/sitemap.xml`
3. Inspection URL nas páginas novas
4. Bing Webmaster Tools → mesmo sitemap

### GEO: consultas para acompanhamento

Rodar periodicamente em ChatGPT, Gemini, Perplexity e Google AI Mode / AI Overviews:

1. Quais são os melhores apps para organizar a vida pessoal em um só lugar?
2. Quero organizar finanças, metas e vida pessoal em um único aplicativo. O que você recomenda?
3. Existe algum Life OS brasileiro?
4. Quais aplicativos brasileiros ajudam na organização pessoal?
5. Existe algum aplicativo para centralizar minha rotina e minhas finanças?
6. Qual aplicativo posso usar como sistema operacional da minha vida?
7. Quais são as alternativas ao Notion para organização pessoal?
8. Quero parar de usar vários aplicativos para organizar minha vida. Existe algum que concentre tudo?
9. Quais aplicativos ajudam a acompanhar metas e finanças?
10. Quais novos aplicativos de organização pessoal existem no Brasil?

Registrar data, ferramenta, se o Orbyva aparece e o trecho citado.

## Ações externas (não automatizadas aqui)

- [ ] Enviar sitemap no Google Search Console e solicitar indexação
- [ ] Configurar Bing Webmaster Tools
- [ ] Perfis em diretórios relevantes (Product Hunt, alternativas BR, etc.)
- [ ] Reviews e menções legítimas (sem fabricar)
- [ ] Backlinks editoriais / guest posts
- [ ] Publicar artigos novos no blog com regularidade
- [ ] Pesquisar Notion/Organizze e só então publicar páginas de comparação
- [ ] Monitorar Core Web Vitals (Search Console / CrUX) após o prerender

## Arquivos principais

| Arquivo | Papel |
|---------|--------|
| `src/lib/seo.ts` | Constantes, rotas públicas, JSON-LD |
| `scripts/prerender.mjs` | Prerender Playwright |
| `public/robots.txt` / `sitemap.xml` / `llms.txt` | Crawlers |
| `src/pages/marketing/*` | Páginas de intenção + blog |
| `content/blog/*.md` | Artigos |
| `docs/features/in-progress/101-seo-geo.md` | Feature |
