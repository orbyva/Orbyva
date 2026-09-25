/**
 * Traduz o `path` web da tool `open_screen` para um destino Expo Router.
 * O server emite caminhos do catálogo web (`/shopping-list`, `/life/health`, …);
 * o mobile usa outras rotas (`/shopping`, `/health`, `/cars`).
 */

export type MobileOrbHref = {
  pathname: string;
  params?: Record<string, string>;
};

/** Prefixos/caminhos web → pathname mobile (sem query). Ordem: mais específico primeiro. */
const PATH_REWRITES: ReadonlyArray<{ from: string; to: string }> = [
  { from: "/shopping-list", to: "/shopping" },
  { from: "/finance/dashboard", to: "/finance" },
  { from: "/life/health", to: "/health" },
  { from: "/car/", to: "/cars/" },
  { from: "/car", to: "/cars" },
  { from: "/timeline", to: "/home" },
];

function rewritePathname(pathname: string): string {
  const clean = pathname.replace(/\/+$/, "") || "/";
  for (const rule of PATH_REWRITES) {
    if (rule.from.endsWith("/")) {
      if (clean.startsWith(rule.from.slice(0, -1) + "/") || clean + "/" === rule.from) {
        return clean.replace(/^\/car(?=\/|$)/, "/cars");
      }
    } else if (clean === rule.from) {
      return rule.to;
    }
  }
  if (clean === "/car" || clean.startsWith("/car/")) {
    return clean.replace(/^\/car/, "/cars");
  }
  return clean;
}

/**
 * Converte `/tasks/projects/abc?tab=tarefas` em `{ pathname: "/tasks/projects/[id]", params }`.
 * Devolve `null` se o caminho não for utilizável no app.
 */
export function mapOrbWebPathToMobile(webPath: string): MobileOrbHref | null {
  if (typeof webPath !== "string" || !webPath.startsWith("/") || webPath.startsWith("//")) {
    return null;
  }
  if (webPath.includes("..") || webPath.includes("\\")) return null;

  const [semHash] = webPath.split("#");
  const [rawPath, query = ""] = semHash.split("?");
  let pathname = rewritePathname(rawPath);

  const params: Record<string, string> = {};
  if (query) {
    for (const part of query.split("&")) {
      if (!part) continue;
      const [k, ...rest] = part.split("=");
      const key = decodeURIComponent(k);
      const value = decodeURIComponent(rest.join("=") || "");
      if (!key || value.length > 200) continue;
      params[key] = value;
    }
  }

  // Detalhes com :id no catálogo web → segmentos Expo
  const project = pathname.match(/^\/tasks\/projects\/([^/]+)$/);
  if (project) {
    return {
      pathname: "/tasks/projects/[id]",
      params: { ...params, id: decodeURIComponent(project[1]) },
    };
  }
  const note = pathname.match(/^\/notes\/([^/]+)$/);
  if (note) {
    return {
      pathname: "/notes/[id]",
      params: { ...params, id: decodeURIComponent(note[1]) },
    };
  }
  const trip = pathname.match(/^\/travel\/([^/]+)$/);
  if (trip) {
    return {
      pathname: "/travel/[id]",
      params: { ...params, id: decodeURIComponent(trip[1]) },
    };
  }
  const place = pathname.match(/^\/places\/([^/]+)$/);
  if (place) {
    return {
      pathname: "/places/[id]",
      params: { ...params, id: decodeURIComponent(place[1]) },
    };
  }
  const movie = pathname.match(/^\/movies\/([^/]+)$/);
  if (movie) {
    return {
      pathname: "/movies/[id]",
      params: { ...params, id: decodeURIComponent(movie[1]) },
    };
  }
  const book = pathname.match(/^\/books\/([^/]+)$/);
  if (book) {
    return {
      pathname: "/books/[id]",
      params: { ...params, id: decodeURIComponent(book[1]) },
    };
  }
  const music = pathname.match(/^\/music\/([^/]+)$/);
  if (music) {
    return {
      pathname: "/music/[id]",
      params: { ...params, id: decodeURIComponent(music[1]) },
    };
  }
  const car = pathname.match(/^\/cars\/([^/]+)$/);
  if (car && car[1] !== "form" && !car[1].includes("-form")) {
    // detalhe de veículo se existir; senão lista
    return {
      pathname: "/cars/[id]",
      params: { ...params, id: decodeURIComponent(car[1]) },
    };
  }

  const knownRoots = [
    "/home",
    "/orb",
    "/account",
    "/tasks",
    "/tasks/agenda",
    "/tasks/live",
    "/tasks/projects",
    "/notes",
    "/shopping",
    "/finance",
    "/finance/transactions",
    "/finance/recurring",
    "/finance/budget",
    "/finance/categories",
    "/habits",
    "/goals",
    "/health",
    "/places",
    "/travel",
    "/cars",
    "/movies",
    "/books",
    "/music",
    "/links",
  ];
  if (!knownRoots.includes(pathname) && !pathname.startsWith("/tasks/projects/")) {
    return null;
  }

  return Object.keys(params).length > 0
    ? { pathname, params }
    : { pathname };
}
