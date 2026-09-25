/**
 * Constantes e builders de SEO / GEO (páginas públicas).
 * Preço e redes só a partir de fontes reais do projeto.
 */
import { BRAND } from "@/lib/brand";
import { PLANS, TRIAL_DAYS } from "@/lib/plan";

export const SITE_URL = BRAND.siteUrl;

export const DEFAULT_OG_IMAGE = `${SITE_URL}/marketing/hub.png`;

/** Metadata canônica da home (index.html + React). */
export const HOME_META = {
  title: "Orbyva · Organize finanças, metas e sua vida em um só lugar",
  description:
    "O Orbyva é um Life OS brasileiro para organizar finanças pessoais, metas e planejamento da vida em uma única plataforma.",
} as const;

export type PublicRoute = {
  path: string;
  title: string;
  description: string;
  /** Incluir no sitemap.xml */
  sitemap?: boolean;
  changefreq?: "weekly" | "monthly" | "yearly";
  priority?: number;
};

/**
 * Rotas públicas indexáveis. Mantém paths alinhados ao router e ao prerender.
 */
export const PUBLIC_ROUTES: readonly PublicRoute[] = [
  {
    path: "/",
    title: HOME_META.title,
    description: HOME_META.description,
    sitemap: true,
    changefreq: "weekly",
    priority: 1,
  },
  {
    path: "/financas-pessoais",
    title: "Finanças pessoais · Orbyva",
    description:
      "Organize finanças pessoais no Orbyva: teto de gastos, contas, parcelas e planejamento do mês no mesmo Life OS.",
    sitemap: true,
    changefreq: "monthly",
    priority: 0.9,
  },
  {
    path: "/metas",
    title: "Metas pessoais · Orbyva",
    description:
      "Transforme objetivos em metas acompanháveis no Orbyva, com progresso junto das finanças e do planejamento pessoal.",
    sitemap: true,
    changefreq: "monthly",
    priority: 0.9,
  },
  {
    path: "/organizacao-pessoal",
    title: "Organização pessoal · Orbyva",
    description:
      "Centralize a organização da vida pessoal: finanças, metas, hábitos e planejamento em um aplicativo brasileiro.",
    sitemap: true,
    changefreq: "monthly",
    priority: 0.9,
  },
  {
    path: "/life-os",
    title: "O que é um Life OS? · Orbyva",
    description:
      "Entenda o que é um Life OS, para que serve e como o Orbyva funciona como sistema operacional da vida pessoal.",
    sitemap: true,
    changefreq: "monthly",
    priority: 0.95,
  },
  {
    path: "/controle-financeiro",
    title: "Controle financeiro pessoal · Orbyva",
    description:
      "Controle financeiro pessoal com teto por categoria, projeção do mês e o restante da vida no mesmo app.",
    sitemap: true,
    changefreq: "monthly",
    priority: 0.85,
  },
  {
    path: "/planejamento-pessoal",
    title: "Planejamento pessoal · Orbyva",
    description:
      "Planejamento pessoal com metas, hábitos e finanças conectados: um Life OS para organizar a rotina.",
    sitemap: true,
    changefreq: "monthly",
    priority: 0.85,
  },
  {
    path: "/app-organizacao-pessoal",
    title: "Aplicativo para organizar finanças, metas e vida pessoal · Orbyva",
    description:
      "O Orbyva é um aplicativo de organização pessoal e Life OS que reúne finanças, metas e planejamento da vida.",
    sitemap: true,
    changefreq: "monthly",
    priority: 0.95,
  },
  {
    path: "/dentro-do-orcamento",
    title: "Está dentro do orçamento? · Orbyva",
    description:
      "Ferramenta grátis para ver se uma compra cabe no mês: renda, contas fixas e o valor da compra, sem login.",
    sitemap: true,
    changefreq: "monthly",
    priority: 0.8,
  },
  {
    path: "/about",
    title: "Sobre o Orbyva",
    description:
      "Life OS brasileiro: organize finanças pessoais, metas, hábitos, viagens e mais numa só órbita.",
    sitemap: true,
    changefreq: "monthly",
    priority: 0.7,
  },
  {
    path: "/blog",
    title: "Blog · Orbyva",
    description:
      "Artigos sobre Life OS, organização pessoal, finanças e metas, pelo time Orbyva.",
    sitemap: true,
    changefreq: "weekly",
    priority: 0.8,
  },
  {
    path: "/terms",
    title: "Termos de uso · Orbyva",
    description: "Termos de uso da conta e dos planos Orbyva.",
    sitemap: true,
    changefreq: "yearly",
    priority: 0.3,
  },
  {
    path: "/privacy",
    title: "Privacidade · Orbyva",
    description: "Política de privacidade do Orbyva (LGPD).",
    sitemap: true,
    changefreq: "yearly",
    priority: 0.3,
  },
] as const;

/** Prefixos / paths privados: Disallow e noindex. */
export const PRIVATE_PATH_PREFIXES = [
  "/home",
  "/account",
  "/goals",
  "/habits",
  "/travel",
  "/places",
  "/finance",
  "/movies",
  "/books",
  "/music",
  "/car",
  "/ops",
  "/invite",
  "/tasks",
  "/notes",
  "/shopping-list",
  "/life",
  "/links",
  "/ext",
  "/events",
  "/login",
] as const;

export function absoluteUrl(path: string): string {
  if (path.startsWith("http")) return path;
  const p = path.startsWith("/") ? path : `/${path}`;
  return p === "/" ? `${SITE_URL}/` : `${SITE_URL}${p}`;
}

export function buildOrganizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: BRAND.name,
    url: SITE_URL,
    logo: absoluteUrl(BRAND.logoMark),
    description: HOME_META.description,
    email: BRAND.email,
    sameAs: [BRAND.instagramUrl],
  };
}

export function buildWebApplicationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: BRAND.name,
    url: SITE_URL,
    description: HOME_META.description,
    applicationCategory: "LifestyleApplication",
    operatingSystem: "Web, iOS (PWA), Android (PWA)",
    inLanguage: "pt-BR",
    offers: {
      "@type": "Offer",
      price: "19.90",
      priceCurrency: "BRL",
      description: `${TRIAL_DAYS} dias grátis; depois ${PLANS.pro.priceLabel}`,
      url: absoluteUrl("/login?mode=signup"),
    },
  };
}

export function buildFaqPageJsonLd(
  faqs: readonly { q: string; a: string }[]
) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };
}

export function buildBlogPostingJsonLd(input: {
  title: string;
  description: string;
  path: string;
  datePublished: string;
  dateModified?: string;
  authorName?: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: input.title,
    description: input.description,
    url: absoluteUrl(input.path),
    datePublished: input.datePublished,
    dateModified: input.dateModified ?? input.datePublished,
    author: {
      "@type": "Organization",
      name: input.authorName ?? BRAND.name,
      url: SITE_URL,
    },
    publisher: {
      "@type": "Organization",
      name: BRAND.name,
      logo: {
        "@type": "ImageObject",
        url: absoluteUrl(BRAND.logoMark),
      },
    },
    mainEntityOfPage: absoluteUrl(input.path),
    image: DEFAULT_OG_IMAGE,
    inLanguage: "pt-BR",
  };
}

export function JsonLdScript(data: unknown): string {
  return JSON.stringify(data);
}
