/** Identidade do produto Orbyva (life OS · lançamentos no núcleo). */
export const BRAND = {
  name: "Orbyva",
  tagline: "Organize finanças, metas e vida pessoal em um só lugar",
  /** Slogan da lockup visual (logo.webp), shares / exportações. */
  logoSlogan: "Tudo da sua vida em uma só órbita.",
  /** Cunha de diferenciação (landing / marketing). */
  wedge: "Life OS com controle do mês",
  shortDescription:
    "O Orbyva é um Life OS brasileiro e aplicativo de organização pessoal para finanças pessoais, metas e planejamento da vida numa só órbita.",
  /** Uma linha para o hero: prova + proposta (conversão). */
  heroSupport:
    "O Orbyva é um Life OS brasileiro para organizar finanças pessoais, metas e planejamento da vida em uma única plataforma, com produtividade sem espalhar a organização da vida em vários apps.",
  /** Assets em /public */
  logo: "/logo.webp",
  logoMark: "/logo-mark.webp",
  /** O mesmo PNG do `<link rel="icon">` do `index.html` (loader / extensão). */
  favicon: "/logo-mark.png",
  /** Mesmo desenho do favicon em 128px: o PNG de 1024px pesa 148 KB para um ícone de 32px. */
  faviconSmall: "/logo-mark-128.webp",
  /** Mark só no sky, fundo transparente (login / fundo escuro). */
  logoMarkSky: "/logo-mark-sky.png",
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
  tasks: "Tarefas",
  projects: "Projetos",
  notes: "Notas",
  "shopping-list": "Lista de Compras",
  live: "Live",
  agenda: "Agenda",
  tags: "Tags",
  gantt: "Gantt",
  "link-icons": "Ícones de link",
  life: "Vida",
  health: "Saúde",
  medications: "Medicações",
};
