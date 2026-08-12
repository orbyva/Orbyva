import { useEffect, useMemo, useRef, useState } from "react";
import { LayoutGroup, motion, useReducedMotion } from "framer-motion";
import { GripVertical, Layers, Plus, Search, Trash2 } from "lucide-react";
import { HexColorPicker } from "react-colorful";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  TYPE_ICONS,
  normalizeHexColor,
} from "@/lib/typeIconCatalog";
import { TypeIcon } from "@/components/TypeIcon";
import { EmptyState } from "@/components/EmptyState";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
} from "@/components/ui/alert-dialog";
import {
  createClassApi,
  createTypeApi,
  deleteClassApi,
  deleteTypeApi,
  fetchClasses,
  updateClassApi,
  updateTypeApi,
} from "@/api/finance";
import type { Class, Nature, Type } from "@/types/finance";
import { useToast } from "@/hooks/use-toast";
import { useTouchDrag } from "@/hooks/useTouchDrag";
import { getErrorMessage } from "@/lib/errors";
import { dropZoneAttrs, readDropZone } from "@/lib/dropZone";
import { LIST_LAYOUT_TRANSITION } from "@/lib/layoutMotion";
import { cn, sortByNamePt } from "@/lib/utils";
import { repairOrphanClasses } from "@/domain/onboarding/defaults";
import {
  filterTypesBySearch,
  visibleClassesForTypeSearch,
} from "@/domain/dimensions/search";

/** `type|<typeId>` */
const TYPE_ZONE = "type";

type DimensionsBoardProps = {
  natures: Nature[];
  types: Type[];
  onTypesChange: (types: Type[]) => void;
};

