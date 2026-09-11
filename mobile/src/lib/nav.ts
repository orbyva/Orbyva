export type AppHref =
  | "/home"
  | "/timeline"
  | "/finance"
  | "/finance/transactions"
  | "/finance/form"
  | "/finance/recurring"
  | "/finance/recurring-form"
  | "/finance/budget"
  | "/finance/categories"
  | "/finance/category-form"
  | "/tasks"
  | "/tasks/form"
  | "/tasks/projects"
  | "/tasks/projects/form"
  | "/notes"
  | "/notes/form"
  | "/shopping"
  | "/shopping/form"
  | "/shopping/category-form"
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
      { title: "Timeline", href: "/timeline" },
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
      { title: "Hábitos", href: null },
      { title: "Saúde", href: null },
      { title: "Metas", href: null },
      { title: "Lugares", href: null },
      { title: "Viagens", href: null },
      { title: "Veículos", href: null },
    ],
  },
  {
    title: "Conteúdo",
    color: "#D46BE8",
    icon: "film-outline",
    items: [
      { title: "Cinema", href: null },
      { title: "Livros", href: null },
      { title: "Música", href: null },
      { title: "Links", href: null },
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
  { id: "movie", label: "Adicionar filme", href: null },
  { id: "habit", label: "Novo hábito", href: null },
  { id: "place", label: "Novo lugar", href: null },
  { id: "trip", label: "Nova viagem", href: null },
];

const FINANCE_QUICK_ADD: QuickAddItem[] = [
  { id: "transaction", label: "Registrar transação", href: "/finance/form" },
  { id: "recurring", label: "Nova recorrência", href: "/finance/recurring-form" },
  { id: "category", label: "Nova categoria", href: "/finance/category-form" },
  { id: "budget", label: "Criar orçamento", href: null },
];

function liveQuickAdd(items: QuickAddItem[]): QuickAddItem[] {
  return items.filter((item) => item.href);
}

/** Ações do `+`. Lista vazia esconde o FAB. Uma ação com href = toque direto. */
export function quickAddActionsForPath(pathname: string): QuickAddItem[] {
  const path = normalizePath(pathname);
  if (path.endsWith("/form") || path.endsWith("-form")) return [];
  if (path === "/account" || path.startsWith("/account/")) return [];
  if (path.startsWith("/finance/budget")) return [];
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
  if (
    path === "/" ||
    path === "/home" ||
    path.startsWith("/home/") ||
    path.startsWith("/timeline")
  ) {
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
  return path === href || path.startsWith(`${href}/`);
}
