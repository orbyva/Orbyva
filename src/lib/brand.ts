/** Identidade do produto Orbyva (life OS · lançamentos no núcleo). */
export const BRAND = {
  name: "Orbyva",
  tagline: "Tudo da sua vida em uma só órbita",
  /** Slogan da lockup visual (logo.webp), shares / exportações. */
  logoSlogan: "Tudo da sua vida em uma só órbita.",
  /** Cunha de diferenciação (landing / marketing). */
  wedge: "Life OS com controle do mês",
  shortDescription:
    "Pare de espalhar a vida em vários apps. Organize finanças, hábitos, metas, viagens e cinema numa só órbita.",
  /** Uma linha para o hero: prova + proposta (conversão). */
  heroSupport:
    "Pare de pagar cinco apps. Organize o mês e o resto da vida no mesmo lugar.",
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

/** Hex de marca, canvas/shares/PWA (espelha --primary / --cinema). */
export const BRAND_COLORS = {
  /** Sky accent, primary (logo Orbyva) */
  primary: "#0EA5E9",
  /** Sky-600 · gradientes / punch */
  primaryDeep: "#0284C7",
  /** Sky-900 · fundos de share */
  primaryDark: "#0C4A6E",
  primarySoft: "rgba(14, 165, 233, 0.55)",
  /** Fuchsia-600 · módulo cinema (longe do sky) */
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
  recurring: "Recorrências",
  transactions: "Transações",
  dimensions: "Categorias",
  categories: "Categorias",
  budget: "Orçamento",
  movies: "Cinema",
  books: "Livros",
  music: "Música",
  links: "Links",
  car: "Veículos",
};
