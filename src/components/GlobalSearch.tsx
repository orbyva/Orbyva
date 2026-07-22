import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Command } from "cmdk";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { cn } from "@/lib/utils";

const SEARCH_DEBOUNCE_MS = 280;

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<GlobalSearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);

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

  function go(hit: GlobalSearchHit) {
    setOpen(false);
    setQuery("");
    setHits([]);
    navigate(hit.href);
  }

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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="overflow-hidden p-0 sm:max-w-lg">
          <DialogTitle className="sr-only">Busca global</DialogTitle>
          <Command shouldFilter={false} className="bg-transparent">
            <div className="flex items-center border-b px-3">
              <Search className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
              <Command.Input
                value={query}
                onValueChange={runSearch}
                placeholder="Metas, hábitos, finanças, cinema..."
                className="flex h-11 w-full rounded-md bg-transparent py-3 text-base outline-none placeholder:text-muted-foreground"
              />
            </div>
            <Command.List className="max-h-80 overflow-y-auto p-2">
              {loading ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Buscando...
                </p>
              ) : query.trim().length < 2 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Digite pelo menos 2 caracteres.
                </p>
              ) : hits.length === 0 ? (
                <Command.Empty className="py-6 text-center text-sm text-muted-foreground">
                  Nenhum resultado.
                </Command.Empty>
              ) : (
                hits.map((hit) => (
                  <Command.Item
                    key={hit.id}
                    value={hit.id}
                    onSelect={() => go(hit)}
                    className={cn(
                      "flex cursor-pointer flex-col gap-0.5 rounded-md px-2 py-2 text-sm",
                      "data-[selected=true]:bg-muted"
                    )}
                  >
                    <span className="font-medium">{hit.title}</span>
                    <span className="text-xs text-muted-foreground">
                      {SEARCH_KIND_LABEL[hit.kind]}
                      {hit.subtitle ? ` · ${hit.subtitle}` : ""}
                    </span>
                  </Command.Item>
                ))
              )}
            </Command.List>
          </Command>
        </DialogContent>
      </Dialog>
    </>
  );
}
