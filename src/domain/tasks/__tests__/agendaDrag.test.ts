import { describe, expect, it } from "vitest";
import {
  DRAG_THRESHOLD_PX,
  MIN_DRAG_DURATION_MINUTES,
  MINUTES_PER_DAY,
  SNAP_MINUTES,
  formatRangeLabel,
  minutesFromOffset,
  minutesToTimeInput,
  normalizeDragRange,
} from "@/domain/tasks";

/**
 * Feature 104 — a matemática do arrasto na grade de horas, sem DOM.
 *
 * O componente só entrega "o ponteiro caiu a X px do topo de uma coluna de Y px de altura"; tudo o
 * que decide qual horário isso vira (snap, clamp, duração mínima, arrasto invertido) está aqui, e é
 * aqui que se prova — sem Chrome, é a única prova de que arrastar das 9 às 10:30 cria 09:00–10:30.
 */

/** Altura da coluna do dia na grade real: 24 linhas de 56px. */
const COLUNA_PX = 24 * 56;
/** Px por minuto nessa coluna — 1344 / 1440. */
const PX_POR_MINUTO = COLUNA_PX / MINUTES_PER_DAY;

describe("minutesFromOffset", () => {
  it("converte o offset em minutos desde a meia-noite (topo = 00:00, fundo = 24:00)", () => {
    expect(minutesFromOffset(0, COLUNA_PX)).toBe(0);
    expect(minutesFromOffset(COLUNA_PX, COLUNA_PX)).toBe(MINUTES_PER_DAY);
    expect(minutesFromOffset(COLUNA_PX / 2, COLUNA_PX)).toBe(12 * 60);
    expect(minutesFromOffset(9 * 60 * PX_POR_MINUTO, COLUNA_PX)).toBe(9 * 60);
  });

  it("arredonda para o múltiplo de 15 minutos mais próximo (para baixo e para cima)", () => {
    // 09:07 -> 09:00 (7 < 7.5); 09:08 -> 09:15.
    expect(minutesFromOffset((9 * 60 + 7) * PX_POR_MINUTO, COLUNA_PX)).toBe(9 * 60);
    expect(minutesFromOffset((9 * 60 + 8) * PX_POR_MINUTO, COLUNA_PX)).toBe(9 * 60 + 15);
    // 10:23 está a 8 min de 10:15 e a 7 min de 10:30 — vai para o mais próximo, 10:30.
    expect(minutesFromOffset((10 * 60 + 23) * PX_POR_MINUTO, COLUNA_PX)).toBe(10 * 60 + 30);
    // Todo resultado é múltiplo do passo, seja qual for o pixel.
    for (let px = 0; px <= COLUNA_PX; px += 7) {
      expect(minutesFromOffset(px, COLUNA_PX) % SNAP_MINUTES).toBe(0);
    }
  });

  it("aceita outro passo de snap quando pedido", () => {
    expect(minutesFromOffset((9 * 60 + 7) * PX_POR_MINUTO, COLUNA_PX, 30)).toBe(9 * 60);
    expect(minutesFromOffset((9 * 60 + 20) * PX_POR_MINUTO, COLUNA_PX, 30)).toBe(9 * 60 + 30);
    // Passo inválido não pode virar divisão por zero: cai no minuto cheio.
    expect(minutesFromOffset((9 * 60 + 7) * PX_POR_MINUTO, COLUNA_PX, 0)).toBe(9 * 60 + 7);
  });

  it("clampa offset negativo em 00:00 e offset maior que a altura em 24:00", () => {
    // Sair pela borda é o caminho normal de um arrasto rápido, não um erro.
    expect(minutesFromOffset(-200, COLUNA_PX)).toBe(0);
    expect(minutesFromOffset(-0.5, COLUNA_PX)).toBe(0);
    expect(minutesFromOffset(COLUNA_PX + 500, COLUNA_PX)).toBe(MINUTES_PER_DAY);
  });

  it("altura zero devolve 0 em vez de NaN (jsdom e o primeiro frame não têm layout)", () => {
    expect(minutesFromOffset(100, 0)).toBe(0);
    expect(minutesFromOffset(100, -10)).toBe(0);
    expect(Number.isNaN(minutesFromOffset(100, 0))).toBe(false);
    expect(minutesFromOffset(Number.NaN, COLUNA_PX)).toBe(0);
    expect(minutesFromOffset(100, Number.NaN)).toBe(0);
  });

  it("o limiar de arrasto é pequeno o bastante para não engolir um arrasto real", () => {
    expect(DRAG_THRESHOLD_PX).toBeGreaterThan(0);
    expect(DRAG_THRESHOLD_PX).toBeLessThan(SNAP_MINUTES * PX_POR_MINUTO);
  });
});

