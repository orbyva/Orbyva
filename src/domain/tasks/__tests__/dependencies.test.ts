import { describe, expect, it } from "vitest";
import {
  hasOpenDependencies,
  wouldCreateCycle,
  type DependencyEdge,
} from "@/domain/tasks/dependencies";

describe("wouldCreateCycle", () => {
  it("rejeita autodependência", () => {
    expect(wouldCreateCycle([], "a", "a")).toBe(true);
  });

  it("permite dependência direta sem ciclo", () => {
    expect(wouldCreateCycle([], "a", "b")).toBe(false);
  });

  it("detecta ciclo transitivo (a->b->c, tentando c->a)", () => {
    const edges: DependencyEdge[] = [
      { taskId: "a", dependsOnTaskId: "b" },
      { taskId: "b", dependsOnTaskId: "c" },
    ];
    expect(wouldCreateCycle(edges, "c", "a")).toBe(true);
  });

  it("não acusa ciclo em grafos independentes", () => {
    const edges: DependencyEdge[] = [{ taskId: "a", dependsOnTaskId: "b" }];
    expect(wouldCreateCycle(edges, "c", "d")).toBe(false);
  });
});

describe("hasOpenDependencies", () => {
  it("retorna false sem dependências", () => {
    expect(hasOpenDependencies("a", [], new Set())).toBe(false);
  });

  it("retorna true quando dependência não está done", () => {
    const edges: DependencyEdge[] = [{ taskId: "a", dependsOnTaskId: "b" }];
    expect(hasOpenDependencies("a", edges, new Set())).toBe(true);
  });

  it("retorna false quando toda dependência está done", () => {
    const edges: DependencyEdge[] = [{ taskId: "a", dependsOnTaskId: "b" }];
    expect(hasOpenDependencies("a", edges, new Set(["b"]))).toBe(false);
  });
});
