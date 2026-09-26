import { describe, expect, it } from "vitest";
import {
  NO_PRIORITY_LABEL,
  PRIORITY_LABELS,
  priorityLabel,
  reorderIntoBand,
  reorderWithinBand,
} from "@/domain/tasks/priority";

/**
 * Feature 082 — a metade "permita a reordenação para as prioridades da mesma faixa" do pedido.
 * `reorderWithinBand` é a função pura por trás do arraste: ela é a única coisa que decide **onde**
 * a tarefa cai e quais pares vão para a escrita em lote (`updateTasksSortOrder`). Testar aqui, e não
 * só pelo gesto, é o que dá cobertura real ao caso de borda (arrastar-e-soltar em jsdom não
 * reproduz o gesto do mouse).
 */

const BAND = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];

describe("reorderWithinBand", () => {
  it("move para cima: a segunda vira a primeira e a faixa inteira é renumerada de 0..n-1", () => {
    expect(reorderWithinBand(BAND, "b", "a")).toEqual([
      { id: "b", sort_order: 0 },
      { id: "a", sort_order: 1 },
      { id: "c", sort_order: 2 },
      { id: "d", sort_order: 3 },
    ]);
  });

  it("move para baixo: a primeira desce uma posição", () => {
    expect(reorderWithinBand(BAND, "a", "b")).toEqual([
      { id: "b", sort_order: 0 },
      { id: "a", sort_order: 1 },
      { id: "c", sort_order: 2 },
      { id: "d", sort_order: 3 },
    ]);
  });

  it("move para a primeira posição vindo do fim", () => {
    expect(reorderWithinBand(BAND, "d", "a")).toEqual([
      { id: "d", sort_order: 0 },
      { id: "a", sort_order: 1 },
      { id: "b", sort_order: 2 },
      { id: "c", sort_order: 3 },
    ]);
  });

  it("move para a última posição vindo do início", () => {
    expect(reorderWithinBand(BAND, "a", "d")).toEqual([
      { id: "b", sort_order: 0 },
      { id: "c", sort_order: 1 },
      { id: "d", sort_order: 2 },
      { id: "a", sort_order: 3 },
    ]);
  });

  it("soltar no mesmo lugar não gera escrita", () => {
    expect(reorderWithinBand(BAND, "c", "c")).toEqual([]);
  });

  it("faixa com um item só não gera escrita", () => {
    expect(reorderWithinBand([{ id: "solo" }], "solo", "solo")).toEqual([]);
  });

  it("ids desconhecidos são ignorados — nada é escrito", () => {
    expect(reorderWithinBand(BAND, "z", "a")).toEqual([]);
    expect(reorderWithinBand(BAND, "a", "z")).toEqual([]);
    expect(reorderWithinBand([], "a", "b")).toEqual([]);
  });

  it("não muta a faixa de entrada", () => {
    const band = [{ id: "a" }, { id: "b" }];
    reorderWithinBand(band, "b", "a");
    expect(band.map((t) => t.id)).toEqual(["a", "b"]);
  });

  it("renumera a partir de qualquer estado anterior, inclusive a faixa toda em 0", () => {
    // É o caso real logo depois da migration: todas as tarefas nascem com sort_order = 0 e a ordem
    // visível vem do desempate (feature 079). O primeiro arraste é o que materializa 0..n-1.
    const pairs = reorderWithinBand([{ id: "x" }, { id: "y" }, { id: "z" }], "z", "x");
    expect(pairs.map((p) => p.sort_order)).toEqual([0, 1, 2]);
    expect(pairs.map((p) => p.id)).toEqual(["z", "x", "y"]);
  });
});

/** Arraste **entre** faixas: a tarefa entra na faixa de destino e ela inteira é renumerada. */
describe("reorderIntoBand", () => {
  const TARGET = [{ id: "a" }, { id: "b" }];
  const VISITOR = { id: "v" };

  it("entra na posição da tarefa sobre a qual foi solta", () => {
    expect(reorderIntoBand(TARGET, VISITOR, "a")).toEqual([
      { id: "v", sort_order: 0 },
      { id: "a", sort_order: 1 },
      { id: "b", sort_order: 2 },
    ]);
    expect(reorderIntoBand(TARGET, VISITOR, "b")).toEqual([
      { id: "a", sort_order: 0 },
      { id: "v", sort_order: 1 },
      { id: "b", sort_order: 2 },
    ]);
  });

  it("sem alvo dentro da faixa, vai para o fim", () => {
    expect(reorderIntoBand(TARGET, VISITOR, null)).toEqual([
      { id: "a", sort_order: 0 },
      { id: "b", sort_order: 1 },
      { id: "v", sort_order: 2 },
    ]);
    expect(reorderIntoBand(TARGET, VISITOR, "desconhecida")).toEqual([
      { id: "a", sort_order: 0 },
      { id: "b", sort_order: 1 },
      { id: "v", sort_order: 2 },
    ]);
  });

  it("faixa de destino vazia recebe a tarefa sozinha", () => {
    expect(reorderIntoBand([], VISITOR, null)).toEqual([{ id: "v", sort_order: 0 }]);
  });

  it("não duplica quando a tarefa já estava na faixa (vira uma reordenação comum)", () => {
    expect(reorderIntoBand([{ id: "a" }, { id: "v" }, { id: "b" }], VISITOR, "a")).toEqual([
      { id: "v", sort_order: 0 },
      { id: "a", sort_order: 1 },
      { id: "b", sort_order: 2 },
    ]);
  });

  it("não muta a faixa de destino", () => {
    const band = [{ id: "a" }];
    reorderIntoBand(band, VISITOR, "a");
    expect(band).toEqual([{ id: "a" }]);
  });
});

describe("priorityLabel", () => {
  it("devolve o rótulo por extenso de cada prioridade", () => {
    expect(priorityLabel("high")).toBe(PRIORITY_LABELS.high);
    expect(priorityLabel("medium")).toBe("Média");
    expect(priorityLabel("low")).toBe("Baixa");
  });

  it("ausência de prioridade tem rótulo próprio — o texto saiu da tela, não da acessibilidade", () => {
    expect(priorityLabel(null)).toBe(NO_PRIORITY_LABEL);
    expect(priorityLabel(undefined)).toBe("Sem prioridade");
  });
});
