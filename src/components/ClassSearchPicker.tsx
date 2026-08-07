import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Loader2, Plus, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { TypeIcon } from "@/components/TypeIcon";
import { FormLabel } from "@/components/FormLabel";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import { DimensionsEmptyHint } from "@/pages/admin/finance/components/NoClassesForTypeHint";
import type { Class } from "@/types/finance";
import type { Dimension } from "@/types/dimensions";
import { cn } from "@/lib/utils";
import {
  createClassApi,
  createTypeApi,
  fetchMostUsedClassIds,
} from "@/api/finance";
import {
  listNaturesForCreate,
  listTypesForCreate,
  QUICK_CREATE_TYPE_COLOR,
  QUICK_CREATE_TYPE_ICON,
  resolveNatureForCreate,
  shouldOfferCreateCta,
  type NaturePickOption,
  type TypePickOption,
} from "@/domain/dimensions/classSearchCreate";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";

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

function classToPickOption(created: Class): ClassPickOption | null {
  const type = created.type;
  if (!type) return null;
  return {
    id: created.id,
    name: created.name,
    typeId: type.id,
    typeName: type.name,
    natureId: type.nature?.id ?? 0,
    natureName: type.nature?.name ?? "",
    hexColor: type.hex_color ?? null,
    lucideIcon: type.lucide_icon ?? null,
  };
}

