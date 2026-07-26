/** Identidade do produto — Orbyva (life OS · ledger no núcleo). */
export const BRAND = {
  name: "Orbyva",
  tagline: "Saiba o que cabe no mês — e organize o resto da vida",
  /** Slogan da lockup visual (logo.webp) — shares / exportações. */
  logoSlogan: "Tudo da sua vida em uma só órbita.",
  /** Cunha de diferenciação (landing / marketing). */
  wedge: "Life OS com ledger",
  shortDescription:
    "Orçamento, parcelas e livro-caixa — com hábitos, metas, viagens e cinema na mesma órbita.",
  /** Uma linha para o hero — prova + proposta (conversão). */
  heroSupport:
    "Orçamento com teto, parcelas sob controle e o mês em clareza. Depois, hábitos, viagens, cinema e o restante do life OS — tudo liberado desde o primeiro dia.",
  /** Assets em /public */
  logo: "/logo.webp",
  logoMark: "/logo-mark.webp",
  email: "orbyva@gmail.com",
  domain: "orbyva.app",
  siteUrl: "https://orbyva.app",
  /** Canal de aquisição principal */
  instagramHandle: "@orbyva",
  instagramUrl: "https://instagram.com/orbyva",
} as const;

/** Hex de marca — canvas/shares/PWA (espelha --primary / --cinema). */
export const BRAND_COLORS = {
  /** Sky accent — primary (logo Orbyva) */
  primary: "#0EA5E9",
  /** Sky-600 — gradientes / punch */
  primaryDeep: "#0284C7",
  /** Sky-900 — fundos de share */
  primaryDark: "#0C4A6E",
  primarySoft: "rgba(14, 165, 233, 0.55)",
  /** Fuchsia-600 — módulo cinema (longe do sky) */
  cinema: "#C026D3",
  cinemaSoft: "rgba(192, 38, 211, 0.5)",
  ink: "#0B0F1A",
  paper: "#F8FAFC",
} as const;

export const BREADCRUMB_LABELS: Record<string, string> = {
  home: "Início",
  account: "Conta",
  timeline: "Timeline",
  goals: "Metas",
  habits: "Hábitos",
  travel: "Viagens",
  invite: "Convite",
  places: "Lugares",
  finance: "Finanças",
  dashboard: "Dashboard",
  recurring: "Parcelas",
  transactions: "Transações",
  dimensions: "Dimensões",
  budget: "Orçamento",
  movies: "Cinema",
  car: "Veículos",
};
