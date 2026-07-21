/** Identidade do produto — FinTrack reafirmado; wedge = life OS com ledger. */
export const BRAND = {
  name: "FinTrack",
  tagline: "Seu life OS pessoal",
  /** Cunha de diferenciação (landing / marketing). */
  wedge: "Life OS com ledger",
  shortDescription:
    "Organize finanças, hábitos, metas, viagens, cinema e veículos num só lugar.",
  /** Uma linha para o hero — prova + proposta. */
  heroSupport:
    "O hub da sua vida com o livro-caixa no centro: saldo, alertas e o que importa hoje.",
} as const;

/** Hex de marca — canvas/shares/PWA (espelha --primary / --cinema). */
export const BRAND_COLORS = {
  /** Sky-500 — primary */
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
