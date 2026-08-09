export type AppArea = "finance" | "entertainment" | "life" | "home";

export type QuickAddActionId =
  | "transaction"
  | "budget"
  | "recurring"
  | "movie"
  | "book"
  | "music"
  | "habit"
  | "place"
  | "goal"
  | "vehicle"
  | "trip";

export type QuickAddAction = {
  id: QuickAddActionId;
  label: string;
  href: string;
  keywords: string[];
  area: AppArea;
  /** Abre formulário no overlay (sem navegar). Default false = navega com ?new=1. */
  inline?: boolean;
};

export const QUICK_ADD_ACTIONS: QuickAddAction[] = [
  {
    id: "transaction",
    label: "Registrar transação",
    href: "/finance/transactions?new=1",
    keywords: [
      "despesa",
      "receita",
      "gasto",
      "entrada",
      "financeiro",
      "transação",
      "gastei",
    ],
    area: "finance",
    inline: true,
  },
  {
    id: "budget",
    label: "Criar orçamento",
    href: "/finance/budget?new=1",
    keywords: ["orçamento", "planejado", "budget", "limite"],
    area: "finance",
  },
  {
    id: "recurring",
    label: "Nova recorrência",
    href: "/finance/recurring?new=1",
    keywords: ["recorrência", "parcela", "conta", "água", "luz", "mensal"],
    area: "finance",
  },
  {
    id: "movie",
    label: "Adicionar filme",
    href: "/movies?new=1",
    keywords: ["filme", "série", "cinema", "imdb", "quero assistir"],
    area: "entertainment",
    inline: true,
  },
  {
    id: "book",
    label: "Adicionar livro",
    href: "/books?new=1",
    keywords: ["livro", "leitura", "estante"],
    area: "entertainment",
    inline: true,
  },
  {
    id: "music",
    label: "Adicionar música",
    href: "/music?new=1",
    keywords: ["música", "album", "disco", "spotify"],
    area: "entertainment",
    inline: true,
  },
  {
    id: "habit",
    label: "Novo hábito",
    href: "/habits?new=1",
    keywords: ["hábito", "rotina", "check-in"],
    area: "life",
  },
  {
    id: "place",
    label: "Novo lugar",
    href: "/places?new=1",
    keywords: ["lugar", "restaurante", "café", "mapa"],
    area: "life",
    inline: true,
  },
  {
    id: "goal",
    label: "Nova meta",
    href: "/goals?new=1",
    keywords: ["meta", "objetivo", "progresso"],
    area: "life",
  },
  {
    id: "vehicle",
    label: "Novo veículo",
    href: "/car?new=1",
    keywords: ["veículo", "carro", "moto"],
    area: "life",
    inline: true,
  },
  {
    id: "trip",
    label: "Nova viagem",
    href: "/travel?new=1",
    keywords: ["viagem", "roteiro", "planejar"],
    area: "life",
    inline: true,
  },
];

const ENTERTAINMENT_PREFIXES = ["/movies", "/books", "/music"];
const LIFE_PREFIXES = ["/habits", "/places", "/goals", "/car", "/travel"];

export function resolveAppArea(pathname: string): AppArea {
  if (pathname.startsWith("/finance")) return "finance";
  if (ENTERTAINMENT_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return "entertainment";
  }
  if (LIFE_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return "life";
  }
  return "home";
}

const AREA_LABELS: Record<AppArea, string> = {
  finance: "Finanças",
  entertainment: "Entretenimento",
  life: "Vida",
  home: "Adicionar",
};

export function areaLabel(area: AppArea): string {
  return AREA_LABELS[area];
}

/** Actions for the current area. On home, returns a curated mix of top actions. */
export function quickAddActionsForArea(area: AppArea): QuickAddAction[] {
  if (area === "home") {
    const ids = ["transaction", "movie", "habit", "place", "trip"];
    return QUICK_ADD_ACTIONS.filter((a) => ids.includes(a.id));
  }
  return QUICK_ADD_ACTIONS.filter((a) => a.area === area);
}