describe("normalizeDragRange", () => {
  it("arrasto normal (de cima para baixo) vira início + duração", () => {
    expect(normalizeDragRange(9 * 60, 10 * 60 + 30)).toEqual({
      startMinutes: 9 * 60,
      durationMinutes: 90,
    });
  });

  it("arrasto invertido (de baixo para cima) devolve a mesma faixa", () => {
    // Quem arrasta "das 11h para as 9h" quer 09:00–11:00, não um erro.
    expect(normalizeDragRange(11 * 60, 9 * 60)).toEqual({
      startMinutes: 9 * 60,
      durationMinutes: 120,
    });
    expect(normalizeDragRange(11 * 60, 9 * 60)).toEqual(normalizeDragRange(9 * 60, 11 * 60));
  });

  it("arrasto de zero (clique parado) vira a duração mínima", () => {
    expect(normalizeDragRange(9 * 60, 9 * 60)).toEqual({
      startMinutes: 9 * 60,
      durationMinutes: MIN_DRAG_DURATION_MINUTES,
    });
  });

  it("faixa que estouraria as 24:00 encosta o início para trás", () => {
    // 23:45 + 15 min cabe exatamente; 23:59 (âncora) com o ponteiro no fundo não pode passar.
    expect(normalizeDragRange(MINUTES_PER_DAY, MINUTES_PER_DAY)).toEqual({
      startMinutes: MINUTES_PER_DAY - MIN_DRAG_DURATION_MINUTES,
      durationMinutes: MIN_DRAG_DURATION_MINUTES,
    });
    const faixa = normalizeDragRange(23 * 60, MINUTES_PER_DAY);
    expect(faixa.startMinutes + faixa.durationMinutes).toBe(MINUTES_PER_DAY);
  });

  it("nunca devolve início negativo nem faixa fora de [0, 24:00]", () => {
    const casos: Array<[number, number]> = [
      [-500, 60],
      [60, -500],
      [MINUTES_PER_DAY + 999, MINUTES_PER_DAY + 999],
      [0, MINUTES_PER_DAY],
    ];
    for (const [ancora, ponteiro] of casos) {
      const { startMinutes, durationMinutes } = normalizeDragRange(ancora, ponteiro);
      expect(startMinutes).toBeGreaterThanOrEqual(0);
      expect(durationMinutes).toBeGreaterThanOrEqual(MIN_DRAG_DURATION_MINUTES);
      expect(startMinutes + durationMinutes).toBeLessThanOrEqual(MINUTES_PER_DAY);
    }
  });
});

describe("formatRangeLabel", () => {
  it("mostra a faixa como HH:mm – HH:mm", () => {
    expect(formatRangeLabel({ startMinutes: 9 * 60, durationMinutes: 90 })).toBe("09:00 – 10:30");
    expect(formatRangeLabel({ startMinutes: 0, durationMinutes: 15 })).toBe("00:00 – 00:15");
    expect(formatRangeLabel({ startMinutes: 13 * 60 + 45, durationMinutes: 30 })).toBe(
      "13:45 – 14:15"
    );
  });

  it("faixa que termina no fim do dia sai como 24:00, não 00:00", () => {
    // `00:00` no fim diria "termina antes de começar" — o eixo da coluna acaba em 24:00.
    expect(formatRangeLabel({ startMinutes: 23 * 60, durationMinutes: 60 })).toBe("23:00 – 24:00");
    expect(
      formatRangeLabel(normalizeDragRange(23 * 60 + 45, MINUTES_PER_DAY + 100))
    ).toBe("23:45 – 24:00");
  });
});

describe("minutesToTimeInput", () => {
  it("devolve o HH:mm que os inputs de hora aceitam", () => {
    expect(minutesToTimeInput(9 * 60)).toBe("09:00");
    expect(minutesToTimeInput(13 * 60 + 45)).toBe("13:45");
  });

  it("o fim do dia vira 23:59 — 24:00 não é hora válida num <input type=\"time\">", () => {
    expect(minutesToTimeInput(MINUTES_PER_DAY)).toBe("23:59");
  });
});
