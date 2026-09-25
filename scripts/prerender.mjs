/**
 * Pós-build: gera HTML estático por rota pública em dist/
 * (Vercel serve o arquivo antes do rewrite SPA).
 *
 * Não usa Playwright/Chromium: na Vercel faltam libs do sistema (libnspr4.so).
 * Injeta title/description/canonical/OG + bloco textual indexável.
 *
 * Uso: node scripts/prerender.mjs  (após vite build)
 */
import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const dist = path.join(root, "dist");
const SITE = "https://orbyva.app";
const OG_IMAGE = `${SITE}/marketing/hub.png`;

/** @typedef {{ path: string, title: string, description: string, h1: string, lead: string, links?: { href: string, label: string }[] }} SeoRoute */

/** @type {SeoRoute[]} */
const ROUTES = [
  {
    path: "/",
    title: "Orbyva · Organize finanças, metas e sua vida em um só lugar",
    description:
      "O Orbyva é um Life OS brasileiro para organizar finanças pessoais, metas e planejamento da vida em uma única plataforma.",
    h1: "Organize finanças, metas e vida pessoal em um só lugar",
    lead: "O Orbyva é um Life OS brasileiro e aplicativo de organização pessoal para organizar finanças pessoais, metas e planejamento da vida em uma única plataforma.",
    links: [
      { href: "/life-os", label: "O que é um Life OS?" },
      { href: "/financas-pessoais", label: "Finanças pessoais" },
      { href: "/metas", label: "Metas" },
      { href: "/organizacao-pessoal", label: "Organização pessoal" },
      { href: "/app-organizacao-pessoal", label: "Aplicativo de organização pessoal" },
      { href: "/blog", label: "Blog" },
    ],
  },
  {
    path: "/financas-pessoais",
    title: "Finanças pessoais · Orbyva",
    description:
      "Organize finanças pessoais no Orbyva: teto de gastos, contas, parcelas e planejamento do mês no mesmo Life OS.",
    h1: "Organize suas finanças pessoais com o Orbyva",
    lead: "O Orbyva é um Life OS brasileiro que coloca o controle financeiro no centro da organização pessoal: teto por categoria, contas, parcelas e visão do mês, junto de metas e planejamento da vida.",
  },
  {
    path: "/metas",
    title: "Metas pessoais · Orbyva",
    description:
      "Transforme objetivos em metas acompanháveis no Orbyva, com progresso junto das finanças e do planejamento pessoal.",
    h1: "Transforme seus objetivos em metas acompanháveis",
    lead: "Metas no Orbyva fazem parte do mesmo Life OS das finanças pessoais e da organização da vida: progresso visível, hábitos no dia a dia e objetivos em R$ alinhados ao orçamento do mês.",
  },
  {
    path: "/organizacao-pessoal",
    title: "Organização pessoal · Orbyva",
    description:
      "Centralize a organização da vida pessoal: finanças, metas, hábitos e planejamento em um aplicativo brasileiro.",
    h1: "Organize sua vida pessoal em um único lugar",
    lead: "O Orbyva é um aplicativo brasileiro de organização pessoal e Life OS: finanças pessoais, metas e planejamento da vida na mesma plataforma.",
  },
  {
    path: "/life-os",
    title: "O que é um Life OS? · Orbyva",
    description:
      "Entenda o que é um Life OS, para que serve e como o Orbyva funciona como sistema operacional da vida pessoal.",
    h1: "O que é um Life OS?",
    lead: "Life OS significa Life Operating System: um sistema para organizar áreas da vida pessoal (finanças, metas, hábitos, planejamento) em um só lugar. O Orbyva é um Life OS brasileiro.",
  },
  {
    path: "/controle-financeiro",
    title: "Controle financeiro pessoal · Orbyva",
    description:
      "Controle financeiro pessoal com teto por categoria, projeção do mês e o restante da vida no mesmo app.",
    h1: "Controle financeiro pessoal no mesmo lugar da vida",
    lead: "Controle financeiro no Orbyva faz parte de um Life OS com metas e organização pessoal: teto do mês, contas, parcelas e o que ainda cabe no orçamento.",
  },
  {
    path: "/planejamento-pessoal",
    title: "Planejamento pessoal · Orbyva",
    description:
      "Planejamento pessoal com metas, hábitos e finanças conectados: um Life OS para organizar a rotina.",
    h1: "Planejamento pessoal com finanças e metas juntos",
    lead: "Planejamento pessoal no Orbyva une rotina, objetivos e dinheiro: hábitos, metas e finanças pessoais no mesmo Life OS.",
  },
  {
    path: "/app-organizacao-pessoal",
    title: "Aplicativo para organizar finanças, metas e vida pessoal · Orbyva",
    description:
      "O Orbyva é um aplicativo de organização pessoal e Life OS que reúne finanças, metas e planejamento da vida.",
    h1: "Aplicativo para organizar finanças, metas e vida pessoal",
    lead: "O Orbyva é um aplicativo de organização pessoal e Life OS que reúne finanças pessoais, metas e planejamento da vida em uma única plataforma.",
  },
  {
    path: "/dentro-do-orcamento",
    title: "Está dentro do orçamento? · Orbyva",
    description:
      "Ferramenta grátis para ver se uma compra cabe no mês: renda, contas fixas e o valor da compra, sem login.",
    h1: "Está dentro do orçamento?",
    lead: "Ferramenta grátis do Orbyva: informe renda, contas fixas e o valor da compra e veja se entra no mês, sem criar conta.",
  },
  {
    path: "/about",
    title: "Sobre o Orbyva",
    description:
      "Life OS brasileiro: organize finanças pessoais, metas, hábitos, viagens e mais numa só órbita.",
    h1: "Sobre o Orbyva",
    lead: "O Orbyva é um Life OS brasileiro para organizar finanças, hábitos, metas, viagens, lugares, cinema, livros, música e veículos numa só órbita.",
  },
  {
    path: "/blog",
    title: "Blog · Orbyva",
    description:
      "Artigos sobre Life OS, organização pessoal, finanças e metas, pelo time Orbyva.",
    h1: "Blog",
    lead: "Artigos sobre Life OS, organização pessoal, finanças e metas.",
    links: [
      { href: "/blog/o-que-e-life-os", label: "O que é um Life OS?" },
      {
        href: "/blog/como-organizar-financas-e-metas",
        label: "Como organizar finanças e metas",
      },
    ],
  },
  {
    path: "/blog/o-que-e-life-os",
    title: "O que é um Life OS? · Orbyva",
    description:
      "Definição clara de Life OS, para que serve e como difere de apps isolados de produtividade.",
    h1: "O que é um Life OS?",
    lead: "Life OS (Life Operating System) é um sistema que organiza áreas da vida pessoal (finanças, metas, hábitos, planejamento) em um único lugar. O Orbyva é um Life OS brasileiro.",
  },
  {
    path: "/blog/como-organizar-financas-e-metas",
    title: "Como organizar finanças e metas no mesmo lugar · Orbyva",
    description:
      "Práticas simples para alinhar orçamento do mês e objetivos pessoais sem viver em planilhas paralelas.",
    h1: "Como organizar finanças e metas no mesmo lugar",
    lead: "No Orbyva, finanças pessoais e metas compartilham o mesmo login, como parte de um Life OS, para o orçamento conversar com os objetivos.",
  },
  {
    path: "/terms",
    title: "Termos de uso · Orbyva",
    description: "Termos de uso da conta e dos planos Orbyva.",
    h1: "Termos de uso",
    lead: "Termos de uso da conta e dos planos Orbyva.",
  },
  {
    path: "/privacy",
    title: "Privacidade · Orbyva",
    description: "Política de privacidade do Orbyva (LGPD).",
    h1: "Privacidade",
    lead: "Política de privacidade do Orbyva (LGPD).",
  },
];

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function absoluteUrl(routePath) {
  return routePath === "/" ? `${SITE}/` : `${SITE}${routePath}`;
}

