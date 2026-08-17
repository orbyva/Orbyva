import { describe, expect, it } from "vitest";
import {
  countPendingByCategory,
  filterCategoriesByProject,
  groupItemsByCategory,
} from "@/domain/shopping/filters";
import type { ShoppingCategory, ShoppingItem } from "@/types/shopping";

function category(id: string, name = id): ShoppingCategory {
  return { id, name };
}

function item(
  id: string,
  shopping_category_id: string,
  status: ShoppingItem["status"] = "pending"
): ShoppingItem {
  return { id, shopping_category_id, title: `Item ${id}`, status };
}

describe("groupItemsByCategory", () => {
  it("preserva a ordem das categorias recebidas", () => {
    const groups = groupItemsByCategory(
      [item("i1", "c2"), item("i2", "c1")],
      [category("c2", "Mercado"), category("c1", "Farmácia")]
    );
    expect(groups.map((g) => g.category.id)).toEqual(["c2", "c1"]);
    expect(groups[0].items.map((i) => i.id)).toEqual(["i1"]);
    expect(groups[1].items.map((i) => i.id)).toEqual(["i2"]);
  });

  it("categoria sem itens aparece com lista vazia", () => {
    const groups = groupItemsByCategory([], [category("c1")]);
    expect(groups).toHaveLength(1);
    expect(groups[0].items).toEqual([]);
  });

  it("item de categoria inexistente é ignorado", () => {
    const groups = groupItemsByCategory(
      [item("i1", "c1"), item("orfao", "sumiu")],
      [category("c1")]
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].items.map((i) => i.id)).toEqual(["i1"]);
  });

  it("dentro da categoria, pending vem antes de purchased", () => {
    const groups = groupItemsByCategory(
      [
        item("comprado-1", "c1", "purchased"),
        item("pendente-1", "c1"),
        item("comprado-2", "c1", "purchased"),
        item("pendente-2", "c1"),
      ],
      [category("c1")]
    );
    expect(groups[0].items.map((i) => i.id)).toEqual([
      "pendente-1",
      "pendente-2",
      "comprado-1",
      "comprado-2",
    ]);
  });

  it("não muta o array de itens recebido", () => {
    const items = [item("comprado", "c1", "purchased"), item("pendente", "c1")];
    groupItemsByCategory(items, [category("c1")]);
    expect(items.map((i) => i.id)).toEqual(["comprado", "pendente"]);
  });

  it("sem categorias, não devolve nenhum grupo", () => {
    expect(groupItemsByCategory([item("i1", "c1")], [])).toEqual([]);
  });
});

describe("filterCategoriesByProject", () => {
  const obra = { ...category("c1", "Materiais"), project_id: "p1" };
  const estudio = { ...category("c2", "Cabos"), project_id: "p2" };
  const mercado = category("c3", "Mercado"); // sem projeto
  const todas = [obra, estudio, mercado];

  it("sem filtro (null) devolve todas as categorias, na ordem recebida", () => {
    expect(filterCategoriesByProject(todas, null)).toEqual(todas);
  });

  it("sem filtro (undefined) também devolve todas", () => {
    expect(filterCategoriesByProject(todas, undefined)).toEqual(todas);
  });

  it("com filtro, devolve só as categorias daquele projeto", () => {
    expect(filterCategoriesByProject(todas, "p1")).toEqual([obra]);
    expect(filterCategoriesByProject(todas, "p2")).toEqual([estudio]);
  });

  it("categoria sem projeto não aparece em filtro de projeto nenhum", () => {
    expect(filterCategoriesByProject(todas, "p1")).not.toContain(mercado);
    expect(filterCategoriesByProject(todas, "p2")).not.toContain(mercado);
    expect(filterCategoriesByProject([mercado], "p1")).toEqual([]);
  });

  it("projeto sem categoria nenhuma devolve lista vazia", () => {
    expect(filterCategoriesByProject(todas, "p-inexistente")).toEqual([]);
  });

  it("preserva a ordem recebida quando o projeto tem várias categorias", () => {
    const outra = { ...category("c4", "Tintas"), project_id: "p1" };
    expect(
      filterCategoriesByProject([obra, mercado, outra], "p1").map((c) => c.id)
    ).toEqual(["c1", "c4"]);
  });

  it("não muta o array recebido", () => {
    const entrada = [...todas];
    filterCategoriesByProject(entrada, "p1");
    expect(entrada).toEqual(todas);
  });
});

describe("countPendingByCategory", () => {
  it("conta só os itens pendentes, por categoria", () => {
    const counts = countPendingByCategory([
      item("i1", "c1"),
      item("i2", "c1"),
      item("i3", "c1", "purchased"),
      item("i4", "c2"),
    ]);
    expect(counts).toEqual({ c1: 2, c2: 1 });
  });

  it("categoria só com itens comprados não aparece no resultado", () => {
    expect(countPendingByCategory([item("i1", "c1", "purchased")])).toEqual({});
  });

  it("lista vazia devolve objeto vazio", () => {
    expect(countPendingByCategory([])).toEqual({});
  });
});
