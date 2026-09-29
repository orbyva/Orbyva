export type AppHref =
  | "/home"
  | "/finance"
  | "/finance/transactions"
  | "/finance/form"
  | "/finance/recurring"
  | "/finance/recurring-form"
  | "/finance/budget"
  | "/finance/budget-form"
  | "/finance/categories"
  | "/finance/category-form"
  | "/tasks"
  | "/tasks/agenda"
  | "/tasks/live"
  | "/tasks/form"
  | "/tasks/projects"
  | "/tasks/projects/form"
  | "/notes"
  | "/notes/form"
  | "/notes/folder-form"
  | "/shopping"
  | "/shopping/form"
  | "/shopping/category-form"
  | "/habits"
  | "/habits/form"
  | "/health"
  | "/health/form"
  | "/health/consult-form"
  | "/health/metric-form"
  | "/goals"
  | "/goals/form"
  | "/places"
  | "/places/form"
  | "/travel"
  | "/travel/form"
  | "/cars"
  | "/cars/form"
  | "/cars/maint-form"
  | "/cars/fuel-form"
  | "/cars/doc-form"
  | "/movies"
  | "/movies/form"
  | "/books"
  | "/books/form"
  | "/music"
  | "/music/form"
  | "/links"
  | "/links/form"
  | "/orb"
  | "/account"
  | null;

export type NavLeaf = {
  title: string;
  href: AppHref;
};

export type NavGroup = {
  title: string;
  color: string;
  icon: "home-outline" | "wallet-outline" | "checkbox-outline" | "leaf-outline" | "film-outline";
  items: NavLeaf[];
};

export const NAV_GROUPS: NavGroup[] = [
  {
    title: "Início",
    color: "#6B7CFA",
    icon: "home-outline",
    items: [
      { title: "Dashboard", href: "/home" },
      { title: "Orb", href: "/orb" },
    ],
  },
  {
    title: "Finanças",
    color: "#0EA5E9",
    icon: "wallet-outline",
    items: [
      { title: "Dashboard", href: "/finance" },
      { title: "Transações", href: "/finance/transactions" },
      { title: "Recorrências", href: "/finance/recurring" },
      { title: "Orçamento", href: "/finance/budget" },
      { title: "Categorias", href: "/finance/categories" },
    ],
  },
  {
    title: "Produtividade",
    color: "#A855F7",
    icon: "checkbox-outline",
    items: [
      { title: "Tarefas", href: "/tasks" },
      { title: "Agenda", href: "/tasks/agenda" },
      { title: "Live", href: "/tasks/live" },
      { title: "Projetos", href: "/tasks/projects" },
      { title: "Notas", href: "/notes" },
      { title: "Lista de Compras", href: "/shopping" },
    ],
  },
  {
    title: "Vida",
    color: "#22A37A",
    icon: "leaf-outline",
    items: [
      { title: "Hábitos", href: "/habits" },
      { title: "Saúde", href: "/health" },
      { title: "Metas", href: "/goals" },
      { title: "Lugares", href: "/places" },
      { title: "Viagens", href: "/travel" },
      { title: "Veículos", href: "/cars" },
    ],
  },
  {
    title: "Conteúdo",
    color: "#D46BE8",
    icon: "film-outline",
    items: [
      { title: "Cinema", href: "/movies" },
      { title: "Livros", href: "/books" },
      { title: "Música", href: "/music" },
      { title: "Links", href: "/links" },
    ],
  },
];

export type QuickAddItem = {
  id: string;
  label: string;
  href: AppHref;
  params?: Record<string, string>;
};

const HOME_QUICK_ADD: QuickAddItem[] = [
  { id: "transaction", label: "Registrar transação", href: "/finance/form" },
  { id: "movie", label: "Adicionar filme", href: "/movies/form" },
  { id: "habit", label: "Novo hábito", href: "/habits/form" },
  { id: "goal", label: "Nova meta", href: "/goals/form" },
  { id: "place", label: "Novo lugar", href: "/places/form" },
  { id: "trip", label: "Nova viagem", href: "/travel/form" },
];