function outPathForRoute(routePath) {
  if (routePath === "/") return path.join(dist, "index.html");
  const clean = routePath.replace(/^\//, "").replace(/\/$/, "");
  return path.join(dist, clean, "index.html");
}

function replaceOrInsertMeta(html, attr, key, content) {
  const re = new RegExp(
    `<meta\\s+${attr}=["']${key}["']\\s+content=["'][^"']*["']\\s*/?>`,
    "i"
  );
  const tag = `<meta ${attr}="${key}" content="${escapeHtml(content)}" />`;
  if (re.test(html)) return html.replace(re, tag);
  return html.replace(/<\/head>/i, `    ${tag}\n  </head>`);
}

function replaceCanonical(html, url) {
  const re = /<link\s+rel=["']canonical["']\s+href=["'][^"']*["']\s*\/?>/i;
  const tag = `<link rel="canonical" href="${escapeHtml(url)}" />`;
  if (re.test(html)) return html.replace(re, tag);
  return html.replace(/<\/head>/i, `    ${tag}\n  </head>`);
}

function replaceTitle(html, title) {
  return html.replace(
    /<title>[^<]*<\/title>/i,
    `<title>${escapeHtml(title)}</title>`
  );
}

function buildSeoBlock(route) {
  const links = route.links ?? [
    { href: "/", label: "Início" },
    { href: "/life-os", label: "Life OS" },
    { href: "/app-organizacao-pessoal", label: "App de organização" },
    { href: "/blog", label: "Blog" },
  ];
  const list = links
    .map(
      (l) =>
        `<li><a href="${escapeHtml(absoluteUrl(l.href))}">${escapeHtml(l.label)}</a></li>`
    )
    .join("\n        ");

  return `<div id="seo-noscript" class="seo-fallback">
      <h1>${escapeHtml(route.h1)}</h1>
      <p>${escapeHtml(route.lead)}</p>
      <ul>
        ${list}
      </ul>
    </div>`;
}

function buildJsonLdHome() {
  const org = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Orbyva",
    url: SITE,
    logo: `${SITE}/logo-mark.webp`,
    description:
      "O Orbyva é um Life OS brasileiro para organizar finanças pessoais, metas e planejamento da vida em uma única plataforma.",
    email: "orbyva@gmail.com",
    sameAs: ["https://instagram.com/orbyva"],
  };
  const app = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "Orbyva",
    url: SITE,
    description: org.description,
    applicationCategory: "LifestyleApplication",
    operatingSystem: "Web, iOS (PWA), Android (PWA)",
    inLanguage: "pt-BR",
    offers: {
      "@type": "Offer",
      price: "19.90",
      priceCurrency: "BRL",
      description: "7 dias grátis; depois R$ 19,90/mês",
      url: `${SITE}/login?mode=signup`,
    },
  };
  return `${JSON.stringify(org)}</script>
    <script type="application/ld+json">${JSON.stringify(app)}`;
}

