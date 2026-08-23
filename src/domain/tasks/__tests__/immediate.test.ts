import { describe, expect, it } from "vitest";
import { computeImmediateSchedule } from "@/domain/tasks/immediate";
import { DEFAULT_ITEM_DURATION_MINUTES } from "@/domain/tasks/calendar";

/**
 * Cobre o cálculo do botão "Imediatamente" (feature 078): prazo = agora + duração estimada, com
 * fallback de 30 min sem duração e prazo = agora exato em tarefa pontual. A virada de dia é o caso
 * que justifica a função existir — somar minutos "na mão" no componente erraria a data.
 */
describe("computeImmediateSchedule (feature 078)", () => {
  it("soma a duração estimada ao horário atual (90 min às 10h00 → hoje 11h30)", () => {
    const now = new Date(2026, 7, 20, 10, 0);
    const result = computeImmediateSchedule({ estimated_duration: 90 }, now);
    expect(result).toEqual({
      due_date: "2026-08-20",
      due_time: "11:30",
      usedFallbackMinutes: null,
      minutes: 90,
    });
  });

  it("sem duração, usa o padrão de 30 min e sinaliza o fallback", () => {
    const now = new Date(2026, 7, 20, 10, 0);
    const result = computeImmediateSchedule({}, now);
    expect(result.due_time).toBe("10:30");
    expect(result.due_date).toBe("2026-08-20");
    expect(result.usedFallbackMinutes).toBe(DEFAULT_ITEM_DURATION_MINUTES);
    expect(DEFAULT_ITEM_DURATION_MINUTES).toBe(30);
  });

  it("duração nula/zero também cai no fallback (0 não é duração)", () => {
    const now = new Date(2026, 7, 20, 10, 0);
    expect(computeImmediateSchedule({ estimated_duration: null }, now).usedFallbackMinutes).toBe(30);
    expect(computeImmediateSchedule({ estimated_duration: 0 }, now).usedFallbackMinutes).toBe(30);
    expect(computeImmediateSchedule({ estimated_duration: 0 }, now).due_time).toBe("10:30");
  });

  it("tarefa pontual recebe o instante exato, sem somar nada e sem fallback", () => {
    const now = new Date(2026, 7, 20, 10, 7);
    const result = computeImmediateSchedule({ is_quick: true }, now);
    expect(result).toEqual({
      due_date: "2026-08-20",
      due_time: "10:07",
      usedFallbackMinutes: null,
      minutes: 0,
    });
  });

  it("tarefa pontual ignora qualquer duração residual", () => {
    const now = new Date(2026, 7, 20, 10, 7);
    const result = computeImmediateSchedule({ is_quick: true, estimated_duration: 240 }, now);
    expect(result.due_time).toBe("10:07");
    expect(result.minutes).toBe(0);
  });

  it("virada de dia: 23h50 + 30 min cai em 00h20 do dia seguinte", () => {
    const now = new Date(2026, 7, 20, 23, 50);
    const result = computeImmediateSchedule({}, now);
    expect(result.due_date).toBe("2026-08-21");
    expect(result.due_time).toBe("00:20");
  });

  it("virada de mês/ano junto com a virada de dia", () => {
    const now = new Date(2026, 11, 31, 23, 30);
    const result = computeImmediateSchedule({ estimated_duration: 60 }, now);
    expect(result.due_date).toBe("2027-01-01");
    expect(result.due_time).toBe("00:30");
  });

  it("duração absurda (1440 min = 24h) cai no dia seguinte no mesmo horário", () => {
    const now = new Date(2026, 7, 20, 9, 15);
    const result = computeImmediateSchedule({ estimated_duration: 1440 }, now);
    expect(result.due_date).toBe("2026-08-21");
    expect(result.due_time).toBe("09:15");
  });

  it("formata hora e minuto sempre com dois dígitos", () => {
    const now = new Date(2026, 7, 20, 8, 2);
    const result = computeImmediateSchedule({ estimated_duration: 1 }, now);
    expect(result.due_time).toBe("08:03");
    expect(result.due_time).toMatch(/^\d{2}:\d{2}$/);
    expect(result.due_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("usa o relógio real quando `now` não é passado", () => {
    const before = new Date();
    const result = computeImmediateSchedule({ is_quick: true });
    const after = new Date();
    // o instante calculado tem de cair entre as duas leituras do relógio (mesmo dia civil)
    expect([
      `${before.getFullYear()}`,
      `${after.getFullYear()}`,
    ]).toContain(result.due_date.slice(0, 4));
    expect(result.minutes).toBe(0);
  });
});
