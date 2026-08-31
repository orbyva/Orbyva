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
  /**
   * Mostra o `<h2>` "Compras do projeto". Dentro da aba "Compras" da página do projeto (feature
   * 069) o gatilho da aba já é o título, e repeti-lo logo abaixo gasta a altura que a feature
   * está tentando devolver às tarefas — nesse caso o título vira `aria-label` da `<section>`,
   * para o leitor de tela continuar anunciando a região.
   */
  showHeading?: boolean;
}

const SECTION_TITLE = "Compras do projeto";

/**
 * "Compras do projeto" dentro da página do projeto (feature 052): as categorias vinculadas a ele,
 * com seus itens, agrupadas — o mesmo `groupItemsByCategory` que a Lista de Compras usa, para os
 * dois lugares nunca divergirem na ordem nem no critério de agrupamento.
 *
 * É deliberadamente somente-leitura: editar, excluir e criar tarefa continuam sendo da Lista de
 * Compras, para onde o link leva já filtrado. Ver Notas da feature 052.
 */
export function ProjectShoppingSection({
  projectId,
  showHeading = true,
}: ProjectShoppingSectionProps) {
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

  /**
   * Só os grupos com categoria de verdade. Item sem categoria (feature 066) não pertence a projeto
   * nenhum — o vínculo com projeto é da categoria (feature 052) —, então o pseudo-grupo
   * "Sem categoria" que `groupItemsByCategory` devolve fica de fora daqui.
   */
  const groups = useMemo(
    () =>
      groupItemsByCategory(items, categories).flatMap((group) =>
        group.category
          ? [{ category: group.category, items: group.items }]
          : []
      ),
    [items, categories]
  );

  return (
    <section
      className="space-y-3"
      aria-labelledby={showHeading ? "project-shopping-heading" : undefined}
      aria-label={showHeading ? undefined : SECTION_TITLE}
    >
      <div className="flex items-center justify-between gap-2">
        {showHeading && (
          <h2
            id="project-shopping-heading"
            className="flex items-center gap-2 text-sm font-semibold"
          >
            <ShoppingCart className="h-4 w-4" aria-hidden="true" />
            {SECTION_TITLE}
          </h2>
        )}
        <Button variant="outline" size="sm" className="ml-auto" asChild>
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
