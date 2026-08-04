import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { TypeIcon } from "@/components/TypeIcon";
import { FormLabel } from "@/components/FormLabel";
import { DimensionsEmptyHint } from "@/pages/admin/finance/components/NoClassesForTypeHint";
import type { Dimension } from "@/types/dimensions";
import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";
import { fetchMostUsedClassIds } from "@/api/finance";

/** Quantidade de sugestões quando a busca está vazia (igual ao limite anterior). */
export const CLASS_SEARCH_SUGGESTION_LIMIT = 12;
const CLASS_SEARCH_RESULT_LIMIT = 20;

export type ClassPickOption = {
  id: number;
  name: string;
  typeId: number;
  typeName: string;
  natureId: number;
  natureName: string;
  hexColor: string | null;
  lucideIcon: string | null;
};

export function flattenClassOptions(
  dimensions: Dimension[],
  natureFilter?: string | null
): ClassPickOption[] {
  const needle = natureFilter?.trim().toLowerCase() || null;
  const out: ClassPickOption[] = [];
  for (const nature of dimensions) {
    if (needle && nature.name.toLowerCase() !== needle) continue;
    for (const type of nature.types) {
      for (const cls of type.classes) {
        out.push({
          id: cls.id,
          name: cls.name,
          typeId: type.id,
          typeName: type.name,
          natureId: nature.id,
          natureName: nature.name,
          hexColor: type.hex_color ?? null,
          lucideIcon: type.lucide_icon ?? null,
        });
      }
    }
  }
  return out.sort((a, b) =>
    a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" })
  );
}

function buildSuggestions(
  options: ClassPickOption[],
  frequentIds: number[],
  limit: number
): ClassPickOption[] {
  const byId = new Map(options.map((o) => [o.id, o]));
  const suggested: ClassPickOption[] = [];

  // Só subcategorias com uso — ordenadas pela frequência (já vem ranqueada).
  for (const id of frequentIds) {
    const opt = byId.get(id);
    if (!opt) continue;
    suggested.push(opt);
    if (suggested.length >= limit) return suggested;
  }

  // Sem histórico ainda: fallback alfabético limitado.
  if (suggested.length === 0) {
    return options.slice(0, limit);
  }

  return suggested;
}

function sortByUsage(
  options: ClassPickOption[],
  frequentIds: number[]
): ClassPickOption[] {
  const rank = new Map(frequentIds.map((id, index) => [id, index]));
  return [...options].sort((a, b) => {
    const ra = rank.get(a.id);
    const rb = rank.get(b.id);
    if (ra != null && rb != null) return ra - rb;
    if (ra != null) return -1;
    if (rb != null) return 1;
    return a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" });
  });
}

type ClassSearchPickerProps = {
  dimensions: Dimension[];
  value: number | null | undefined;
  onChange: (option: ClassPickOption | null) => void;
  /** Restrict to a nature name (e.g. "Despesa"). */
  preferredNatureName?: string | null;
  label?: string;
  required?: boolean;
  autoFocus?: boolean;
};

export function ClassSearchPicker({
  dimensions,
  value,
  onChange,
  preferredNatureName = null,
  label = "Categoria",
  required = true,
  autoFocus = true,
}: ClassSearchPickerProps) {
  const [query, setQuery] = useState("");
  const [frequentIds, setFrequentIds] = useState<number[]>([]);

  const options = useMemo(
    () => flattenClassOptions(dimensions, preferredNatureName),
    [dimensions, preferredNatureName]
  );

  useEffect(() => {
    let cancelled = false;
    void fetchMostUsedClassIds(
      CLASS_SEARCH_SUGGESTION_LIMIT,
      preferredNatureName
    )
      .then((ids) => {
        if (!cancelled) setFrequentIds(ids);
      })
      .catch(() => {
        if (!cancelled) setFrequentIds([]);
      });
    return () => {
      cancelled = true;
    };
  }, [preferredNatureName]);

  const selected = options.find((o) => o.id === value) ?? null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return buildSuggestions(
        options,
        frequentIds,
        CLASS_SEARCH_SUGGESTION_LIMIT
      );
    }
    const matches = options.filter(
      (o) =>
        o.name.toLowerCase().includes(q) ||
        o.typeName.toLowerCase().includes(q) ||
        o.natureName.toLowerCase().includes(q)
    );
    return sortByUsage(matches, frequentIds).slice(
      0,
      CLASS_SEARCH_RESULT_LIMIT
    );
  }, [options, query, frequentIds]);

  const showFrequentHint =
    !query.trim() &&
    frequentIds.some((id) => options.some((o) => o.id === id));

  if (options.length === 0) {
    return (
      <div className="space-y-2">
        <FormLabel required={required}>{label}</FormLabel>
        <DimensionsEmptyHint missing="classes" />
        <p className="text-xs text-muted-foreground">
          <Link to="/finance/categories" className="underline underline-offset-2">
            Abrir Categorias
          </Link>{" "}
          para cadastrar categorias e subcategorias.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <FormLabel required={required}>{label}</FormLabel>
      {selected ? (
        <button
          type="button"
          onClick={() => {
            onChange(null);
            setQuery("");
          }}
          className="flex w-full items-center gap-3 rounded-xl border bg-card px-3 py-2.5 text-left transition hover:bg-accent/40"
        >
          <span
            className="flex size-9 shrink-0 items-center justify-center rounded-full"
            style={{
              backgroundColor: selected.hexColor
                ? `${selected.hexColor}33`
                : "hsl(var(--muted))",
            }}
          >
            <TypeIcon
              name={selected.lucideIcon}
              className="size-4"
              style={
                selected.hexColor
                  ? { color: selected.hexColor }
                  : undefined
              }
            />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[11px] text-muted-foreground">
              {selected.typeName}
              <span className="text-muted-foreground/70">
                {" "}
                · {selected.natureName}
              </span>
            </span>
            <span className="block truncate text-sm font-medium">
              {selected.name}
            </span>
          </span>
          <span className="text-xs text-muted-foreground">Trocar</span>
        </button>
      ) : (
        <>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar categoria ou subcategoria (ex: Aluguel)"
              className="pl-9"
              autoFocus={autoFocus}
            />
          </div>
          {showFrequentHint ? (
            <p className="text-[11px] text-muted-foreground">
              Subcategorias mais usadas
            </p>
          ) : null}
          <div className="max-h-56 space-y-1.5 overflow-y-auto rounded-xl border bg-muted/20 p-1.5">
            {filtered.length === 0 ? (
              <p className="px-2 py-3 text-center text-xs text-muted-foreground">
                Nenhuma subcategoria encontrada.
              </p>
            ) : (
              filtered.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    onChange(opt);
                    setQuery("");
                  }}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg border border-transparent bg-background px-2.5 py-2 text-left transition hover:border-border hover:bg-accent/40"
                  )}
                >
                  <span
                    className="flex size-9 shrink-0 items-center justify-center rounded-full"
                    style={{
                      backgroundColor: opt.hexColor
                        ? `${opt.hexColor}33`
                        : "hsl(var(--muted))",
                    }}
                  >
                    <TypeIcon
                      name={opt.lucideIcon}
                      className="size-4"
                      style={
                        opt.hexColor ? { color: opt.hexColor } : undefined
                      }
                    />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[11px] text-muted-foreground">
                      {opt.typeName}
                      <span className="text-muted-foreground/70">
                        {" "}
                        · {opt.natureName}
                      </span>
                    </span>
                    <span className="block truncate text-sm font-medium">
                      {opt.name}
                    </span>
                  </span>
                </button>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
