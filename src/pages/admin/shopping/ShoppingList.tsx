import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Pen, Plus, ShoppingCart, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import { EmptyState } from "@/components/EmptyState";
import { ICON_EDIT_BUTTON_CLASS } from "@/components/FormLabel";
import { ModuleGuide, ModuleGuideButton } from "@/components/ModuleGuide";
import { PageShell } from "@/components/PageShell";
import { TableLoadingSkeleton } from "@/components/TableLoadingSkeleton";
import {
  deleteShoppingCategory,
  fetchShoppingCategories,
} from "@/api/shopping/categories";
import {
  deleteShoppingItem,
  fetchShoppingItems,
  fetchTaskLinksForItems,
} from "@/api/shopping/items";
import type { ShoppingItemTaskLink } from "@/api/shopping/items";
import { fetchProjects } from "@/api/tasks/projects";
import {
  countPendingByCategory,
  filterCategoriesByProject,
  groupItemsByCategory,
  UNCATEGORIZED_GROUP_ID,
  UNCATEGORIZED_GROUP_LABEL,
} from "@/domain/shopping/filters";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";
import type {
  ShoppingCategory,
  ShoppingItem,
  ShoppingItemStatus,
} from "@/types/shopping";
import type { Project } from "@/types/tasks";
import { ShoppingCategoryDialog } from "./ShoppingCategoryDialog";
import { ShoppingItemDialog } from "./ShoppingItemDialog";
import { ShoppingItemRow } from "./ShoppingItemRow";

/** Valor do `<Select>` que representa "sem filtro" — Radix não aceita `value=""`. */
const ALL_PROJECTS = "__all__";

function categoryDeleteDescription(itemCount: number): string {
  if (itemCount === 0) return "A categoria não tem itens.";
  if (itemCount === 1) return "1 item dela também será excluído.";
  return `${itemCount} itens dela também serão excluídos.`;
}

