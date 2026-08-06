import { describe, expect, it } from "vitest";
import { computeMissingLinkedInstallments } from "@/domain/tasks/linkedInstallments";

describe("computeMissingLinkedInstallments", () => {
  it("retorna todas as parcelas em aberto quando nenhuma foi materializada", () => {
    const result = computeMissingLinkedInstallments(
      [
        { number: 1, dueDate: "2026-09-10" },
        { number: 2, dueDate: "2026-10-10" },
      ],
      []
    );
    expect(result).toEqual([
      { number: 1, dueDate: "2026-09-10" },
      { number: 2, dueDate: "2026-10-10" },
    ]);
  });

  it("pula parcelas já materializadas", () => {
    const result = computeMissingLinkedInstallments(
      [
        { number: 1, dueDate: "2026-09-10" },
        { number: 2, dueDate: "2026-10-10" },
      ],
      [1]
    );
    expect(result).toEqual([{ number: 2, dueDate: "2026-10-10" }]);
  });

  it("retorna vazio quando não há parcelas em aberto", () => {
    expect(computeMissingLinkedInstallments([], [])).toEqual([]);
  });

  it("retorna vazio quando todas já foram materializadas", () => {
    const result = computeMissingLinkedInstallments(
      [{ number: 1, dueDate: "2026-09-10" }],
      [1]
    );
    expect(result).toEqual([]);
  });
});