export function DimensionsBoard({
  natures,
  types,
  onTypesChange,
}: DimensionsBoardProps) {
  const { toast } = useToast();
  const [classes, setClasses] = useState<Class[]>([]);
  const [addingType, setAddingType] = useState(false);
  const [newTypeName, setNewTypeName] = useState("");
  const [newTypeNatureId, setNewTypeNatureId] = useState<number>(0);
  const [newTypeColor, setNewTypeColor] = useState<string | null>(null);
  const [newTypeIcon, setNewTypeIcon] = useState<string | null>(null);
  const [showNewColorPicker, setShowNewColorPicker] = useState(false);
  const [editingTypeId, setEditingTypeId] = useState<number | null>(null);
  const [editTypeName, setEditTypeName] = useState("");
  const [editTypeColor, setEditTypeColor] = useState<string | null>(null);
  const [editTypeIcon, setEditTypeIcon] = useState<string | null>(null);
  const [showEditColorPicker, setShowEditColorPicker] = useState(false);
  const [addingClassForType, setAddingClassForType] = useState<number | null>(
    null
  );
  const [newClassName, setNewClassName] = useState("");
  const [editingClassId, setEditingClassId] = useState<number | null>(null);
  const [editingClassName, setEditingClassName] = useState("");
  const [deletingTypeId, setDeletingTypeId] = useState<number | null>(null);
  const [deletingClassId, setDeletingClassId] = useState<number | null>(null);
  const [dragClassId, setDragClassId] = useState<number | null>(null);
  const [dropTypeId, setDropTypeId] = useState<number | null>(null);
  const [natureFilter, setNatureFilter] = useState<"all" | number>("all");
  const [search, setSearch] = useState("");
  const classesBooted = useRef(false);
  const reduceMotion = useReducedMotion();

  const { handleProps: dragHandleProps, dragOverlay } = useTouchDrag({
    onStart: (classId) => setDragClassId(Number(classId)),
    onZoneChange: (zone) => {
      const target = readDropZone(zone);
      setDropTypeId(
        target?.kind === TYPE_ZONE ? Number(target.parts[0]) : null
      );
    },
    onDrop: (classId, zone) => {
      const target = readDropZone(zone);
      if (target?.kind !== TYPE_ZONE) return;
      onDropOnType(Number(target.parts[0]), Number(classId));
    },
    onCancel: () => {
      setDragClassId(null);
      setDropTypeId(null);
    },
  });

  // Carrega classes (e repara órfãs) uma vez — não a cada criação de categoria.
  // Marca `classesBooted` só após sucesso (Strict Mode cancela o 1º efeito).
  useEffect(() => {
    if (types.length === 0) {
      setClasses([]);
      return;
    }
    if (classesBooted.current) return;

    let cancelled = false;
    void (async () => {
      try {
        const repaired = await repairOrphanClasses(types);
        if (cancelled) return;
        if (repaired > 0) {
          toast({
            title: "Subcategorias religadas",
            description: `${repaired} subcategoria(s) órfã(s) foram associadas a uma categoria válida.`,
            duration: 3500,
          });
        }
        const list = await fetchClasses();
        if (cancelled) return;
        setClasses(list);
        classesBooted.current = true;
      } catch (error) {
        if (!cancelled) {
          toast({
            title: "Erro",
            description: getErrorMessage(
              error,
              "Não foi possível carregar as subcategorias."
            ),
            variant: "destructive",
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [types, toast]);

  useEffect(() => {
    if (!newTypeNatureId && natures[0]) {
      setNewTypeNatureId(natures[0].id);
    }
  }, [natures, newTypeNatureId]);

  const classesByType = useMemo(() => {
    const map = new Map<number, Class[]>();
    for (const cls of classes) {
      const tid = cls.type_id ?? cls.type?.id;
      if (tid == null) continue;
      const list = map.get(tid) ?? [];
      list.push(cls);
      map.set(tid, list);
    }
    for (const [tid, list] of map) {
      map.set(
        tid,
        [...list].sort((a, b) =>
          a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" })
        )
      );
    }
    return map;
  }, [classes]);

  const sortedTypes = useMemo(() => sortByNamePt(types), [types]);

  const natureOrder = useMemo(() => {
    const preferred = ["Receita", "Despesa", "Investimento"];
    return [...natures].sort((a, b) => {
      const ia = preferred.indexOf(a.name);
      const ib = preferred.indexOf(b.name);
      if (ia === -1 && ib === -1) return a.name.localeCompare(b.name, "pt-BR");
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
  }, [natures]);

  const visibleTypes = useMemo(() => {
    const byNature =
      natureFilter === "all"
        ? sortedTypes
        : sortedTypes.filter((t) => {
            const nid = t.nature_id ?? t.nature?.id;
            return nid === natureFilter;
          });
    return filterTypesBySearch(byNature, classes, search);
  }, [sortedTypes, natureFilter, classes, search]);

  async function handleCreateType() {
    if (!newTypeName.trim() || !newTypeNatureId) return;
    try {
      const maxOrder = types.reduce(
        (max, t) => Math.max(max, Number(t.order) || 0),
        0
      );
      const created = await createTypeApi({
        name: newTypeName.trim(),
        nature_id: newTypeNatureId,
        hex_color: normalizeHexColor(newTypeColor ?? "") ?? newTypeColor,
        lucide_icon: newTypeIcon,
        order: maxOrder + 1,
      });
      onTypesChange([...types, created]);
      setNewTypeName("");
      setNewTypeColor(null);
      setNewTypeIcon(null);
      setShowNewColorPicker(false);
      setAddingType(false);
      toast({ title: "Categoria criada", duration: 2000 });
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Não foi possível criar a categoria."),
        variant: "destructive",
      });
    }
  }

  function startEditType(type: Type) {
    setEditingTypeId(type.id);
    setEditTypeName(type.name);
    setEditTypeColor(type.hex_color);
    setEditTypeIcon(type.lucide_icon);
    setShowEditColorPicker(false);
  }

  async function handleSaveTypeEdit() {
    if (editingTypeId == null || !editTypeName.trim()) {
      setEditingTypeId(null);
      return;
    }
    try {
      await updateTypeApi({
        id: editingTypeId,
        name: editTypeName.trim(),
        hex_color: normalizeHexColor(editTypeColor ?? "") ?? editTypeColor,
        lucide_icon: editTypeIcon,
      });
      onTypesChange(
        types.map((t) =>
          t.id === editingTypeId
            ? {
                ...t,
                name: editTypeName.trim(),
                hex_color:
                  normalizeHexColor(editTypeColor ?? "") ?? editTypeColor,
                lucide_icon: editTypeIcon,
              }
            : t
        )
      );
      setEditingTypeId(null);
      toast({ title: "Categoria atualizada", duration: 2000 });
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Não foi possível salvar a categoria."),
        variant: "destructive",
      });
    }
  }

  async function handleCreateClass(typeId: number) {
    if (!newClassName.trim()) return;
    try {
      const created = await createClassApi({
        name: newClassName.trim(),
        type_id: typeId,
      });
      setClasses((prev) => [...prev, created]);
      setNewClassName("");
      setAddingClassForType(null);
      toast({ title: "Subcategoria criada", duration: 2000 });
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Não foi possível criar a subcategoria."),
        variant: "destructive",
      });
    }
  }

  async function handleRenameClass(id: number) {
    if (!editingClassName.trim()) {
      setEditingClassId(null);
      return;
    }
    try {
      await updateClassApi({ id, name: editingClassName.trim() });
      setClasses((prev) =>
        prev.map((c) =>
          c.id === id ? { ...c, name: editingClassName.trim() } : c
        )
      );
      setEditingClassId(null);
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Não foi possível renomear."),
        variant: "destructive",
      });
    }
  }

  async function confirmDeleteType(id: number) {
    try {
      await deleteTypeApi(id);
      onTypesChange(types.filter((t) => t.id !== id));
      setClasses((prev) =>
        prev.filter((c) => (c.type_id ?? c.type?.id) !== id)
      );
      toast({ title: "Categoria excluída", duration: 2000 });
    } catch (error) {
      toast({
        title: "Não foi possível excluir",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setDeletingTypeId(null);
    }
  }

  async function confirmDeleteClass(id: number) {
    try {
      await deleteClassApi(id);
      setClasses((prev) => prev.filter((c) => c.id !== id));
      toast({ title: "Subcategoria excluída", duration: 2000 });
    } catch (error) {
      toast({
        title: "Não foi possível excluir",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setDeletingClassId(null);
    }
  }

  function onDropOnType(targetTypeId: number, classId = dragClassId) {
    if (classId == null) return;
    const cls = classes.find((c) => c.id === classId);
    const fromType = cls?.type_id ?? cls?.type?.id;
    setDragClassId(null);
    setDropTypeId(null);
    if (!cls || fromType === targetTypeId) return;
    void (async () => {
      try {
        await updateClassApi({ id: cls.id, type_id: targetTypeId });
        setClasses((prev) =>
          prev.map((c) =>
            c.id === cls.id
              ? {
                  ...c,
                  type_id: targetTypeId,
                  type: types.find((t) => t.id === targetTypeId) ?? c.type,
                }
              : c
          )
        );
      } catch (error) {
        toast({
          title: "Erro ao mover",
          description: getErrorMessage(error),
          variant: "destructive",
        });
      }
    })();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Categorias com subcategorias aninhadas. Arraste uma subcategoria pelo
            punho até outra categoria para reassociar.
          </p>
          <div
            className="flex max-w-full gap-1 overflow-x-auto pb-0.5"
            role="tablist"
            aria-label="Filtrar por natureza"
          >
            <Button
              type="button"
              size="sm"
              variant={natureFilter === "all" ? "default" : "outline"}
              className="shrink-0"
              role="tab"
              aria-selected={natureFilter === "all"}
              onClick={() => setNatureFilter("all")}
            >
              Todas
            </Button>
            {natureOrder.map((n) => (
              <Button
                key={n.id}
                type="button"
                size="sm"
                variant={natureFilter === n.id ? "default" : "outline"}
                className="shrink-0"
                role="tab"
                aria-selected={natureFilter === n.id}
                onClick={() => {
                  setNatureFilter(n.id);
                  setNewTypeNatureId(n.id);
                }}
              >
                {n.name}
              </Button>
            ))}
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="shrink-0 self-end sm:self-start"
          onClick={() => {
            setAddingType((v) => !v);
            if (natureFilter !== "all") {
              setNewTypeNatureId(natureFilter);
            }
          }}
          aria-label="Nova categoria"
        >
          <Plus className="size-4" />
        </Button>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar categorias ou subcategorias…"
          className="pl-9"
          aria-label="Buscar categorias"
        />
      </div>

      {addingType ? (
        <div className="space-y-3 rounded-xl border bg-card p-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-1">
              <label className="text-xs text-muted-foreground">Nome da categoria</label>
              <Input
                value={newTypeName}
                onChange={(e) => setNewTypeName(e.target.value)}
                placeholder="Ex: Alimentação"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleCreateType();
                }}
              />
            </div>
            <div className="w-full space-y-1 sm:w-44">
              <label className="text-xs text-muted-foreground">Natureza</label>
              <Select
                value={String(newTypeNatureId || "")}
                onValueChange={(v) => setNewTypeNatureId(Number(v))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Natureza" />
                </SelectTrigger>
                <SelectContent>
                  {natures.map((n) => (
                    <SelectItem key={n.id} value={String(n.id)}>
                      {n.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Cor</label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="h-9 w-9 shrink-0 rounded-md border"
                  style={{ backgroundColor: newTypeColor || "#94a3b8" }}
                  onClick={() => setShowNewColorPicker((v) => !v)}
                  aria-label="Escolher cor"
                />
                <Input
                  value={newTypeColor ?? ""}
                  placeholder="#0EA5E9"
                  onChange={(e) => setNewTypeColor(e.target.value || null)}
                  onBlur={() => {
                    const n = normalizeHexColor(newTypeColor ?? "");
                    if (n) setNewTypeColor(n);
                  }}
                />
              </div>
              {showNewColorPicker ? (
                <HexColorPicker
                  color={newTypeColor || "#94a3b8"}
                  onChange={(color) => setNewTypeColor(color)}
                />
              ) : null}
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Ícone</label>
              <Select
                value={newTypeIcon ?? "none"}
                onValueChange={(value) =>
                  setNewTypeIcon(value === "none" ? null : value)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Ícone" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem ícone</SelectItem>
                  {TYPE_ICONS.map((icon) => (
                    <SelectItem key={icon.id} value={icon.id}>
                      <span className="inline-flex items-center gap-2">
                        <TypeIcon name={icon.id} className="size-3.5" />
                        {icon.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                setAddingType(false);
                setShowNewColorPicker(false);
              }}
            >
              Cancelar
            </Button>
            <Button onClick={() => void handleCreateType()}>Criar</Button>
          </div>
        </div>
      ) : null}

      {sortedTypes.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="Nenhuma categoria"
          description="Crie a primeira categoria (ex: Alimentação, Moradia) e depois as subcategorias."
          action={
            <Button onClick={() => setAddingType(true)}>Nova categoria</Button>
          }
        />
      ) : visibleTypes.length === 0 ? (
        <EmptyState
          icon={Layers}
          title={
            search.trim()
              ? "Nenhuma categoria encontrada"
              : "Nada nesta natureza"
          }
          description={
            search.trim()
              ? "Tente outro termo ou limpe a busca."
              : "Não há categorias neste filtro. Crie uma nova ou escolha “Todas”."
          }
          action={
            search.trim() ? undefined : (
              <Button
                onClick={() => {
                  if (natureFilter !== "all") setNewTypeNatureId(natureFilter);
                  setAddingType(true);
                }}
              >
                Nova categoria
              </Button>
            )
          }
        />
      ) : (
        <LayoutGroup id="finance-dimension-classes">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visibleTypes.map((type) => {
            const natureName =
              type.nature?.name ??
              natures.find((n) => n.id === type.nature_id)?.name ??
              "";
            const typeClasses = visibleClassesForTypeSearch(
              type,
              classesByType.get(type.id) ?? [],
              search
            );
            return (
              <article
                key={type.id}
                className={cn(
                  "flex flex-col rounded-2xl border bg-card p-3 shadow-sm transition-colors",
                  dragClassId != null &&
                    dropTypeId === type.id &&
                    "border-primary bg-primary/5"
                )}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => onDropOnType(type.id)}
                {...dropZoneAttrs(TYPE_ZONE, type.id)}
              >
                <header className="mb-2 flex items-start justify-between gap-2">
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <button
                      type="button"
                      className="flex size-9 shrink-0 items-center justify-center rounded-lg"
                      style={{
                        backgroundColor: type.hex_color
                          ? `${type.hex_color}33`
                          : "hsl(var(--muted))",
                      }}
                      onClick={() => startEditType(type)}
                      aria-label="Editar categoria"
                      title="Editar categoria (cor e ícone)"
                    >
                      <TypeIcon
                        name={type.lucide_icon}
                        className="size-4"
                        style={
                          type.hex_color
                            ? { color: type.hex_color }
                            : undefined
                        }
                      />
                    </button>
                    <div className="min-w-0">
                      {editingTypeId === type.id ? (
                        <Input
                          value={editTypeName}
                          onChange={(e) => setEditTypeName(e.target.value)}
                          className="h-8"
                          autoFocus
                        />
                      ) : (
                        <button
                          type="button"
                          className="truncate text-left font-semibold hover:underline"
                          onClick={() => startEditType(type)}
                        >
                          {type.name}
                        </button>
                      )}
                      <p className="text-[11px] text-muted-foreground">
                        {natureName}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-8"
                      onClick={() => {
                        setAddingClassForType(type.id);
                        setNewClassName("");
                      }}
                      aria-label="Nova subcategoria"
                    >
                      <Plus className="size-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-8 text-destructive"
                      onClick={() => setDeletingTypeId(type.id)}
                      aria-label="Excluir categoria"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </header>

                {editingTypeId === type.id ? (
                  <div className="mb-3 space-y-2 rounded-xl border bg-muted/20 p-2">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div className="space-y-1">
                        <label className="text-[11px] text-muted-foreground">
                          Cor
                        </label>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            className="h-8 w-8 shrink-0 rounded-md border"
                            style={{
                              backgroundColor: editTypeColor || "#94a3b8",
                            }}
                            onClick={() => setShowEditColorPicker((v) => !v)}
                            aria-label="Escolher cor"
                          />
                          <Input
                            value={editTypeColor ?? ""}
                            className="h-8"
                            onChange={(e) =>
                              setEditTypeColor(e.target.value || null)
                            }
                          />
                        </div>
                        {showEditColorPicker ? (
                          <HexColorPicker
                            color={editTypeColor || "#94a3b8"}
                            onChange={(color) => setEditTypeColor(color)}
                          />
                        ) : null}
                      </div>
                      <div className="space-y-1">
                        <label className="text-[11px] text-muted-foreground">
                          Ícone
                        </label>
                        <Select
                          value={editTypeIcon ?? "none"}
                          onValueChange={(value) =>
                            setEditTypeIcon(value === "none" ? null : value)
                          }
                        >
                          <SelectTrigger className="h-8">
                            <SelectValue placeholder="Ícone" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Sem ícone</SelectItem>
                            {TYPE_ICONS.map((icon) => (
                              <SelectItem key={icon.id} value={icon.id}>
                                <span className="inline-flex items-center gap-2">
                                  <TypeIcon
                                    name={icon.id}
                                    className="size-3.5"
                                  />
                                  {icon.label}
                                </span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditingTypeId(null)}
                      >
                        Cancelar
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => void handleSaveTypeEdit()}
                      >
                        Salvar
                      </Button>
                    </div>
                  </div>
                ) : null}

                <ul className="min-h-[3rem] flex-1 space-y-1.5">
                  {typeClasses.map((cls) => (
                    <motion.li
                      key={cls.id}
                      layout={!reduceMotion ? "position" : false}
                      layoutId={
                        !reduceMotion ? `class-${cls.id}` : undefined
                      }
                      transition={LIST_LAYOUT_TRANSITION}
                      draggable
                      onDragStart={() => setDragClassId(cls.id)}
                      onDragEnd={() => setDragClassId(null)}
                      className={cn(
                        "flex items-center gap-1.5 rounded-xl border bg-background px-2 py-1.5",
                        dragClassId === cls.id && "opacity-60"
                      )}
                    >
                      <span
                        {...dragHandleProps(String(cls.id), cls.name)}
                        className="-my-1 -ml-1 shrink-0 cursor-grab p-1 text-muted-foreground active:cursor-grabbing"
                        aria-hidden
                      >
                        <GripVertical className="size-3.5" />
                      </span>
                      {editingClassId === cls.id ? (
                        <Input
                          value={editingClassName}
                          onChange={(e) => setEditingClassName(e.target.value)}
                          className="h-8"
                          autoFocus
                          onBlur={() => void handleRenameClass(cls.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter")
                              void handleRenameClass(cls.id);
                            if (e.key === "Escape") setEditingClassId(null);
                          }}
                        />
                      ) : (
                        <button
                          type="button"
                          className="min-w-0 flex-1 truncate rounded-md px-1 text-left text-sm hover:bg-muted/50"
                          onClick={() => {
                            setEditingClassId(cls.id);
                            setEditingClassName(cls.name);
                          }}
                        >
                          {cls.name}
                        </button>
                      )}
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-7 shrink-0 text-destructive"
                        onClick={() => setDeletingClassId(cls.id)}
                        aria-label="Excluir subcategoria"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </motion.li>
                  ))}
                  {addingClassForType === type.id ? (
                    <li className="flex gap-1.5">
                      <Input
                        value={newClassName}
                        onChange={(e) => setNewClassName(e.target.value)}
                        placeholder="Nome da subcategoria"
                        className="h-8"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter")
                            void handleCreateClass(type.id);
                          if (e.key === "Escape") setAddingClassForType(null);
                        }}
                      />
                      <Button
                        size="sm"
                        className="h-8"
                        onClick={() => void handleCreateClass(type.id)}
                      >
                        Ok
                      </Button>
                    </li>
                  ) : null}
                </ul>
              </article>
            );
          })}
          <div
            aria-hidden
            className="hidden min-h-[8rem] rounded-2xl border border-dashed bg-muted/20 sm:block"
          />
          </div>
        </LayoutGroup>
      )}

      <AlertDialog
        open={deletingTypeId != null}
        onOpenChange={(o) => !o && setDeletingTypeId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>Excluir categoria?</AlertDialogHeader>
          <p className="text-sm text-muted-foreground">
            Se ainda houver subcategorias nesta categoria, a exclusão será
            bloqueada — exclua ou mova as subcategorias antes.
          </p>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                deletingTypeId != null && void confirmDeleteType(deletingTypeId)
              }
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={deletingClassId != null}
        onOpenChange={(o) => !o && setDeletingClassId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>Excluir subcategoria?</AlertDialogHeader>
          <p className="text-sm text-muted-foreground">
            Só é possível se não estiver em uso em lançamentos.
          </p>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                deletingClassId != null &&
                void confirmDeleteClass(deletingClassId)
              }
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {dragOverlay}
    </div>
  );
}
