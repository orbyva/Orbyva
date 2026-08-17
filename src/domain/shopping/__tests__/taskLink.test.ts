import { describe, expect, it } from "vitest";
import {
  SHOPPING_TASK_ICON_KEY,
  buildTaskDraftFromItem,
  resolveItemStatusFromTask,
  resolveTaskStatusFromItem,
} from "@/domain/shopping/taskLink";
import { TASK_ICON_PRESETS } from "@/pages/admin/tasks/TaskIconBadge";
import type { ShoppingCategory, ShoppingItem } from "@/types/shopping";

/**
 * Regras puras do vínculo item → tarefa (feature 051): o rascunho da tarefa que nasce de um item
 * e os dois mapeamentos de status. Ficam num lugar só justamente pra que os dois lados da
 * sincronização (API de itens e `updateTask`) não divirjam.
 */

function makeItem(overrides: Partial<ShoppingItem> = {}): ShoppingItem {
  return {
    id: "item-1",
    shopping_category_id: "cat-1",
    title: "Café",
    description: null,
    quantity: null,
    unit: null,
    provider_link: null,
    status: "pending",
    ...overrides,
  };
}

const category: ShoppingCategory = { id: "cat-1", name: "Mercado" };

describe("buildTaskDraftFromItem", () => {
  it("o título é o compromisso de comprar o item", () => {
    expect(buildTaskDraftFromItem(makeItem(), category).title).toBe("Comprar Café");
  });

  it("grava sempre o ícone de compras, e essa chave existe no catálogo de presets", () => {
    const draft = buildTaskDraftFromItem(makeItem(), category);
    expect(draft.icon_key).toBe("shopping-cart");
    expect(draft.icon_key).toBe(SHOPPING_TASK_ICON_KEY);
    expect(TASK_ICON_PRESETS.map((preset) => preset.key)).toContain(draft.icon_key);
  });

  it("guarda o id do item no vínculo unidirecional", () => {
    expect(buildTaskDraftFromItem(makeItem({ id: "item-99" }), category)).toMatchObject({
      linked_shopping_item_id: "item-99",
    });
  });

  it("a descrição copia categoria, quantidade+unidade, descrição e link do fornecedor", () => {
    const draft = buildTaskDraftFromItem(
      makeItem({
        description: "moído, não em grão",
        quantity: 2,
        unit: "pacotes",
        provider_link: "https://loja.example/cafe",
      }),
      category
    );

    expect(draft.description).toBe(
      "Lista de Compras · Mercado\n2 pacotes\nmoído, não em grão\nhttps://loja.example/cafe"
    );
  });

  it("sem categoria conhecida, a descrição ainda diz de onde a tarefa veio", () => {
    expect(buildTaskDraftFromItem(makeItem(), null).description).toBe("Lista de Compras");
  });

  it("campos vazios ou só espaços não entram na descrição", () => {
    const draft = buildTaskDraftFromItem(
      makeItem({ description: "   ", unit: "  ", provider_link: "" }),
      category
    );
    expect(draft.description).toBe("Lista de Compras · Mercado");
  });

  it("quantidade sem unidade (e unidade sem quantidade) ainda aparecem", () => {
    expect(buildTaskDraftFromItem(makeItem({ quantity: 3 }), category).description).toBe(
      "Lista de Compras · Mercado\n3"
    );
    expect(buildTaskDraftFromItem(makeItem({ unit: "kg" }), category).description).toBe(
      "Lista de Compras · Mercado\nkg"
    );
  });

  it("item pendente vira tarefa em todo; item já comprado vira tarefa concluída", () => {
    expect(buildTaskDraftFromItem(makeItem({ status: "pending" }), category).status).toBe("todo");
    expect(buildTaskDraftFromItem(makeItem({ status: "purchased" }), category).status).toBe("done");
  });

  it("não devolve recorrência — a tarefa criada nunca é recorrente", () => {
    expect(buildTaskDraftFromItem(makeItem(), category)).not.toHaveProperty("recurrence_rule");
  });
});

describe("resolveItemStatusFromTask", () => {
  it("tarefa concluída marca o item como comprado", () => {
    expect(resolveItemStatusFromTask("done")).toBe("purchased");
  });

  it("tarefa reaberta (todo ou doing) devolve o item pra pendente", () => {
    expect(resolveItemStatusFromTask("todo")).toBe("pending");
    expect(resolveItemStatusFromTask("doing")).toBe("pending");
  });
});

describe("resolveTaskStatusFromItem", () => {
  it("item comprado conclui a tarefa", () => {
    expect(resolveTaskStatusFromItem("purchased")).toBe("done");
  });

  it("item desmarcado reabre a tarefa em todo", () => {
    expect(resolveTaskStatusFromItem("pending")).toBe("todo");
  });
});

describe("os dois mapeamentos são inversos um do outro", () => {
  it("purchased ↔ done e pending ↔ todo fecham o ciclo nos dois sentidos", () => {
    expect(resolveItemStatusFromTask(resolveTaskStatusFromItem("purchased"))).toBe("purchased");
    expect(resolveItemStatusFromTask(resolveTaskStatusFromItem("pending"))).toBe("pending");
    expect(resolveTaskStatusFromItem(resolveItemStatusFromTask("done"))).toBe("done");
    expect(resolveTaskStatusFromItem(resolveItemStatusFromTask("todo"))).toBe("todo");
  });

  it("doing colapsa em todo na volta — é o preço de o item só ter dois estados", () => {
    expect(resolveTaskStatusFromItem(resolveItemStatusFromTask("doing"))).toBe("todo");
  });
});