export default function ShoppingList() {
  const [categories, setCategories] = useState<ShoppingCategory[]>([]);
  const [items, setItems] = useState<ShoppingItem[]>([]);
  /** Projetos disponíveis — alimentam o filtro da página e o campo "Projeto" da categoria. */
  const [projects, setProjects] = useState<Project[]>([]);
  /** Quais itens já viraram tarefa — carregado numa consulta só por load, nunca por item. */
  const [taskLinks, setTaskLinks] = useState<Map<string, ShoppingItemTaskLink>>(
    new Map()
  );
  const [loading, setLoading] = useState(true);
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] =
    useState<ShoppingCategory | null>(null);
  const [itemDialogOpen, setItemDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ShoppingItem | null>(null);
  const [itemDialogCategoryId, setItemDialogCategoryId] = useState<
    string | null
  >(null);
  const { toast } = useToast();
  /**
   * O filtro por projeto mora na URL (`/shopping-list?project=<id>`), não em `useState`: é assim
   * que o link vindo da página do projeto abre a lista já filtrada e que o estado sobrevive ao
   * refresh (ver Decisões da feature 052).
   */
  const [searchParams, setSearchParams] = useSearchParams();
  const projectFilter = searchParams.get("project");

  function handleProjectFilterChange(value: string) {
    const next = new URLSearchParams(searchParams);
    if (value === ALL_PROJECTS) next.delete("project");
    else next.set("project", value);
    setSearchParams(next, { replace: true });
  }

  const load = useCallback(async () => {
    try {
      const [categoryList, itemList, projectList] = await Promise.all([
        fetchShoppingCategories(),
        fetchShoppingItems(),
        fetchProjects(),
      ]);
      setCategories(categoryList);
      setItems(itemList);
      setProjects(projectList);
      // Uma única consulta `in (<ids da página>)` para descobrir quais itens já têm tarefa —
      // não uma por linha (ver Decisões da feature 051).
      setTaskLinks(await fetchTaskLinksForItems(itemList.map((item) => item.id)));
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(
          error,
          "Não foi possível carregar a lista de compras."
        ),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  /**
   * Filtrar por projeto encurta a lista de categorias — e só isso. O agrupamento continua sendo o
   * mesmo `groupItemsByCategory`, então a lista filtrada segue agrupada por categoria, que é o
   * pedido literal ("ver os itens, por categorias, de um projeto em específico").
   */
  const visibleCategories = useMemo(
    () => filterCategoriesByProject(categories, projectFilter),
    [categories, projectFilter]
  );
  /**
   * O pseudo-grupo "Sem categoria" só aparece na lista completa: item sem categoria não pertence
   * a projeto nenhum, porque o vínculo com projeto é da categoria (feature 052).
   */
  const groups = useMemo(
    () =>
      groupItemsByCategory(items, visibleCategories, {
        includeUncategorized: !projectFilter,
      }),
    [items, visibleCategories, projectFilter]
  );
  const filteredProject = useMemo(
    () => projects.find((project) => project.id === projectFilter) ?? null,
    [projects, projectFilter]
  );
  const projectNameById = useMemo(
    () =>
      Object.fromEntries(
        projects.map((project) => [project.id, project.name])
      ) as Record<string, string | undefined>,
    [projects]
  );
  const pendingByCategory = useMemo(
    () => countPendingByCategory(items),
    [items]
  );

  /** Pendentes do grupo — os itens soltos moram sob `UNCATEGORIZED_GROUP_ID`. */
  function pendingCountFor(category: ShoppingCategory | null): number {
    return pendingByCategory[category?.id ?? UNCATEGORIZED_GROUP_ID] ?? 0;
  }

  function openCreateCategory() {
    setEditingCategory(null);
    setCategoryDialogOpen(true);
  }

  function openEditCategory(category: ShoppingCategory) {
    setEditingCategory(category);
    setCategoryDialogOpen(true);
  }

  function openCreateItem(categoryId?: string) {
    setEditingItem(null);
    setItemDialogCategoryId(categoryId ?? null);
    setItemDialogOpen(true);
  }

  function openEditItem(item: ShoppingItem) {
    setEditingItem(item);
    setItemDialogCategoryId(item.shopping_category_id);
    setItemDialogOpen(true);
  }

  function handleStatusChange(id: string, status: ShoppingItemStatus) {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, status } : item))
    );
    // A API já sincronizou a tarefa vinculada; aqui só refletimos isso no que a tela mostra.
    setTaskLinks((prev) => {
      const link = prev.get(id);
      if (!link) return prev;
      const next = new Map(prev);
      next.set(id, {
        ...link,
        status: status === "purchased" ? "done" : "todo",
      });
      return next;
    });
  }

  function handleTaskCreated(itemId: string, link: ShoppingItemTaskLink) {
    setTaskLinks((prev) => new Map(prev).set(itemId, link));
  }

  async function handleDeleteCategory(id: string) {
    try {
      await deleteShoppingCategory(id);
      toast({ title: "Categoria excluída", duration: 2000 });
      load();
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(
          error,
          "Não foi possível excluir a categoria."
        ),
        variant: "destructive",
      });
    }
  }

  async function handleDeleteItem(id: string) {
    try {
      await deleteShoppingItem(id);
      toast({ title: "Item excluído", duration: 2000 });
      load();
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Não foi possível excluir o item."),
        variant: "destructive",
      });
    }
  }

  return (
    <PageShell
      title="Lista de Compras"
      description="Agrupe o que você precisa comprar por categoria e marque o que já comprou."
      actions={
        <>
          <ModuleGuideButton moduleId="shopping" />
          <Button variant="outline" onClick={openCreateCategory}>
            Nova categoria
          </Button>
          {/* Nunca desabilitado: anotar um item não depende de existir categoria (feature 066). */}
          <Button onClick={() => openCreateItem()}>Novo item</Button>
        </>
      }
    >
      <ModuleGuide moduleId="shopping" />
      {projects.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={projectFilter ?? ALL_PROJECTS}
            onValueChange={handleProjectFilterChange}
          >
            <SelectTrigger className="w-56" aria-label="Filtrar por projeto">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_PROJECTS}>Todos os projetos</SelectItem>
              {projects.map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  {project.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {filteredProject && (
            <p className="text-xs text-muted-foreground">
              Mostrando as compras de{" "}
              <span className="font-medium text-foreground">
                {filteredProject.name}
              </span>
              , agrupadas por categoria.
            </p>
          )}
        </div>
      )}

      {loading ? (
        <TableLoadingSkeleton rows={4} />
      ) : projectFilter && visibleCategories.length === 0 ? (
        <EmptyState
          icon={ShoppingCart}
          title="Nenhuma categoria neste projeto"
          description={
            filteredProject
              ? `Nenhuma categoria da lista está vinculada a "${filteredProject.name}". Crie uma, ou edite uma existente para vinculá-la.`
              : "Nenhuma categoria da lista está vinculada a este projeto."
          }
          action={<Button onClick={openCreateCategory}>Nova categoria</Button>}
        />
      ) : groups.length === 0 ? (
        /*
          Nada mesmo: nenhuma categoria e nenhum item solto. As duas ações aparecem lado a lado, e
          a categoria é descrita pelo que é — organização opcional, não pré-requisito.
        */
        <EmptyState
          icon={ShoppingCart}
          title="Sua lista está vazia"
          description="Anote o que precisa comprar. Categorias (Mercado, Casa nova…) são opcionais — servem só para agrupar depois."
          action={
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
              <Button onClick={() => openCreateItem()}>Novo item</Button>
              <Button variant="outline" onClick={openCreateCategory}>
                Nova categoria
              </Button>
            </div>
          }
        />
      ) : (
        <div className="space-y-4">
          {groups.map(({ category, items: categoryItems, synthetic }) => (
            <section
              key={category?.id ?? UNCATEGORIZED_GROUP_ID}
              className="space-y-2.5 rounded-xl border bg-card p-3.5 shadow-sm sm:p-5"
              style={
                category?.color
                  ? { borderLeft: `3px solid ${category.color}` }
                  : undefined
              }
            >
              <header className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {category?.color && (
                      <span
                        aria-hidden="true"
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: category.color }}
                      />
                    )}
                    {/* Sem bolinha e em tom apagado: o grupo dos itens soltos não é uma categoria. */}
                    <h2
                      className={
                        category
                          ? "truncate font-semibold"
                          : "truncate font-semibold text-muted-foreground"
                      }
                    >
                      {category?.name ?? UNCATEGORIZED_GROUP_LABEL}
                    </h2>
                    <Badge variant="outline" className="shrink-0 text-[10px]">
                      {pendingCountFor(category)} pendente
                      {pendingCountFor(category) === 1 ? "" : "s"}
                    </Badge>
                    {/*
                      Só faz sentido quando a lista mostra tudo: com o filtro ativo, todas as
                      categorias visíveis são do mesmo projeto e o nome já está no cabeçalho da
                      página — repeti-lo em cada seção seria ruído.
                    */}
                    {category &&
                      !projectFilter &&
                      projectNameById[category.project_id ?? ""] && (
                        <Badge variant="secondary" className="shrink-0 text-[10px]">
                          {projectNameById[category.project_id ?? ""]}
                        </Badge>
                      )}
                  </div>
                  {category?.description && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {category.description}
                    </p>
                  )}
                  {synthetic && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Itens anotados sem categoria. Edite um item para movê-lo
                      para uma categoria.
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className={`h-8 w-8 ${ICON_EDIT_BUTTON_CLASS}`}
                    onClick={() => openCreateItem(category?.id)}
                    aria-label={
                      category
                        ? `Adicionar item em ${category.name}`
                        : "Adicionar item sem categoria"
                    }
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                  {/* Editar e excluir só existem para categoria de verdade. */}
                  {category && (
                    <>
                      <Button
                        variant="ghost"
                        size="icon"
                        className={`h-8 w-8 ${ICON_EDIT_BUTTON_CLASS}`}
                        onClick={() => openEditCategory(category)}
                        aria-label={`Editar categoria ${category.name}`}
                      >
                        <Pen className="h-3.5 w-3.5" />
                      </Button>
                      <ConfirmDeleteDialog
                        title="Excluir esta categoria?"
                        description={categoryDeleteDescription(
                          categoryItems.length
                        )}
                        onConfirm={() => handleDeleteCategory(category.id)}
                      >
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive"
                          aria-label={`Excluir categoria ${category.name}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </ConfirmDeleteDialog>
                    </>
                  )}
                </div>
              </header>

              {categoryItems.length === 0 ? (
                <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
                  Nenhum item nesta categoria ainda.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {categoryItems.map((item) => (
                    <ShoppingItemRow
                      key={item.id}
                      item={item}
                      taskLink={taskLinks.get(item.id) ?? null}
                      onStatusChange={handleStatusChange}
                      onTaskCreated={handleTaskCreated}
                      onEdit={() => openEditItem(item)}
                      onDelete={() => handleDeleteItem(item.id)}
                    />
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      )}

      <ShoppingCategoryDialog
        open={categoryDialogOpen}
        onOpenChange={setCategoryDialogOpen}
        category={editingCategory}
        projects={projects}
        defaultProjectId={projectFilter}
        onSaved={load}
      />
      <ShoppingItemDialog
        open={itemDialogOpen}
        onOpenChange={setItemDialogOpen}
        item={editingItem}
        categories={categories}
        defaultCategoryId={itemDialogCategoryId}
        onSaved={load}
      />
    </PageShell>
  );
}