const FINANCE_QUICK_ADD: QuickAddItem[] = [
  { id: "transaction", label: "Registrar transação", href: "/finance/form" },
  { id: "recurring", label: "Nova recorrência", href: "/finance/recurring-form" },
  { id: "category", label: "Nova categoria", href: "/finance/category-form" },
  { id: "budget", label: "Criar orçamento", href: "/finance/budget-form" },
];

function liveQuickAdd(items: QuickAddItem[]): QuickAddItem[] {
  return items.filter((item) => item.href);
}

/** Ações do `+`. Lista vazia esconde o FAB. Uma ação com href = toque direto. */
export function quickAddActionsForPath(pathname: string): QuickAddItem[] {
  const path = normalizePath(pathname);
  if (path.endsWith("/form") || path.endsWith("-form")) return [];
  if (path === "/orb" || path.startsWith("/orb/")) return [];
  if (path === "/account" || path.startsWith("/account/")) return [];
  if (path.startsWith("/finance/budget")) {
    return [
      {
        id: "budget",
        label: "Criar orçamento",
        href: "/finance/budget-form",
      },
    ];
  }
  if (path.startsWith("/finance/categories")) {
    return [
      {
        id: "category",
        label: "Nova categoria",
        href: "/finance/category-form",
      },
    ];
  }
  if (path.startsWith("/finance/recurring")) {
    return [
      {
        id: "recurring",
        label: "Nova recorrência",
        href: "/finance/recurring-form",
      },
    ];
  }
  if (/^\/notes\/[^/]+$/.test(path)) return [];
  if (path.startsWith("/notes")) {
    return [
      {
        id: "note",
        label: "Nova nota",
        href: "/notes/form",
      },
      {
        id: "folder",
        label: "Nova pasta",
        href: "/notes/folder-form",
      },
    ];
  }
  if (path.startsWith("/shopping")) {
    return [
      {
        id: "shopping",
        label: "Novo item",
        href: "/shopping/form",
      },
      {
        id: "shopping-cat",
        label: "Nova categoria",
        href: "/shopping/category-form",
      },
    ];
  }
  if (path === "/tasks/projects" || path === "/tasks/projects/") {
    return [
      {
        id: "project",
        label: "Novo projeto",
        href: "/tasks/projects/form",
      },
    ];
  }
  if (/^\/tasks\/projects\/[^/]+$/.test(path)) {
    const projectId = path.split("/")[3];
    return [
      {
        id: "task",
        label: "Nova tarefa",
        href: "/tasks/form",
        params: projectId ? { projectId } : undefined,
      },
    ];
  }
  if (path.startsWith("/tasks/projects")) return [];
  if (path.startsWith("/tasks")) {
    return [
      {
        id: "task",
        label: "Nova tarefa",
        href: "/tasks/form",
      },
    ];
  }
  if (path.startsWith("/habits")) {
    return [
      {
        id: "habit",
        label: "Novo hábito",
        href: "/habits/form",
      },
    ];
  }
  if (path.startsWith("/goals")) {
    return [
      {
        id: "goal",
        label: "Nova meta",
        href: "/goals/form",
      },
    ];
  }
  if (path.startsWith("/health")) {
    return [
      { id: "med", label: "Nova medicação", href: "/health/form" },
      { id: "consult", label: "Nova consulta", href: "/health/consult-form" },
      { id: "metric", label: "Nova medição", href: "/health/metric-form" },
    ];
  }
  if (path.startsWith("/places")) {
    return [{ id: "place", label: "Novo lugar", href: "/places/form" }];
  }
  if (path === "/travel" || path === "/travel/") {
    return [{ id: "trip", label: "Nova viagem", href: "/travel/form" }];
  }
  if (path.startsWith("/travel/")) return [];
  if (/^\/cars\/[^/]+$/.test(path)) {
    const vehicleId = path.split("/")[2];
    return [
      {
        id: "maint",
        label: "Registrar manutenção",
        href: "/cars/maint-form",
        params: vehicleId ? { vehicleId } : undefined,
      },
      {
        id: "fuel",
        label: "Registrar abastecimento",
        href: "/cars/fuel-form",
        params: vehicleId ? { vehicleId } : undefined,
      },
      {
        id: "doc",
        label: "Novo documento",
        href: "/cars/doc-form",
        params: vehicleId ? { vehicleId } : undefined,
      },
    ];
  }
  if (path.startsWith("/cars")) {
    return [{ id: "car", label: "Novo veículo", href: "/cars/form" }];
  }
  if (path.startsWith("/movies")) {
    return [{ id: "movie", label: "Adicionar filme", href: "/movies/form" }];
  }
  if (path.startsWith("/books")) {
    return [{ id: "book", label: "Adicionar livro", href: "/books/form" }];
  }
  if (path.startsWith("/music")) {
    return [{ id: "album", label: "Adicionar álbum", href: "/music/form" }];
  }
  if (path.startsWith("/links")) {
    return [{ id: "link", label: "Adicionar link", href: "/links/form" }];
  }
  if (path.startsWith("/finance/transactions")) {
    return [
      {
        id: "transaction",
        label: "Registrar transação",
        href: "/finance/form",
      },
    ];
  }
  if (path === "/finance" || path === "/finance/") {
    return liveQuickAdd(FINANCE_QUICK_ADD);
  }
  if (path === "/" || path === "/home" || path.startsWith("/home/")) {
    return liveQuickAdd(HOME_QUICK_ADD);
  }
  return [];
}

