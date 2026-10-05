import { describe, expect, it } from "vitest";

import {
  alertSeverityTone,
  budgetStatusTone,
  carAlertBadge,
  natureTone,
  netTone,
  taskStatusTone,
} from "../semanticTone";

describe("budgetStatusTone", () => {
  it("estourado e crítico ficam destrutivos, com ou sem acento", () => {
    expect(budgetStatusTone("ESTOUROU")).toBe("destructive");
    expect(budgetStatusTone("Crítico")).toBe("destructive");
  });

  it("atenção e quase ficam em alerta", () => {
    expect(budgetStatusTone("Atenção")).toBe("warning");
    expect(budgetStatusTone("quase")).toBe("warning");
  });

  it("qualquer outro status é sucesso", () => {
    expect(budgetStatusTone("OK")).toBe("success");
    expect(budgetStatusTone("")).toBe("success");
  });
});

describe("natureTone", () => {
  it("separa receita, investimento e saída", () => {
    expect(natureTone("Receita")).toBe("success");
    expect(natureTone("Investimento")).toBe("chart6");
    expect(natureTone("Despesa")).toBe("destructive");
    expect(natureTone(null)).toBe("destructive");
  });
});

describe("netTone", () => {
  it("zero e positivo são sucesso; negativo é destrutivo", () => {
    expect(netTone(0)).toBe("success");
    expect(netTone(10)).toBe("success");
    expect(netTone(-0.01)).toBe("destructive");
  });
});

describe("taskStatusTone", () => {
  it("a fazer neutro, fazendo em destaque, feita em sucesso", () => {
    expect(taskStatusTone("todo")).toBe("mutedForeground");
    expect(taskStatusTone("doing")).toBe("primary");
    expect(taskStatusTone("done")).toBe("success");
    expect(taskStatusTone("")).toBe("mutedForeground");
  });
});

describe("carAlertBadge", () => {
  it("vencido vira badge destrutivo, perto de vencer vira alerta", () => {
    expect(carAlertBadge("overdue")).toEqual({ variant: "destructive", label: "Vencido" });
    expect(carAlertBadge("upcoming")).toEqual({ variant: "warning", label: "Em breve" });
  });

  it("em dia ou sem dado não mostra badge", () => {
    expect(carAlertBadge("ok")).toBeNull();
    expect(carAlertBadge("none")).toBeNull();
    expect(carAlertBadge(undefined)).toBeNull();
  });
});

describe("alertSeverityTone", () => {
  it("severidade do alerta vira o token do status", () => {
    expect(alertSeverityTone("danger")).toBe("destructive");
    expect(alertSeverityTone("warning")).toBe("warning");
    expect(alertSeverityTone("success")).toBe("success");
    expect(alertSeverityTone("info")).toBe("mutedForeground");
  });
});
