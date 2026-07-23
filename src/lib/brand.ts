/** Identidade do produto — Orbyva (life OS · porta = ledger). */
export const BRAND = {
  name: "Orbyva",
  tagline: "Comece pelo livro-caixa. Organize o resto da vida.",
  /** Cunha de diferenciação (landing / marketing). */
  wedge: "Life OS com ledger",
  shortDescription:
    "Finanças no centro — hábitos, metas, viagens, cinema e veículos na mesma órbita.",
  /** Uma linha para o hero — prova + proposta. */
  heroSupport:
    "Registre gastos, acompanhe o mês e o orçamento. O life OS cresce depois que o ledger gruda.",
  /** Assets em /public */
  logo: "/logo.webp",
  logoMark: "/logo-mark.webp",
  email: "hello@orbyva.app",
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