export function normalizePath(pathname: string): string {
  const stripped = pathname.replace(/\/\([^/]+\)/g, "");
  return stripped || "/";
}

export function isNavActive(pathname: string, href: AppHref): boolean {
  if (!href) return false;
  const path = normalizePath(pathname);
  if (href === "/home") return path === "/home" || path === "/";
  if (href === "/finance") {
    return path === "/finance" || path === "/finance/";
  }
  if (href === "/tasks") {
    return path === "/tasks" || path === "/tasks/" || path.startsWith("/tasks/form");
  }
  if (href === "/tasks/agenda") {
    return path === "/tasks/agenda" || path.startsWith("/tasks/agenda/");
  }
  if (href === "/tasks/live") {
    return path === "/tasks/live" || path.startsWith("/tasks/live/");
  }
  if (href === "/tasks/projects") {
    return (
      path === "/tasks/projects" || path.startsWith("/tasks/projects/")
    );
  }
  if (href === "/notes") {
    return path === "/notes" || path.startsWith("/notes/");
  }
  if (href === "/shopping") {
    return path === "/shopping" || path.startsWith("/shopping/");
  }
  if (href === "/habits") {
    return path === "/habits" || path.startsWith("/habits/");
  }
  if (href === "/health") {
    return path === "/health" || path.startsWith("/health/");
  }
  if (href === "/goals") {
    return path === "/goals" || path.startsWith("/goals/");
  }
  if (href === "/places") {
    return path === "/places" || path.startsWith("/places/");
  }
  if (href === "/travel") {
    return path === "/travel" || path.startsWith("/travel/");
  }
  if (href === "/cars") {
    return path === "/cars" || path.startsWith("/cars/");
  }
  if (href === "/movies") {
    return path === "/movies" || path.startsWith("/movies/");
  }
  if (href === "/books") {
    return path === "/books" || path.startsWith("/books/");
  }
  if (href === "/music") {
    return path === "/music" || path.startsWith("/music/");
  }
  if (href === "/links") {
    return path === "/links" || path.startsWith("/links/");
  }
  return path === href || path.startsWith(`${href}/`);
}
