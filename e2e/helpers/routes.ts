/**
 * Tabela de rotas — fonte única para specs parametrizados.
 *
 * O `heading` é o `<h1>` que o `PageShell` renderiza a partir da prop `title`
 * (ver src/components/PageShell.tsx). Rota nova sem entrada aqui não é coberta
 * pelo smoke: adicionar aqui é o passo mais barato de cobertura do repositório.
 */

export type AppRoute = {
  path: string;
  /** `<h1>` esperado. Regex para telas com título dinâmico. */
  heading: string | RegExp;
  /** Agrupamento do menu lateral — usado só para leitura do relatório. */
  module: "Início" | "Finanças" | "Entretenimento" | "Vida" | "Conta";
};

/** Rotas privadas com layout de app. Todas exigem sessão. */
export const APP_ROUTES: AppRoute[] = [
  { path: "/home", heading: /^Olá/, module: "Início" },
  { path: "/timeline", heading: "Timeline", module: "Início" },

  { path: "/finance/dashboard", heading: "Finanças", module: "Finanças" },
  { path: "/finance/transactions", heading: "Transações", module: "Finanças" },
  { path: "/finance/budget", heading: "Orçamento mensal", module: "Finanças" },
  { path: "/finance/recurring", heading: "Recorrências", module: "Finanças" },
  { path: "/finance/categories", heading: "Categorias", module: "Finanças" },

  { path: "/movies", heading: "Cinema", module: "Entretenimento" },
  { path: "/books", heading: "Livros", module: "Entretenimento" },
  { path: "/music", heading: "Música", module: "Entretenimento" },

  { path: "/habits", heading: "Hábitos", module: "Vida" },
  { path: "/places", heading: "Lugares", module: "Vida" },
  { path: "/goals", heading: "Metas Pessoais", module: "Vida" },
  { path: "/car", heading: "Veículos", module: "Vida" },
  { path: "/travel", heading: "Viagens", module: "Vida" },

  { path: "/account", heading: "Conta", module: "Conta" },
];

/**
 * Rotas privadas fora do smoke de renderização, mas dentro do teste de guarda.
 * `/ops` tem gate próprio; `/travel/:id` e os aceites de convite precisam de
 * massa específica.
 */
export const GUARDED_ONLY_ROUTES = ["/ops", "/travel/invite/e2e-token-invalido"];

/** Rotas públicas — não podem exigir sessão nunca. */
export const PUBLIC_ROUTES = ["/", "/login", "/about", "/terms", "/privacy"];

/** Redirects que já quebraram link salvo/bookmark. */
export const APP_REDIRECTS: { from: string; to: RegExp }[] = [
  { from: "/finance/dimensions", to: /\/finance\/categories$/ },
];

/** Fallback do ErrorBoundary — se aparecer, a tela crashou. */
export const ERROR_BOUNDARY_HEADING = "Algo deu errado";
