export interface SimulatedPoint {
  ym: string;
  year: number;
  month: number;
  receiveTotal: number;
  /** Despesas sem a simulação. */
  payBase: number;
  /** Parcela simulada que cai neste mês (0 fora da simulação). */
  sim: number;
}

export interface BarSegment {
  y: number;
  height: number;
}

export interface ProjectionBarSlot {
  ym: string;
  x: number;
  receive: BarSegment;
  pay: BarSegment;
  sim: BarSegment | null;
}

export interface ProjectionBarsLayout {
  width: number;
  plotHeight: number;
  maxValue: number;
  barWidth: number;
  slots: ProjectionBarSlot[];
}

/**
 * Barras agrupadas por mês, como no web: receitas ao lado de despesas, com a parcela simulada
 * empilhada **em cima** das despesas. A escala usa o maior entre receita e despesa+simulação, para
 * a pilha nunca estourar o gráfico.
 */
export function layoutProjectionBars(
  points: SimulatedPoint[],
  { slotWidth, plotHeight, gap = 3 }: { slotWidth: number; plotHeight: number; gap?: number }
): ProjectionBarsLayout {
  const maxValue = Math.max(1, ...points.map((p) => Math.max(p.receiveTotal, p.payBase + p.sim)));
  const barWidth = Math.max(4, (slotWidth - gap * 3) / 2);
  const scale = (value: number) => (Math.max(0, value) / maxValue) * plotHeight;

  const slots = points.map((point, i) => {
    const x = i * slotWidth;
    const receiveH = scale(point.receiveTotal);
    const payH = scale(point.payBase);
    const simH = scale(point.sim);
    return {
      ym: point.ym,
      x,
      receive: { y: plotHeight - receiveH, height: receiveH },
      pay: { y: plotHeight - payH, height: payH },
      sim: point.sim > 0 ? { y: plotHeight - payH - simH, height: simH } : null,
    };
  });

  return { width: points.length * slotWidth, plotHeight, maxValue, barWidth, slots };
}

export interface SimulationImpact {
  sim: number;
  payWithSim: number;
  netBefore: number;
  netAfter: number;
  /** A simulação vira o saldo do mês de positivo (ou zero) para negativo. */
  turnsNegative: boolean;
}

export function simulationImpact(point: SimulatedPoint): SimulationImpact {
  const netBefore = point.receiveTotal - point.payBase;
  const netAfter = netBefore - point.sim;
  return {
    sim: point.sim,
    payWithSim: point.payBase + point.sim,
    netBefore,
    netAfter,
    turnsNegative: point.sim > 0 && netBefore >= 0 && netAfter < 0,
  };
}

/** Meses da janela que a compra simulada joga para o vermelho. */
export function monthsTurnedNegative(points: SimulatedPoint[]): SimulatedPoint[] {
  return points.filter((point) => simulationImpact(point).turnsNegative);
}
