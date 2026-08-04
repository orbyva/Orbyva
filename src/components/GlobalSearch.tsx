import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Command } from "cmdk";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  searchGlobal,
  SEARCH_KIND_LABEL,
  type GlobalSearchHit,
} from "@/api/search";
import {
  QUICK_ADD_ACTIONS,
  resolveAppArea,
  type AppArea,
  type QuickAddAction,
} from "@/lib/quickAdd";
import { cn } from "@/lib/utils";

const SEARCH_DEBOUNCE_MS = 280;

type NavAction = {
  id: string;
  label: string;
  href: string;
  keywords: string[];
  area: AppArea | "any";
  kind: "action" | "nav";
};

const NAV_ACTIONS: NavAction[] = [
  {
    id: "nav-home",
    label: "Ir para Início",
    href: "/home",
    keywords: ["início", "home", "hub", "painel"],
    area: "any",
    kind: "nav",
  },
  {
    id: "nav-budget",
    label: "Ir para Orçamento",
    href: "/finance/budget",
    keywords: ["orçamento", "budget", "teto"],
    area: "finance",
    kind: "nav",
  },
  {
    id: "nav-categories",
    label: "Ir para Categorias",
    href: "/finance/categories",
    keywords: ["categorias", "subcategorias", "dimensões", "tipo", "classe"],
    area: "finance",
    kind: "nav",
  },
  {
    id: "nav-transactions",
    label: "Ir para Transações",
    href: "/finance/transactions",
    keywords: ["lançamentos", "transações", "extrato"],
    area: "finance",
    kind: "nav",
  },
  {
    id: "nav-recurring",
    label: "Ir para Recorrências",
    href: "/finance/recurring",
    keywords: ["recorrências", "parcelas", "contas"],
    area: "finance",
    kind: "nav",
  },
  {
    id: "nav-movies",
    label: "Ir para Cinema",
    href: "/movies",
    keywords: ["cinema", "filmes", "séries"],
    area: "entertainment",
    kind: "nav",
  },
  {
    id: "nav-places",
    label: "Ir para Lugares",
    href: "/places",
    keywords: ["lugares", "restaurante", "mapa"],
    area: "life",
    kind: "nav",
  },
  {
    id: "nav-travel",
    label: "Ir para Viagens",
    href: "/travel",
    keywords: ["viagens", "roteiro"],
    area: "life",
    kind: "nav",
  },
];

type RankedAction = {
  id: string;
  label: string;
  href: string;
  kind: "action" | "nav";
  score: number;
};

function scoreMatch(
  query: string,
  label: string,
  keywords: string[],
  areaBoost: number
): number {
  const q = query.trim().toLowerCase();
  if (!q) return 10 + areaBoost;
  let score = areaBoost;
  const labelL = label.toLowerCase();
  if (labelL === q) score += 100;
  else if (labelL.startsWith(q)) score += 60;
  else if (labelL.includes(q)) score += 35;
  for (const kw of keywords) {
    const k = kw.toLowerCase();
    if (k === q) score += 50;
    else if (k.startsWith(q) || q.startsWith(k)) score += 25;
    else if (k.includes(q) || q.includes(k)) score += 12;
  }
  // fuzzy: shared chars ratio (light)
  let shared = 0;
  for (const ch of q) if (labelL.includes(ch)) shared += 1;
  score += Math.min(10, shared);
  return score;
}

