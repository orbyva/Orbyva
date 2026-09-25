import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ShoppingCart } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/EmptyState";
import { TableLoadingSkeleton } from "@/components/TableLoadingSkeleton";
import { fetchShoppingCategories } from "@/api/shopping/categories";
import { fetchShoppingItems } from "@/api/shopping/items";
import { groupItemsByCategory } from "@/domain/shopping/filters";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";
import type { ShoppingCategory, ShoppingItem } from "@/types/shopping";

interface ProjectShoppingSectionProps {
  projectId: string;
}

/**
 * "Compras do projeto" dentro da página do projeto (feature 052): as categorias vinculadas a ele,
 * com seus itens, agrupadas — o mesmo `groupItemsByCategory` que a Lista de Compras usa, para os
 * dois lugares nunca divergirem na ordem nem no critério de agrupamento.
 *
 * É deliberadamente somente-leitura: editar, excluir e criar tarefa continuam sendo da Lista de
 * Compras, para onde o link leva já filtrado. Ver Notas da feature 052.
 *
 * Desde a feature 071 é o conteúdo da aba **"Compras"** (`?tab=compras`), ao lado de "Notas" —
 * antes ficava empilhada abaixo das abas. Como o `TabsContent` do Radix desmonta o conteúdo
 * inativo, os `fetch` daqui só acontecem quando o usuário abre a aba.
 */
export function ProjectShoppingSection({ projectId }: ProjectShoppingSectionProps) {
  const [categories, setCategories] = useState<ShoppingCategory[]>([]);
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [projectCategories, allItems] = await Promise.all([
        fetchShoppingCategories({ projectId }),
        fetchShoppingItems(),
      ]);
      setCategories(projectCategories);
      setItems(allItems);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erro ao carregar as compras do projeto",
        description: getErrorMessage(error),
      });
    } finally {
      setLoading(false);
    }
  }, [projectId, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const groups = useMemo(
    () => groupItemsByCategory(items, categories),
    [items, categories]
  );

  return (
    <section className="space-y-3" aria-labelledby="project-shopping-heading">
      <div className="flex items-center justify-between gap-2">
        <h2
          id="project-shopping-heading"
          className="flex items-center gap-2 text-sm font-semibold"
        >
          <ShoppingCart className="h-4 w-4" aria-hidden="true" />
          Compras do projeto
        </h2>
        <Button variant="outline" size="sm" asChild>
          <Link to={`/shopping-list?project=${projectId}`}>
            Ver na Lista de Compras
          </Link>
        </Button>
      </div>

      {loading ? (
        <TableLoadingSkeleton rows={2} />
      ) : groups.length === 0 ? (
        <EmptyState
          icon={ShoppingCart}
          title="Nenhuma categoria de compras neste projeto"
          description="Na Lista de Compras, vincule uma categoria a este projeto para ver aqui o que precisa ser comprado."
        />
      ) : (
        <div className="space-y-3">
          {groups.map(({ category, items: categoryItems }) => (
            <div
              key={category.id}
              className="rounded-lg border bg-card p-3"
              style={
                category.color
                  ? { borderLeft: `3px solid ${category.color}` }
                  : undefined
              }
            >
              <div className="flex items-center gap-2">
                <h3 className="truncate text-sm font-medium">{category.name}</h3>
                <Badge variant="outline" className="shrink-0 text-[10px]">
                  {categoryItems.filter((i) => i.status === "pending").length}{" "}
                  pendente
                  {categoryItems.filter((i) => i.status === "pending").length ===
                  1
                    ? ""
                    : "s"}
                </Badge>
              </div>
              {categoryItems.length === 0 ? (
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Nenhum item nesta categoria.
                </p>
              ) : (
                <ul className="mt-1.5 space-y-1">
                  {categoryItems.map((item) => (
                    <li
                      key={item.id}
                      className={
                        item.status === "purchased"
                          ? "text-xs text-muted-foreground line-through"
                          : "text-xs"
                      }
                    >
                      {item.title}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