function buildSuggestions(
  options: ClassPickOption[],
  frequentIds: number[],
  limit: number
): ClassPickOption[] {
  const byId = new Map(options.map((o) => [o.id, o]));
  const suggested: ClassPickOption[] = [];

  for (const id of frequentIds) {
    const opt = byId.get(id);
    if (!opt) continue;
    suggested.push(opt);
    if (suggested.length >= limit) return suggested;
  }

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

type PanelMode = "search" | "create";
type CreateMode = "newType" | "existingType";

type ClassSearchPickerProps = {
  dimensions: Dimension[];
  value: number | null | undefined;
  onChange: (option: ClassPickOption | null) => void;
  /** Restrict to a nature name (e.g. "Despesa"). */
  preferredNatureName?: string | null;
  label?: string;
  required?: boolean;
  autoFocus?: boolean;
  /** Inline create when the typed name has no exact match. Default true. */
  allowCreate?: boolean;
};

export function ClassSearchPicker({
  dimensions,
  value,
  onChange,
  preferredNatureName = null,
  label = "Categoria",
  required = true,
  autoFocus = true,
  allowCreate = true,
}: ClassSearchPickerProps) {
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [frequentIds, setFrequentIds] = useState<number[]>([]);
  const [listOpen, setListOpen] = useState(false);
  const [extraOptions, setExtraOptions] = useState<ClassPickOption[]>([]);
  const [panel, setPanel] = useState<PanelMode>("search");
  const [createName, setCreateName] = useState("");
  const [createMode, setCreateMode] = useState<CreateMode>("newType");
  const [selectedTypeId, setSelectedTypeId] = useState<number | null>(null);
  const [selectedNatureId, setSelectedNatureId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);

  const baseOptions = useMemo(
    () => flattenClassOptions(dimensions, preferredNatureName),
    [dimensions, preferredNatureName]
  );

  const options = useMemo(() => {
    if (extraOptions.length === 0) return baseOptions;
    const byId = new Map(baseOptions.map((o) => [o.id, o]));
    for (const extra of extraOptions) {
      if (!byId.has(extra.id)) byId.set(extra.id, extra);
    }
    return [...byId.values()].sort((a, b) =>
      a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" })
    );
  }, [baseOptions, extraOptions]);

  const typeOptions = useMemo(
    () => listTypesForCreate(dimensions, preferredNatureName),
    [dimensions, preferredNatureName]
  );

  const natureOptions = useMemo(
    () => listNaturesForCreate(dimensions),
    [dimensions]
  );

  const defaultNature = useMemo(
    () => resolveNatureForCreate(dimensions, preferredNatureName),
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

  useEffect(() => {
    if (!selected) setListOpen(true);
  }, [selected]);

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

  const trimmedQuery = query.trim();
  const showCreateCta = shouldOfferCreateCta(
    trimmedQuery,
    options,
    allowCreate,
    natureOptions.length > 0
  );

  const showFrequentHint =
    panel === "search" &&
    !trimmedQuery &&
    frequentIds.some((id) => options.some((o) => o.id === id));

  function resetCreatePanel(name: string) {
    setCreateName(name);
    // Preferência: criar categoria nova (dor principal do CTA).
    setCreateMode("newType");
    setSelectedTypeId(typeOptions[0]?.id ?? null);
    setSelectedNatureId(defaultNature?.id ?? null);
    setPanel("create");
    setListOpen(true);
  }

  function openCreatePanel() {
    if (!allowCreate || creating) return;
    resetCreatePanel(trimmedQuery);
  }

  function selectCreated(option: ClassPickOption) {
    setExtraOptions((prev) =>
      prev.some((o) => o.id === option.id) ? prev : [...prev, option]
    );
    onChange(option);
    setQuery("");
    setPanel("search");
    setListOpen(false);
  }

  async function createUnderExistingType(type: TypePickOption, name: string) {
    const created = await createClassApi({
      name,
      type_id: type.id,
    });
    const option = classToPickOption(created);
    if (!option) {
      throw new Error("Subcategoria criada sem categoria associada.");
    }
    selectCreated(option);
    toast({ title: "Subcategoria criada", duration: 2000 });
  }

  async function createNewTypeAndClass(
    nature: NaturePickOption,
    name: string
  ) {
    const type = await createTypeApi({
      name,
      nature_id: nature.id,
      hex_color: QUICK_CREATE_TYPE_COLOR,
      lucide_icon: QUICK_CREATE_TYPE_ICON,
      exclude_from_spend: nature.name.toLowerCase() === "investimento",
    });
    const created = await createClassApi({
      name,
      type_id: type.id,
    });
    const option = classToPickOption(created) ?? {
      id: created.id,
      name: created.name,
      typeId: type.id,
      typeName: type.name,
      natureId: nature.id,
      natureName: nature.name,
      hexColor: type.hex_color ?? QUICK_CREATE_TYPE_COLOR,
      lucideIcon: type.lucide_icon ?? QUICK_CREATE_TYPE_ICON,
    };
    selectCreated(option);
    toast({ title: "Categoria criada", duration: 2000 });
  }

  async function submitCreate() {
    const name = createName.trim();
    if (!name || creating) return;

    setCreating(true);
    try {
      if (createMode === "existingType") {
        const type = typeOptions.find((t) => t.id === selectedTypeId);
        if (!type) {
          throw new Error("Selecione uma categoria existente.");
        }
        await createUnderExistingType(type, name);
        return;
      }

      const nature =
        natureOptions.find((n) => n.id === selectedNatureId) ?? defaultNature;
      if (!nature) {
        throw new Error("Nenhuma natureza disponível para criar a categoria.");
      }
      await createNewTypeAndClass(nature, name);
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(
          error,
          "Não foi possível criar a categoria."
        ),
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  }

  if (natureOptions.length === 0) {
    return (
      <div className="space-y-2">
        <FormLabel required={required}>{label}</FormLabel>
        <DimensionsEmptyHint missing="classes" />
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
            setPanel("search");
            setListOpen(true);
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
        <Popover
          open={listOpen}
          onOpenChange={(next) => {
            if (!next) {
              setListOpen(false);
              setPanel("search");
            }
          }}
          modal={false}
        >
          <PopoverAnchor asChild>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPanel("search");
                  setListOpen(true);
                }}
                onFocus={() => setListOpen(true)}
                onClick={() => setListOpen(true)}
                placeholder="Buscar categoria ou subcategoria (ex: Aluguel)"
                className="pl-9"
                autoFocus={autoFocus}
                autoComplete="off"
                disabled={creating}
              />
            </div>
          </PopoverAnchor>
          <PopoverContent
            align="start"
            side="bottom"
            sideOffset={6}
            onOpenAutoFocus={(e) => e.preventDefault()}
            onCloseAutoFocus={(e) => e.preventDefault()}
            className="w-[var(--radix-popover-trigger-width)] max-h-[min(22rem,55dvh)] overflow-y-auto overscroll-contain p-1.5 touch-pan-y"
            onWheel={(e) => e.stopPropagation()}
            onTouchMove={(e) => e.stopPropagation()}
          >
            {panel === "create" ? (
              <div className="space-y-3 p-1.5">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={creating}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setPanel("search");
                    }}
                    className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-muted-foreground transition hover:bg-accent/50 hover:text-foreground"
                  >
                    <ArrowLeft className="size-3.5" />
                    Voltar
                  </button>
                  <p className="text-xs font-medium text-foreground">
                    Criar agora
                  </p>
                </div>

                <div className="space-y-1.5">
                  <p className="text-[11px] text-muted-foreground">Nome</p>
                  <Input
                    value={createName}
                    onChange={(e) => setCreateName(e.target.value)}
                    placeholder="Ex: Farmácia"
                    autoFocus
                    disabled={creating}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void submitCreate();
                      }
                    }}
                  />
                </div>

                <div className="space-y-1.5">
                  <p className="text-[11px] text-muted-foreground">Onde salvar</p>
                  <div className="grid gap-1.5">
                    {typeOptions.length > 0 ? (
                      <button
                        type="button"
                        disabled={creating}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setCreateMode("existingType");
                          if (selectedTypeId == null && typeOptions[0]) {
                            setSelectedTypeId(typeOptions[0].id);
                          }
                        }}
                        className={cn(
                          "rounded-lg border px-2.5 py-2 text-left text-sm transition",
                          createMode === "existingType"
                            ? "border-primary/40 bg-accent/40"
                            : "border-transparent bg-background hover:border-border hover:bg-accent/30"
                        )}
                      >
                        Em categoria existente
                      </button>
                    ) : null}
                    <button
                      type="button"
                      disabled={creating}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setCreateMode("newType");
                      }}
                      className={cn(
                        "rounded-lg border px-2.5 py-2 text-left text-sm transition",
                        createMode === "newType"
                          ? "border-primary/40 bg-accent/40"
                          : "border-transparent bg-background hover:border-border hover:bg-accent/30"
                      )}
                    >
                      Nova categoria (mesmo nome)
                    </button>
                  </div>
                </div>

                {createMode === "existingType" && typeOptions.length > 0 ? (
                  <div className="max-h-36 space-y-1 overflow-y-auto">
                    {typeOptions.map((type) => (
                      <button
                        key={type.id}
                        type="button"
                        disabled={creating}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setSelectedTypeId(type.id);
                          setCreateMode("existingType");
                        }}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-lg border px-2.5 py-2 text-left transition",
                          selectedTypeId === type.id
                            ? "border-primary/40 bg-accent/40"
                            : "border-transparent bg-background hover:border-border hover:bg-accent/30"
                        )}
                      >
                        <span
                          className="flex size-8 shrink-0 items-center justify-center rounded-full"
                          style={{
                            backgroundColor: type.hexColor
                              ? `${type.hexColor}33`
                              : "hsl(var(--muted))",
                          }}
                        >
                          <TypeIcon
                            name={type.lucideIcon}
                            className="size-3.5"
                            style={
                              type.hexColor
                                ? { color: type.hexColor }
                                : undefined
                            }
                          />
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium">
                            {type.name}
                          </span>
                          <span className="block text-[11px] text-muted-foreground">
                            {type.natureName}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                ) : null}

                {createMode === "newType" &&
                !preferredNatureName &&
                natureOptions.length > 1 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {natureOptions.map((nature) => (
                      <button
                        key={nature.id}
                        type="button"
                        disabled={creating}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setSelectedNatureId(nature.id);
                        }}
                        className={cn(
                          "rounded-full border px-2.5 py-1 text-xs transition",
                          selectedNatureId === nature.id
                            ? "border-primary/40 bg-accent/50 font-medium"
                            : "border-border bg-background text-muted-foreground hover:bg-accent/30"
                        )}
                      >
                        {nature.name}
                      </button>
                    ))}
                  </div>
                ) : null}

                {createMode === "newType" && preferredNatureName ? (
                  <p className="text-[11px] text-muted-foreground">
                    Natureza: {preferredNatureName}
                  </p>
                ) : null}

                <Button
                  type="button"
                  className="w-full"
                  disabled={creating || !createName.trim()}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    void submitCreate();
                  }}
                >
                  {creating ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Criando…
                    </>
                  ) : (
                    "Criar e usar"
                  )}
                </Button>
              </div>
            ) : (
              <>
                {showFrequentHint ? (
                  <p className="px-2 pb-1.5 pt-0.5 text-[11px] text-muted-foreground">
                    Subcategorias mais usadas
                  </p>
                ) : null}
                {filtered.length === 0 ? (
                  <p className="px-2 py-3 text-center text-xs text-muted-foreground">
                    {trimmedQuery
                      ? "Nenhuma categoria encontrada."
                      : "Digite para buscar ou crie uma nova."}
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {filtered.map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          onChange(opt);
                          setQuery("");
                          setListOpen(false);
                        }}
                        className="flex w-full items-center gap-3 rounded-lg border border-transparent bg-background px-2.5 py-2 text-left transition hover:border-border hover:bg-accent/40"
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
                    ))}
                  </div>
                )}

                {allowCreate ? (
                  <div
                    className={cn(
                      "mt-1.5 space-y-1 border-t border-border/70 px-1 pt-2",
                      filtered.length === 0 && "border-t-0 pt-0"
                    )}
                  >
                    {showCreateCta || filtered.length === 0 ? (
                      <p className="px-1.5 text-[11px] text-muted-foreground">
                        Não achou a categoria desejada?
                      </p>
                    ) : null}
                    <button
                      type="button"
                      disabled={creating}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        if (trimmedQuery) {
                          openCreatePanel();
                          return;
                        }
                        resetCreatePanel("");
                      }}
                      className="flex w-full items-center gap-2 rounded-lg border border-dashed border-border bg-background px-2.5 py-2 text-left text-sm transition hover:bg-accent/40"
                    >
                      <Plus className="size-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 truncate font-medium">
                        {showCreateCta
                          ? `Crie agora “${trimmedQuery}”`
                          : "Crie agora"}
                      </span>
                    </button>
                  </div>
                ) : null}
              </>
            )}
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