function rankActions(query: string, area: AppArea): RankedAction[] {
  const create: RankedAction[] = QUICK_ADD_ACTIONS.map((a: QuickAddAction) => ({
    id: a.id,
    label: a.label,
    href: a.href,
    kind: "action" as const,
    score: scoreMatch(
      query,
      a.label,
      a.keywords,
      a.area === area ? 20 : area === "home" ? 5 : 0
    ),
  }));
  const nav: RankedAction[] = NAV_ACTIONS.map((a) => ({
    id: a.id,
    label: a.label,
    href: a.href,
    kind: "nav" as const,
    score: scoreMatch(
      query,
      a.label,
      a.keywords,
      a.area === area || a.area === "any" ? 18 : 0
    ),
  }));
  const q = query.trim();
  return [...create, ...nav]
    .filter((a) => (!q ? a.score > 0 : a.score >= 12))
    .sort((a, b) => b.score - a.score)
    .slice(0, 12);
}

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<GlobalSearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const area = resolveAppArea(location.pathname);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);

  const matchingActions = useMemo(
    () => rankActions(query, area),
    [query, area]
  );
  const showEntitySearch = query.trim().length >= 2;

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const runSearch = useCallback((value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (value.trim().length < 2) {
      requestIdRef.current += 1;
      setHits([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    debounceRef.current = setTimeout(() => {
      const requestId = ++requestIdRef.current;
      void searchGlobal(value)
        .then((results) => {
          if (requestId !== requestIdRef.current) return;
          setHits(results);
        })
        .finally(() => {
          if (requestId !== requestIdRef.current) return;
          setLoading(false);
        });
    }, SEARCH_DEBOUNCE_MS);
  }, []);

  function goTo(href: string) {
    setOpen(false);
    setQuery("");
    setHits([]);
    navigate(href);
  }

  const createActions = matchingActions.filter((a) => a.kind === "action");
  const navActions = matchingActions.filter((a) => a.kind === "nav");
  const hasResults =
    createActions.length > 0 || navActions.length > 0 || hits.length > 0;
  const showEmpty =
    !loading &&
    !hasResults &&
    (showEntitySearch || matchingActions.length === 0);

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="hidden h-8 gap-2 text-muted-foreground sm:inline-flex"
        onClick={() => setOpen(true)}
      >
        <Search className="h-3.5 w-3.5" />
        Buscar
        <kbd className="pointer-events-none rounded border bg-muted px-1.5 text-[10px] font-medium">
          ⌘K
        </kbd>
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="sm:hidden"
        aria-label="Buscar"
        onClick={() => setOpen(true)}
      >
        <Search className="h-4 w-4" />
      </Button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) {
            setQuery("");
            setHits([]);
            setLoading(false);
          }
        }}
      >
        <DialogContent className="overflow-hidden p-0 sm:max-w-lg">
          <DialogTitle className="sr-only">Busca global</DialogTitle>
          <Command shouldFilter={false} className="bg-transparent">
            <div className="flex items-center border-b px-3">
              <Search className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
              <Command.Input
                value={query}
                onValueChange={runSearch}
                placeholder="Buscar ou executar ação…"
                className="flex h-11 w-full rounded-md bg-transparent py-3 text-base outline-none placeholder:text-muted-foreground"
              />
            </div>
            <Command.List className="max-h-80 overflow-y-auto p-2">
              {createActions.length > 0 ? (
                <Command.Group
                  heading="Ações"
                  className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground"
                >
                  {createActions.map((action) => (
                    <Command.Item
                      key={action.id}
                      value={action.id}
                      onSelect={() => goTo(action.href)}
                      className={cn(
                        "flex cursor-pointer items-center justify-between gap-2 rounded-md px-2 py-2 text-sm",
                        "data-[selected=true]:bg-muted"
                      )}
                    >
                      <span className="font-medium">{action.label}</span>
                      <Badge variant="secondary" className="shrink-0 text-[10px]">
                        Ação
                      </Badge>
                    </Command.Item>
                  ))}
                </Command.Group>
              ) : null}

              {navActions.length > 0 ? (
                <Command.Group
                  heading="Navegação"
                  className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground"
                >
                  {navActions.map((action) => (
                    <Command.Item
                      key={action.id}
                      value={action.id}
                      onSelect={() => goTo(action.href)}
                      className={cn(
                        "flex cursor-pointer items-center justify-between gap-2 rounded-md px-2 py-2 text-sm",
                        "data-[selected=true]:bg-muted"
                      )}
                    >
                      <span className="font-medium">{action.label}</span>
                      <Badge variant="outline" className="shrink-0 text-[10px]">
                        Navegação
                      </Badge>
                    </Command.Item>
                  ))}
                </Command.Group>
              ) : null}

              {showEntitySearch ? (
                loading ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    Buscando...
                  </p>
                ) : hits.length > 0 ? (
                  <Command.Group
                    heading="Resultados"
                    className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground"
                  >
                    {hits.map((hit) => (
                      <Command.Item
                        key={hit.id}
                        value={hit.id}
                        onSelect={() => goTo(hit.href)}
                        className={cn(
                          "flex cursor-pointer flex-col gap-1 rounded-md px-2 py-2 text-sm",
                          "data-[selected=true]:bg-muted"
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-medium">{hit.title}</span>
                          <Badge
                            variant="outline"
                            className="shrink-0 text-[10px]"
                          >
                            {SEARCH_KIND_LABEL[hit.kind]}
                          </Badge>
                        </div>
                        {hit.subtitle ? (
                          <span className="text-xs text-muted-foreground">
                            {hit.subtitle}
                          </span>
                        ) : null}
                      </Command.Item>
                    ))}
                  </Command.Group>
                ) : showEmpty ? (
                  <Command.Empty className="py-6 text-center text-sm text-muted-foreground">
                    Nenhum resultado.
                  </Command.Empty>
                ) : null
              ) : null}

              {!showEntitySearch && matchingActions.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Nenhuma ação encontrada.
                </p>
              ) : null}
            </Command.List>
          </Command>
        </DialogContent>
      </Dialog>
    </>
  );
}