function applyRouteMeta(html, route) {
  const url = absoluteUrl(route.path);
  let next = replaceTitle(html, route.title);
  next = replaceOrInsertMeta(next, "name", "description", route.description);
  next = replaceCanonical(next, url);
  next = replaceOrInsertMeta(next, "property", "og:title", route.title);
  next = replaceOrInsertMeta(next, "property", "og:description", route.description);
  next = replaceOrInsertMeta(next, "property", "og:url", url);
  next = replaceOrInsertMeta(next, "property", "og:image", OG_IMAGE);
  next = replaceOrInsertMeta(next, "property", "og:type", "website");
  next = replaceOrInsertMeta(next, "property", "og:site_name", "Orbyva");
  next = replaceOrInsertMeta(next, "property", "og:locale", "pt_BR");
  next = replaceOrInsertMeta(next, "name", "twitter:card", "summary_large_image");
  next = replaceOrInsertMeta(next, "name", "twitter:title", route.title);
  next = replaceOrInsertMeta(next, "name", "twitter:description", route.description);
  next = replaceOrInsertMeta(next, "name", "twitter:image", OG_IMAGE);

  const seoBlock = buildSeoBlock(route);
  if (/id=["']seo-noscript["']/.test(next)) {
    next = next.replace(
      /<div id=["']seo-noscript["'][\s\S]*?<\/div>/i,
      seoBlock
    );
  } else {
    next = next.replace(/<body([^>]*)>/i, `<body$1>\n    ${seoBlock}`);
  }

  if (route.path === "/") {
    // Garante Organization + WebApplication no head (além do que o React injeta após JS)
    if (!next.includes('"@type":"Organization"')) {
      next = next.replace(
        /<\/head>/i,
        `    <script type="application/ld+json">${buildJsonLdHome()}</script>\n  </head>`
      );
    }
  }

  return next;
}

async function main() {
  const indexPath = path.join(dist, "index.html");
  let baseHtml;
  try {
    baseHtml = await readFile(indexPath, "utf8");
  } catch {
    console.error("dist/index.html ausente: rode vite build antes.");
    process.exit(1);
  }

  for (const route of ROUTES) {
    const html = applyRouteMeta(baseHtml, route);
    const out = outPathForRoute(route.path);
    await mkdir(path.dirname(out), { recursive: true });
    await writeFile(out, html, "utf8");
    console.log(`prerender ${route.path}`);
  }

  console.log(`prerender ok (${ROUTES.length} rotas, static shells)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
