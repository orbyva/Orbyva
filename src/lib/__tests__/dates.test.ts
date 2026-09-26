import { describe, expect, it } from "vitest";
import {
  formatLocalIsoDate,
  formatLocalIsoDateTime,
  localDateTimeInputToIso,
  startOfLocalDay,
  toLocalDateTimeInputValue,
} from "@/lib/dates";

describe("formatLocalIsoDateTime", () => {
  it("junta a data civil com o horário HH:mm", () => {
    const date = new Date(2026, 8, 1, 15, 45);
    expect(formatLocalIsoDate(date)).toBe("2026-09-01");
    expect(formatLocalIsoDateTime(date, "10:00")).toBe("2026-09-01T10:00");
  });

  it("horário vazio cai em 00:00, sem inventar fuso", () => {
    expect(formatLocalIsoDateTime(new Date(2026, 0, 2), "")).toBe("2026-01-02T00:00");
  });
});

/**
 * Feature 067: o dialog de evento da Agenda usa `<input type="datetime-local">`, que fala
 * `YYYY-MM-DDTHH:mm` em **hora local**, enquanto `project_event.starts_at`/`ends_at` guardam ISO em
 * UTC. Estes helpers são a ponte — e a regra é nunca fatiar `toISOString()`, senão em fuso UTC−
 * editar um evento mostra a hora (e às vezes o dia) errada.
 */

describe("formatLocalIsoDate / startOfLocalDay", () => {
  it("formata a data civil local, sem passar por UTC", () => {
    // 23:30 local: em UTC− o `toISOString()` já teria virado o dia.
    expect(formatLocalIsoDate(new Date(2026, 7, 17, 23, 30))).toBe("2026-08-17");
  });

  it("startOfLocalDay zera a hora mantendo o dia local", () => {
    const start = startOfLocalDay(new Date(2026, 7, 17, 23, 30));
    expect(start.getHours()).toBe(0);
    expect(formatLocalIsoDate(start)).toBe("2026-08-17");
  });
});

describe("toLocalDateTimeInputValue", () => {
  it("devolve a hora local do instante, no formato do input", () => {
    const local = new Date(2026, 7, 17, 9, 5);
    expect(toLocalDateTimeInputValue(local.toISOString())).toBe("2026-08-17T09:05");
  });

  it("zero à esquerda em mês, dia, hora e minuto", () => {
    const local = new Date(2026, 0, 3, 7, 4);
    expect(toLocalDateTimeInputValue(local.toISOString())).toBe("2026-01-03T07:04");
  });

  it("não desloca o dia perto da meia-noite (o bug de fatiar toISOString)", () => {
    const local = new Date(2026, 7, 17, 23, 45);
    expect(toLocalDateTimeInputValue(local.toISOString())).toBe("2026-08-17T23:45");
  });

  it("string vazia, nula ou inválida devolve ''", () => {
    expect(toLocalDateTimeInputValue("")).toBe("");
    expect(toLocalDateTimeInputValue(null)).toBe("");
    expect(toLocalDateTimeInputValue(undefined)).toBe("");
    expect(toLocalDateTimeInputValue("nada disso")).toBe("");
  });
});

describe("localDateTimeInputToIso", () => {
  it("interpreta o valor como hora local e devolve o instante em ISO", () => {
    expect(localDateTimeInputToIso("2026-08-17T09:05")).toBe(
      new Date(2026, 7, 17, 9, 5).toISOString()
    );
  });

  it("aceita o valor com segundos que alguns navegadores mandam", () => {
    expect(localDateTimeInputToIso("2026-08-17T09:05:30")).toBe(
      new Date(2026, 7, 17, 9, 5, 30).toISOString()
    );
  });

  it("string vazia, nula ou fora do formato devolve ''", () => {
    expect(localDateTimeInputToIso("")).toBe("");
    expect(localDateTimeInputToIso(null)).toBe("");
    expect(localDateTimeInputToIso(undefined)).toBe("");
    expect(localDateTimeInputToIso("2026-08-17")).toBe("");
    expect(localDateTimeInputToIso("17/08/2026 09:05")).toBe("");
  });

  it("data impossível devolve '' em vez de rolar para o mês seguinte", () => {
    expect(localDateTimeInputToIso("2026-13-01T10:00")).toBe("");
    expect(localDateTimeInputToIso("2026-02-30T10:00")).toBe("");
  });
});

describe("ida e volta", () => {
  it("preserva a hora local em qualquer um dos dois sentidos", () => {
    for (const value of ["2026-08-17T00:00", "2026-01-03T07:04", "2026-12-31T23:59"]) {
      expect(toLocalDateTimeInputValue(localDateTimeInputToIso(value))).toBe(value);
    }
  });

  it("ISO -> input -> ISO devolve o mesmo instante (minuto cheio)", () => {
    const iso = new Date(2026, 7, 17, 14, 30).toISOString();
    expect(localDateTimeInputToIso(toLocalDateTimeInputValue(iso))).toBe(iso);
  });
});
