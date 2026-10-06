import { describe, expect, it } from "vitest";

import {
  layoutProjectionBars,
  monthsTurnedNegative,
  simulationImpact,
  type SimulatedPoint,
} from "../projectionChart";

function point(ym: string, receiveTotal: number, payBase: number, sim = 0): SimulatedPoint {
  const [year, month] = ym.split("-").map(Number);
  return { ym, year, month, receiveTotal, payBase, sim };
}

describe("layoutProjectionBars", () => {
  it("empilha a simulação em cima das despesas e escala pelo maior total", () => {
    const layout = layoutProjectionBars(
      [point("2026-10", 1000, 500, 0), point("2026-11", 1000, 800, 400)],
      { slotWidth: 40, plotHeight: 120 }
    );
    expect(layout.maxValue).toBe(1200);
    expect(layout.width).toBe(80);

    const [oct, nov] = layout.slots;
    expect(oct.sim).toBeNull();
    expect(oct.receive.height).toBe(100);
    expect(oct.pay).toEqual({ y: 70, height: 50 });

    expect(nov.x).toBe(40);
    expect(nov.pay).toEqual({ y: 40, height: 80 });
    expect(nov.sim).toEqual({ y: 0, height: 40 });
    expect(nov.sim!.y + nov.sim!.height).toBe(nov.pay.y);
  });

  it("não divide por zero quando tudo é zero", () => {
    const layout = layoutProjectionBars([point("2026-10", 0, 0)], { slotWidth: 40, plotHeight: 100 });
    expect(layout.maxValue).toBe(1);
    expect(layout.slots[0].receive.height).toBe(0);
  });
});

describe("simulationImpact", () => {
  it("calcula saldo antes/depois e detecta virada para o vermelho", () => {
    expect(simulationImpact(point("2026-10", 1000, 800, 300))).toEqual({
      sim: 300,
      payWithSim: 1100,
      netBefore: 200,
      netAfter: -100,
      turnsNegative: true,
    });
  });

  it("mês já negativo ou sem simulação não conta como virada", () => {
    expect(simulationImpact(point("2026-10", 100, 800, 300)).turnsNegative).toBe(false);
    expect(simulationImpact(point("2026-10", 100, 800, 0)).turnsNegative).toBe(false);
    expect(simulationImpact(point("2026-10", 1000, 500, 300)).turnsNegative).toBe(false);
  });
});

describe("monthsTurnedNegative", () => {
  it("lista só os meses que a compra joga para o vermelho", () => {
    const months = monthsTurnedNegative([
      point("2026-10", 1000, 500, 300),
      point("2026-11", 1000, 900, 300),
      point("2026-12", 200, 900, 300),
      point("2027-01", 1000, 990, 0),
    ]);
    expect(months.map((m) => m.ym)).toEqual(["2026-11"]);
  });
});
